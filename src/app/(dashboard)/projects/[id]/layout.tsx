import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Tổng quan kênh" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
