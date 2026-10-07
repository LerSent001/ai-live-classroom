import type { Metadata } from "next";
import { Inconsolata } from "next/font/google";
import "./globals.css";

const inconsolata = Inconsolata({
  subsets: ["latin"],
  variable: "--font-inconsolata",
});

export const metadata: Metadata = {
  title: "中文课堂 · Live Classroom",
  description: "从自己的问题出发，在轻量 3D 中文课堂中观看讲解。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={inconsolata.variable} lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
