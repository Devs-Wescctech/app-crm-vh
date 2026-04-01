/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
        extend: {
                fontFamily: {
                        sans: ['Inter', 'system-ui', 'sans-serif'],
                        display: ['Space Grotesk', 'Inter', 'sans-serif'],
                },
                borderRadius: {
                        lg: 'var(--radius)',
                        md: 'calc(var(--radius) - 2px)',
                        sm: 'calc(var(--radius) - 4px)',
                        xl: 'calc(var(--radius) + 4px)',
                        '2xl': 'calc(var(--radius) + 8px)',
                        '3xl': '1.5rem',
                },
                colors: {
                        background: 'hsl(var(--background))',
                        foreground: 'hsl(var(--foreground))',
                        card: {
                                DEFAULT: 'hsl(var(--card))',
                                foreground: 'hsl(var(--card-foreground))'
                        },
                        popover: {
                                DEFAULT: 'hsl(var(--popover))',
                                foreground: 'hsl(var(--popover-foreground))'
                        },
                        primary: {
                                DEFAULT: 'hsl(var(--primary))',
                                foreground: 'hsl(var(--primary-foreground))'
                        },
                        secondary: {
                                DEFAULT: 'hsl(var(--secondary))',
                                foreground: 'hsl(var(--secondary-foreground))'
                        },
                        muted: {
                                DEFAULT: 'hsl(var(--muted))',
                                foreground: 'hsl(var(--muted-foreground))'
                        },
                        accent: {
                                DEFAULT: 'hsl(var(--accent))',
                                foreground: 'hsl(var(--accent-foreground))'
                        },
                        destructive: {
                                DEFAULT: 'hsl(var(--destructive))',
                                foreground: 'hsl(var(--destructive-foreground))'
                        },
                        success: {
                                DEFAULT: 'hsl(var(--success))',
                                foreground: 'hsl(var(--success-foreground))'
                        },
                        warning: {
                                DEFAULT: 'hsl(var(--warning))',
                                foreground: 'hsl(var(--warning-foreground))'
                        },
                        info: {
                                DEFAULT: 'hsl(var(--info))',
                                foreground: 'hsl(var(--info-foreground))'
                        },
                        border: 'hsl(var(--border))',
                        input: 'hsl(var(--input))',
                        ring: 'hsl(var(--ring))',
                        chart: {
                                '1': 'hsl(var(--chart-1))',
                                '2': 'hsl(var(--chart-2))',
                                '3': 'hsl(var(--chart-3))',
                                '4': 'hsl(var(--chart-4))',
                                '5': 'hsl(var(--chart-5))'
                        },
                        sidebar: {
                                DEFAULT: 'hsl(var(--sidebar-background))',
                                foreground: 'hsl(var(--sidebar-foreground))',
                                primary: 'hsl(var(--sidebar-primary))',
                                'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
                                accent: 'hsl(var(--sidebar-accent))',
                                'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
                                border: 'hsl(var(--sidebar-border))',
                                ring: 'hsl(var(--sidebar-ring))'
                        }
                },
                boxShadow: {
                        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
                        'glass-lg': '0 20px 40px -24px rgba(31, 38, 135, 0.15)',
                        'glow': '0 0 20px rgba(59, 130, 246, 0.3)',
                        'glow-lg': '0 0 40px rgba(59, 130, 246, 0.4)',
                        'soft': '0 2px 8px -2px rgba(0, 0, 0, 0.05), 0 4px 16px -4px rgba(0, 0, 0, 0.08)',
                        'soft-lg': '0 4px 12px -4px rgba(0, 0, 0, 0.08), 0 8px 24px -8px rgba(0, 0, 0, 0.12)',
                        'inner-glow': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
                        'card-hover': '0 20px 50px -12px rgba(0, 0, 0, 0.15)',
                },
                backdropBlur: {
                        xs: '2px',
                },
                keyframes: {
                        'accordion-down': {
                                from: { height: '0' },
                                to: { height: 'var(--radix-accordion-content-height)' }
                        },
                        'accordion-up': {
                                from: { height: 'var(--radix-accordion-content-height)' },
                                to: { height: '0' }
                        },
                        'fade-in': {
                                from: { opacity: '0' },
                                to: { opacity: '1' }
                        },
                        'fade-in-up': {
                                from: { opacity: '0', transform: 'translateY(10px)' },
                                to: { opacity: '1', transform: 'translateY(0)' }
                        },
                        'fade-in-down': {
                                from: { opacity: '0', transform: 'translateY(-10px)' },
                                to: { opacity: '1', transform: 'translateY(0)' }
                        },
                        'slide-in-left': {
                                from: { opacity: '0', transform: 'translateX(-20px)' },
                                to: { opacity: '1', transform: 'translateX(0)' }
                        },
                        'slide-in-right': {
                                from: { opacity: '0', transform: 'translateX(20px)' },
                                to: { opacity: '1', transform: 'translateX(0)' }
                        },
                        'scale-in': {
                                from: { opacity: '0', transform: 'scale(0.95)' },
                                to: { opacity: '1', transform: 'scale(1)' }
                        },
                        'pulse-soft': {
                                '0%, 100%': { opacity: '1' },
                                '50%': { opacity: '0.7' }
                        },
                        'shimmer': {
                                from: { backgroundPosition: '-200% 0' },
                                to: { backgroundPosition: '200% 0' }
                        },
                        'float': {
                                '0%, 100%': { transform: 'translateY(0)' },
                                '50%': { transform: 'translateY(-5px)' }
                        },
                        'glow-pulse': {
                                '0%, 100%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)' },
                                '50%': { boxShadow: '0 0 30px rgba(59, 130, 246, 0.5)' }
                        },
                        'count-up': {
                                from: { transform: 'translateY(100%)' },
                                to: { transform: 'translateY(0)' }
                        },
                },
                animation: {
                        'accordion-down': 'accordion-down 0.2s ease-out',
                        'accordion-up': 'accordion-up 0.2s ease-out',
                        'fade-in': 'fade-in 0.3s ease-out',
                        'fade-in-up': 'fade-in-up 0.4s ease-out',
                        'fade-in-down': 'fade-in-down 0.4s ease-out',
                        'slide-in-left': 'slide-in-left 0.3s ease-out',
                        'slide-in-right': 'slide-in-right 0.3s ease-out',
                        'scale-in': 'scale-in 0.2s ease-out',
                        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
                        'shimmer': 'shimmer 2s linear infinite',
                        'float': 'float 3s ease-in-out infinite',
                        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
                        'count-up': 'count-up 0.5s ease-out',
                }
        }
  },
  plugins: [require("tailwindcss-animate")],
}