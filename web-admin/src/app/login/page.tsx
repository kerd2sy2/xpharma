'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { IconLoader2, IconAlertCircle } from '@tabler/icons-react';

declare global {
  interface Window {
    google?: any;
  }
}

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  '691858081100-sc5nk157i5vjejhr52pgm8kkh1ofore6.apps.googleusercontent.com';

export default function LoginPage() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Handle Google OAuth callback if redirected with access_token in hash
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = params.get('access_token');
      if (accessToken) {
        setGoogleLoading(true);
        setErrorMsg(null);
        // Delegate verification securely to backend
        fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken })
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.user) {
              localStorage.setItem('xpharma_user', JSON.stringify(data.user));
              router.push('/dashboard/overview');
            } else {
              setErrorMsg(data.error || 'عذراً، هذا الحساب غير مصرح له بالوصول إلى لوحة التحكم');
              setGoogleLoading(false);
            }
          })
          .catch(() => {
            setErrorMsg('حدث خطأ أثناء معالجة تسجيل الدخول. يرجى المحاولة مرة أخرى.');
            setGoogleLoading(false);
          });
      }
    }
  }, [router]);

  // Load Google Identity Services (GIS)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredentialResponse,
          auto_select: false
        });
      }
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleGoogleCredentialResponse = async (response: any) => {
    if (response?.credential) {
      setGoogleLoading(true);
      setErrorMsg(null);
      try {
        // Send token to backend API for secure verification
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_token: response.credential })
        });

        const data = await res.json();

        if (data.success && data.user) {
          localStorage.setItem('xpharma_user', JSON.stringify(data.user));
          router.push('/dashboard/overview');
        } else {
          setErrorMsg(data.error || 'عذراً، هذا الحساب غير مصرح له بالوصول إلى لوحة التحكم');
          setGoogleLoading(false);
        }
      } catch (err) {
        console.error('Auth verification error:', err);
        setErrorMsg('فشل الاتصال بخدمة التحقق، يرجى المحاولة لاحقاً');
        setGoogleLoading(false);
      }
    }
  };

  const handleGoogleLogin = () => {
    setErrorMsg(null);
    setGoogleLoading(true);

    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          triggerGoogleOAuthRedirect();
        }
      });
    } else {
      triggerGoogleOAuthRedirect();
    }
  };

  const triggerGoogleOAuthRedirect = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://xpharma.cloud';
    const scope = 'openid email profile';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      GOOGLE_CLIENT_ID
    )}&redirect_uri=${encodeURIComponent(
      origin
    )}&response_type=token&scope=${encodeURIComponent(scope)}&prompt=select_account`;
    window.location.href = authUrl;
  };

  return (
    <div className='min-h-screen w-full flex items-center justify-center bg-background text-foreground p-4 antialiased selection:bg-primary selection:text-primary-foreground'>
      <div className='w-full max-w-sm flex flex-col items-center text-center space-y-6'>
        {/* Brand Header */}
        <div className='flex flex-col items-center space-y-3'>
          <div className='relative w-16 h-16 rounded-2xl overflow-hidden border border-border bg-card p-1.5 shadow-sm'>
            <Image
              src='/logo.png'
              alt='xpharma Logo'
              width={64}
              height={64}
              className='w-full h-full object-contain rounded-xl'
              priority
            />
          </div>
          <div className='space-y-1'>
            <h1 className='text-2xl font-bold tracking-tight text-foreground'>
              xpharma Cloud
            </h1>
            <p className='text-sm text-muted-foreground'>
              لوحة تحكم الإدارة المركزية
            </p>
          </div>
        </div>

        {/* Minimal Login Card */}
        <div className='w-full bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4'>
          {/* Error Message */}
          {errorMsg && (
            <div className='flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs text-right leading-relaxed animate-in fade-in duration-150'>
              <IconAlertCircle className='w-4 h-4 shrink-0 mt-0.5' />
              <div>{errorMsg}</div>
            </div>
          )}

          {/* Clean Google Button */}
          <button
            type='button'
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className='w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-input bg-background hover:bg-muted text-foreground font-medium text-sm transition-all duration-150 shadow-xs hover:shadow-sm active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'
          >
            {googleLoading ? (
              <>
                <IconLoader2 className='w-4 h-4 animate-spin text-muted-foreground' />
                <span>جاري التحقق والدخول...</span>
              </>
            ) : (
              <>
                <svg className='w-4 h-4 shrink-0' viewBox='0 0 24 24'>
                  <path
                    fill='#4285F4'
                    d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
                  />
                  <path
                    fill='#34A853'
                    d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
                  />
                  <path
                    fill='#FBBC05'
                    d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z'
                  />
                  <path
                    fill='#EA4335'
                    d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z'
                  />
                </svg>
                <span>تسجيل الدخول بواسطة Google</span>
              </>
            )}
          </button>
        </div>

        {/* Minimal Footer */}
        <p className='text-xs text-muted-foreground font-mono'>
          &copy; 2026 xpharma Cloud
        </p>
      </div>
    </div>
  );
}
