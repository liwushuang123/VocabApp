import type { Metadata, Viewport } from "next";
import "./globals.css";
import LayoutShell from "@/components/ui/LayoutShell";

export const metadata: Metadata = {
  title: "VocabApp",
  description: "Learn English vocabulary while reading",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VocabApp",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#16a34a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
