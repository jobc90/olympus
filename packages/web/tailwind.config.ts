import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0f172a', // slate-900
        surface: '#1e293b', // slate-800
        accent: '#3b82f6', // blue-500
        'accent-hover': '#60a5fa', // blue-400
        text: '#f1f5f9', // slate-100
        'text-muted': '#cbd5e1', // slate-300
        border: '#334155', // slate-700
      },
    },
  },
  plugins: [],
} satisfies Config;
