import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0a0d12",
        surface: "#11161d",
        elevated: "#172029",
        border: "#222c37",
        accent: { DEFAULT: "#5b8cff", dim: "#1b2740" },
        good: "#3ad29a",
        warn: "#f3b13e",
        bad: "#f6685e",
        fg: { DEFAULT: "#eef2f7", muted: "#aab6c4", faint: "#7e8b9a" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: { "fade-up": "fade-up 0.4s cubic-bezier(0.22,1,0.36,1) both" },
    },
  },
  plugins: [],
};

export default config;
