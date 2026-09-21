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
      },
    },
  },
  plugins: [],
}
