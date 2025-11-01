/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-light': 'var(--color-surface-light)',
        primary: 'var(--color-primary)',
        accent: 'var(--color-accent)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        border: 'var(--color-border)',

        // Status colors
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',

        // Sidebar colors (stays dark regardless of theme)
        'sidebar-bg': 'var(--color-sidebar-bg)',
        'sidebar-surface': 'var(--color-sidebar-surface)',
        'sidebar-text': 'var(--color-sidebar-text)',
        'sidebar-text-muted': 'var(--color-sidebar-text-muted)',
        'sidebar-accent': 'var(--color-sidebar-accent)',
      },
    },
  },
  plugins: [],
}
