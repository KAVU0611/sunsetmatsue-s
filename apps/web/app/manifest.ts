import type { MetadataRoute } from "next";

const manifest = (): MetadataRoute.Manifest => ({
  name: "Sunset Forecast",
  short_name: "Sunset",
  description: "Generate and share sunset score cards for Shinjiko.",
  start_url: "/",
  display: "standalone",
  background_color: "#0f172a",
  theme_color: "#0f172a",
  lang: "ja-JP",
  icons: [
    {
      src: "/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png"
    },
    {
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png"
    }
  ]
});

export default manifest;
