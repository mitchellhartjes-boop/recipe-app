/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#faf8f5',
        paper: '#fffdfa',
        ink: '#292524',
        paprika: {
          50: '#fef6f1',
          100: '#fde9dd',
          200: '#fbcfb8',
          300: '#f7ab87',
          400: '#f17a4f',
          500: '#e85829',
          600: '#d63f17',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(41,37,36,0.04), 0 8px 24px -12px rgba(41,37,36,0.12)',
      },
    },
  },
  plugins: [],
}
