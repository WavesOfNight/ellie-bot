import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-quicksand)", "system-ui", "sans-serif"],
        display: ["var(--font-baloo)", "var(--font-quicksand)", "system-ui", "sans-serif"],
      },
      colors: {
        lavender: {
          50: "#F7F5FF",
          100: "#EEEDFE",
          200: "#CECBF6",
          300: "#AFA9EC",
          400: "#7F77DD",
          600: "#534AB7",
          800: "#3C3489",
          900: "#26215C",
        },
        aqua: { 50: "#F0FBF7", 100: "#E1F5EE", 200: "#9FE1CB", 400: "#5DCAA5", 600: "#0F6E56", 800: "#085041" },
        blush: { 50: "#FDF3F7", 100: "#FBEAF0", 200: "#F4C0D1", 400: "#D4537E", 600: "#993556", 800: "#4B1528" },
        cream: { 50: "#FFFDF7", 100: "#FAEEDA" },
        coral: { 100: "#FAECE7", 200: "#F5C4B3", 400: "#D85A30", 600: "#993C1D" },
        discord: { 50: "#EEF0FE", 100: "#DFE3FD", 400: "#5865F2", 500: "#4752C4", 600: "#3C45A5" },
      },
      borderRadius: { aero: "22px" },
      boxShadow: { glass: "0 8px 30px rgba(83,74,183,.12), inset 0 1px 0 rgba(255,255,255,.6)" },
    },
  },
  plugins: [],
};

export default config;
