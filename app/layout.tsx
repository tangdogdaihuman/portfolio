import type { Metadata } from "next";
import { Anton, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import AuroraCanvas from "@/components/aurora-canvas";
import SmoothScroll from "@/components/smooth-scroll";
import GlassCursor from "@/components/cursor";

const anton = Anton({
  variable: "--font-display-en",
  subsets: ["latin"],
  weight: "400",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const jbMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://tangzihang.top"),
  title: {
    default: "Tang Zihang — CG Portfolio",
    template: "%s — Tang Zihang",
  },
  description: "唐子航个人 CG 作品集 · 3D 角色/场景/材质 · Game Art Portfolio",
  openGraph: {
    title: "Tang Zihang — CG Portfolio",
    description: "唐子航个人 CG 作品集 · 3D 角色/场景/材质",
    url: "/",
    siteName: "Tang Zihang Portfolio",
    type: "website",
    locale: "zh_CN",
  },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

function getImageOrigin() {
  try {
    const url = process.env.R2_PUBLIC_URL;
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const imageOrigin = getImageOrigin();
  return (
    <html lang="zh-CN" className={`${anton.variable} ${spaceGrotesk.variable} ${jbMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta name="nightmode" content="disable" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@200..900&family=Noto+Sans+SC:wght@100..900&display=swap"
          rel="stylesheet"
        />
        {imageOrigin && (
          <>
            <link rel="preconnect" href={imageOrigin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={imageOrigin} />
          </>
        )}
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{try{var t=localStorage.getItem("theme"),c=document.documentElement.classList;c.remove("light");c.remove("dark");c.add(t==="light"?"light":"dark")}catch(e){document.documentElement.classList.add("dark")}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-bg text-text antialiased">
        <AuroraCanvas />
        <SmoothScroll />
        <GlassCursor />
        {children}
      </body>
    </html>
  );
}
