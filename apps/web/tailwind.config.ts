import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        "baykus-bg": "#f4f7fb",
        "baykus-card": "#ffffff",
        "baykus-line": "#d7dee8",
        "baykus-text": "#111827",
        "baykus-muted": "#6b7280",
        "baykus-primary": "#2563eb",
        "baykus-primary-dark": "#1d4ed8",
        "baykus-success": "#16a34a",
        "baykus-splash": "#1b2230",
        "baykus-accent": "#93c5fd",
        "baykus-navy": "#1e293b",
        baykus: {
          bg: "#f4f7fb",
          card: "#ffffff",
          line: "#d7dee8",
          text: "#111827",
          muted: "#6b7280",
          primary: "#2563eb",
          "primary-dark": "#1d4ed8",
          success: "#16a34a",
          splash: "#1b2230",
          accent: "#93c5fd",
          navy: "#1e293b",
          50: "#f4f7fb",
          100: "#e0effe",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1e3a8a",
          900: "#111827",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(17, 24, 39, 0.04), 0 1px 3px rgba(17, 24, 39, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
