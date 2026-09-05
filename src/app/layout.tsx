import type { Metadata } from "next";
import { Inconsolata } from "next/font/google";
import "./globals.css";

const inconsolata = Inconsolata({
  subsets: ["latin"],
  variable: "--font-inconsolata",
});

export const metadata: Metadata = {
  title: "Monokuma Classroom",
  description: "An anime classroom with Monokuma. Choose a topic, watch a lesson, and discover what to learn next.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={inconsolata.variable} lang="en">
      <body>{children}</body>
    </html>
  );
}
