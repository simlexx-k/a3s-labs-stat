import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "A3S Infrastructure Console",
    short_name: "A3S Console",
    description: "Live host and container telemetry for A3S infrastructure.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#191b1f",
    icons: [
      {
        src: "/brand/a3s-infrastructure-app-icon.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/a3s-logo-dark-tile.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
