import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Olympus Theme
        background: '#0A0F1C',
        surface: '#141B2D',
        'surface-hover': '#1E2942',
        'surface-active': '#253352',

        // Primary: Olympus Cyan
        primary: '#00D4FF',
        'primary-dim': '#0099CC',
        'primary-glow': 'rgba(0, 212, 255, 0.15)',

        // Secondary: Sparky Gold
        secondary: '#FFD700',
        'secondary-dim': '#B8860B',
        'secondary-glow': 'rgba(255, 215, 0, 0.15)',

        // Text
        text: '#FFFFFF',
        'text-secondary': '#94A3B8',
        'text-muted': '#64748B',

        // Status
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',

        // Border
        border: '#1E293B',
        'border-active': '#00D4FF',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 212, 255, 0.3)',
        'glow-gold': '0 0 15px rgba(255, 215, 0, 0.2)',
        'glow-success': '0 0 10px rgba(16, 185, 129, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 212, 255, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 212, 255, 0.4)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
