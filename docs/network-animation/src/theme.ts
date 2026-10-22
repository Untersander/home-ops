// GitHub's Primer colors, so the GIFs blend into the README in both themes
export type ThemeName = 'dark' | 'light';

export type Theme = {
  bg: string;
  fg: string;
  muted: string;
  card: string;
  border: string;
  blue: string;
  green: string;
  orange: string;
  purple: string;
};

export const themes: Record<ThemeName, Theme> = {
  dark: {
    bg: '#0d1117',
    fg: '#e6edf3',
    muted: '#8b949e',
    card: '#161b22',
    border: '#30363d',
    blue: '#58a6ff',
    green: '#3fb950',
    orange: '#d29922',
    purple: '#bc8cff',
  },
  light: {
    bg: '#ffffff',
    fg: '#1f2328',
    muted: '#59636e',
    card: '#f6f8fa',
    border: '#d1d9e0',
    blue: '#0969da',
    green: '#1a7f37',
    orange: '#9a6700',
    purple: '#8250df',
  },
};
