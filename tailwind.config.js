/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Barlow', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        flomo: {
          green: '#2CCC74',
          forest: '#176D3E',
          sand: '#F4DCA4',
          sandMuted: '#CFBE9A',
          slate: '#747C84',
        },
        morgen: {
          black: '#191A23',
          surface: '#21222D',
          elevated: '#282A38',
          border: '#323546',
          red: '#FF8295',
          rose: '#C84A59',
          wine: '#3C1C26',
          yellow: '#F3C26A',
          gold: '#A58854',
          slate: '#76879D',
          slateHover: '#3A4554',
          body: '#CBCCCC',
          muted: '#858B99',
        },
      },
    },
  },
  plugins: [],
};
