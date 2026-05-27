const sha = process.env.VERCEL_GIT_COMMIT_SHA;
const version = sha ? sha.slice(0, 7) : "dev";

export default function VersionBadge() {
  return (
    <div className="fixed right-4 bottom-4 text-[0.6rem] text-text-muted/30 tracking-wider select-none pointer-events-none">
      {version}
    </div>
  );
}
