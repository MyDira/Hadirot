/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  safelist: [
    'scale-105',
    'scale-110',
    'shadow-sm',
    'shadow-lg',
    'bg-brand-600',
    'border-t-brand-600',
    'border-t-white',
    'hover:scale-105',
    'hover:shadow-lg',
    'border-l-4',
    'border-r-4',
    'border-t-4',
    'border-l-transparent',
    'border-r-transparent',
  ],
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
        accent: {
          400: "#9CCC65",
          500: "#7CB342",
          600: "#689F38",
        },
      },
      fontFamily: {
        brand: ["var(--brand-serif)"],
        logo: ["var(--logo-font)"]
      },
    },
  },
  plugins: [],
};
