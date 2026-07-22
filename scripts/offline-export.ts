import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const root = process.cwd();
const distDir = path.join(root, 'offline-export', 'dist');
const desktop = path.join(process.env.USERPROFILE || process.env.HOME || root, 'Desktop');
const desktopDir = path.join(desktop, 'ultracode');
const desktopZip = path.join(desktop, 'ultracode.zip');

const nextConfigPath = path.join(root, 'next.config.ts');
const workPagePath = path.join(root, 'app', 'work', '[id]', 'page.tsx');
const nextConfigBackup = nextConfigPath + '.offline.bak';
const workPageBackup = workPagePath + '.offline.bak';

const externalHosts = [
  'cdn.tangzihang.top',
  'pub-1b5c7de127bb43299da537180f90085d.r2.dev',
  'r2.cloudflarestorage.com',
];

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchAndSave(urlStr: string, targetPath: string, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(urlStr, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = res.body;
      if (!body) throw new Error('no body');
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      await pipeline(Readable.fromWeb(body as any), fs.createWriteStream(targetPath));
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  download attempt ${attempt} failed for ${urlStr}: ${message}`);
      if (attempt === retries) throw err;
      await sleep(1000 * attempt);
    }
  }
}

function patchNextConfig() {
  const original = fs.readFileSync(nextConfigPath, 'utf8');
  fs.writeFileSync(nextConfigBackup, original);
  const patched = original
    .replace(/const nextConfig: NextConfig = \{/, `const nextConfig: NextConfig = {\n  output: 'export',\n  distDir: 'offline-export/dist',\n  trailingSlash: false,`)
    .replace(/images: \{\s*remotePatterns: \[/, `images: {\n    unoptimized: true,\n    remotePatterns: [`);
  fs.writeFileSync(nextConfigPath, patched);
  console.log('Patched next.config.ts for static export');
}

function patchWorkPage() {
  const original = fs.readFileSync(workPagePath, 'utf8');
  fs.writeFileSync(workPageBackup, original);
  const insert = `\nexport async function generateStaticParams() {\n  const result = await db.execute('SELECT id FROM works');\n  return result.rows.map((row) => ({ id: row.id as string }));\n}\n`;
  const patched = original.replace(/export const revalidate = 30;/, `export const revalidate = 30;${insert}`);
  fs.writeFileSync(workPagePath, patched);
  console.log('Patched app/work/[id]/page.tsx with generateStaticParams');
}

function revertFiles() {
  if (fs.existsSync(nextConfigBackup)) {
    fs.copyFileSync(nextConfigBackup, nextConfigPath);
    fs.unlinkSync(nextConfigBackup);
  }
  if (fs.existsSync(workPageBackup)) {
    fs.copyFileSync(workPageBackup, workPagePath);
    fs.unlinkSync(workPageBackup);
  }
  console.log('Reverted source file patches');
}

function isTextFile(file: string) {
  const ext = path.extname(file).toLowerCase();
  return [
    '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.json', '.xml', '.txt', '.svg', '.ts', '.tsx'
  ].includes(ext);
}

function isExternalUrl(urlStr: string) {
  try {
    const url = new URL(urlStr);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function urlToLocalPath(urlStr: string) {
  const url = new URL(urlStr);
  let pathname = url.pathname;
  if (pathname.startsWith('/')) pathname = pathname.slice(1);
  if (!pathname) pathname = 'index';
  const safePath = pathname.replace(/\/g, '/').split('/').map((seg) =>
    seg.replace(/[:*?"<>|]/g, '_')
  ).join('/');
  return path.join('assets', url.hostname, safePath);
}

async function postProcess() {
  console.log('Post-processing static export for offline assets...');
  const assetDir = path.join(distDir, 'assets');
  fs.mkdirSync(assetDir, { recursive: true });

  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk(distDir);

  const urlSet = new Set<string>();
  const urlRegex = /https?:\/\/[^\s"'\`\)\]\}\<\>.,;]+/g;
  for (const file of files) {
    if (!isTextFile(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const matches = text.match(urlRegex) || [];
    for (const m of matches) {
      if (externalHosts.some((h) => m.includes(h)) || m.includes('r2.dev') || m.includes('r2.cloudflarestorage.com') || m.includes('cdn.tangzihang.top')) {
        if (isExternalUrl(m)) urlSet.add(m);
      }
    }
  }

  console.log(`Found ${urlSet.size} external assets to localize`);

  const urlToRelative: Map<string, string> = new Map();
  const sortedUrls = [...urlSet].sort();
  for (const url of sortedUrls) {
    const rel = urlToLocalPath(url);
    urlToRelative.set(url, rel);
    const target = path.join(distDir, rel);
    if (fs.existsSync(target)) {
      console.log(`  already exists: ${rel}`);
      continue;
    }
    process.stdout.write(`  downloading ${rel} ... `);
    try {
      await fetchAndSave(url, target);
      const stats = fs.statSync(target);
      console.log(`(${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (err) {
      console.log('FAILED');
      console.error(err);
    }
  }

  for (const file of files) {
    if (!isTextFile(file)) continue;
    let text = fs.readFileSync(file, 'utf8');
    let changed = false;
    for (const [url, rel] of urlToRelative) {
      const assetFull = path.join(distDir, rel);
      if (!fs.existsSync(assetFull)) continue;
      const relativeToFile = path.relative(path.dirname(file), assetFull).replace(/\\/g, '/');
      if (url !== relativeToFile) {
        const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const newText = text.replace(new RegExp(escaped, 'g'), relativeToFile);
        if (newText !== text) {
          text = newText;
          changed = true;
        }
      }
    }
    if (changed) {
      fs.writeFileSync(file, text, 'utf8');
    }
  }

  console.log('Offline asset localization complete');
}

function copyToDesktop() {
  fs.rmSync(desktopDir, { recursive: true, force: true });
  fs.cpSync(distDir, desktopDir, { recursive: true });
  console.log(`Copied offline site to ${desktopDir}`);
}

function zipDesktopFolder() {
  try {
    if (process.platform === 'win32') {
      execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${desktopDir.replace(/'/g, "''")}\*' -DestinationPath '${desktopZip.replace(/'/g, "''")}' -Force"`, { stdio: 'inherit' });
    } else {
      execSync(`cd "${desktopDir}" && zip -r "${desktopZip}" .`, { stdio: 'inherit' });
    }
    console.log(`Created ${desktopZip}`);
  } catch (err) {
    console.warn('Could not create zip:', err);
  }
}

async function main() {
  try {
    console.log('Starting offline export...');
    patchNextConfig();
    patchWorkPage();

    console.log('Building static site...');
    execSync('npx next build', { stdio: 'inherit', cwd: root });

    await postProcess();
    copyToDesktop();
    zipDesktopFolder();
    console.log('Offline export complete.');
  } finally {
    revertFiles();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
