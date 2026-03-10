import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
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
    default: "AIDA — Giải pháp xây dựng fanpage bằng AI",
    template: "%s | AIDA",
  },
  description: "Xây dựng fanpage chuyên nghiệp với AI. Quản lý nhân vật mascot, tạo nội dung, hình ảnh và meme cho fanpage chứng khoán, couple, gaming, ẩm thực và nhiều chủ đề khác.",
  keywords: ["AIDA", "fanpage", "AI", "Việt Nam", "content creator", "social media", "xây dựng fanpage", "AIDA AI", "mascot", "meme", "comic"],
  authors: [{ name: "AIDA" }],
  creator: "AIDA",
  openGraph: {
    title: "AIDA — Giải pháp xây dựng fanpage bằng AI",
    description: "Xây dựng fanpage chuyên nghiệp với AI. Tạo nội dung, hình ảnh, meme với nhân vật mascot riêng. Dành cho content creators Việt Nam.",
    type: "website",
    locale: "vi_VN",
    siteName: "AIDA",
    url: SITE_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AIDA — Giải pháp xây dựng fanpage bằng AI",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIDA — Giải pháp xây dựng fanpage bằng AI",
    description: "Xây dựng fanpage chuyên nghiệp với AI. Tạo nội dung, hình ảnh, meme với nhân vật mascot riêng.",
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
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
