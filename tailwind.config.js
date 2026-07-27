/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0d1117",
        paper: "#f7f5f2",
        warm: "#ede8e0",
        rule: "#d5cdc2",
        accent: "#8b5e3c",
        accent2: "#3d6b5e",
        mid: "#6b7280",
      },
    },
  },
  plugins: [],
};
