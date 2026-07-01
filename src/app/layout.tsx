import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@coinbase/onchainkit/styles.css"; // OnchainKit stillerini yükle
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OnBase — Bölgesel Web3 Sosyal Keşif",
  description: "Bulunduğunuz bölgedeki insanlarla check-in yaparak tanışın ve Farcaster ile NFT fotoğraf yollayın.",
  other: {
    "fc:frame": JSON.stringify({
      version: "next",
      imageUrl: "https://onbase.app/cover.png",
      button: {
        title: "OnBase'i Aç",
        action: {
          type: "launch_profile",
          target: "https://onbase.app/"
        }
      }
    }),
    "og:image": "https://onbase.app/cover.png"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 selection:bg-rose-500 selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
