import '@/global.css';
import { Platform } from 'react-native';

export const BrandColors = {
  purple: '#3f0082',
  green: '#00d780',
  purpleDark: '#2a0058',
  purpleLight: '#590ea8',
  greenDark: '#00b368',
  greenLight: '#26e696',
} as const;

export const Colors = {
  light: {
    text: '#1A0A33',
    background: '#F9F7FD',
    card: '#FFFFFF',
    border: '#E9E3F3',
    textSecondary: '#6B5E82',
    primary: '#3f0082',
    primarySoft: '#3f008215',
    secondary: '#00d780',
    secondarySoft: '#00d78018',
    success: '#00d780',
    successSoft: '#00d78018',
    backgroundElement: '#F2EEFB',
    backgroundSelected: '#E3DCF5',
  },
  dark: {
    text: '#1A0A33',
    background: '#F9F7FD',
    card: '#FFFFFF',
    border: '#E9E3F3',
    textSecondary: '#6B5E82',
    primary: '#3f0082',
    primarySoft: '#3f008215',
    secondary: '#00d780',
    secondarySoft: '#00d78018',
    success: '#00d780',
    successSoft: '#00d78018',
    backgroundElement: '#F2EEFB',
    backgroundSelected: '#E3DCF5',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
