/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#05070f",
          900: "#070b14",
          800: "#0c1220",
          700: "#121826",
        },
        accent: {
          DEFAULT: "#6ea8ff",
          violet: "#8b5cf6",
          mint: "#34d399",
          rose: "#f87171",
        },
      },
      boxShadow: {
        glow: "0 0 40px rgba(110,168,255,0.25)",
      },
      backgroundImage: {
        mesh: "radial-gradient(120% 80% at 10% -10%, rgba(110,168,255,0.25), transparent 50%), radial-gradient(80% 60% at 100% 0%, rgba(139,92,246,0.2), transparent 45%)",
      },
    },
  },
  plugins: [],
};
