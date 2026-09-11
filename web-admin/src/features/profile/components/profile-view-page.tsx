'use client';

import React, { useEffect, useState } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Icons } from '@/components/icons';
import { useUser, useClerk } from '@clerk/nextjs';
import Link from 'next/link';

export default function ProfileViewPage() {
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();
  const [localUser, setLocalUser] = useState<any>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('xpharma_user');
      if (stored) {
        setLocalUser(JSON.parse(stored));
      }
    } catch (_) {}
  }, []);

  const fullName = localUser?.name || localUser?.fullName || clerkUser?.fullName || 'Ibrahim M. Elsheikh';
  const email = localUser?.email || clerkUser?.emailAddresses?.[0]?.emailAddress || 'kerd2sy@gmail.com';
  const avatarUrl = localUser?.picture || localUser?.imageUrl || clerkUser?.imageUrl || '';
  const role = localUser?.role || 'مدير النظام (Super Admin)';

  const handleLogout = async () => {
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
  };

  return (
    <PageContainer
      pageTitle='الملف الشخصي'
      pageDescription='إدارة بيانات الحساب الشخصي وإعدادات الأمان والجلسة الحالية'
    >
      <div className='flex flex-col gap-6' dir='rtl'>
        {/* Main User Card */}
        <Card className='border-border/60 bg-card/60 backdrop-blur-sm shadow-sm'>
          <CardContent className='pt-6'>
            <div className='flex flex-col sm:flex-row items-center sm:items-start gap-6'>
              <Avatar className='h-24 w-24 rounded-2xl border-2 border-primary/20 shadow-md'>
                <AvatarImage src={avatarUrl} alt={fullName} />
                <AvatarFallback className='rounded-2xl bg-primary/10 text-primary text-2xl font-bold'>
                  {fullName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className='flex-1 text-center sm:text-right space-y-2'>
                <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
                  <div>
                    <h2 className='text-2xl font-bold tracking-tight text-foreground'>{fullName}</h2>
                    <p className='text-sm text-muted-foreground font-mono mt-0.5'>{email}</p>
                  </div>
                  <div className='flex flex-wrap items-center justify-center sm:justify-end gap-2'>
                    <Badge variant='outline' className='bg-primary/10 text-primary border-primary/20 gap-1 text-xs py-1 px-2.5 font-medium'>
                      <Icons.badgeCheck className='size-3.5' />
                      {role}
                    </Badge>
                    <Badge variant='outline' className='bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1 text-xs py-1 px-2.5 font-medium'>
                      <span className='size-2 rounded-full bg-emerald-500 animate-pulse' />
                      نشط وموثق
                    </Badge>
                  </div>
                </div>

                <p className='text-xs text-muted-foreground pt-1'>
                  المسؤول الرئيسي عن إدارة منصة XPharma Cloud، التحكم بالمستأجرين، ومراقبة التزامن وقواعد البيانات.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Two Column Grid */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {/* Account Details */}
          <Card className='border-border/60 shadow-sm'>
            <CardHeader className='pb-4'>
              <CardTitle className='text-base flex items-center gap-2'>
                <Icons.account className='size-5 text-primary' />
                معلومات الحساب
              </CardTitle>
              <CardDescription>البيانات المسجلة لملف الدخول</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4 text-sm'>
              <div className='flex justify-between items-center py-2 border-b border-border/40'>
                <span className='text-muted-foreground'>الاسم الكامل:</span>
                <span className='font-semibold text-foreground'>{fullName}</span>
              </div>
              <div className='flex justify-between items-center py-2 border-b border-border/40'>
                <span className='text-muted-foreground'>البريد الإلكتروني:</span>
                <span className='font-semibold font-mono text-foreground'>{email}</span>
              </div>
              <div className='flex justify-between items-center py-2 border-b border-border/40'>
                <span className='text-muted-foreground'>مستوى الصلاحية:</span>
                <span className='font-semibold text-primary'>مدير نظام فائق (Super Administrator)</span>
              </div>
              <div className='flex justify-between items-center py-2 border-b border-border/40'>
                <span className='text-muted-foreground'>المؤسسة:</span>
                <span className='font-semibold text-foreground'>منصة XPharma Cloud</span>
              </div>
              <div className='flex justify-between items-center py-2'>
                <span className='text-muted-foreground'>طريقة المصادقة:</span>
                <span className='font-semibold text-foreground'>Google OAuth 2.0 المعتمد</span>
              </div>
            </CardContent>
          </Card>

          {/* Security and Session */}
          <Card className='border-border/60 shadow-sm flex flex-col justify-between'>
            <div>
              <CardHeader className='pb-4'>
                <CardTitle className='text-base flex items-center gap-2'>
                  <Icons.lock className='size-5 text-primary' />
                  الأمان والجلسة الحالية
                </CardTitle>
                <CardDescription>إدارة الجلسة النشطة وخيارات الأمان</CardDescription>
              </CardHeader>
              <CardContent className='space-y-4 text-sm'>
                <div className='flex justify-between items-center py-2 border-b border-border/40'>
                  <span className='text-muted-foreground'>حالة الجلسة:</span>
                  <span className='inline-flex items-center gap-1.5 text-emerald-500 font-medium'>
                    <span className='size-2 rounded-full bg-emerald-500' />
                    متصل الآن (Online)
                  </span>
                </div>
                <div className='flex justify-between items-center py-2 border-b border-border/40'>
                  <span className='text-muted-foreground'>تشفير الاتصال:</span>
                  <span className='font-mono font-medium text-xs text-foreground'>HTTPS / TLS 1.3</span>
                </div>
                <div className='flex justify-between items-center py-2 border-b border-border/40'>
                  <span className='text-muted-foreground'>مدة الجلسة:</span>
                  <span className='text-foreground font-medium'>7 أيام مع التجديد التلقائي</span>
                </div>
                <div className='flex justify-between items-center py-2'>
                  <span className='text-muted-foreground'>إجراءات سريعة:</span>
                  <div className='flex gap-2'>
                    <Link
                      href='/dashboard/notifications'
                      className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-8 text-xs' })}
                    >
                      <Icons.notification className='size-3.5 ml-1' />
                      الإشعارات
                    </Link>
                    <Link
                      href='/dashboard/billing-review'
                      className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-8 text-xs' })}
                    >
                      <Icons.billing className='size-3.5 ml-1' />
                      الفواتير
                    </Link>
                  </div>
                </div>
              </CardContent>
            </div>
            <div className='p-6 pt-0'>
              <Button
                variant='destructive'
                onClick={handleLogout}
                className='w-full gap-2 font-medium cursor-pointer shadow-sm'
              >
                <Icons.logout className='size-4' />
                تسجيل الخروج من لوحة التحكم
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
