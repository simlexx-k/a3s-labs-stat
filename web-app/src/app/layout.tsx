import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://istatus.a3slabs.co.ke"),
  title: "A3S Infrastructure Console",
  description: "Live host and container telemetry for A3S infrastructure.",
  applicationName: "A3S Infrastructure Console",
  icons: {
    icon: [{ url: "/brand/a3s-logo-dark-tile.png", sizes: "1254x1254", type: "image/png" }],
    shortcut: "/brand/a3s-logo-dark-tile.png",
    apple: [{ url: "/brand/a3s-infrastructure-app-icon.png", sizes: "1254x1254", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "A3S Labs",
    title: "A3S Infrastructure Console",
    description: "Live host and container telemetry for A3S infrastructure.",
    images: [{
      url: "/brand/a3s-labs-infrastructure-banner-dark.png",
      width: 1672,
      height: 941,
      alt: "A3S Labs cloud, containers, and systems intelligence",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "A3S Infrastructure Console",
    description: "Live host and container telemetry for A3S infrastructure.",
    images: ["/brand/a3s-labs-infrastructure-banner-dark.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body><TooltipProvider>{children}</TooltipProvider></body>
    </html>
  );
}
