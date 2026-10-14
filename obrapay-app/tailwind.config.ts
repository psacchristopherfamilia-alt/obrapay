import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        charcoal: '#111B33',
        paper: '#F5F7FB',
        card: '#FFFFFF',
        ink: '#101828',
        inkSoft: '#667085',
        primary: '#2E5CFF',
        steel: '#475467',
        line: '#E3E7EF',
        success: '#12805C',
        warning: '#B5720A',
        danger: '#C23B3B',
        info: '#0E7490',
      },
      fontFamily: {
        heading: ['Manrope', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '10px',
        sm: '7px',
      },
    },
  },
  plugins: [],
} satisfies Config;
