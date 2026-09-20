'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  IconLoader2,
  IconAlertCircle,
  IconShieldCheck,
  IconServer2,
  IconReceipt2,
  IconSparkles,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';

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
  const [gisLoaded, setGisLoaded] = useState(false);
  const buttonContainerRef = useRef<HTMLDivElement>(null);

  // Handle Google OAuth callback if redirected with access_token in hash
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = params.get('access_token');
      if (accessToken) {
        setGoogleLoading(true);
        setErrorMsg(null);
        fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.user) {
              document.cookie = 'xpharma_session=authenticated; path=/; max-age=604800; SameSite=Lax';
              localStorage.setItem('xpharma_user', JSON.stringify(data.user));
              window.location.href = '/dashboard/overview';
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

  // Load Google Identity Services (GIS) and initialize auto-prompt & native button
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Reset Google One Tap cooldown cookie so prompt is never suppressed
    document.cookie = 'g_state=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT;';

    // Expose global callback for GIS
    (window as any).handleGoogleCredentialResponse = handleGoogleCredentialResponse;

    const setupGIS = () => {
      if (!window.google?.accounts?.id) return;

      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredentialResponse,
          auto_select: true,
          itp_support: true,
          use_fedcm_for_prompt: false,
          cancel_on_tap_outside: false,
          context: 'signin',
        });

        // Trigger floating One-Tap prompt at the top
        window.google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed()) {
            console.log('One-tap not displayed reason:', notification.getNotDisplayedReason());
          }
        });

        // Render official Google button into the hidden container for fallback
        if (buttonContainerRef.current) {
          buttonContainerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(buttonContainerRef.current, {
            theme: 'outline',
            size: 'large',
            type: 'standard',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: 320,
          });
          setGisLoaded(true);
        }
      } catch (e) {
        console.warn('Google Identity Services setup failed:', e);
      }
    };

    if (window.google?.accounts?.id) {
      setupGIS();
    } else {
      const existingScript = document.getElementById('google-gsi-client');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'google-gsi-client';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = setupGIS;
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener('load', setupGIS);
      }
    }
  }, []);

  const handleGoogleCredentialResponse = async (response: any) => {
    if (!response || !response.credential) {
      setErrorMsg('لم يتم استلام بيانات التحقق من جوجل. يرجى المحاولة مجدداً.');
      return;
    }

    setGoogleLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await res.json();

      if (res.ok && data.success && data.user) {
        document.cookie = 'xpharma_session=authenticated; path=/; max-age=604800; SameSite=Lax';
        localStorage.setItem('xpharma_user', JSON.stringify(data.user));
        window.location.href = '/dashboard/overview';
      } else {
        setErrorMsg(data.error || 'عذراً، هذا الحساب غير مصرح له بالوصول إلى لوحة التحكم');
        setGoogleLoading(false);
      }
    } catch {
      setErrorMsg('تعذر الاتصال بخادم المصادقة. يرجى التحقق من اتصال الإنترنت.');
      setGoogleLoading(false);
    }
  };

  const handleManualGoogleClick = () => {
    setGoogleLoading(true);
    setErrorMsg(null);

    // If native GIS is loaded, trigger its prompt first
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          redirectToGoogleOAuth();
        }
      });
      // Safety timeout: if prompt doesn't open within 1.5s, redirect
      setTimeout(() => {
        redirectToGoogleOAuth();
      }, 1500);
      return;
    }

    redirectToGoogleOAuth();
  };

  const redirectToGoogleOAuth = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://admin.xpharma.cloud';
    const scope = 'openid email profile';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      GOOGLE_CLIENT_ID
    )}&redirect_uri=${encodeURIComponent(
      origin
    )}&response_type=token&scope=${encodeURIComponent(scope)}&prompt=select_account`;
    window.location.href = authUrl;
  };

  return (
    <div className='relative min-h-screen w-full flex items-center justify-center bg-slate-950 text-foreground p-4 overflow-hidden selection:bg-primary selection:text-primary-foreground font-sans'>
      {/* Background Animated Glows & Mesh Grid */}
      <div className='absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none' />
      <div className='absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl animate-pulse pointer-events-none' />
      <div className='absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl animate-pulse pointer-events-none' />
      <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none' />

      {/* Google Identity Services Declarative Trigger for One-Tap */}
      <div
        id='g_id_onload'
        data-client_id={GOOGLE_CLIENT_ID}
        data-context='signin'
        data-callback='handleGoogleCredentialResponse'
        data-auto_select='true'
        data-itp_support='true'
        data-use_fedcm_for_prompt='false'
        data-cancel_on_tap_outside='false'
      />

      {/* Main Login Wrapper */}
      <div className='relative z-10 w-full max-w-md flex flex-col items-center text-center space-y-8 animate-in fade-in zoom-in-95 duration-500'>
        {/* Brand Header with Animated Glow Container */}
        <div className='flex flex-col items-center space-y-4'>
          <div className='relative group'>
            {/* Glow Aura */}
            <div className='absolute -inset-1 rounded-3xl bg-linear-to-r from-emerald-500 via-primary to-blue-500 opacity-40 blur-lg group-hover:opacity-75 transition duration-500' />
            <div className='relative w-20 h-20 rounded-3xl overflow-hidden border border-white/10 bg-slate-900/90 p-2 shadow-2xl flex items-center justify-center backdrop-blur-xl'>
              <Image
                src='/brand-logo.png'
                alt='xpharma Logo'
                width={80}
                height={80}
                className='w-full h-full object-contain rounded-2xl transition-transform duration-300 group-hover:scale-105'
                priority
              />
            </div>
          </div>

          <div className='space-y-2'>
            <Badge
              variant='outline'
              className='border-primary/30 bg-primary/10 text-primary-foreground text-xs font-semibold px-3 py-1 gap-1.5 backdrop-blur-md'
            >
              <span className='inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse' />
              منظومة إكس فارما السحابية • الإدارة المركزية
            </Badge>
            <h1 className='text-3xl font-black tracking-tight text-white'>
              xpharma <span className='text-primary'>Cloud</span>
            </h1>
            <p className='text-xs text-slate-400 max-w-xs leading-relaxed'>
              لوحة التحكم الشاملة لإدارة المخازن السحابية، شبكة الصيدليات، والمزامنة والاشتراكات
            </p>
          </div>
        </div>

        {/* Premium Glassmorphic Login Card */}
        <div className='w-full relative rounded-3xl bg-slate-900/70 border border-white/10 p-7 shadow-2xl backdrop-blur-2xl space-y-6 overflow-hidden'>
          {/* Top Rainbow Accent Line */}
          <div className='absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-emerald-500 via-primary to-blue-500' />

          <div className='space-y-1.5 text-right'>
            <h2 className='text-base font-bold text-white flex items-center gap-2'>
              <IconSparkles className='size-4 text-emerald-400' />
              تسجيل الدخول الإداري
            </h2>
            <p className='text-xs text-slate-400'>
              يرجى تسجيل الدخول باستخدام حساب جوجل المعتمد بصلاحيات المدير.
            </p>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div className='flex items-start gap-3 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-right leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200'>
              <IconAlertCircle className='w-4 h-4 shrink-0 mt-0.5 text-red-400' />
              <div className='flex-1'>{errorMsg}</div>
            </div>
          )}

          {/* Hidden Container for GIS rendered button (fallback) */}
          <div ref={buttonContainerRef} id='google-btn-container' className='hidden' />

          {/* Custom Animated Google Sign-In Button */}
          <button
            type='button'
            onClick={handleManualGoogleClick}
            disabled={googleLoading}
            className='w-full group relative flex items-center justify-center gap-3 py-3.5 px-5 rounded-2xl bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-900 font-bold text-sm transition-all duration-200 shadow-xl shadow-white/5 hover:shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-white/20'
          >
            {googleLoading ? (
              <>
                <IconLoader2 className='w-5 h-5 animate-spin text-primary' />
                <span className='font-bold text-slate-800'>جاري التحقق والدخول إلى لوحة التحكم...</span>
              </>
            ) : (
              <>
                {/* Official Google Vector Logo */}
                <svg className='w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110' viewBox='0 0 24 24'>
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
                <span>المتابعة باستخدام حساب Google</span>
              </>
            )}
          </button>

          {/* Value Proposition Badges */}
          <div className='pt-2 border-t border-white/5 grid grid-cols-3 gap-2 text-right'>
            <div className='flex flex-col items-center text-center p-2 rounded-xl bg-white/5 border border-white/5'>
              <IconShieldCheck className='size-4 text-emerald-400 mb-1' />
              <span className='text-[10px] font-medium text-slate-300'>تشفير معتمد</span>
            </div>
            <div className='flex flex-col items-center text-center p-2 rounded-xl bg-white/5 border border-white/5'>
              <IconServer2 className='size-4 text-blue-400 mb-1' />
              <span className='text-[10px] font-medium text-slate-300'>تزامن لحظي</span>
            </div>
            <div className='flex flex-col items-center text-center p-2 rounded-xl bg-white/5 border border-white/5'>
              <IconReceipt2 className='size-4 text-purple-400 mb-1' />
              <span className='text-[10px] font-medium text-slate-300'>إدارة الاشتراكات</span>
            </div>
          </div>
        </div>

        {/* Live Server Operational Indicator & Footer */}
        <div className='space-y-2 text-center text-xs text-slate-500'>
          <div className='inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/60 border border-white/5 backdrop-blur-md'>
            <span className='inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse' />
            <span className='font-mono text-[11px] text-slate-400'>السيرفر متصل وجميع الخدمات السحابية تعمل بكفاءة</span>
          </div>

          <p className='text-[11px] text-slate-600 font-mono'>
            &copy; 2026 xpharma Cloud. جميع الحقوق محفوظة.
          </p>
        </div>
      </div>
    </div>
  );
}
