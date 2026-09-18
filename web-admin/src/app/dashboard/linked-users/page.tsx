'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  IconLink,
  IconUnlink,
  IconSearch,
  IconRefresh,
  IconBuildingStore,
  IconBuildingWarehouse,
  IconUsers,
  IconPhone,
  IconMail,
  IconDeviceMobile,
  IconCheck,
  IconCopy,
  IconBrandWhatsapp,
  IconDownload,
  IconAlertCircle,
  IconShieldCheck
} from '@tabler/icons-react';
import { toast } from 'sonner';

interface LinkedRecord {
  pharmacy_id: string;
  pharmacy_code: string;
  pharmacy_name: string;
  pharmacy_phone: string;
  pharmacy_address: string;
  pharmacy_is_active: boolean;
  linked_user_id: string;
  linked_at: string;
  pharmacy_created_at: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_category: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone: string;
  user_avatar_url: string;
  device_name: string;
  device_id: string;
  user_provider: string;
  user_role: string;
  last_login_at: string;
  subscription_status: string;
  subscription_end_date: string | null;
}

interface StatsData {
  total_linked_pharmacies: number;
  total_pharmacies: number;
  unique_pharmacists: number;
  total_warehouses: number;
  active_subscriptions: number;
}

export default function LinkedUsersPage() {
  const [data, setData] = useState<LinkedRecord[]>([]);
  const [stats, setStats] = useState<StatsData>({
    total_linked_pharmacies: 0,
    total_pharmacies: 0,
    unique_pharmacists: 0,
    total_warehouses: 0,
    active_subscriptions: 0
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'linked_only' | 'all'>('linked_only');
  const [selectedTenant, setSelectedTenant] = useState('all');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Unlink Modal state
  const [unlinkItem, setUnlinkItem] = useState<LinkedRecord | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (filterMode) params.set('filter', filterMode);
      if (selectedTenant !== 'all') params.set('tenant_id', selectedTenant);

      const res = await fetch(`/api/linked-pharmacies?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
        if (json.stats) setStats(json.stats);
      } else {
        toast.error('حدث خطأ أثناء جلب البيانات: ' + (json.error || 'غير معروف'));
      }
    } catch (err: any) {
      toast.error('فشل الاتصال بقاعدة البيانات');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, filterMode, selectedTenant]);

  // Handle Unlink
  const handleConfirmUnlink = async () => {
    if (!unlinkItem) return;
    setUnlinking(true);
    try {
      const res = await fetch('/api/linked-pharmacies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pharmacy_id: unlinkItem.pharmacy_id })
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`تم فك ربط صيدلية "${unlinkItem.pharmacy_name}" بنجاح`);
        setUnlinkItem(null);
        fetchData();
      } else {
        toast.error(json.error || 'فشل فك الربط');
      }
    } catch (err) {
      toast.error('حدث خطأ أثناء تنفيذ الطلب');
    } finally {
      setUnlinking(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    toast.success(`تم نسخ ${label}`);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (data.length === 0) {
      toast.info('لا توجد بيانات لتصديرها');
      return;
    }
    const headers = [
      'كود الصيدلية',
      'اسم الصيدلية',
      'هاتف الصيدلية',
      'عنوان الصيدلية',
      'اسم المستخدم',
      'البريد الإلكتروني',
      'هاتف المستخدم',
      'اسم المخزن',
      'الجهاز',
      'سيرية الجهاز',
      'حالة الاشتراك',
      'تاريخ الربط'
    ];

    const rows = data.map(item => [
      `"${item.pharmacy_code || ''}"`,
      `"${item.pharmacy_name || ''}"`,
      `"${item.pharmacy_phone || ''}"`,
      `"${item.pharmacy_address || ''}"`,
      `"${item.user_name || ''}"`,
      `"${item.user_email || ''}"`,
      `"${item.user_phone || ''}"`,
      `"${item.tenant_name || ''}"`,
      `"${item.device_name || ''}"`,
      `"${item.device_id || ''}"`,
      `"${item.subscription_status || ''}"`,
      `"${item.linked_at ? new Date(item.linked_at).toLocaleDateString('ar-EG') : ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `xpharma_linked_users_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('تم تصدير ملف CSV بنجاح');
  };

  // Unique warehouses for filter
  const warehouses = useMemo(() => {
    const map = new Map<string, string>();
    data.forEach(item => {
      if (item.tenant_id && item.tenant_name) {
        map.set(item.tenant_id, item.tenant_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  return (
    <PageContainer
      pageTitle='المستخدمين والصيدليات المرتبطة'
      pageDescription='سجل شامل يوضح الربط المباشر بين حسابات الصيادلة (الاسم، الإيميل، رقم الهاتف) والمخازن التابعة لها.'
    >
      <div className='flex flex-col gap-6' dir='rtl'>
        {/* Top Summary KPI Cards */}
        <div className='grid gap-4 md:grid-cols-4'>
          <Card className='border-primary/20 bg-card/60 backdrop-blur shadow-sm'>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                إجمالي الصيدليات المرتبطة
              </CardTitle>
              <div className='h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary'>
                <IconLink className='h-5 w-5' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-primary'>
                {stats.total_linked_pharmacies}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                من إجمالي {stats.total_pharmacies} صيدلية مسجلة
              </p>
            </CardContent>
          </Card>

          <Card className='border-blue-500/20 bg-card/60 backdrop-blur shadow-sm'>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                الصيادلة والمستخدمين النشطين
              </CardTitle>
              <div className='h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600'>
                <IconUsers className='h-5 w-5' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>
                {stats.unique_pharmacists}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                حسابات صيادلة تدير صيدليات حالياً
              </p>
            </CardContent>
          </Card>

          <Card className='border-emerald-500/20 bg-card/60 backdrop-blur shadow-sm'>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                المخازن والمستودعات
              </CardTitle>
              <div className='h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600'>
                <IconBuildingWarehouse className='h-5 w-5' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-emerald-600'>
                {stats.total_warehouses}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                مخازن نشطة ومتصلة بالمنظومة
              </p>
            </CardContent>
          </Card>

          <Card className='border-amber-500/20 bg-card/60 backdrop-blur shadow-sm'>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                الاشتراكات النشطة
              </CardTitle>
              <div className='h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600'>
                <IconShieldCheck className='h-5 w-5' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-amber-600'>
                {stats.active_subscriptions}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                صيدليات مفعلة الاشتراك التجاري
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Controls and Search Bar */}
        <Card className='shadow-sm'>
          <CardContent className='pt-6'>
            <div className='flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4'>
              {/* Search */}
              <div className='relative flex-1'>
                <IconSearch className='absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder='بحث بالصيدلية، كود الصيدلية، اسم المستخدم، الإيميل، رقم الهاتف، أو اسم المخزن...'
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className='pr-9'
                />
              </div>

              {/* Filters */}
              <div className='flex flex-wrap items-center gap-2'>
                {/* Mode Select */}
                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as any)}
                  className='h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'
                >
                  <option value='linked_only'>الصيدليات المرتبطة فقط</option>
                  <option value='all'>جميع الصيدليات (المرتبطة وغير المرتبطة)</option>
                </select>

                {/* Warehouse Select */}
                {warehouses.length > 0 && (
                  <select
                    value={selectedTenant}
                    onChange={(e) => setSelectedTenant(e.target.value)}
                    className='h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'
                  >
                    <option value='all'>كافة المخازن</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                )}

                <Button
                  variant='outline'
                  size='sm'
                  onClick={fetchData}
                  disabled={loading}
                  className='h-9 gap-1.5'
                >
                  <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  تحديث
                </Button>

                <Button
                  variant='secondary'
                  size='sm'
                  onClick={handleExportCSV}
                  className='h-9 gap-1.5'
                >
                  <IconDownload className='h-4 w-4' />
                  تصدير CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Linked Records Table */}
        <Card className='shadow-sm overflow-hidden'>
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader className='bg-muted/50'>
                <TableRow>
                  <TableHead className='text-right font-bold w-[220px]'>الصيدلية والكود</TableHead>
                  <TableHead className='text-right font-bold w-[240px]'>حساب المستخدم المسجل</TableHead>
                  <TableHead className='text-right font-bold w-[200px]'>الهاتف وسيرية الاتصال</TableHead>
                  <TableHead className='text-right font-bold w-[180px]'>المخزن التابع له</TableHead>
                  <TableHead className='text-right font-bold w-[160px]'>الجهاز والنظام</TableHead>
                  <TableHead className='text-right font-bold w-[120px]'>حالة الربط</TableHead>
                  <TableHead className='text-center font-bold w-[100px]'>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <TableRow key={idx}>
                      <TableCell colSpan={7} className='h-16 text-center text-muted-foreground animate-pulse'>
                        جاري تحميل البيانات الحقيقية من قاعدة البيانات...
                      </TableCell>
                    </TableRow>
                  ))
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className='h-32 text-center text-muted-foreground'>
                      <div className='flex flex-col items-center justify-center gap-2'>
                        <IconAlertCircle className='h-8 w-8 text-muted-foreground/60' />
                        <span className='font-medium text-base'>لا توجد صيدليات مطابقة لخيارات البحث الحالية</span>
                        <span className='text-xs'>تأكد من شروط البحث أو قم بتبديل الفلتر لعرض جميع الصيدليات</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((item) => {
                    const isLinked = !!item.linked_user_id;
                    const cleanPhone = (item.user_phone || item.pharmacy_phone || '').replace(/\D/g, '');
                    const waPhone = cleanPhone.startsWith('0') ? `2${cleanPhone}` : cleanPhone;

                    return (
                      <TableRow key={item.pharmacy_id} className='hover:bg-muted/40 transition-colors'>
                        {/* Pharmacy Info */}
                        <TableCell>
                          <div className='flex flex-col gap-1'>
                            <div className='flex items-center gap-1.5'>
                              <IconBuildingStore className='h-4 w-4 text-primary shrink-0' />
                              <span className='font-semibold text-foreground text-sm'>
                                {item.pharmacy_name}
                              </span>
                            </div>
                            <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                              <span className='bg-muted px-2 py-0.5 rounded font-mono font-medium text-foreground'>
                                كود: {item.pharmacy_code}
                              </span>
                              {item.pharmacy_address && (
                                <span className='truncate max-w-[150px]' title={item.pharmacy_address}>
                                  {item.pharmacy_address}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* User Account Info */}
                        <TableCell>
                          {isLinked ? (
                            <div className='flex flex-col gap-1'>
                              <div className='flex items-center gap-1.5'>
                                <span className='font-medium text-sm text-foreground'>
                                  {item.user_name || 'مستخدم مسجل'}
                                </span>
                                <Badge variant='outline' className='text-[10px] px-1.5 py-0 h-4'>
                                  {item.user_role || 'صيدلي'}
                                </Badge>
                              </div>
                              {item.user_email ? (
                                <div className='flex items-center gap-1 text-xs text-muted-foreground group'>
                                  <IconMail className='h-3.5 w-3.5 shrink-0' />
                                  <span className='font-mono truncate max-w-[160px]' title={item.user_email}>
                                    {item.user_email}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(item.user_email, 'الإيميل')}
                                    className='opacity-60 hover:opacity-100 transition-opacity p-0.5'
                                    title='نسخ الإيميل'
                                  >
                                    {copiedText === item.user_email ? (
                                      <IconCheck className='h-3 w-3 text-emerald-500' />
                                    ) : (
                                      <IconCopy className='h-3 w-3' />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <span className='text-xs text-muted-foreground'>معرف: {item.linked_user_id.slice(0, 8)}...</span>
                              )}
                            </div>
                          ) : (
                            <span className='text-xs text-muted-foreground italic flex items-center gap-1'>
                              <IconUnlink className='h-3.5 w-3.5 text-muted-foreground/60' />
                              غير مربوطة بحساب بعد
                            </span>
                          )}
                        </TableCell>

                        {/* Phone & Contact */}
                        <TableCell>
                          <div className='flex flex-col gap-1 text-xs'>
                            {item.user_phone ? (
                              <div className='flex items-center gap-1.5 font-mono text-foreground font-medium'>
                                <IconPhone className='h-3.5 w-3.5 text-emerald-600 shrink-0' />
                                <span>{item.user_phone}</span>
                                {cleanPhone && (
                                  <a
                                    href={`https://wa.me/${waPhone}`}
                                    target='_blank'
                                    rel='noreferrer'
                                    className='text-emerald-600 hover:text-emerald-700 ml-1'
                                    title='مراسلة واتساب'
                                  >
                                    <IconBrandWhatsapp className='h-3.5 w-3.5' />
                                  </a>
                                )}
                              </div>
                            ) : null}

                            {item.pharmacy_phone && item.pharmacy_phone !== item.user_phone && (
                              <div className='flex items-center gap-1.5 text-muted-foreground'>
                                <span>هاتف الصيدلية: {item.pharmacy_phone}</span>
                              </div>
                            )}

                            {!item.user_phone && !item.pharmacy_phone && (
                              <span className='text-muted-foreground'>لا يوجد هاتف مسجل</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Warehouse / Tenant */}
                        <TableCell>
                          <div className='flex flex-col gap-0.5'>
                            <div className='flex items-center gap-1.5'>
                              <IconBuildingWarehouse className='h-4 w-4 text-blue-600 shrink-0' />
                              <span className='font-medium text-sm text-foreground'>
                                {item.tenant_name}
                              </span>
                            </div>
                            <span className='text-[11px] text-muted-foreground'>
                              {item.tenant_category || 'مخزن أدوية'}
                            </span>
                          </div>
                        </TableCell>

                        {/* Device & Hardware Info */}
                        <TableCell>
                          <div className='flex flex-col gap-0.5 text-xs text-muted-foreground'>
                            {item.device_name ? (
                              <div className='flex items-center gap-1 font-medium text-foreground'>
                                <IconDeviceMobile className='h-3.5 w-3.5 text-primary shrink-0' />
                                <span>{item.device_name}</span>
                              </div>
                            ) : null}
                            {item.device_id ? (
                              <span
                                className='font-mono text-[10px] text-muted-foreground truncate max-w-[140px]'
                                title={`سيرية الجهاز: ${item.device_id}`}
                              >
                                سيرية: {item.device_id}
                              </span>
                            ) : (
                              <span className='text-[11px] text-muted-foreground'>تطبيق الهاتف</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <div className='flex flex-col gap-1 items-start'>
                            {isLinked ? (
                              <Badge className='bg-emerald-500/15 text-emerald-700 border-emerald-500/30 gap-1'>
                                <IconLink className='h-3 w-3' />
                                مرتبط
                              </Badge>
                            ) : (
                              <Badge variant='outline' className='text-muted-foreground gap-1'>
                                <IconUnlink className='h-3 w-3' />
                                متاح للربط
                              </Badge>
                            )}

                            {item.subscription_status === 'active' && (
                              <span className='text-[10px] text-emerald-600 font-medium'>
                                اشتراك نشط
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className='text-center'>
                          {isLinked ? (
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => setUnlinkItem(item)}
                              className='text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2 text-xs gap-1'
                            >
                              <IconUnlink className='h-3.5 w-3.5' />
                              فك الربط
                            </Button>
                          ) : (
                            <span className='text-xs text-muted-foreground'>-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Unlink Confirmation Dialog */}
        <Dialog open={!!unlinkItem} onOpenChange={(open) => !open && setUnlinkItem(null)}>
          <DialogContent className='sm:max-w-[450px]' dir='rtl'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2 text-destructive'>
                <IconUnlink className='h-5 w-5' />
                تأكيد فك ربط الصيدلية
              </DialogTitle>
              <DialogDescription className='pt-2 text-sm text-foreground/80 leading-relaxed'>
                هل أنت متأكد من رغبتك في فك ربط صيدلية{' '}
                <strong className='text-foreground'>{unlinkItem?.pharmacy_name}</strong> (كود:{' '}
                {unlinkItem?.pharmacy_code}) من حساب المستخدم{' '}
                <strong className='text-foreground'>{unlinkItem?.user_name || unlinkItem?.user_email}</strong>؟
                <br />
                <span className='text-xs text-muted-foreground mt-2 block'>
                  سيتمكن المستخدم أو صيدلي آخر من ربط الصيدلية مجدداً عبر كود التحقق.
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className='flex-row justify-start gap-2 pt-4'>
              <Button
                variant='destructive'
                onClick={handleConfirmUnlink}
                disabled={unlinking}
                className='gap-1.5'
              >
                {unlinking ? 'جاري فك الربط...' : 'نعم، فك الربط الآن'}
              </Button>
              <Button
                variant='outline'
                onClick={() => setUnlinkItem(null)}
                disabled={unlinking}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  );
}
