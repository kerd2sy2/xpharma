'use client';

import React, { useEffect } from 'react';
import { useClerk } from '@clerk/nextjs';
import { Icons } from '@/components/icons';

export default function LogoutPage() {
  const { signOut } = useClerk();

  useEffect(() => {
    async function performLogout() {
      try {
        document.cookie = 'xpharma_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0; SameSite=Lax';
        localStorage.removeItem('xpharma_user');
        sessionStorage.clear();
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch (_) {}
        if (signOut) {
          try {
            await signOut();
          } catch (_) {}
        }
      } finally {
        window.location.href = '/login';
      }
    }
    performLogout();
  }, [signOut]);

  return (
    <div className='flex h-screen w-full flex-col items-center justify-center gap-3 bg-background' dir='rtl'>
      <Icons.spinner className='h-8 w-8 animate-spin text-primary' />
      <p className='text-sm font-medium text-muted-foreground'>جاري تسجيل الخروج والتحويل إلى صفحة الدخول...</p>
    </div>
  );
}
