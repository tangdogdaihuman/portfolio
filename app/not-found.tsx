import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center px-6">
        <p className="font-display text-8xl text-accent/30 mb-4 tracking-wider">404</p>
        <p className="text-text-muted text-lg mb-8">页面不存在</p>
        <Link href="/" className="nav-link text-accent">
          返回首页
        </Link>
      </div>
    </div>
  );
}
