"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [key, setKey] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    if (res.ok) {
      const redirect = searchParams.get("redirect") || "/admin";
      router.push(redirect);
    } else {
      setError(true);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="请输入密钥"
          autoFocus
          className="w-full bg-surface border border-border text-text px-4 py-3 text-sm focus:outline-none focus:border-accent-dim transition-colors"
        />
      </div>
      {error && (
        <p className="text-red-400 text-xs">密钥错误</p>
      )}
      <button
        type="submit"
        className="w-full py-3 bg-accent text-bg text-sm font-medium hover:bg-accent-dim transition-colors"
      >
        登录
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl text-text text-center mb-8">
          管理后台
        </h1>
        <Suspense fallback={<div className="text-text-muted text-sm text-center">加载中...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
