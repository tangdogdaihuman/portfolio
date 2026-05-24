"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });

      if (res.ok) {
        const raw = searchParams.get("redirect");
        const redirect = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/admin";
        router.push(redirect);
        return;
      }

      if (res.status === 429) setError("尝试次数过多，请稍后再试");
      else if (res.status === 500) setError("服务端密钥未配置");
      else setError("密钥错误");
    } catch {
      setError("网络异常，请重试");
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
          aria-label="管理密钥"
          autoFocus
          className="w-full bg-surface border border-border text-text px-4 py-3 text-sm focus:outline-none focus:border-accent-dim transition-colors"
        />
      </div>
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
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
        <h1 className="font-display text-2xl text-text text-center mb-3">输入管理密钥</h1>
        <p className="text-center text-sm text-text-muted mb-8">登录后可编辑作品、排序与内容</p>
        <Suspense fallback={<div className="text-text-muted text-sm text-center">加载中...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
