import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // #4d806d — verde bosque / color principal del dashboard
        brand: {
          50: "#f0f5f3",
          100: "#d9ece6",
          200: "#b3d8ce",
          300: "#8cc4b6",
          400: "#63a895",
          500: "#4d806d",
          600: "#3f6a5a",
          700: "#335547",
          800: "#2b4539",
          900: "#1e3028",
        },
        // #e87554 — coral
        coral: {
          50: "#fef3ef",
          100: "#fde0d5",
          200: "#f9b9a8",
          300: "#f3927b",
          400: "#e87554",
          500: "#d55839",
          600: "#b04330",
          700: "#8a3126",
          800: "#65221a",
        },
        // #f3a926 — dorado/ámbar
        gold: {
          50: "#fef9ec",
          100: "#fcedc6",
          200: "#f9d88e",
          300: "#f6c358",
          400: "#f3a926",
          500: "#de8a0b",
          600: "#b56c08",
          700: "#8a5006",
          800: "#623905",
        },
        // #d4cbc0 — arena/beige cálido
        sand: {
          50: "#faf8f6",
          100: "#f2ede8",
          200: "#e4dbd2",
          300: "#d4cbc0",
          400: "#c2b5a8",
          500: "#a89990",
          600: "#8c7d74",
          700: "#6f6258",
          800: "#524840",
        },
      },
    },
  },
  plugins: [],
};
export default config;
