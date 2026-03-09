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

export const metadata: Metadata = {
  title: "Meme Factory - Công cụ tạo meme AI cho fanpage Việt Nam",
  description: "Tạo meme chuyên nghiệp cho fanpage với AI. Quản lý nhân vật, tạo nội dung, xuất ảnh nhiều định dạng. Phù hợp cho Bò và Gấu, Thỏ Bảy Màu và các fanpage Việt Nam.",
  keywords: ["meme", "fanpage", "AI", "Viet Nam", "content creator", "social media", "meme generator"],
  authors: [{ name: "Meme Factory" }],
  openGraph: {
    title: "Meme Factory - Công cụ tạo meme AI cho fanpage",
    description: "Tạo meme chuyên nghiệp cho fanpage với AI. Quản lý nhân vật, tạo nội dung, xuất ảnh nhiều định dạng.",
    type: "website",
    locale: "vi_VN",
    siteName: "Meme Factory",
  },
  twitter: {
    card: "summary_large_image",
    title: "Meme Factory - Công cụ tạo meme AI cho fanpage",
    description: "Tạo meme chuyên nghiệp cho fanpage với AI.",
  },
  icons: {
    icon: [
      { url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎨</text></svg>", type: "image/svg+xml" },
    ],
  },
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
