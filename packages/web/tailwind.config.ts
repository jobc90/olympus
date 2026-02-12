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

        // Theme CSS Variable Colors
        'theme-bg': 'var(--bg-primary)',
        'theme-bg-secondary': 'var(--bg-secondary)',
        'theme-card': 'var(--bg-card)',
        'theme-card-hover': 'var(--bg-card-hover)',
        'theme-text': 'var(--text-primary)',
        'theme-text-secondary': 'var(--text-secondary)',
        'theme-accent': 'var(--accent-primary)',
        'theme-success': 'var(--accent-success)',
        'theme-warning': 'var(--accent-warning)',
        'theme-danger': 'var(--accent-danger)',
        'theme-info': 'var(--accent-info)',
        'theme-border': 'var(--border)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
        pixel: ['"Press Start 2P"', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 212, 255, 0.3)',
        'glow-gold': '0 0 15px rgba(255, 215, 0, 0.2)',
        'glow-success': '0 0 10px rgba(16, 185, 129, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-in': 'slide-in 0.3s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 212, 255, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 212, 255, 0.4)' },
        },
        'slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
