import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Noto Sans JP'", "Inter", "system-ui", "sans-serif"]
      },
      colors: {
        background: "hsl(215, 27%, 16%)",
        foreground: "hsl(210, 38%, 95%)",
        card: "rgba(15,23,42,0.65)",
        glass: "rgba(255,255,255,0.08)",
        accent: "#f97316"
      },
      borderRadius: {
        glass: "32px"
      },
      boxShadow: {
        card: "0 30px 80px rgba(8, 15, 40, 0.65)",
        glass: "0 25px 90px rgba(15, 23, 42, 0.45)"
      }
    }
  },
  plugins: [animate]
};

export default config;
