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
    <html lang="zh-CN" data-scroll-behavior="smooth" className={`${bodoni.variable} ${zcoolXiaoWei.variable} ${inter.variable} dark`}>
      <body className="min-h-screen bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
