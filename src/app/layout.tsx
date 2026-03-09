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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://meme-factory-bice.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Meme Factory — Tạo meme AI cho fanpage Việt Nam",
    template: "%s | Meme Factory",
  },
  description: "Biến ý tưởng thành meme siêu dễ thương với AI. Quản lý nhân vật mascot, tạo nội dung và xuất ảnh cho fanpage chứng khoán, couple, gaming, ẩm thực và nhiều chủ đề khác.",
  keywords: ["meme", "fanpage", "AI", "Việt Nam", "content creator", "social media", "meme generator", "Gemini AI", "mascot", "chứng khoán", "comic"],
  authors: [{ name: "Meme Factory" }],
  creator: "Meme Factory",
  openGraph: {
    title: "Meme Factory — Tạo meme AI cho fanpage Việt Nam",
    description: "Biến ý tưởng thành meme siêu dễ thương. 8 phong cách AI, 15 biểu cảm nhân vật, xuất 4 định dạng. 100% miễn phí!",
    type: "website",
    locale: "vi_VN",
    siteName: "Meme Factory",
    url: SITE_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Meme Factory — Công cụ tạo meme AI cho fanpage Việt Nam",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Meme Factory — Tạo meme AI cho fanpage Việt Nam",
    description: "Biến ý tưởng thành meme siêu dễ thương. 8 phong cách AI, 15 biểu cảm nhân vật. 100% miễn phí!",
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
