/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        ink: '#37352f', muted: '#787774', faint: '#9b9a97',
        line: '#ededeb', hover: '#f7f7f5', chip: '#f1f1ef', page: '#fbfbfa',
        ok: '#0f7b6c', warn: '#cb912f', danger: '#e03e3e', info: '#337ea9',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
};
