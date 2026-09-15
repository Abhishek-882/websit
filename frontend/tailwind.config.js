/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        darkBg: '#090d16',
        panelBg: '#0f172a',
        cardBg: '#131d31',
        borderCol: '#1e293b',
        brandCyan: '#06b6d4',
        brandEmerald: '#10b981',
        brandPurple: '#a855f7',
      },
    },
  },
  plugins: [],
}
