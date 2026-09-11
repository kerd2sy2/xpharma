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
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  pharmacy_id: string | null;
  pharmacy_name: string | null;
  pharmacy_code: string | null;
  pharmacy_phone: string | null;
  plan_type: string;
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
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'active' | 'rejected'>('all');

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
    if (filterTab === 'rejected') return s.status === 'rejected';
    return true;
  });

  const pendingCount = subscriptions.filter((s) => s.status === 'pending_approval').length;
  const activeCount = subscriptions.filter((s) => s.status === 'active').length;

  return (
    <PageContainer>
      <div className='flex flex-col gap-6'>
        {/* Header */}
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>مراجعة الاشتراكات ومدفوعات إنستاباي (Billing Review)</h1>
            <p className='text-sm text-muted-foreground'>
              فحص إيصالات التحويل البنكي وتطبيق InstaPay وتفعيل اشتراكات الصيدليات في السحابة.
            </p>
          </div>
          <Button variant='outline' size='sm' onClick={fetchSubscriptions} disabled={loading}>
            <IconRefresh className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            تحديث البيانات
          </Button>
        </div>

        {/* Stats */}
        <div className='grid gap-4 md:grid-cols-3'>
          <Card className={pendingCount > 0 ? 'border-amber-500/60 bg-amber-500/5' : ''}>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>طلبات معلقة للمراجعة</CardTitle>
              <IconReceipt className='size-4 text-amber-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-amber-600'>{pendingCount}</div>
              <p className='text-xs text-muted-foreground'>إيصالات إنستاباي بانتظار فحص المشرف</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>الاشتراكات النشطة</CardTitle>
              <IconCircleCheck className='size-4 text-emerald-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-emerald-600'>{activeCount}</div>
              <p className='text-xs text-muted-foreground'>صيدلية مفعلة ومحدثة</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>إجمالي السجلات</CardTitle>
              <IconCreditCard className='size-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{subscriptions.length}</div>
              <p className='text-xs text-muted-foreground'>سجل اشتراك مسجل</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Table */}
        <Card>
          <CardHeader className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <div>
              <CardTitle>سجل الاشتراكات والمدفوعات</CardTitle>
              <CardDescription>عرض تفاصيل التحويلات ورقم المعاملة وصور الإيصالات المرفوعة.</CardDescription>
            </div>
            <Tabs value={filterTab} onValueChange={(v: any) => setFilterTab(v)}>
              <TabsList>
                <TabsTrigger value='all'>الكل ({subscriptions.length})</TabsTrigger>
                <TabsTrigger value='pending' className='relative'>
                  المعلقة ({pendingCount})
                  {pendingCount > 0 && (
                    <span className='size-2 rounded-full bg-amber-500 absolute -top-0.5 -right-0.5' />
                  )}
                </TabsTrigger>
                <TabsTrigger value='active'>النشطة ({activeCount})</TabsTrigger>
                <TabsTrigger value='rejected'>المرفوضة</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الصيدلية</TableHead>
                    <TableHead>المخزن التابع له</TableHead>
                    <TableHead>نوع الباقة</TableHead>
                    <TableHead>رقم معاملة إنستاباي</TableHead>
                    <TableHead>الإيصال</TableHead>
                    <TableHead>تاريخ الانتهاء</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className='text-end'>الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && subscriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className='text-center py-8 text-muted-foreground'>
                        جاري التحميل...
                      </TableCell>
                    </TableRow>
                  ) : filteredSubs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className='text-center py-8 text-muted-foreground'>
                        لا توجد اشتراكات مطابقة للفلتر المحدد.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSubs.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className='font-semibold'>{s.pharmacy_name || 'غير محدد'}</div>
                          <div className='text-xs text-muted-foreground'>كود: {s.pharmacy_code || '-'}</div>
                        </TableCell>
                        <TableCell>
                          <span className='font-medium'>{s.tenant_name}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant='secondary' className='text-xs'>
                            {s.plan_type === 'yearly' ? 'سنوي' : s.plan_type === 'quarterly' ? 'ربع سنوي' : 'شهري'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {s.receipt_ref ? (
                            <code className='text-xs bg-muted px-1.5 py-0.5 rounded font-mono'>
                              {s.receipt_ref}
                            </code>
                          ) : (
                            <span className='text-xs text-muted-foreground'>-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.receipt_url ? (
                            <Button
                              variant='outline'
                              size='sm'
                              className='h-7 text-xs gap-1'
                              onClick={() => setPreviewSub(s)}
                            >
                              <IconPhoto className='size-3.5' />
                              عرض الإيصال
                            </Button>
                          ) : (
                            <span className='text-xs text-muted-foreground'>لا يوجد مرفق</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className='text-xs text-muted-foreground'>
                            {s.end_date ? new Date(s.end_date).toLocaleDateString('ar-EG') : '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {s.status === 'active' ? (
                            <Badge variant='outline' className='border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'>
                              نشط (Active)
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
                          {s.status === 'pending_approval' ? (
                            <div className='flex items-center justify-end gap-1.5'>
                              <Button
                                size='sm'
                                className='h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1'
                                onClick={() => handleApprove(s.id, s.pharmacy_name || '')}
                                disabled={actionLoading}
                              >
                                <IconCheck className='size-3.5' />
                                اعتماد
                              </Button>
                              <Button
                                size='sm'
                                variant='destructive'
                                className='h-8 gap-1'
                                onClick={() => setRejectSub(s)}
                                disabled={actionLoading}
                              >
                                <IconX className='size-3.5' />
                                رفض
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant='ghost'
                              size='sm'
                              className='h-8 text-xs'
                              onClick={() => setPreviewSub(s)}
                            >
                              التفاصيل
                            </Button>
                          )}
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
