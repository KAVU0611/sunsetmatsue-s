import "./globals.css";
import type { Metadata } from "next";
import { PropsWithChildren } from "react";

export const metadata: Metadata = {
  title: "Sunset Card Generator",
  description: "Design serene sunset cards with dynamic scores and shareable imagery.",
  applicationName: "Sunset Forecast",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
    other: [
      {
        rel: "mask-icon",
        url: "/icons/icon-512.png"
      }
    ]
  },
  themeColor: "#0f172a"
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="ja">
      <body>
        <main className="min-h-screen">{children}</main>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(console.error);
                });
              }
            `
          }}
        />
      </body>
    </html>
  );
}
