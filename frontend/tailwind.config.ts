import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Noto Sans JP'", "system-ui", "sans-serif"]
      },
      colors: {
        background: "hsl(210, 40%, 98%)",
        foreground: "hsl(224, 71%, 4%)",
        card: "hsl(0, 0%, 100%)",
        muted: "hsl(215, 20%, 65%)",
        accent: "hsl(24, 95%, 53%)"
      },
      boxShadow: {
        card: "0px 20px 50px rgba(15, 23, 42, 0.1)"
      }
    }
  },
  plugins: [animate]
};

export default config;
