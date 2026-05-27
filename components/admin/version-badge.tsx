export default function VersionBadge() {
  const sha = process.env.NEXT_PUBLIC_GIT_SHA || "dev";
  const builtAt = process.env.NEXT_PUBLIC_BUILD_TIME || "";
  return (
    <div className="fixed right-4 bottom-4 text-[0.6rem] text-text-muted/30 tracking-wider select-none pointer-events-none">
      {builtAt} · {sha}
    </div>
  );
}
