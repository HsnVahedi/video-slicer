import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Free Online Video Slicer - Trim & Cut Videos in Browser",
  description: "Easily remove unwanted moments from videos using our free online video slicer. No upload required - trim, cut, and slice videos directly in your browser with ffmpeg WebAssembly.",
  keywords: "video trimmer, video slicer, online video editor, browser video editing, free video cutter, trim video online, ffmpeg browser, no upload video editor",
  openGraph: {
    title: "Free Online Video Slicer - Edit Videos Directly in Browser",
    description: "Remove unwanted parts from videos without uploading files. Free browser-based video slicer using ffmpeg WebAssembly.",
    type: "website",
    locale: "en_US",
    siteName: "Video Slicer",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Online Video Slicer - Browser-Based Video Editing",
    description: "Cut unwanted parts from videos directly in your browser. No upload required. Powered by ffmpeg WebAssembly.",
  },
  robots: {
    index: true,
    follow: true,
  },
  themeColor: "#ffffff",
  viewport: "width=device-width, initial-scale=1",
  alternates: {
    canonical: "https://your-domain.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
