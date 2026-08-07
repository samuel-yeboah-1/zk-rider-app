import { Platform } from 'react-native';

export const theme = {
  colors: {
    bg: '#061019',
    bgDeep: '#040b12',
    surface: '#0c1826',
    surfaceAlt: '#122234',
    surfaceGlass: 'rgba(20,40,64,0.55)',
    border: '#173049',
    borderBright: '#26507a',

    text: '#eaf3fb',
    textMuted: '#7191ad',
    textDim: '#43607d',

    primary: '#4bb7e8',
    primaryText: '#00121e',
    sky: '#4bb7e8',
    skyLight: '#8fd6f4',
    blue: '#2b93d6',
    blueDeep: '#1b74bb',

    accent: '#1b74bb',
    cyan: '#4bb7e8',
    magenta: '#2b93d6',
    green: '#33c9d6',

    warning: '#ffb74d',
    danger: '#ff5470',
  },
  glow: (color: string, radius = 16, opacity = 0.9) => ({
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: 0 },
    elevation: Math.round(radius / 2),
  }),
  font: {
    mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
  },
  radius: { sm: 8, md: 14, lg: 22, xl: 30, pill: 999 },
  spacing: (n: number) => n * 4,
} as const;
