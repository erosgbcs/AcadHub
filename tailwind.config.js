// tailwind.config.js
tailwind.config = {
  theme: {
    extend: {
      transitionTimingFunction: {
        'ios':     'cubic-bezier(0.32, 0.72, 0, 1)',
        'ios-pop': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'ios-fade-in':   { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'ios-fade-out':  { '0%': { opacity: '1' }, '100%': { opacity: '0' } },
        'ios-pop-in': {
          '0%':   { opacity: '0', transform: 'scale(0.92) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'ios-pop-out': {
          '0%':   { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.96)' },
        },
        'ios-sheet-up': {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'ios-sheet-down': {
          '0%':   { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      animation: {
        'ios-fade-in':    'ios-fade-in 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
        'ios-fade-out':   'ios-fade-out 0.2s cubic-bezier(0.4, 0, 1, 1) forwards',
        'ios-pop-in':     'ios-pop-in 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
        'ios-pop-out':    'ios-pop-out 0.2s cubic-bezier(0.4, 0, 1, 1) forwards',
        'ios-sheet-up':   'ios-sheet-up 0.36s cubic-bezier(0.32, 0.72, 0, 1)',
        'ios-sheet-down': 'ios-sheet-down 0.25s cubic-bezier(0.4, 0, 1, 1) forwards',
      },
    },
  },
};