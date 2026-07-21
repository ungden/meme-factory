import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://aida.vn";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AIDA — Creative Studio cho nhân vật nhất quán",
    template: "%s | AIDA",
  },
  description: "Tạo meme, chiến dịch thời trang, storyboard và visual sản phẩm với nhân vật nhất quán từ cùng một thư viện reference.",
  keywords: ["AIDA", "AI creative studio", "character consistency", "image generation", "storyboard", "fashion campaign", "meme", "Việt Nam"],
  authors: [{ name: "AIDA" }],
  creator: "AIDA",
  openGraph: {
    title: "AIDA — Creative Studio cho nhân vật nhất quán",
    description: "Một Studio cho meme, thời trang, storyboard và visual sản phẩm — với nhân vật nhất quán qua mọi khung hình.",
    type: "website",
    locale: "vi_VN",
    siteName: "AIDA",
    url: SITE_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AIDA Creative Studio",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIDA — Creative Studio cho nhân vật nhất quán",
    description: "Một Studio cho meme, thời trang, storyboard và visual sản phẩm.",
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
      <body className={`${inter.variable} font-sans antialiased`}>
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
