/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1e3a5f',
          dark: '#142842',
          light: '#2d4f7c',
        },
        cyan: {
          DEFAULT: '#00b4d8',
          dark: '#0090ad',
        },
        paper: '#eef5fb',
        glow: '#00D4FF',
        warnglow: '#FFB800',
        okglow: '#00E676',
        badglow: '#FF5252',
        ink: '#0a0e1a',
        sub: '#B8C9E0',
      },
    },
  },
  plugins: [],
}
