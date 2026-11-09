/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        // Feedarte warm orange
        brand: { 50: 'rgb(var(--brand-50) / <alpha-value>)', 100: 'rgb(var(--brand-100) / <alpha-value>)', 200: 'rgb(var(--brand-200) / <alpha-value>)', 300: '#FFB27F', 400: '#FF8A3D', 500: '#FF6B1A', 600: '#F25500', 700: '#C44400' },
        // theme-aware (see web/src/index.css :root / .dark)
        ink: Object.fromEntries([900, 800, 700, 600, 500, 400, 300, 200, 100, 50].map((k) => [k, `rgb(var(--ink-${k}) / <alpha-value>)`])),
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        card: '0 1px 2px rgba(20,20,22,.04), 0 1px 10px rgba(20,20,22,.04)',
        island: '0 1px 2px rgba(20,20,22,.04), 0 10px 30px -12px rgba(20,20,22,.10)',
        lift: '0 2px 4px rgba(20,20,22,.04), 0 18px 40px -16px rgba(20,20,22,.22)',
        glow: '0 8px 22px -8px rgba(255,107,26,.65)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        'pop-in': { from: { opacity: 0, transform: 'scale(.96) translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        'slide-up': { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'none' } },
        backdrop: { from: { opacity: 0 }, to: { opacity: 1 } },
        shimmer: { from: { backgroundPosition: '-400px 0' }, to: { backgroundPosition: '400px 0' } },
      },
      animation: {
        'fade-in': 'fade-in .35s cubic-bezier(.2,.7,.2,1) both',
        'pop-in': 'pop-in .28s cubic-bezier(.2,.8,.2,1) both',
        'slide-up': 'slide-up .3s cubic-bezier(.2,.8,.2,1) both',
        backdrop: 'backdrop .2s ease-out both',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
};
