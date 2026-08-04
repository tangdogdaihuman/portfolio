export default function AmbientBackground() {
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden">
      <div
        className="animate-blob-a absolute -top-[12%] -left-[10%] h-[52vmax] w-[52vmax] rounded-full blur-[110px]"
        style={{
          opacity: "var(--blob-opacity)",
          background: "radial-gradient(circle at 40% 40%, rgba(var(--blob-1), 0.9), transparent 68%)",
        }}
      />
      <div
        className="animate-blob-b absolute top-[8%] -right-[14%] h-[46vmax] w-[46vmax] rounded-full blur-[120px]"
        style={{
          opacity: "var(--blob-opacity)",
          background: "radial-gradient(circle at 60% 40%, rgba(var(--blob-2), 0.85), transparent 68%)",
        }}
      />
      <div
        className="animate-blob-c absolute -bottom-[18%] left-[16%] h-[48vmax] w-[48vmax] rounded-full blur-[130px]"
        style={{
          opacity: "var(--blob-opacity)",
          background: "radial-gradient(circle at 50% 50%, rgba(var(--blob-3), 0.8), transparent 70%)",
        }}
      />
      <div
        className="animate-blob-b absolute bottom-[24%] right-[24%] h-[26vmax] w-[26vmax] rounded-full blur-[100px]"
        style={{
          opacity: "calc(var(--blob-opacity) * 0.55)",
          background: "radial-gradient(circle at 50% 50%, rgba(var(--blob-4), 0.7), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 90% at 50% 42%, transparent 30%, var(--theme-bg) 108%)",
        }}
      />
    </div>
  );
}
