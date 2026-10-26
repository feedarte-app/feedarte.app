/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#EEF2FF', 100: '#E0E7FF', 500: '#3B5BDB', 600: '#2F4AC4', 700: '#2840A8' },
        ink: { 900: '#111114', 700: '#3A3A40', 500: '#6B6B73', 400: '#8E8E96', 300: '#C4C4CA', 200: '#E4E4E8', 100: '#F1F1F4', 50: '#F7F7F9' },
      },
      boxShadow: { card: '0 1px 2px rgba(16,16,20,.04), 0 1px 8px rgba(16,16,20,.04)' },
    },
  },
  plugins: [],
};
