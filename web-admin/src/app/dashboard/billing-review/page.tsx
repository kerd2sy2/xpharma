'use client';

import React, { useState, useEffect } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  IconRefresh,
  IconCheck,
  IconX,
  IconReceipt,
  IconCreditCard,
  IconAlertCircle,
  IconCircleCheck,
  IconPhoto,
} from '@tabler/icons-react';
import { toast } from 'sonner';

interface Subscription {
  id: string;
  tenant_id: string | null;
  tenant_name: string;
  tenant_slug: string | null;
  pharmacy_id: string | null;
  pharmacy_name: string | null;
  pharmacy_code: string | null;
  pharmacy_phone: string | null;
  user_email: string | null;
  user_name: string | null;
  user_phone: string | null;
  plan_type: string;
  amount: number;
  payment_method: string;
  order_id: string | null;
  transaction_id: string | null;
  card_brand: string | null;
  masked_card: string | null;
  status: 'active' | 'pending_approval' | 'rejected' | 'expired';
  start_date: string;
  end_date: string;
  receipt_url: string | null;
  receipt_ref: string | null;
  notes: string | null;
  created_at: string;
}

export default function BillingReviewPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'active' | 'kashier' | 'rejected'>('all');

  // Receipt Preview modal
  const [previewSub, setPreviewSub] = useState<Subscription | null>(null);

  // Reject modal
  const [rejectSub, setRejectSub] = useState<Subscription | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/billing');
      const data = await res.json();
      if (data.success) {
        setSubscriptions(data.subscriptions || []);
      } else {
        toast.error('فشل جلب الاشتراكات: ' + (data.error || ''));
      }
    } catch {
      toast.error('خطأ في الاتصال بالسيرفر');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const handleApprove = async (id: string, pharmacyName: string) => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'active', notes: 'تم الاعتماد عبر لوحة الإدارة' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`تم اعتماد وتفعيل اشتراك (${pharmacyName || 'الصيدلية'}) بنجاح!`);
        if (previewSub?.id === id) setPreviewSub(null);
        fetchSubscriptions();
      } else {
        toast.error(data.error || 'فشل اعتماد الاشتراك');
      }
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectSub) return;
    try {
      setActionLoading(true);
      const res = await fetch('/api/billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rejectSub.id,
          status: 'rejected',
          notes: rejectReason.trim() || 'تم الرفض بواسطة الإدارة',
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('تم رفض الاشتراك وحفظ السبب');
        setRejectSub(null);
        setRejectReason('');
        if (previewSub?.id === rejectSub.id) setPreviewSub(null);
        fetchSubscriptions();
      } else {
        toast.error(data.error || 'فشل تحديث الحالة');
      }
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredSubs = subscriptions.filter((s) => {
    if (filterTab === 'pending') return s.status === 'pending_approval';
    if (filterTab === 'active') return s.status === 'active';
    if (filterTab === 'kashier') return s.payment_method === 'kashier' || !!s.transaction_id;
    if (filterTab === 'rejected') return s.status === 'rejected';
    return true;
  });

  const pendingCount = subscriptions.filter((s) => s.status === 'pending_approval').length;
  const activeCount = subscriptions.filter((s) => s.status === 'active').length;
  const totalRevenue = subscriptions
    .filter((s) => s.status === 'active')
    .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  const formatPlanName = (plan: string) => {
    if (plan === 'yearly') return 'سنوي';
    if (plan === 'quarterly') return 'ربع سنوي';
    if (plan === 'monthly') return 'شهري';
    if (plan.startsWith('P') || plan.includes('صيدل')) return plan;
    return `${plan} صيدليات`;
  };

  return (
    <PageContainer>
      <div className='flex flex-col gap-6'>
        {/* Header */}
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>مراجعة الفواتير والاشتراكات (Billing & Subscriptions)</h1>
            <p className='text-sm text-muted-foreground'>
              متابعة عمليات الدفع الإلكتروني (بوابة Kashier) والتحويلات البنكية (InstaPay) وتفعيل اشتراكات الصيدليات.
            </p>
          </div>
          <Button variant='outline' size='sm' onClick={fetchSubscriptions} disabled={loading}>
            <IconRefresh className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            تحديث الفواتير
          </Button>
        </div>

        {/* Stats */}
        <div className='grid gap-4 md:grid-cols-4'>
          <Card className={pendingCount > 0 ? 'border-amber-500/60 bg-amber-500/5' : ''}>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>معاملات بانتظار المراجعة</CardTitle>
              <IconReceipt className='size-4 text-amber-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-amber-600'>{pendingCount}</div>
              <p className='text-xs text-muted-foreground'>إيصالات إنستاباي اليدوية</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>الاشتراكات النشطة</CardTitle>
              <IconCircleCheck className='size-4 text-emerald-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-emerald-600'>{activeCount}</div>
              <p className='text-xs text-muted-foreground'>مفعلة وتعمل الآن</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>إجمالي الإيرادات</CardTitle>
              <IconCreditCard className='size-4 text-primary' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-primary'>{totalRevenue.toLocaleString()} ج.م</div>
              <p className='text-xs text-muted-foreground'>من الاشتراكات المعتمدة</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>إجمالي العمليات</CardTitle>
              <IconReceipt className='size-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{subscriptions.length}</div>
              <p className='text-xs text-muted-foreground'>عملية مسجلة بالنظام</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Table */}
        <Card>
          <CardHeader className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <div>
              <CardTitle>سجل الفواتير وعمليات الدفع</CardTitle>
              <CardDescription>عرض فوري لعمليات الدفع عبر كاشير وتحويلات إنستاباي وتفاصيل العميل.</CardDescription>
            </div>
            <Tabs value={filterTab} onValueChange={(v: any) => setFilterTab(v)}>
              <TabsList>
                <TabsTrigger value='all'>الكل ({subscriptions.length})</TabsTrigger>
                <TabsTrigger value='kashier'>بوابة كاشير 💳</TabsTrigger>
                <TabsTrigger value='active'>النشطة ({activeCount})</TabsTrigger>
                <TabsTrigger value='pending' className='relative'>
                  المعلقة ({pendingCount})
                  {pendingCount > 0 && (
                    <span className='size-2 rounded-full bg-amber-500 absolute -top-0.5 -right-0.5' />
                  )}
                </TabsTrigger>
                <TabsTrigger value='rejected'>المرفوضة</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العميل / الصيدلية</TableHead>
                    <TableHead>طريقة الدفع</TableHead>
                    <TableHead>نوع الباقة</TableHead>
                    <TableHead>المبلغ المدفوع</TableHead>
                    <TableHead>رقم العملية / المرجع</TableHead>
                    <TableHead>تاريخ العملية</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className='text-end'>التفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && subscriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className='text-center py-8 text-muted-foreground'>
                        جاري تحميل الفواتير...
                      </TableCell>
                    </TableRow>
                  ) : filteredSubs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className='text-center py-8 text-muted-foreground'>
                        لا توجد فواتير أو اشتراكات مسجلة مطابقة للفلتر.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSubs.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className='font-semibold'>{s.user_name || s.pharmacy_name || 'مشترك تطبيق'}</div>
                          <div className='text-xs text-muted-foreground font-mono'>
                            {s.user_email || s.pharmacy_phone || s.pharmacy_code || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {s.payment_method === 'kashier' || s.transaction_id ? (
                            <Badge variant='outline' className='border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 gap-1 text-xs'>
                              <IconCreditCard className='size-3' />
                              كاشير (أونلاين)
                            </Badge>
                          ) : (
                            <Badge variant='outline' className='border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30 gap-1 text-xs'>
                              <IconReceipt className='size-3' />
                              إنستاباي (تحويل)
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant='secondary' className='text-xs'>
                            {formatPlanName(s.plan_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className='font-bold text-emerald-600 dark:text-emerald-400 font-mono'>
                            {s.amount ? `${s.amount} ج.م` : '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {s.receipt_ref || s.transaction_id || s.order_id ? (
                            <code className='text-xs bg-muted px-1.5 py-0.5 rounded font-mono'>
                              {s.transaction_id || s.receipt_ref || s.order_id}
                            </code>
                          ) : (
                            <span className='text-xs text-muted-foreground'>-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className='text-xs text-muted-foreground'>
                            {s.created_at ? new Date(s.created_at).toLocaleDateString('ar-EG') : '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {s.status === 'active' ? (
                            <Badge variant='outline' className='border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'>
                              مدفوع ونشط
                            </Badge>
                          ) : s.status === 'pending_approval' ? (
                            <Badge variant='outline' className='border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30 animate-pulse'>
                              بانتظار المراجعة
                            </Badge>
                          ) : s.status === 'rejected' ? (
                            <Badge variant='outline' className='border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-950/30'>
                              مرفوض
                            </Badge>
                          ) : (
                            <Badge variant='outline'>منتهي</Badge>
                          )}
                        </TableCell>
                        <TableCell className='text-end'>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-8 text-xs'
                            onClick={() => setPreviewSub(s)}
                          >
                            التفاصيل
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Dialog: Receipt Preview */}
      <Dialog open={!!previewSub} onOpenChange={(open) => !open && setPreviewSub(null)}>
        <DialogContent className='sm:max-w-[560px]'>
          <DialogHeader>
            <DialogTitle>فحص إيصال التحويل (InstaPay Receipt)</DialogTitle>
            <DialogDescription>
              مراجعة بيانات الدفع الخاصة بـ ({previewSub?.pharmacy_name || 'الصيدلية'}) - مخزن {previewSub?.tenant_name}
            </DialogDescription>
          </DialogHeader>

          {previewSub && (
            <div className='space-y-4 py-3'>
              <div className='grid grid-cols-2 gap-2 text-sm bg-muted/50 p-3 rounded-md'>
                <div>
                  <span className='text-xs text-muted-foreground block'>رقم المعاملة (Ref ID):</span>
                  <span className='font-mono font-semibold'>{previewSub.receipt_ref || 'غير مسجل'}</span>
                </div>
                <div>
                  <span className='text-xs text-muted-foreground block'>نوع الباقة:</span>
                  <span className='font-semibold'>{previewSub.plan_type}</span>
                </div>
                {previewSub.notes && (
                  <div className='col-span-2 pt-1 border-t'>
                    <span className='text-xs text-muted-foreground block'>ملاحظات:</span>
                    <span>{previewSub.notes}</span>
                  </div>
                )}
              </div>

              {previewSub.receipt_url ? (
                <div className='rounded-lg border overflow-hidden bg-black/5 flex items-center justify-center min-h-[220px] max-h-[380px]'>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewSub.receipt_url}
                    alt='إيصال الدفع'
                    className='object-contain max-h-[360px] w-full'
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className='text-center py-8 text-sm text-muted-foreground border rounded-md border-dashed'>
                  لم يتم إرفاق صورة إيصال لهذا الطلب.
                </div>
              )}
            </div>
          )}

          <DialogFooter className='flex gap-2 sm:justify-between'>
            {previewSub?.status === 'pending_approval' ? (
              <>
                <Button
                  variant='destructive'
                  onClick={() => {
                    const target = previewSub;
                    setPreviewSub(null);
                    setRejectSub(target);
                  }}
                  disabled={actionLoading}
                >
                  <IconX className='size-4 mr-1' />
                  رفض الإيصال
                </Button>
                <Button
                  className='bg-emerald-600 hover:bg-emerald-700 text-white'
                  onClick={() => handleApprove(previewSub.id, previewSub.pharmacy_name || '')}
                  disabled={actionLoading}
                >
                  <IconCheck className='size-4 mr-1' />
                  اعتماد وتفعيل الاشتراك
                </Button>
              </>
            ) : (
              <Button variant='outline' onClick={() => setPreviewSub(null)}>
                إغلاق
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Reject with Reason */}
      <Dialog open={!!rejectSub} onOpenChange={(open) => !open && setRejectSub(null)}>
        <DialogContent className='sm:max-w-[420px]'>
          <DialogHeader>
            <DialogTitle className='text-rose-600'>رفض إيصال الاشتراك</DialogTitle>
            <DialogDescription>
              يرجى كتابة سبب الرفض ليظهر للصيدلي (مثال: الإيصال غير واضح، أو لم يتم استلام التحويل).
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-3 py-3'>
            <div className='space-y-1'>
              <Label htmlFor='reason'>سبب الرفض</Label>
              <Input
                id='reason'
                placeholder='مثال: رقم التحويل غير مطابق، أعد المحاولة'
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={() => setRejectSub(null)} disabled={actionLoading}>
              إلغاء
            </Button>
            <Button variant='destructive' onClick={handleRejectConfirm} disabled={actionLoading}>
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
