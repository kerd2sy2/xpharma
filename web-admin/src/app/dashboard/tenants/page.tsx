'use client';

import React, { useState, useEffect, useRef } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  IconPlus,
  IconKey,
  IconRefresh,
  IconCopy,
  IconCheck,
  IconServer,
  IconAlertCircle,
  IconCircleCheck,
  IconClock,
  IconEdit,
  IconPhone,
  IconMapPin,
  IconPhoto,
  IconUpload,
} from '@tabler/icons-react';
import { toast } from 'sonner';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  schema_name: string;
  status: string;
  address?: string | null;
  contact_phone?: string | null;
  logo_url?: string | null;
  last_heartbeat_at: string | null;
  created_at: string;
  sync_status: string;
  last_sync_at: string | null;
  last_invoice_cursor: string | null;
  last_error: string | null;
  pharmacies_count: number;
  agent_health: 'online' | 'offline_alert' | 'idle' | 'never';
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // New tenant form
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newLogoUrl, setNewLogoUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Edit tenant form
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [updating, setUpdating] = useState(false);

  const createFileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Generated token display
  const [generatedApiKey, setGeneratedApiKey] = useState('');
  const [generatedTenantName, setGeneratedTenantName] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tenants');
      const data = await res.json();
      if (data.success) {
        setTenants(data.tenants || []);
      } else {
        toast.error('فشل جلب بيانات المخازن: ' + (data.error || ''));
      }
    } catch {
      toast.error('حدث خطأ في الاتصال بقاعدة البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleFileUpload = async (file: File, isEdit: boolean) => {
    try {
      setUploadingLogo(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.url) {
        if (isEdit) {
          setEditLogoUrl(data.url);
        } else {
          setNewLogoUrl(data.url);
        }
        toast.success('تم رفع الشعار بنجاح!');
      } else {
        toast.error(data.error || 'فشل رفع الشعار');
      }
    } catch {
      toast.error('حدث خطأ أثناء رفع الشعار');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newSlug.trim()) {
      toast.error('يرجى كتابة اسم المخزن والمعرف (slug)');
      return;
    }

    try {
      setCreating(true);
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          slug: newSlug.trim(),
          address: newAddress.trim(),
          contact_phone: newContactPhone.trim(),
          logo_url: newLogoUrl.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('تم إنشاء المخزن واستنساخ المخطط بنجاح!');
        setCreateOpen(false);
        setNewName('');
        setNewSlug('');
        setNewAddress('');
        setNewContactPhone('');
        setNewLogoUrl('');
        setGeneratedApiKey(data.apiKey);
        setGeneratedTenantName(data.tenant.name);
        setTokenOpen(true);
        fetchTenants();
      } else {
        toast.error(data.error || 'فشل إنشاء المخزن');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (t: Tenant) => {
    setEditingTenant(t);
    setEditName(t.name || '');
    setEditAddress(t.address || '');
    setEditContactPhone(t.contact_phone || '');
    setEditLogoUrl(t.logo_url || '');
    setEditOpen(true);
  };

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;
    if (!editName.trim()) {
      toast.error('اسم المخزن مطلوب');
      return;
    }

    try {
      setUpdating(true);
      const res = await fetch(`/api/tenants/${editingTenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          address: editAddress.trim(),
          contact_phone: editContactPhone.trim(),
          logo_url: editLogoUrl.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('تم تحديث بيانات المخزن بنجاح!');
        setEditOpen(false);
        setEditingTenant(null);
        fetchTenants();
      } else {
        toast.error(data.error || 'فشل تحديث المخزن');
      }
    } catch {
      toast.error('حدث خطأ أثناء الاتصال');
    } finally {
      setUpdating(false);
    }
  };

  const handleRegenerateToken = async (tenantId: string, tenantName: string) => {
    if (!confirm(`هل أنت متأكد من إعادة توليد مفتاح وكيل مخزن (${tenantName})؟ سيتوقف المفتاح القديم فوراً.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/tenants/${tenantId}/token`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('تم توليد مفتاح جديد للوكيل بنجاح');
        setGeneratedApiKey(data.apiKey);
        setGeneratedTenantName(tenantName);
        setTokenOpen(true);
      } else {
        toast.error(data.error || 'فشل توليد المفتاح');
      }
    } catch {
      toast.error('حدث خطأ أثناء الاتصال');
    }
  };

  const handleToggleStatus = async (tenantId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`/api/tenants/${tenantId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`تم تغيير حالة المخزن إلى ${nextStatus === 'active' ? 'نشط' : 'موقوف'}`);
        fetchTenants();
      } else {
        toast.error(data.error || 'فشل تحديث الحالة');
      }
    } catch {
      toast.error('فشل الاتصال');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('تم نسخ المفتاح إلى الحافظة');
    setTimeout(() => setCopied(false), 2500);
  };

  const activeCount = tenants.filter((t) => t.status === 'active').length;
  const onlineCount = tenants.filter((t) => t.agent_health === 'online').length;

  return (
    <PageContainer>
      <div className='flex flex-col gap-6' dir='rtl'>
        {/* Header section */}
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>إدارة المخازن والمستأجرين (Warehouses & Tenants)</h1>
            <p className='text-sm text-muted-foreground'>
              إنشاء المخازن، تخصيص بيانات التواصل والعنوان واللوجو، وإدارة مفاتيح الوكلاء (Agent Tokens).
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='outline' size='sm' onClick={fetchTenants} disabled={loading}>
              <IconRefresh className={`size-4 ml-1 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </Button>
            <Button onClick={() => setCreateOpen(true)} className='gap-1'>
              <IconPlus className='size-4' />
              إضافة مخزن جديد
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className='grid gap-4 md:grid-cols-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>إجمالي المخازن</CardTitle>
              <IconServer className='size-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{tenants.length}</div>
              <p className='text-xs text-muted-foreground'>مستأجر مسجل في المنصة</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>المخازن النشطة</CardTitle>
              <IconCircleCheck className='size-4 text-emerald-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-emerald-600'>{activeCount}</div>
              <p className='text-xs text-muted-foreground'>تعمل بكامل الصلاحيات</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>الوكلاء المتصلون الآن</CardTitle>
              <div className='size-2.5 rounded-full bg-emerald-500 animate-pulse' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-emerald-600'>{onlineCount}</div>
              <p className='text-xs text-muted-foreground'>آخر نبضة منذ أقل من 5 دقائق</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>تنبيهات الانقطاع</CardTitle>
              <IconAlertCircle className='size-4 text-amber-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-amber-600'>
                {tenants.filter((t) => t.agent_health === 'offline_alert').length}
              </div>
              <p className='text-xs text-muted-foreground'>منقطع لأكثر من 24 ساعة</p>
            </CardContent>
          </Card>
        </div>

        {/* Tenants Table */}
        <Card>
          <CardHeader>
            <CardTitle>قائمة المخازن (Tenants List)</CardTitle>
            <CardDescription>
              كل مخزن يمتلك مخططاً مستقلاً (Schema) مع بيانات التواصل والعنوان وشعار المخزن للتطبيق.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='rounded-md border overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='text-right'>المخزن والشعار</TableHead>
                    <TableHead className='text-right'>العنوان ورقم التواصل</TableHead>
                    <TableHead className='text-right'>المعرف والمخطط</TableHead>
                    <TableHead className='text-right'>الحالة</TableHead>
                    <TableHead className='text-right'>حالة الوكيل (Agent)</TableHead>
                    <TableHead className='text-right'>الصيدليات المرتبطة</TableHead>
                    <TableHead className='text-right'>المزامنة</TableHead>
                    <TableHead className='text-left'>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && tenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className='text-center py-8 text-muted-foreground'>
                        جاري تحميل المخازن...
                      </TableCell>
                    </TableRow>
                  ) : tenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className='text-center py-8 text-muted-foreground'>
                        لا يوجد مخازن مضافة حتى الآن. اضغط "إضافة مخزن جديد" للبدء.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tenants.map((t) => (
                      <TableRow key={t.id}>
                        {/* Warehouse Name & Logo */}
                        <TableCell>
                          <div className='flex items-center gap-3'>
                            {t.logo_url ? (
                              <img
                                src={t.logo_url}
                                alt={t.name}
                                className='size-10 rounded-xl object-contain border bg-white p-0.5 shadow-xs shrink-0'
                                onError={(e) => {
                                  // Fallback on broken image
                                  (e.currentTarget as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className='size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold shrink-0'>
                                {t.name.charAt(0)}
                              </div>
                            )}
                            <div>
                              <div className='font-bold text-foreground'>{t.name}</div>
                              <code className='text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded'>
                                {t.slug}
                              </code>
                            </div>
                          </div>
                        </TableCell>

                        {/* Address & Contact Phone */}
                        <TableCell>
                          <div className='space-y-1 text-xs'>
                            {t.contact_phone ? (
                              <div className='flex items-center gap-1.5 text-foreground font-medium'>
                                <IconPhone className='size-3.5 text-emerald-600 shrink-0' />
                                <span dir='ltr' className='font-mono font-semibold'>{t.contact_phone}</span>
                              </div>
                            ) : (
                              <span className='text-muted-foreground text-[11px] italic'>بدون هاتف</span>
                            )}
                            {t.address ? (
                              <div className='flex items-center gap-1.5 text-muted-foreground truncate max-w-[200px]'>
                                <IconMapPin className='size-3.5 text-primary shrink-0' />
                                <span className='truncate' title={t.address}>{t.address}</span>
                              </div>
                            ) : (
                              <span className='text-muted-foreground text-[11px] italic block'>بدون عنوان</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Schema */}
                        <TableCell>
                          <code className='text-xs text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded'>
                            {t.schema_name}
                          </code>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          {t.status === 'active' ? (
                            <Badge variant='outline' className='border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 font-medium'>
                              نشط
                            </Badge>
                          ) : (
                            <Badge variant='outline' className='border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-950/30 font-medium'>
                              موقوف
                            </Badge>
                          )}
                        </TableCell>

                        {/* Agent Health */}
                        <TableCell>
                          {t.agent_health === 'online' ? (
                            <div className='flex items-center gap-1.5 text-xs text-emerald-600 font-medium'>
                              <div className='size-2 rounded-full bg-emerald-500 animate-ping' />
                              متصل (Online)
                            </div>
                          ) : t.agent_health === 'offline_alert' ? (
                            <div className='flex items-center gap-1.5 text-xs text-rose-600 font-medium'>
                              <IconAlertCircle className='size-3.5' />
                              منقطع (&gt;24h)
                            </div>
                          ) : t.agent_health === 'idle' ? (
                            <div className='flex items-center gap-1.5 text-xs text-amber-600 font-medium'>
                              <IconClock className='size-3.5' />
                              خامل (Idle)
                            </div>
                          ) : (
                            <span className='text-xs text-muted-foreground'>لم يتصل بعد</span>
                          )}
                        </TableCell>

                        {/* Pharmacies count */}
                        <TableCell className='font-medium'>{t.pharmacies_count} صيدلية</TableCell>

                        {/* Sync status */}
                        <TableCell>
                          <span className='text-xs capitalize bg-muted px-2 py-0.5 rounded'>
                            {t.sync_status || 'idle'}
                          </span>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className='text-left'>
                          <div className='flex items-center justify-end gap-1.5'>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => openEditModal(t)}
                              className='h-8 text-xs gap-1'
                              title='تعديل بيانات المخزن'
                            >
                              <IconEdit className='size-3.5' />
                              تعديل
                            </Button>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => handleRegenerateToken(t.id, t.name)}
                              className='h-8 text-xs gap-1'
                              title='توليد مفتاح وكيل جديد'
                            >
                              <IconKey className='size-3.5' />
                              المفتاح
                            </Button>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => handleToggleStatus(t.id, t.status)}
                              className='h-8 text-xs'
                            >
                              {t.status === 'active' ? 'إيقاف' : 'تفعيل'}
                            </Button>
                          </div>
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

      {/* Dialog: Create Tenant */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className='sm:max-w-[540px]' dir='rtl'>
          <form onSubmit={handleCreateTenant}>
            <DialogHeader>
              <DialogTitle className='text-right'>إضافة مخزن جديد (New Warehouse Tenant)</DialogTitle>
              <DialogDescription className='text-right'>
                أدخل بيانات المخزن وهاتف الدعم الفني والعنوان والشعار لإنشاء المخزن واستنساخ المخطط.
              </DialogDescription>
            </DialogHeader>
            <div className='grid gap-4 py-4'>
              {/* Name & Slug */}
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='name' className='text-right'>
                    اسم المخزن <span className='text-rose-500'>*</span>
                  </Label>
                  <Input
                    id='name'
                    placeholder='مثال: مخزن تبارك للأدوية'
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (!newSlug) {
                        setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_'));
                      }
                    }}
                    required
                  />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='slug' className='text-right'>
                    المعرف البرمجي (Slug) <span className='text-rose-500'>*</span>
                  </Label>
                  <Input
                    id='slug'
                    placeholder='مثال: tabarak'
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    required
                  />
                </div>
              </div>

              {/* Contact Phone & Address */}
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='contact_phone' className='text-right'>
                    رقم التواصل والدعم للربط
                  </Label>
                  <Input
                    id='contact_phone'
                    placeholder='مثلاً: 01012345678'
                    dir='ltr'
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                  />
                  <p className='text-[11px] text-muted-foreground'>
                    يظهر للصيدلي لو واجه مشكلة أثناء الربط للتواصل معكم مباشرة.
                  </p>
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='address' className='text-right'>
                    العنوان ومقر المخزن
                  </Label>
                  <Input
                    id='address'
                    placeholder='مثال: المنصورة - شارع الجيش'
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                  />
                  <p className='text-[11px] text-muted-foreground'>
                    مقر المستودع الجغرافي أو المحافظة.
                  </p>
                </div>
              </div>

              {/* Logo Upload & URL */}
              <div className='grid gap-2 border rounded-lg p-3 bg-muted/30'>
                <Label className='text-right font-medium flex items-center justify-between'>
                  <span>شعار / لوجو المخزن (Logo)</span>
                  {uploadingLogo && <span className='text-xs text-primary animate-pulse'>جاري رفع الصورة...</span>}
                </Label>

                <div className='flex items-center gap-3'>
                  {newLogoUrl ? (
                    <img
                      src={newLogoUrl}
                      alt='معاينة اللوجو'
                      className='size-14 rounded-xl border object-contain bg-white p-1 shadow-xs shrink-0'
                    />
                  ) : (
                    <div className='size-14 rounded-xl border border-dashed flex items-center justify-center text-muted-foreground bg-muted shrink-0'>
                      <IconPhoto className='size-6' />
                    </div>
                  )}

                  <div className='flex-1 space-y-2'>
                    <Input
                      placeholder='رابط الصورة (URL) أو ارفع ملف'
                      dir='ltr'
                      value={newLogoUrl}
                      onChange={(e) => setNewLogoUrl(e.target.value)}
                      className='text-xs'
                    />
                    <div className='flex items-center gap-2'>
                      <input
                        type='file'
                        accept='image/*'
                        ref={createFileInputRef}
                        className='hidden'
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, false);
                        }}
                      />
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        className='h-7 text-xs gap-1'
                        onClick={() => createFileInputRef.current?.click()}
                        disabled={uploadingLogo}
                      >
                        <IconUpload className='size-3.5' />
                        اختر صورة من الجهاز
                      </Button>
                      {newLogoUrl && (
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-7 text-xs text-rose-500'
                          onClick={() => setNewLogoUrl('')}
                        >
                          إزالة
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className='gap-2 sm:gap-0'>
              <Button type='button' variant='outline' onClick={() => setCreateOpen(false)} disabled={creating}>
                إلغاء
              </Button>
              <Button type='submit' disabled={creating || uploadingLogo}>
                {creating ? 'جاري الإنشاء والاستنساخ...' : 'إنشاء المخزن'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit Tenant Details */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className='sm:max-w-[540px]' dir='rtl'>
          <form onSubmit={handleUpdateTenant}>
            <DialogHeader>
              <DialogTitle className='text-right'>تعديل بيانات المخزن ({editingTenant?.name})</DialogTitle>
              <DialogDescription className='text-right'>
                تحديث الاسم، العنوان، رقم هاتف الدعم، أو شعار المخزن.
              </DialogDescription>
            </DialogHeader>

            <div className='grid gap-4 py-4'>
              <div className='grid gap-1.5'>
                <Label htmlFor='edit_name' className='text-right'>
                  اسم المخزن <span className='text-rose-500'>*</span>
                </Label>
                <Input
                  id='edit_name'
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='edit_contact_phone' className='text-right'>
                    رقم التواصل والدعم للربط
                  </Label>
                  <Input
                    id='edit_contact_phone'
                    placeholder='مثال: 01012345678'
                    dir='ltr'
                    value={editContactPhone}
                    onChange={(e) => setEditContactPhone(e.target.value)}
                  />
                  <p className='text-[11px] text-muted-foreground'>
                    يظهر للعميل في حال وجود مشكلة أثناء الربط.
                  </p>
                </div>

                <div className='grid gap-1.5'>
                  <Label htmlFor='edit_address' className='text-right'>
                    العنوان ومقر المخزن
                  </Label>
                  <Input
                    id='edit_address'
                    placeholder='مثال: المنصورة - شارع الجيش'
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                  />
                </div>
              </div>

              {/* Logo Edit */}
              <div className='grid gap-2 border rounded-lg p-3 bg-muted/30'>
                <Label className='text-right font-medium flex items-center justify-between'>
                  <span>شعار / لوجو المخزن (Logo)</span>
                  {uploadingLogo && <span className='text-xs text-primary animate-pulse'>جاري الرفع...</span>}
                </Label>

                <div className='flex items-center gap-3'>
                  {editLogoUrl ? (
                    <img
                      src={editLogoUrl}
                      alt='معاينة اللوجو'
                      className='size-14 rounded-xl border object-contain bg-white p-1 shadow-xs shrink-0'
                    />
                  ) : (
                    <div className='size-14 rounded-xl border border-dashed flex items-center justify-center text-muted-foreground bg-muted shrink-0'>
                      <IconPhoto className='size-6' />
                    </div>
                  )}

                  <div className='flex-1 space-y-2'>
                    <Input
                      placeholder='رابط الصورة (URL) أو ارفع ملف جديد'
                      dir='ltr'
                      value={editLogoUrl}
                      onChange={(e) => setEditLogoUrl(e.target.value)}
                      className='text-xs'
                    />
                    <div className='flex items-center gap-2'>
                      <input
                        type='file'
                        accept='image/*'
                        ref={editFileInputRef}
                        className='hidden'
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, true);
                        }}
                      />
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        className='h-7 text-xs gap-1'
                        onClick={() => editFileInputRef.current?.click()}
                        disabled={uploadingLogo}
                      >
                        <IconUpload className='size-3.5' />
                        اختر صورة جديدة
                      </Button>
                      {editLogoUrl && (
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-7 text-xs text-rose-500'
                          onClick={() => setEditLogoUrl('')}
                        >
                          إزالة
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className='gap-2 sm:gap-0'>
              <Button type='button' variant='outline' onClick={() => setEditOpen(false)} disabled={updating}>
                إلغاء
              </Button>
              <Button type='submit' disabled={updating || uploadingLogo}>
                {updating ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Generated Agent Token */}
      <Dialog open={tokenOpen} onOpenChange={setTokenOpen}>
        <DialogContent className='sm:max-w-[560px]' dir='rtl'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-emerald-600 text-right'>
              <IconCircleCheck className='size-5' />
              مفتاح وكيل المخزن ({generatedTenantName})
            </DialogTitle>
            <DialogDescription className='text-right'>
              انسخ هذا المفتاح وضعه في ملف إعدادات الوكيل (`config.yaml` / `.env`) على جهاز المخزن. لن تتمكن من رؤية المفتاح كاملاً مرة أخرى!
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4 py-4'>
            <div className='space-y-1.5'>
              <Label className='text-xs text-muted-foreground'>Agent API Token (احفظه في مكان آمن):</Label>
              <div className='flex items-center gap-2'>
                <Input
                  readOnly
                  value={generatedApiKey}
                  className='font-mono text-xs bg-muted'
                  dir='ltr'
                />
                <Button
                  size='icon'
                  variant='outline'
                  onClick={() => copyToClipboard(generatedApiKey)}
                  title='نسخ'
                >
                  {copied ? <IconCheck className='size-4 text-emerald-500' /> : <IconCopy className='size-4' />}
                </Button>
              </div>
            </div>

            <div className='rounded-md bg-muted/60 p-3 text-xs space-y-1 text-right'>
              <p className='font-semibold text-foreground'>طريقة الاستخدام في وكيل الويندوز (Agent Config):</p>
              <pre className='overflow-x-auto text-[11px] p-2 bg-background/80 rounded border' dir='ltr'>
{`# config.yaml
cloud:
  api_url: "https://api.xpharma.cloud"
  api_key: "${generatedApiKey}"
  sync_interval_seconds: 60
firebird:
  db_path: "C:\\\\ORGA\\\\ORGA.GDB"`}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setTokenOpen(false)}>تم النسخ والحفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
