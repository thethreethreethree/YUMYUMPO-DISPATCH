/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scan every HTML/JS source so dynamically inserted classes aren't purged.
  content: [
    "./*.html",
    "./assets/js/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        "brand-yellow":  "#FFD000",
        "yellow-dark":   "#E6BB00",
        "yellow-light":  "#FFF9D6",
        "yellow-pale":   "#FFFDF0",
        "brand-black":   "#111111",
        "black-soft":    "#1E1E1E",
        "gray-50":       "#F9F9F9",
        "gray-100":      "#F3F3F3",
        "gray-200":      "#E8E8E8",
        "gray-400":      "#ABABAB",
        "gray-600":      "#6B6B6B",
        // Legacy aliases so older markup still resolves to the new palette.
        cream:     "#FFFFFF",
        warm:      "#F9F9F9",
        beige:     "#FFF9D6",
        charcoal:  "#111111",
        ink:       "#1E1E1E",
        ember:     "#FFD000",
        dust:      "#6B6B6B",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "Inter", "system-ui", "sans-serif"],
        sans:    ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  // Safelist a few utility classes that are constructed at runtime (status
  // colours, badge tones, etc.) and would otherwise be tree-shaken away.
  safelist: [
    "status-online", "status-available", "status-busy", "status-offline",
    "tone-yellow", "tone-green", "tone-red", "tone-gray",
    "from-left",
  ],
  plugins: [],
};
