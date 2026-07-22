import type { Metadata, Viewport } from "next";
import { Inter, Patrick_Hand } from "next/font/google";
import { Suspense } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import GARouteTracker from "@/components/analytics/ga-route-tracker";
import { GA_ID } from "@/lib/analytics";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
});

const hand = Patrick_Hand({
  variable: "--font-caveat",
  subsets: ["latin", "vietnamese"],
  weight: "400",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6e9" },
    { media: "(prefers-color-scheme: dark)", color: "#121310" },
  ],
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://aida.vn";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AIDA — Media Studio cho fanpage có chất riêng",
    template: "%s | AIDA",
  },
  description: "Từ một nhân vật và một ý tưởng, tạo trọn bộ meme, TikTok, quảng cáo và bài đăng fanpage nhất quán.",
  keywords: ["AIDA", "AI media studio", "fanpage", "character consistency", "content creation", "TikTok", "quảng cáo", "meme", "Việt Nam"],
  authors: [{ name: "AIDA" }],
  creator: "AIDA",
  openGraph: {
    title: "AIDA — Một ý tưởng, đủ content để đăng",
    description: "Giữ nguyên nhân vật, đổi format linh hoạt — từ meme đến TikTok, quảng cáo và bài viết mỗi ngày.",
    type: "website",
    locale: "vi_VN",
    siteName: "AIDA",
    url: SITE_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AIDA Media Studio",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIDA — Một ý tưởng, đủ content để đăng",
    description: "Tạo meme, TikTok, quảng cáo và bài viết với nhân vật nhất quán.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('aida-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.classList.add(t);document.documentElement.style.colorScheme=t}catch(e){document.documentElement.classList.add('light')}})();`,
          }}
        />
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${hand.variable} font-sans antialiased`}>
        <ThemeProvider>
          <ToastProvider>
            <Suspense fallback={null}>
              <GARouteTracker />
            </Suspense>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
