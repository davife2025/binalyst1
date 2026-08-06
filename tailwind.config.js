/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Syne', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
      colors: {
        brand: {
          yellow: '#F0B90B',
          green:  '#0ECB81',
          red:    '#F6465D',
          bg:     '#0B0E11',
          bg2:    '#161A1F',
          bg3:    '#1E2329',
          bg4:    '#2B3139',
          border: '#2B3139',
          text:   '#EAECEF',
          muted:  '#848E9C',
          dim:    '#474D57',
        },
      },
    },
  },
  plugins: [],
}