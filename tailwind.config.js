/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F2F6FA",
          100: "#E6EEF5",
          200: "#C7D7E8",
          300: "#A2BDD7",
          400: "#6C94BD",
          500: "#3E6FA3",
          600: "#295A8B",
          700: "#1E4A74" /* header bg */,
          800: "#173A5B",
          900: "#102A42",
        },
        brandAccent: { 300: "#EAD9A8", 500: "#D8BE72", 700: "#B79A4D" },
        accent: {
          400: "#9CCC65",
          500: "#7CB342",
          600: "#689F38",
        },
      },
      fontFamily: { brand: ["var(--brand-serif)"] },
    },
  },
  plugins: [],
};
