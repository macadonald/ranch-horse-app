/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      colors: {
        ranch: {
          50:  '#fdf8f0',
          100: '#f9ead6',
          200: '#f2d5ac',
          300: '#e8b87a',
          400: '#d4924a',
          500: '#b8742a',
          600: '#8f5420',
          700: '#6b3d18',
          800: '#4a2a10',
          900: '#2d1a0a',
        },
        sage: {
          50:  '#f4f7f0',
          100: '#e2ead8',
          200: '#c4d4b0',
          300: '#9ab882',
          400: '#739a58',
          500: '#567a3e',
          600: '#3f5f2d',
          700: '#2e4620',
          800: '#1e2e15',
          900: '#111c0c',
        },
        dark: {
          900: '#1a1410',
          800: '#2a2018',
          700: '#3a2e22',
          600: '#4a3c2e',
        }
      }
    },
  },
  plugins: [],
}
