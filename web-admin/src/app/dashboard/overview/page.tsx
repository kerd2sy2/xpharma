'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  IconBuildingWarehouse,
  IconBuildingHospital,
  IconUsers,
  IconCash,
  IconRefresh,
  IconPlus,
  IconArrowUpRight,
  IconServer,
  IconReceipt,
  IconPhone,
  IconCreditCard,
  IconCheck,
  IconInbox,
} from '@tabler/icons-react';
import { toast } from 'sonner';

interface OverviewData {
  revenue: {
    total: number;
    activeCount: number;
    pendingCount: number;
    totalCount: number;
  };
  tenants: {
    total: number;
    active: number;
    onlineAgents: number;
    list: Array<{
      id: string;
      name: string;
      slug: string;
      schema_name: string;
      status: string;
      last_heartbeat_at: string | null;
      sync_status: string | null;
      last_sync_at: string | null;
      last_error: string | null;
      agent_health: 'online' | 'idle' | 'offline' | 'never';
      total_pharmacies: number;
    }>;
  };
  pharmacies: {
    total: number;
    linked: number;
  };
  users: {
    total: number;
    trial: number;
    paid: number;
    plans: Array<{ plan: number; count: number }>;
  };
  recentSubscriptions: Array<{
    id: string;
    user_name: string | null;
    user_email: string | null;
    user_phone: string | null;
    plan_type: string;
    amount: number;
    currency: string;
    payment_method: string;
    status: string;
    order_id: string | null;
    transaction_id: string | null;
    card_brand: string | null;
    masked_card: string | null;
    created_at: string;
    tenant_name: string | null;
  }>;
  recentRequests: Array<{
    id: string;
    warehouse_name: string;
    warehouse_phone: string;
    notes: string | null;
    requested_by_name: string | null;
    requested_by_email: string | null;
    status: string;
    created_at: string;
  }>;
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      const res = await fetch('/api/overview/stats', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        if (isManual) toast.success('تم تحديث المؤشرات بنجاح');
      } else {
        toast.error('فشل جلب المؤشرات: ' + (json.error || ''));
      }
    } catch {
      toast.error('خطأ في الاتصال بالخادم');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => fetchStats(false), 30000);
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (val: number) => {
    return (
      new Intl.NumberFormat('ar-EG', {
        style: 'currency',
        currency: 'EGP',
        maximumFractionDigits: 0,
      }).format(val)
    );
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('ar-EG', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6 pb-12'>
        {/* Header with Quick Actions & Live Indicator */}
        <div className='flex flex-col justify-between gap-4 md:flex-row md:items-center'>
          <div>
            <div className='flex items-center gap-2'>
              <h1 className='text-3xl font-black tracking-tight text-foreground'>
                لوحة العمليات الرئيسية
              </h1>
              <Badge variant='outline' className='border-primary/30 bg-primary/5 text-primary text-xs font-semibold'>
                <span className='mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse' />
                بث حي مباشر
              </Badge>
            </div>
            <p className='text-muted-foreground mt-1 text-sm'>
              مؤشرات الأداء اللحظية لمنصة إكس فارما، نشاط المخازن، والاشتراكات
            </p>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => fetchStats(true)}
              disabled={refreshing}
              className='h-9 gap-2 text-xs font-medium'
            >
              <IconRefresh className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              تحديث فوري
            </Button>

            <Link
              href='/dashboard/tenants'
              className={buttonVariants({
                variant: 'default',
                size: 'sm',
                className: 'h-9 gap-1.5 text-xs font-semibold shadow-xs',
              })}
            >
              <IconPlus className='size-3.5' />
              إضافة مخزن
            </Link>
          </div>
        </div>

        {/* 4 Real-time KPI Metric Cards */}
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {/* Card 1: Revenue */}
          <Card className='relative overflow-hidden border-border/70 bg-linear-to-br from-card to-card/60 shadow-xs hover:border-border transition-colors'>
            <CardHeader className='pb-2'>
              <div className='flex items-center justify-between'>
                <CardDescription className='font-medium text-xs'>إجمالي الإيرادات المحصلة</CardDescription>
                <div className='rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400'>
                  <IconCash className='size-4' />
                </div>
              </div>
              <CardTitle className='text-2xl font-black tabular-nums tracking-tight mt-1'>
                {loading ? '...' : formatCurrency(data?.revenue.total || 0)}
              </CardTitle>
            </CardHeader>
            <CardContent className='pt-0 text-xs text-muted-foreground'>
              <div className='flex items-center justify-between'>
                <span>الاشتراكات النشطة:</span>
                <span className='font-bold text-foreground'>{data?.revenue.activeCount || 0}</span>
              </div>
              {Number(data?.revenue.pendingCount || 0) > 0 && (
                <div className='flex items-center justify-between text-amber-600 font-medium mt-1'>
                  <span>بانتظار المراجعة:</span>
                  <span>{data?.revenue.pendingCount}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 2: Warehouses */}
          <Card className='relative overflow-hidden border-border/70 bg-linear-to-br from-card to-card/60 shadow-xs hover:border-border transition-colors'>
            <CardHeader className='pb-2'>
              <div className='flex items-center justify-between'>
                <CardDescription className='font-medium text-xs'>المخازن والمستأجرين</CardDescription>
                <div className='rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400'>
                  <IconBuildingWarehouse className='size-4' />
                </div>
              </div>
              <CardTitle className='text-2xl font-black tabular-nums tracking-tight mt-1'>
                {loading ? '...' : data?.tenants.total || 0}
                <span className='text-xs font-normal text-muted-foreground mr-1.5'>مخزن</span>
              </CardTitle>
            </CardHeader>
            <CardContent className='pt-0 text-xs text-muted-foreground'>
              <div className='flex items-center justify-between'>
                <span>المخازن النشطة:</span>
                <span className='font-bold text-emerald-600'>{data?.tenants.active || 0}</span>
              </div>
              <div className='flex items-center justify-between mt-1'>
                <span>وكلاء متصلين الآن:</span>
                <span className='font-bold text-blue-600'>{data?.tenants.onlineAgents || 0}</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Pharmacies */}
          <Card className='relative overflow-hidden border-border/70 bg-linear-to-br from-card to-card/60 shadow-xs hover:border-border transition-colors'>
            <CardHeader className='pb-2'>
              <div className='flex items-center justify-between'>
                <CardDescription className='font-medium text-xs'>شبكة الصيدليات</CardDescription>
                <div className='rounded-lg bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-400'>
                  <IconBuildingHospital className='size-4' />
                </div>
              </div>
              <CardTitle className='text-2xl font-black tabular-nums tracking-tight mt-1'>
                {loading ? '...' : (data?.pharmacies.total || 0).toLocaleString('ar-EG')}
                <span className='text-xs font-normal text-muted-foreground mr-1.5'>صيدلية</span>
              </CardTitle>
            </CardHeader>
            <CardContent className='pt-0 text-xs text-muted-foreground'>
              <div className='flex items-center justify-between'>
                <span>مرتبطة بحسابات موبايل:</span>
                <span className='font-bold text-foreground'>{data?.pharmacies.linked || 0}</span>
              </div>
              <div className='flex items-center justify-between mt-1'>
                <span>جاهزة للربط:</span>
                <span>{Math.max(0, (data?.pharmacies.total || 0) - (data?.pharmacies.linked || 0))}</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Pharmacists & Users */}
          <Card className='relative overflow-hidden border-border/70 bg-linear-to-br from-card to-card/60 shadow-xs hover:border-border transition-colors'>
            <CardHeader className='pb-2'>
              <div className='flex items-center justify-between'>
                <CardDescription className='font-medium text-xs'>الصيادلة ومستخدمي التطبيق</CardDescription>
                <div className='rounded-lg bg-purple-500/10 p-2 text-purple-600 dark:text-purple-400'>
                  <IconUsers className='size-4' />
                </div>
              </div>
              <CardTitle className='text-2xl font-black tabular-nums tracking-tight mt-1'>
                {loading ? '...' : data?.users.total || 0}
                <span className='text-xs font-normal text-muted-foreground mr-1.5'>صيدلي</span>
              </CardTitle>
            </CardHeader>
            <CardContent className='pt-0 text-xs text-muted-foreground'>
              <div className='flex items-center justify-between'>
                <span>مشتركين بباقات مدفوعة:</span>
                <span className='font-bold text-emerald-600'>{data?.users.paid || 0}</span>
              </div>
              <div className='flex items-center justify-between mt-1'>
                <span>في الخطة المجانية / التجريبية:</span>
                <span>{data?.users.trial || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Action Navigation Buttons */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <Link
            href='/dashboard/tenants'
            className='flex flex-col items-start gap-1 p-3.5 text-right rounded-lg border border-border/70 bg-card hover:bg-muted/50 transition-colors shadow-xs'
          >
            <div className='flex w-full items-center justify-between text-primary font-bold text-sm'>
              <span>المخازن والمستأجرين</span>
              <IconArrowUpRight className='size-4' />
            </div>
            <span className='text-muted-foreground text-xs font-normal'>إدارة المستودعات والـ API Keys</span>
          </Link>

          <Link
            href='/dashboard/billing-review'
            className='flex flex-col items-start gap-1 p-3.5 text-right rounded-lg border border-border/70 bg-card hover:bg-muted/50 transition-colors shadow-xs'
          >
            <div className='flex w-full items-center justify-between text-emerald-600 font-bold text-sm'>
              <span>مراجعة الاشتراكات</span>
              <IconArrowUpRight className='size-4' />
            </div>
            <span className='text-muted-foreground text-xs font-normal'>مدفوعات كاشير وإنستاباي</span>
          </Link>

          <Link
            href='/dashboard/monitoring'
            className='flex flex-col items-start gap-1 p-3.5 text-right rounded-lg border border-border/70 bg-card hover:bg-muted/50 transition-colors shadow-xs'
          >
            <div className='flex w-full items-center justify-between text-blue-600 font-bold text-sm'>
              <span>مراقبة الوكلاء والتزامن</span>
              <IconArrowUpRight className='size-4' />
            </div>
            <span className='text-muted-foreground text-xs font-normal'>حالة الاتصال والـ Heartbeat</span>
          </Link>

          <Link
            href='/dashboard/banners'
            className='flex flex-col items-start gap-1 p-3.5 text-right rounded-lg border border-border/70 bg-card hover:bg-muted/50 transition-colors shadow-xs'
          >
            <div className='flex w-full items-center justify-between text-amber-600 font-bold text-sm'>
              <span>الإعلانات والبانرات</span>
              <IconArrowUpRight className='size-4' />
            </div>
            <span className='text-muted-foreground text-xs font-normal'>العروض الترويجية داخل التطبيق</span>
          </Link>
        </div>

        {/* Two-Column Operational Section */}
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-12'>
          {/* Left Column (7 cols): Warehouses & Onboarding Requests */}
          <div className='flex flex-col gap-6 lg:col-span-7'>
            {/* Warehouses Live Status Table */}
            <Card className='border-border/70 shadow-xs'>
              <CardHeader className='flex flex-row items-center justify-between pb-3'>
                <div>
                  <CardTitle className='text-base font-bold flex items-center gap-2'>
                    <IconServer className='size-4 text-primary' />
                    حالة وكلاء المخازن المسجلة
                  </CardTitle>
                  <CardDescription className='text-xs mt-0.5'>
                    آخر نشاط واتصال للوكلاء المزامنين لقواعد بيانات المخازن
                  </CardDescription>
                </div>
                <Link
                  href='/dashboard/tenants'
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'sm',
                    className: 'h-8 text-xs font-semibold',
                  })}
                >
                  عرض الكل
                  <IconArrowUpRight className='mr-1 size-3' />
                </Link>
              </CardHeader>
              <CardContent className='p-0'>
                {(!data?.tenants.list || data.tenants.list.length === 0) ? (
                  <div className='flex flex-col items-center justify-center p-8 text-center text-muted-foreground'>
                    <IconInbox className='size-10 stroke-1 text-muted-foreground/50 mb-2' />
                    <p className='text-sm font-semibold'>لا توجد مخازن مضافة حتى الآن</p>
                    <p className='text-xs text-muted-foreground mt-1 max-w-sm'>
                      ابدأ بإضافة أول مستودع لتوليد مفتاح الربط للوكيل (Agent) وبدء مزامنة الفواتير.
                    </p>
                    <Link
                      href='/dashboard/tenants'
                      className={buttonVariants({
                        variant: 'default',
                        size: 'sm',
                        className: 'mt-4 h-8 text-xs gap-1',
                      })}
                    >
                      <IconPlus className='size-3.5' />
                      إضافة أول مخزن
                    </Link>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className='bg-muted/40'>
                      <TableRow>
                        <TableHead className='text-right text-xs'>اسم المخزن</TableHead>
                        <TableHead className='text-right text-xs'>حالة الوكيل</TableHead>
                        <TableHead className='text-right text-xs'>حالة المزامنة</TableHead>
                        <TableHead className='text-right text-xs'>الصيدليات</TableHead>
                        <TableHead className='text-right text-xs'>آخر اتصال</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.tenants.list.map((tenant) => {
                        const isOnline = tenant.agent_health === 'online';
                        return (
                          <TableRow key={tenant.id} className='hover:bg-muted/30'>
                            <TableCell className='font-semibold text-xs py-3'>
                              <div>
                                <span>{tenant.name}</span>
                                <span className='block font-mono text-[10px] text-muted-foreground'>
                                  {tenant.slug}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className='py-3'>
                              <Badge
                                variant={isOnline ? 'default' : 'secondary'}
                                className={`text-[11px] gap-1 font-medium ${
                                  isOnline
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                <span
                                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                                    isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'
                                  }`}
                                />
                                {isOnline ? 'متصل' : 'غير متصل'}
                              </Badge>
                            </TableCell>
                            <TableCell className='text-xs py-3 font-mono'>
                              <Badge variant='outline' className='text-[10px]'>
                                {tenant.sync_status || 'idle'}
                              </Badge>
                            </TableCell>
                            <TableCell className='text-xs py-3 font-semibold'>
                              {tenant.total_pharmacies || 0}
                            </TableCell>
                            <TableCell className='text-xs py-3 text-muted-foreground font-mono'>
                              {formatDate(tenant.last_heartbeat_at)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Recent Warehouse Join Requests */}
            <Card className='border-border/70 shadow-xs'>
              <CardHeader className='flex flex-row items-center justify-between pb-3'>
                <div>
                  <CardTitle className='text-base font-bold flex items-center gap-2'>
                    <IconBuildingHospital className='size-4 text-indigo-600' />
                    طلبات إضافة المخازن من الصيادلة
                  </CardTitle>
                  <CardDescription className='text-xs mt-0.5'>
                    المستودعات التي يقترحها الصيادلة من داخل تطبيق الموبايل لربطها
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className='pt-0'>
                {(!data?.recentRequests || data.recentRequests.length === 0) ? (
                  <div className='flex flex-col items-center justify-center p-6 text-center text-muted-foreground'>
                    <IconCheck className='size-8 stroke-1 text-emerald-500 mb-1' />
                    <p className='text-xs font-medium'>لا توجد طلبات إضافة مخازن جديدة معلقة حالياً</p>
                  </div>
                ) : (
                  <div className='divide-y divide-border/50'>
                    {data.recentRequests.map((req) => (
                      <div key={req.id} className='flex items-center justify-between py-3'>
                        <div>
                          <p className='font-bold text-xs text-foreground'>{req.warehouse_name}</p>
                          <div className='flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5'>
                            <span className='flex items-center gap-1 font-mono'>
                              <IconPhone className='size-3' />
                              {req.warehouse_phone}
                            </span>
                            {req.requested_by_name && (
                              <span>بواسطة: {req.requested_by_name}</span>
                            )}
                          </div>
                          {req.notes && (
                            <p className='text-[11px] text-muted-foreground/80 italic mt-0.5'>&ldquo;{req.notes}&rdquo;</p>
                          )}
                        </div>
                        <div className='text-left'>
                          <Badge variant={req.status === 'pending' ? 'secondary' : 'default'} className='text-[10px]'>
                            {req.status === 'pending' ? 'قيد الانتظار' : req.status}
                          </Badge>
                          <span className='block text-[10px] text-muted-foreground mt-1'>
                            {formatDate(req.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column (5 cols): Subscriptions & Plans Breakdown */}
          <div className='flex flex-col gap-6 lg:col-span-5'>
            {/* Recent Real Billing Transactions */}
            <Card className='border-border/70 shadow-xs'>
              <CardHeader className='flex flex-row items-center justify-between pb-3'>
                <div>
                  <CardTitle className='text-base font-bold flex items-center gap-2'>
                    <IconReceipt className='size-4 text-emerald-600' />
                    أحدث العمليات والاشتراكات
                  </CardTitle>
                  <CardDescription className='text-xs mt-0.5'>
                    عمليات الدفع عبر كاشير وإيداعات إنستاباي
                  </CardDescription>
                </div>
                <Link
                  href='/dashboard/billing-review'
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'sm',
                    className: 'h-8 text-xs font-semibold',
                  })}
                >
                  إدارة الاشتراكات
                  <IconArrowUpRight className='mr-1 size-3' />
                </Link>
              </CardHeader>
              <CardContent className='pt-0'>
                {(!data?.recentSubscriptions || data.recentSubscriptions.length === 0) ? (
                  <div className='flex flex-col items-center justify-center p-8 text-center text-muted-foreground'>
                    <IconReceipt className='size-10 stroke-1 text-muted-foreground/50 mb-2' />
                    <p className='text-sm font-semibold'>لا توجد عمليات دفع حتى الآن</p>
                    <p className='text-xs text-muted-foreground mt-1 max-w-xs'>
                      ستظهر هنا فورياً تفاصيل أي اشتراك مدفوع يتم عبر بوابة كاشير أو تحويل إنستاباي.
                    </p>
                  </div>
                ) : (
                  <div className='divide-y divide-border/50'>
                    {data.recentSubscriptions.map((sub) => {
                      const isActive = sub.status === 'active';
                      return (
                        <div key={sub.id} className='flex items-center justify-between py-3'>
                          <div className='space-y-0.5'>
                            <div className='flex items-center gap-2'>
                              <span className='font-bold text-xs text-foreground'>
                                {sub.user_name || sub.user_email || 'صيدلي'}
                              </span>
                              <Badge variant='outline' className='text-[10px] font-normal py-0'>
                                {sub.plan_type || 'اشتراك'}
                              </Badge>
                            </div>
                            <p className='text-[11px] text-muted-foreground font-mono'>
                              {sub.payment_method === 'kashier' ? 'كاشير (بطاقة ائتمان)' : 'إنستاباي'}
                              {sub.masked_card && ` • ${sub.masked_card}`}
                            </p>
                            <p className='text-[10px] text-muted-foreground'>
                              {formatDate(sub.created_at)}
                            </p>
                          </div>

                          <div className='text-left'>
                            <span className='font-bold text-xs text-foreground block tabular-nums'>
                              {formatCurrency(Number(sub.amount) || 0)}
                            </span>
                            <Badge
                              variant={isActive ? 'default' : 'secondary'}
                              className={`text-[10px] font-medium mt-1 ${
                                isActive
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                              }`}
                            >
                              {isActive ? 'نشط' : sub.status === 'pending_approval' ? 'بانتظار المراجعة' : sub.status}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Subscription Plans Distribution Card */}
            <Card className='border-border/70 shadow-xs'>
              <CardHeader className='pb-3'>
                <CardTitle className='text-base font-bold flex items-center gap-2'>
                  <IconCreditCard className='size-4 text-purple-600' />
                  توزيع خطط اشتراك الصيادلة
                </CardTitle>
                <CardDescription className='text-xs mt-0.5'>
                  توزيع مستخدمي التطبيق على باقات الصيدليات للمخزن الواحد
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4 pt-1'>
                <div className='space-y-3'>
                  {/* Free Plan */}
                  <div className='flex items-center justify-between text-xs'>
                    <div className='flex items-center gap-2'>
                      <span className='h-2.5 w-2.5 rounded-full bg-blue-500' />
                      <span className='font-medium'>الخطة التجريبية / المجانية (صيدلية واحدة لكل مخزن)</span>
                    </div>
                    <span className='font-bold tabular-nums text-foreground'>
                      {data?.users.trial || 0}
                    </span>
                  </div>

                  {/* Paid Plans */}
                  <div className='flex items-center justify-between text-xs'>
                    <div className='flex items-center gap-2'>
                      <span className='h-2.5 w-2.5 rounded-full bg-emerald-500' />
                      <span className='font-medium'>الباقات المدفوعة (صيدليتان فأكثر لكل مخزن)</span>
                    </div>
                    <span className='font-bold tabular-nums text-emerald-600'>
                      {data?.users.paid || 0}
                    </span>
                  </div>
                </div>

                <div className='rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground leading-relaxed border border-border/40'>
                  💡 <strong>قاعدة التسعير الحالية:</strong> يحق لكل صيدلي ربط صيدلية واحدة مجاناً في كل مخزن. الباقات المدفوعة تتيح له فتح صيدليتين أو 3 صيدليات أو أكثر في كل المخازن في نفس الوقت.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
