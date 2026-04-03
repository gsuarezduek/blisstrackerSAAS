/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#FFF4E8',
          100: '#FFE3C2',
          200: '#FFC88A',
          300: '#FFA84D',
          400: '#FF9A2E',
          500: '#F7931A',
          600: '#E67E00',
          700: '#CC6F00',
          800: '#A35800',
          900: '#3D2100',
        },
      },
    },
  },
  plugins: [],
}
