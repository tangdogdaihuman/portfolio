"use client";

import { Suspense, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LazyMotion, domAnimation, m } from "framer-motion";
import { EASE_OUT, SPRING_SOFT } from "@/components/reveal";

type LoginMode = "totp" | "email" | "key";

const MODES: Array<{ value: LoginMode; label: string }> = [
  { value: "totp", label: "动态口令" },
  { value: "email", label: "邮箱验证码" },
  { value: "key", label: "管理密钥" },
];

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
      <div className="glass-chip relative mb-7 flex rounded-full p-1">
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => { setMode(option.value); setError(""); }}
            data-hover
            className={`relative min-h-10 flex-1 rounded-full text-[0.72rem] tracking-[0.08em] transition-colors duration-300 ${
              mode === option.value ? "text-text" : "text-text-muted hover:text-text"
            }`}
          >
            {mode === option.value && (
              <m.span
                layoutId="login-mode-bubble"
                transition={SPRING_SOFT}
                className="absolute inset-0 rounded-full border border-accent/40 bg-accent/12"
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <m.div
          key={mode}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="space-y-4"
        >
          {mode === "totp" ? (
            <div>
              <p className="meta-label mb-3">打开 Authenticator 查看当前口令</p>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6 位动态口令"
                aria-label="动态口令"
                autoFocus
                maxLength={6}
                className="glass-chip w-full rounded-2xl px-5 py-3.5 text-center text-sm tracking-[0.5em] text-text transition-colors placeholder:tracking-[0.15em] placeholder:text-text-muted/50 focus:border-accent/50 focus:outline-none"
              />
            </div>
          ) : mode === "email" ? (
            <div>
              <p className="meta-label mb-3">验证码将发送至 1193662756@qq.com</p>
              <div className="flex gap-2.5">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6 位验证码"
                  aria-label="验证码"
                  autoFocus
                  maxLength={6}
                  className="glass-chip min-w-0 flex-1 rounded-2xl px-5 py-3.5 text-center text-sm tracking-[0.5em] text-text transition-colors placeholder:tracking-[0.15em] placeholder:text-text-muted/50 focus:border-accent/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={countdown > 0 || sending}
                  data-hover
                  className="glass-chip shrink-0 rounded-2xl px-4 text-[0.72rem] tracking-[0.06em] text-text-muted transition-colors duration-300 hover:text-text disabled:pointer-events-none disabled:opacity-50"
                >
                  {sending ? "发送中…" : countdown > 0 ? `${countdown}s` : "获取验证码"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="meta-label mb-3">使用管理员密钥登录</p>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="请输入密钥"
                aria-label="管理密钥"
                autoFocus
                className="glass-chip w-full rounded-2xl px-5 py-3.5 text-sm text-text transition-colors placeholder:text-text-muted/50 focus:border-accent/50 focus:outline-none"
              />
            </div>
          )}
        </m.div>

        {error && (
          <p className="rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-2.5 text-xs text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || (mode === "totp" ? token.length !== 6 : mode === "email" ? code.length !== 6 : !key)}
          data-hover
          className="min-h-12 w-full rounded-full bg-accent text-[0.78rem] font-medium tracking-[0.14em] text-on-accent shadow-[0_14px_36px_-10px_color-mix(in_srgb,var(--color-accent)_55%,transparent)] transition-[transform,box-shadow] duration-300 hover:scale-[1.02] hover:shadow-[0_18px_44px_-10px_color-mix(in_srgb,var(--color-accent)_70%,transparent)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? "验证中…" : "登录"}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="animate-fade-up w-full max-w-sm">
        <div className="glass-strong rounded-[28px] p-7 md:p-8">
          <p className="meta-label text-center">Admin Console</p>
          <h1 className="font-display mt-3 text-center text-3xl text-text">管理后台</h1>
          <p className="mt-2 text-center text-sm text-text-muted">登录后可编辑作品、排序与内容</p>
          <div className="mt-8">
            <Suspense fallback={<div className="meta-label py-8 text-center">加载中…</div>}>
              <LazyMotion features={domAnimation}>
                <LoginForm />
              </LazyMotion>
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
