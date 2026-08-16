/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#F7F4EE',
        parchment: '#EFE9DD',
        navy: {
          DEFAULT: '#10293B',
          light: '#1B3B52',
          dark: '#081722',
        },
        brass: {
          DEFAULT: '#B8863B',
          light: '#D3A75E',
          dark: '#8E6526',
        },
        sage: {
          DEFAULT: '#3C6E52',
          light: '#EAF1EC',
        },
        brick: {
          DEFAULT: '#A6472F',
          light: '#F6E7E2',
        },
        slate: {
          ink: '#3C4A52',
          muted: '#6B7A82',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 14px rgba(16, 41, 59, 0.08)',
        lifted: '0 10px 30px rgba(16, 41, 59, 0.14)',
      },
      borderRadius: {
        sm: '4px',
      },
    },
  },
  plugins: [],
};
