'use client';

import React, { useState } from 'react';
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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('superadmin@xpharma.cloud');
  const [password, setPassword] = useState('••••••••••••');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<'admin' | 'warehouse'>('admin');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Smooth transition to dashboard overview
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

          <form onSubmit={handleLogin}>
            <CardContent className='space-y-4 pt-0'>
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
            </CardContent>

            <CardFooter className='flex flex-col gap-3 pt-2 pb-6'>
              <Button
                type='submit'
                disabled={loading}
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
          </form>
        </Card>

        {/* Footer Note */}
        <p className='text-center text-xs text-slate-500 mt-6 font-mono'>
          &copy; 2026 xpharma Technologies Inc. All rights reserved.
        </p>
      </div>
    </div>
  );
}
