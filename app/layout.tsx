import type { Metadata } from "next";
import { Bodoni_Moda, Inter, ZCOOL_XiaoWei } from "next/font/google";
import "./globals.css";

const bodoni = Bodoni_Moda({
  variable: "--font-display-en",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const zcoolXiaoWei = ZCOOL_XiaoWei({
  variable: "--font-display-cn",
  weight: "400",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Tang Zihang — CG Portfolio",
    template: "%s — Tang Zihang",
  },
  description: "唐子航个人 CG 作品集 · 3D 角色/场景/材质 · Game Art Portfolio",
  openGraph: {
    title: "Tang Zihang — CG Portfolio",
    description: "唐子航个人 CG 作品集 · 3D 角色/场景/材质",
    siteName: "Tang Zihang Portfolio",
    type: "website",
    locale: "zh_CN",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" className={`${bodoni.variable} ${zcoolXiaoWei.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{try{var t=localStorage.getItem("theme"),d=t==="light",el=document.documentElement,s=el.style,c=el.classList;c.remove("light");c.remove("dark");c.add(d?"light":"dark");var m=d?["#f8f6f0","#ede8dd","#d5cfc2","#1a1815","#6b655b","#8b6914","#a68b3c","rgba(245,240,230,0.95)","245,240,230"]:["#0a0908","#171411","#322c26","#e8e4dc","#9a9185","#c9a961","#8b7340","rgba(10,9,8,0.95)","10,9,8"],k=["--theme-bg","--theme-surface","--theme-border","--theme-text","--theme-text-muted","--theme-accent","--theme-accent-dim","--theme-overlay","--atmosphere"];for(var i=0;i<k.length;i++)s.setProperty(k[i],m[i])}catch(e){document.documentElement.className+=" dark"}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
