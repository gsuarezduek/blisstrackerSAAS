/** @type {import('tailwindcss').Config} */
// Misma paleta `primary` que frontend/tailwind.config.js — el JSX de la landing se
// copió tal cual, así que las clases tienen que resolver a los mismos colores.
// El sitio público NO tiene dark mode (la app sí): no se declara `darkMode`.
export default {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
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
      keyframes: {
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
    },
  },
  plugins: [],
}
