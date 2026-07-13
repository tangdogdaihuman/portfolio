"use client";

import { Suspense, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LoginMode = "totp" | "email" | "key";

function LoginForm() {
  const [mode, setMode] = useState<LoginMode>("totp");
  const [key, setKey] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const clearCountdown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    clearCountdown();
    setCountdown(30);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearCountdown();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearCountdown]);

  const handleSendCode = async () => {
    setError("");
    setSending(true);

    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        startCountdown();
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.status === 429) setError(data.message || "发送过于频繁，请稍后再试");
      else setError(data.message || "发送失败，请重试");
    } catch {
      setError("网络异常，请重试");
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body = mode === "totp"
        ? { token }
        : mode === "email"
        ? { code }
        : { key };

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const raw = searchParams.get("redirect");
        const redirect = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/admin";
        router.push(redirect);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.status === 429) setError(data.message || "尝试次数过多，请稍后再试");
      else if (res.status === 500) setError(data.message || "服务端错误");
      else setError(data.message || (
        mode === "totp" ? "动态口令错误" : mode === "email" ? "验证码错误" : "密钥错误"
      ));
    } catch {
      setError("网络异常，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* 切换 tab */}
      <div className="flex mb-6 bg-surface rounded-sm">
        <button
          type="button"
          onClick={() => { setMode("totp"); setError(""); }}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mode === "totp"
              ? "bg-accent text-bg"
              : "text-text-muted hover:text-text"
          }`}
        >
          动态口令
        </button>
        <button
          type="button"
          onClick={() => { setMode("email"); setError(""); }}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mode === "email"
              ? "bg-accent text-bg"
              : "text-text-muted hover:text-text"
          }`}
        >
          邮箱验证码
        </button>
        <button
          type="button"
          onClick={() => { setMode("key"); setError(""); }}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mode === "key"
              ? "bg-accent text-bg"
              : "text-text-muted hover:text-text"
          }`}
        >
          管理密钥
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "totp" ? (
          <div>
            <p className="text-xs text-text-muted mb-3">
              打开 Authenticator App 查看当前动态口令
            </p>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="输入6位动态口令"
              aria-label="动态口令"
              autoFocus
              maxLength={6}
              className="w-full bg-surface border border-border text-text px-4 py-3 text-sm tracking-[6px] text-center focus:outline-none focus:border-accent-dim transition-colors"
            />
          </div>
        ) : mode === "email" ? (
          <>
            <p className="text-xs text-text-muted">
              验证码将发送至 1193662756@qq.com
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="输入6位验证码"
                aria-label="验证码"
                autoFocus
                maxLength={6}
                className="flex-1 bg-surface border border-border text-text px-4 py-3 text-sm tracking-[6px] text-center focus:outline-none focus:border-accent-dim transition-colors"
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={countdown > 0 || sending}
                className="px-4 py-3 text-sm font-medium bg-surface border border-border text-text-muted hover:text-text hover:border-accent-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {sending ? "发送中..." : countdown > 0 ? `${countdown}s` : "获取验证码"}
              </button>
            </div>
          </>
        ) : (
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
        )}

        {error && (
          <p className="text-red-400 text-xs">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || (mode === "totp" ? token.length !== 6 : mode === "email" ? code.length !== 6 : !key)}
          className="w-full py-3 bg-accent text-bg text-sm font-medium hover:bg-accent-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "验证中..." : "登录"}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl text-text text-center mb-3">管理后台</h1>
        <p className="text-center text-sm text-text-muted mb-8">登录后可编辑作品、排序与内容</p>
        <Suspense fallback={<div className="text-text-muted text-sm text-center">加载中...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
