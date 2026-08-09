import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A3S Labs Stat",
  description: "Live VPS and Docker telemetry console.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
