import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: {
          50: "#fefdfb",
          100: "#fdf8f0",
          200: "#f5ead5",
          300: "#eddcba",
          400: "#e0c99a",
          500: "#d4b87e",
        },
        sand: {
          100: "#f7f0e3",
          200: "#efe1c8",
          300: "#e2cda6",
          400: "#d4b98a",
        },
        earth: {
          100: "#e8dfd2",
          200: "#d1c4a9",
          300: "#b8a88a",
          400: "#9e8c6c",
          500: "#7a6b52",
          600: "#5c5040",
        },
        leaf: {
          100: "#e8efe5",
          200: "#c8d9c0",
          300: "#a3bf96",
          400: "#7da56c",
          500: "#5e8a4a",
        },
        ocean: {
          100: "#e5eff5",
          200: "#c4dae8",
          300: "#9ec3d8",
          400: "#78acc8",
        },
        coral: {
          100: "#fce8de",
          200: "#f5c8b0",
          300: "#eba882",
          400: "#e08a58",
        },
        mint: {
          100: "#e2f2ed",
          200: "#b8e0d2",
          300: "#8ecdb7",
          400: "#64ba9c",
        },
        sky: {
          100: "#e5f0f8",
          200: "#c0ddef",
          300: "#96c8e4",
          400: "#6cb3d9",
        },
      },
      fontFamily: {
        display: ['"Noto Serif SC"', "Georgia", "serif"],
        body: ['"Noto Sans SC"', "system-ui", "sans-serif"],
        hand: ['"Ma Shan Zheng"', "cursive"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      boxShadow: {
        soft: "0 4px 20px rgba(122, 107, 82, 0.1)",
        warm: "0 8px 32px rgba(122, 107, 82, 0.15)",
        panel: "0 12px 40px rgba(122, 107, 82, 0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
