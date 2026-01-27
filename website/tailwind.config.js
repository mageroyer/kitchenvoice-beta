/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Marche Template Colors
        marche: {
          forest: '#2C5530',
          cream: '#F5F1EB',
          walnut: '#8B4513',
          gold: '#D4AF37',
        },
        // Dynamic colors set via CSS variables
        primary: 'var(--color-primary)',
        accent: 'var(--color-accent)',
      },
      fontFamily: {
        display: ['Playfair Display', 'serif'],
        body: ['Source Sans Pro', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
