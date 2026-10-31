import type { Config } from "tailwindcss";

// Apple-inspired palette. Existing utility names (slate/blue/emerald/rose/amber/…) keep
// working, but now resolve to Apple's neutral grays and system colors, so the whole UI
// shares one restrained accent instead of the multi-hue violet/indigo look.
const appleGray = {
  50: "#F5F5F7",
  100: "#EDEDF0",
  200: "#E0E0E5",
  300: "#D1D1D6",
  400: "#A1A1A6",
  500: "#86868B",
  600: "#6E6E73",
  700: "#48484A",
  800: "#2C2C2E",
  900: "#1D1D1F",
  950: "#111112",
};
const appleBlue = {
  50: "#EEF5FF",
  100: "#DCEBFF",
  200: "#B8D6FF",
  300: "#8BBDFF",
  400: "#4A9BFF",
  500: "#0A84FF",
  600: "#0071E3",
  700: "#0062C4",
  800: "#004F9E",
  900: "#003C78",
  950: "#00264D",
};
const appleGreen = {
  50: "#EDFAF1",
  100: "#D4F4DE",
  200: "#A8E9BD",
  300: "#74D995",
  400: "#45C86E",
  500: "#34C759",
  600: "#248A3D",
  700: "#1D7233",
  800: "#165A28",
  900: "#10441E",
  950: "#082A12",
};
const appleRed = {
  50: "#FFF0EF",
  100: "#FFDEDB",
  200: "#FFBDB8",
  300: "#FF928A",
  400: "#FF6259",
  500: "#FF3B30",
  600: "#D70015",
  700: "#B50012",
  800: "#8F000E",
  900: "#6B000A",
  950: "#420006",
};
const appleOrange = {
  50: "#FFF7EB",
  100: "#FFEBCC",
  200: "#FFD699",
  300: "#FFBF5C",
  400: "#FFA826",
  500: "#FF9500",
  600: "#C96A00",
  700: "#A35200",
  800: "#7A3D00",
  900: "#5C2E00",
  950: "#3A1D00",
};

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        slate: appleGray,
        gray: appleGray,
        blue: appleBlue,
        // Former "AI" accents collapse into the single system accent.
        sky: appleBlue,
        indigo: appleBlue,
        violet: appleBlue,
        purple: appleBlue,
        fuchsia: appleBlue,
        emerald: appleGreen,
        green: appleGreen,
        rose: appleRed,
        red: appleRed,
        amber: appleOrange,
        orange: appleOrange,
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        popover: "hsl(var(--popover))",
        "popover-foreground": "hsl(var(--popover-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",
        ai: "hsl(var(--ai))",
      },
      // Controls 8px, cards 12px, sheets 14px — Apple's continuous, modest corners.
      borderRadius: {
        "2xl": "14px",
        xl: "12px",
        lg: "8px",
        md: "7px",
        sm: "5px",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.04)",
        soft: "0 1px 2px rgba(0, 0, 0, 0.05)",
        sheet: "0 24px 64px rgba(0, 0, 0, 0.18), 0 0 0 0.5px rgba(0, 0, 0, 0.12)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"Helvetica Neue"',
          "Inter",
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
        mono: ['"SF Mono"', "ui-monospace", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to right, rgba(148, 163, 184, 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.06) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;
