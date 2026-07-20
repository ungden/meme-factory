import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: "/**",
        search: "",
      },
      {
        pathname: "/continuity/**",
        search: "?v=quiet-luxury-20260720",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kpsmwylkmdrmbunzboua.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "qr.sepay.vn",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.vietqr.io",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
