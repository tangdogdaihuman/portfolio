"use client";

export default function IntroForm({
  intro,
  setIntro,
  tagline,
  setTagline,
  onSave,
  loading,
  label,
}: {
  intro: string;
  setIntro: (value: string) => void;
  tagline: string;
  setTagline: (value: string) => void;
  onSave: () => void;
  loading: boolean;
  label?: string;
}) {
  return (
    <div className="glass space-y-4 rounded-[28px] p-5 md:p-7">
      <div>
        <label htmlFor="intro-tagline" className="block text-sm text-text-muted mb-2">
          Hero 副标题（显示在姓名下方）
        </label>
        <input
          id="intro-tagline"
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
          className="glass-chip w-full rounded-2xl px-4 py-3 text-sm text-text transition-colors placeholder:text-text-muted/50 focus:border-accent/50 focus:outline-none"
          placeholder="Hard Surface / Stylized Character / Game Art"
        />
      </div>
      <label htmlFor="intro-content" className="block text-sm text-text-muted mb-2">
        {label || "个人介绍（支持换行，前台按段落显示）"}
      </label>
      <textarea
        id="intro-content"
        value={intro}
        onChange={(event) => setIntro(event.target.value)}
        rows={10}
        className="glass-chip w-full rounded-2xl px-4 py-3 text-sm text-text transition-colors focus:border-accent/50 focus:outline-none resize-y"
      />
      <button
        onClick={onSave}
        disabled={loading}
        className="mt-4 min-h-11 rounded-full bg-accent px-8 py-2.5 text-sm font-medium text-on-accent shadow-[0_14px_36px_-10px_color-mix(in_srgb,var(--color-accent)_55%,transparent)] transition-[transform,box-shadow] duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
      >
        {loading ? "保存中..." : "保存"}
      </button>
    </div>
  );
}
