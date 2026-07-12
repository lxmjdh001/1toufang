import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WzzAds",
  description: "TikTok + Meta one-click ad operations platform"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
