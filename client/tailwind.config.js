/** @type {import('tailwindcss').Config} */
export default {
  content: { relative: true, files: ['./index.html', './src/**/*.{js,jsx}'] },
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#eef4ff', 100: '#d9e6ff', 200: '#bcd3ff', 300: '#8eb6ff', 400: '#598dff', 500: '#3366ff', 600: '#1f47f5', 700: '#1834e1', 800: '#1a2db6', 900: '#1b2c8f', 950: '#151d57' },
      },
    },
  },
  plugins: [],
};
