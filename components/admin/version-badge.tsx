export default function VersionBadge() {
  const ver = process.env.NEXT_PUBLIC_APP_VERSION || "0";
  const sha = process.env.NEXT_PUBLIC_GIT_SHA || "dev";
  return (
    <div className="fixed right-4 bottom-4 text-[0.6rem] text-text-muted/30 tracking-wider select-none pointer-events-none">
      v{ver} · {sha}
    </div>
  );
}
