'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  IconShieldCheck,
  IconBuildingWarehouse,
  IconArrowRight,
  IconLoader2,
  IconKey,
  IconMail,
  IconSparkles
} from '@tabler/icons-react';

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
  const [email, setEmail] = useState('superadmin@xpharma.cloud');
  const [password, setPassword] = useState('••••••••••••');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [role, setRole] = useState<'admin' | 'warehouse'>('admin');

  // Listen for Google OAuth callback if redirected with access_token hash
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = params.get('access_token');
      if (accessToken) {
        setGoogleLoading(true);
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
          .then((res) => res.json())
          .then((user) => {
            if (user && user.email) {
              localStorage.setItem('xpharma_user', JSON.stringify(user));
            }
            router.push('/dashboard/overview');
          })
          .catch(() => {
            router.push('/dashboard/overview');
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
      try {
        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const profile = JSON.parse(jsonPayload);
        localStorage.setItem('xpharma_user', JSON.stringify(profile));

        // Call backend verification
        try {
          await fetch('https://api.xpharma.cloud/v1/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_token: response.credential })
          });
        } catch (_) {}
      } catch (err) {
        console.error('Google profile decode error:', err);
      }
      router.push('/dashboard/overview');
    }
  };

  const handleGoogleLogin = () => {
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      router.push('/dashboard/overview');
    }, 600);
  };

  return (
    <div className='relative min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 p-4 selection:bg-teal-500 selection:text-white'>
      {/* Dynamic Background Glows */}
      <div className='absolute top-1/4 -left-20 w-96 h-96 bg-teal-500/15 rounded-full blur-3xl pointer-events-none' />
      <div className='absolute bottom-1/4 -right-20 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none' />

      <div className='relative w-full max-w-md z-10'>
        {/* Header Branding */}
        <div className='flex flex-col items-center text-center mb-8'>
          <div className='relative w-20 h-20 mb-4 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-teal-500/30 bg-slate-900/80 p-2'>
            <Image
              src='/logo.png'
              alt='xpharma Logo'
              width={80}
              height={80}
              className='w-full h-full object-contain rounded-xl'
              priority
            />
          </div>
          <h1 className='text-3xl font-bold tracking-tight bg-gradient-to-r from-teal-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent'>
            xpharma Cloud
          </h1>
          <p className='text-slate-400 text-sm mt-1.5 font-medium'>
            بوابة الإدارة المركزية والربط السحابي للمستودعات والصيدليات
          </p>
        </div>

        {/* Login Card */}
        <Card className='border-slate-800/80 bg-slate-900/70 backdrop-blur-xl shadow-2xl text-slate-100'>
          <CardHeader className='pb-4'>
            {/* Role Switcher */}
            <div className='grid grid-cols-2 gap-1.5 p-1 bg-slate-950/60 rounded-lg border border-slate-800/80 mb-2'>
              <button
                type='button'
                onClick={() => setRole('admin')}
                className={`flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  role === 'admin'
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <IconShieldCheck className='w-3.5 h-3.5' />
                مدير المنصة (Admin)
              </button>
              <button
                type='button'
                onClick={() => setRole('warehouse')}
                className={`flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  role === 'warehouse'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <IconBuildingWarehouse className='w-3.5 h-3.5' />
                مستودع أدوية (Tenant)
              </button>
            </div>

            <CardTitle className='text-lg font-semibold text-slate-100 pt-2'>
              تسجيل الدخول
            </CardTitle>
            <CardDescription className='text-slate-400 text-xs'>
              {role === 'admin'
                ? 'لوحة التحكم المركزية - المراقبة والفواتير وإدارة المستأجرين'
                : 'إدارة المستودع الخاص بك والمزامنة السحابية وقوائم الأدوية'}
            </CardDescription>
          </CardHeader>

          <CardContent className='space-y-4 pt-0'>
            {/* Google OAuth Button */}
            <button
              type='button'
              onClick={handleGoogleLogin}
              disabled={googleLoading || loading}
              className='w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-800 font-medium rounded-lg text-sm transition-all shadow-md hover:shadow-lg border border-slate-200 disabled:opacity-60 disabled:cursor-not-allowed'
            >
              {googleLoading ? (
                <>
                  <IconLoader2 className='w-4 h-4 text-slate-700 animate-spin' />
                  <span>جاري تسجيل الدخول عبر Google...</span>
                </>
              ) : (
                <>
                  <svg className='w-4 h-4' viewBox='0 0 24 24'>
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
                  <span>تسجيل الدخول بحساب Google</span>
                </>
              )}
            </button>

            {/* Divider */}
            <div className='relative flex items-center justify-center my-3'>
              <div className='border-t border-slate-800 w-full' />
              <span className='bg-slate-900 px-3 text-xs text-slate-500 uppercase tracking-wider'>
                أو بالبريد الإلكتروني
              </span>
              <div className='border-t border-slate-800 w-full' />
            </div>

            <form onSubmit={handleLogin} className='space-y-4'>
              <div className='space-y-1.5'>
                <Label htmlFor='email' className='text-xs text-slate-300 font-medium'>
                  البريد الإلكتروني / اسم المستخدم
                </Label>
                <div className='relative'>
                  <IconMail className='absolute left-3 top-2.5 h-4 w-4 text-slate-500' />
                  <Input
                    id='email'
                    type='email'
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className='pl-9 bg-slate-950/50 border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500'
                    placeholder='name@company.com'
                  />
                </div>
              </div>

              <div className='space-y-1.5'>
                <div className='flex items-center justify-between'>
                  <Label htmlFor='password' className='text-xs text-slate-300 font-medium'>
                    كلمة المرور
                  </Label>
                  <a href='#' className='text-xs text-teal-400 hover:text-teal-300 transition-colors'>
                    نسيت كلمة المرور؟
                  </a>
                </div>
                <div className='relative'>
                  <IconKey className='absolute left-3 top-2.5 h-4 w-4 text-slate-500' />
                  <Input
                    id='password'
                    type='password'
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className='pl-9 bg-slate-950/50 border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500'
                    placeholder='••••••••'
                  />
                </div>
              </div>

              <div className='flex items-center justify-between pt-1'>
                <label className='flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-300'>
                  <input
                    type='checkbox'
                    defaultChecked
                    className='rounded border-slate-700 bg-slate-950 text-teal-500 focus:ring-teal-500 focus:ring-offset-slate-900'
                  />
                  تذكر بيانات الدخول
                </label>
                <div className='flex items-center gap-1 text-xs text-teal-400/80 font-mono'>
                  <IconSparkles className='w-3 h-3 text-teal-400' />
                  <span>v1.0.0 Cloud</span>
                </div>
              </div>

              <Button
                type='submit'
                disabled={loading || googleLoading}
                className='w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-semibold shadow-lg shadow-teal-500/20 py-2.5 h-auto transition-all'
              >
                {loading ? (
                  <>
                    <IconLoader2 className='w-4 h-4 mr-2 animate-spin' />
                    جاري التحقق والدخول...
                  </>
                ) : (
                  <>
                    دخول لوحة التحكم
                    <IconArrowRight className='w-4 h-4 ml-2' />
                  </>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className='flex flex-col gap-3 pt-0 pb-6'>
            <div className='flex items-center justify-center gap-4 text-xs text-slate-500 pt-2'>
              <Link href='/privacy' className='hover:text-slate-400 transition-colors'>
                سياسة الخصوصية
              </Link>
              <span>•</span>
              <Link href='/terms' className='hover:text-slate-400 transition-colors'>
                شروط الاستخدام
              </Link>
            </div>
          </CardFooter>
        </Card>

        {/* Footer Note */}
        <p className='text-center text-xs text-slate-500 mt-6 font-mono'>
          &copy; 2026 xpharma Technologies Inc. All rights reserved.
        </p>
      </div>
    </div>
  );
}
