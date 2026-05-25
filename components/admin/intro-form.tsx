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
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-text-muted mb-2">
          Hero 副标题（显示在姓名下方）
        </label>
        <input
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
          className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim transition-colors"
          placeholder="Hard Surface / Stylized Character / Game Art"
        />
      </div>
      <label className="block text-sm text-text-muted mb-2">
        {label || "个人介绍（支持换行，前台按段落显示）"}
      </label>
      <textarea
        value={intro}
        onChange={(event) => setIntro(event.target.value)}
        rows={10}
        className="w-full bg-bg border border-border text-text px-4 py-3 text-sm focus:outline-none focus:border-accent-dim transition-colors resize-y"
      />
      <button
        onClick={onSave}
        disabled={loading}
        className="mt-4 px-6 py-2 bg-accent text-bg text-sm font-medium hover:bg-accent-dim transition-colors disabled:opacity-50"
      >
        {loading ? "保存中..." : "保存"}
      </button>
    </div>
  );
}
