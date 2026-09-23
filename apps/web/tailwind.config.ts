import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        card: "rgb(var(--color-card) / <alpha-value>)",
        raised: "rgb(var(--color-raised) / <alpha-value>)",
        line: {
          DEFAULT: "rgb(var(--color-line) / <alpha-value>)",
          strong: "rgb(var(--color-line-strong) / <alpha-value>)",
        },
        ink: {
          900: "rgb(var(--color-ink-900) / <alpha-value>)",
          700: "rgb(var(--color-ink-700) / <alpha-value>)",
          500: "rgb(var(--color-ink-500) / <alpha-value>)",
          400: "rgb(var(--color-ink-400) / <alpha-value>)",
        },
        brand: {
          50: "rgb(var(--color-brand-50) / <alpha-value>)",
          100: "rgb(var(--color-brand-100) / <alpha-value>)",
          200: "rgb(var(--color-brand-200) / <alpha-value>)",
          300: "rgb(var(--color-brand-300) / <alpha-value>)",
          400: "rgb(var(--color-brand-400) / <alpha-value>)",
          500: "rgb(var(--color-brand-500) / <alpha-value>)",
          600: "rgb(var(--color-brand-600) / <alpha-value>)",
          700: "rgb(var(--color-brand-700) / <alpha-value>)",
          800: "rgb(var(--color-brand-800) / <alpha-value>)",
          900: "rgb(var(--color-brand-900) / <alpha-value>)",
          950: "rgb(var(--color-brand-950) / <alpha-value>)",
          solid: "rgb(var(--color-brand-solid) / <alpha-value>)",
          "solid-hover": "rgb(var(--color-brand-solid-hover) / <alpha-value>)",
        },
        conn: {
          ok: "rgb(var(--state-ok) / <alpha-value>)",
          warn: "rgb(var(--state-warn) / <alpha-value>)",
          bad: "rgb(var(--state-bad) / <alpha-value>)",
          idle: "rgb(var(--state-idle) / <alpha-value>)",
        },
        state: {
          ok: "#0d9488",
          okSoft: "#ccfbf1",
          warn: "#d97706",
          warnSoft: "#fef3c7",
          bad: "#e11d48",
          badSoft: "#ffe4e6",
          idle: "#64748b",
          idleSoft: "#f1f5f9",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        card: "var(--shadow-1)",
        pop: "var(--shadow-2)",
        modal: "var(--shadow-3)",
      },
      borderRadius: { xl: "0.75rem", "2xl": "1rem" },
      transitionDuration: {
        fast: "var(--motion-fast)",
        normal: "var(--motion-normal)",
        slow: "var(--motion-slow)",
      },
      transitionTimingFunction: {
        "out-soft": "var(--ease-out)",
      },
    },
  },
  plugins: [],
};

export default config;
