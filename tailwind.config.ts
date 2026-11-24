import type { Config } from "tailwindcss";

export default {
  content: ["./src/popup/**/*.{html,ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
