import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A3S Labs Stat",
  description: "VPS, Docker, and container stats dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

