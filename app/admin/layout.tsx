import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <span className="font-display text-xl text-text">管理后台</span>
        <Link
          href="/"
          className="text-sm text-text-muted hover:text-text transition-colors"
        >
          回前台
        </Link>
      </div>
      {children}
    </div>
  );
}
