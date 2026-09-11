'use client';
import { ClerkProvider } from '@clerk/nextjs';
import React from 'react';
import { ActiveThemeProvider } from '../themes/active-theme';
import QueryProvider from './query-provider';

export default function Providers({
  activeThemeValue,
  children
}: {
  activeThemeValue: string;
  children: React.ReactNode;
}) {
  const publishableKey =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k';

  return (
    <ActiveThemeProvider initialTheme={activeThemeValue}>
      <ClerkProvider
        publishableKey={publishableKey}
        appearance={{
          variables: {
            colorPrimary: 'var(--primary)',
            colorPrimaryForeground: 'var(--primary-foreground)',
            colorDanger: 'var(--destructive)',
            colorBackground: 'var(--card)',
            colorForeground: 'var(--foreground)',
            colorMuted: 'var(--muted)',
            colorMutedForeground: 'var(--muted-foreground)',
            colorInput: 'var(--input)',
            colorInputForeground: 'var(--foreground)',
            colorBorder: 'var(--border)',
            colorRing: 'var(--ring)',
            fontFamily: 'var(--font-sans)'
          }
        }}
      >
        <QueryProvider>{children}</QueryProvider>
      </ClerkProvider>
    </ActiveThemeProvider>
  );
}
