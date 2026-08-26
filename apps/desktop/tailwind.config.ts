import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#081018",
        panel: "#0f1b28",
        accent: "#8fd6b5",
        signal: "#f2c46d",
        danger: "#f7887c"
      },
      fontFamily: {
        sans: ["Segoe UI", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;

