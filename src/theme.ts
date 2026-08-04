export const theme = {
  colors: {
    bg: '#0e1116',
    surface: '#171c24',
    surfaceAlt: '#1f2630',
    border: '#2a323d',
    text: '#f2f5f8',
    textMuted: '#8b97a6',
    primary: '#3ddc84',
    primaryText: '#06210f',
    danger: '#ff5c5c',
    warning: '#ffb020',
    accent: '#4a9dff',
  },
  radius: { sm: 8, md: 12, lg: 20 },
  spacing: (n: number) => n * 4,
} as const;
