/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#00C896",
          dark:    "#00A37A",
        },
        surface: {
          DEFAULT: "#0F1117",
          card:    "#1A1D27",
          border:  "#2A2D3A",
          hover:   "#22253A",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
}
