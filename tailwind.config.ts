import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "system-ui",
          "Segoe UI",
          "sans-serif",
        ],
      },
      colors: {
        // System
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Apple system colors
        "apple-gray": {
          50: "#F2F2F7",
          100: "#E5E5EA",
          200: "#D1D1D6",
          300: "#C7C7CC",
          400: "#AEAEB2",
          500: "#8E8E93",
          600: "#636366",
          700: "#48484A",
          800: "#3A3A3C",
          900: "#2C2C2E",
          950: "#1C1C1E",
        },
        // Agent accent colors
        "agent-alex": "#1C1C1E",
        "agent-jeremy": "#2d5f3f",
        "agent-kai": "#1f3a5f",
        "agent-dana": "#6b4423",
        "agent-marcus": "#4a2c4a",
      },
      borderRadius: {
        "apple-sm": "8px",
        "apple-md": "12px",
        "apple-lg": "16px",
        "apple-xl": "20px",
        "apple-2xl": "28px",
      },
      boxShadow: {
        "apple-sm": "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
        "apple-md": "0 4px 16px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.08)",
        "apple-lg": "0 8px 32px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)",
        "apple-xl": "0 20px 60px rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.10)",
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      },
      transitionDuration: {
        "200": "200ms",
        "300": "300ms",
      },
      backdropBlur: {
        apple: "20px",
      },
      keyframes: {
        "typing-dot": {
          "0%, 60%, 100%": { transform: "translateY(0)", opacity: "0.4" },
          "30%": { transform: "translateY(-4px)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-left": {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "typing-dot": "typing-dot 1.2s ease-in-out infinite",
        "fade-in": "fade-in 200ms ease forwards",
        "slide-in-right": "slide-in-right 200ms ease forwards",
        "slide-in-left": "slide-in-left 200ms ease forwards",
      },
    },
  },
  plugins: [],
};

export default config;
