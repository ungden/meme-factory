import type { Metadata, Viewport } from "next";
import { Inter, Patrick_Hand } from "next/font/google";
import { Suspense } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import GARouteTracker from "@/components/analytics/ga-route-tracker";
import AnalyticsConsent from "@/components/analytics/analytics-consent";
import "./globals.css";
import { SITE_URL } from "@/lib/site-url";

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
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AIDA — Meme, video, phim ngắn cho kênh của bạn",
    template: "%s | AIDA",
  },
  description: "Gõ một ý tưởng, nhận meme, video, phim ngắn cho fanpage và TikTok — đúng nhân vật, đúng giọng kênh, từng bài hoặc tự làm mỗi ngày.",
  keywords: ["AIDA", "làm meme", "phim ngắn AI", "video TikTok", "fanpage", "nhân vật", "Việt Nam"],
  authors: [{ name: "AIDA" }],
  creator: "AIDA",
  openGraph: {
    title: "AIDA — Kênh của bạn, ngày nào cũng có bài mới",
    description: "Meme, video và phim ngắn với đúng một nhân vật — từng bài hoặc tự làm mỗi ngày.",
    type: "website",
    locale: "vi_VN",
    siteName: "AIDA",
    url: SITE_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AIDA — meme, video, phim ngắn cho kênh của bạn",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIDA — Kênh của bạn, ngày nào cũng có bài mới",
    description: "Meme, video và phim ngắn với đúng một nhân vật — từng bài hoặc tự làm mỗi ngày.",
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
      </head>
      <body className={`${inter.variable} ${hand.variable} font-sans antialiased`}>
        <ThemeProvider>
          <ToastProvider>
            <Suspense fallback={null}>
              <GARouteTracker />
            </Suspense>
            {children}
            <AnalyticsConsent />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
