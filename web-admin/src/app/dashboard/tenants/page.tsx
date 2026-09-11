'use client';

import React, { useState, useEffect } from 'react';
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
} from '@tabler/icons-react';
import { toast } from 'sonner';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  schema_name: string;
  status: string;
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

  // New tenant form
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [creating, setCreating] = useState(false);

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
    } catch (err: any) {
      toast.error('حدث خطأ في الاتصال بقاعدة البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

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
        body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim() }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('تم إنشاء المخزن واستنساخ المخطط بنجاح!');
        setCreateOpen(false);
        setNewName('');
        setNewSlug('');
        setGeneratedApiKey(data.apiKey);
        setGeneratedTenantName(data.tenant.name);
        setTokenOpen(true);
        fetchTenants();
      } else {
        toast.error(data.error || 'فشل إنشاء المخزن');
      }
    } catch (err) {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setCreating(false);
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
    } catch (err) {
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
      <div className='flex flex-col gap-6'>
        {/* Header section */}
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>إدارة المخازن والمستأجرين (Warehouses & Tenants)</h1>
            <p className='text-sm text-muted-foreground'>
              إنشاء المخازن، تخصيص المخططات المستقلة، وتوليد مفاتيح مصادقة الوكلاء (Agent Tokens).
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='outline' size='sm' onClick={fetchTenants} disabled={loading}>
              <IconRefresh className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
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
              كل مخزن يمتلك مخططاً مستقلاً تماماً (Schema-per-tenant) وجداول خاصة به لضمان العزل والسرعة.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>اسم المخزن</TableHead>
                    <TableHead>المعرف (Slug)</TableHead>
                    <TableHead>المخطط (Schema)</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>حالة الوكيل (Agent)</TableHead>
                    <TableHead>الصيدليات المرتبطة</TableHead>
                    <TableHead>حالة المزامنة</TableHead>
                    <TableHead className='text-end'>الإجراءات</TableHead>
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
                        <TableCell className='font-semibold'>{t.name}</TableCell>
                        <TableCell>
                          <code className='text-xs bg-muted px-1.5 py-0.5 rounded'>{t.slug}</code>
                        </TableCell>
                        <TableCell>
                          <code className='text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded'>
                            {t.schema_name}
                          </code>
                        </TableCell>
                        <TableCell>
                          {t.status === 'active' ? (
                            <Badge variant='outline' className='border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'>
                              نشط (Active)
                            </Badge>
                          ) : (
                            <Badge variant='outline' className='border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-950/30'>
                              موقوف (Suspended)
                            </Badge>
                          )}
                        </TableCell>
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
                        <TableCell className='font-medium'>{t.pharmacies_count} صيدلية</TableCell>
                        <TableCell>
                          <span className='text-xs capitalize'>
                            {t.sync_status || 'idle'}
                          </span>
                        </TableCell>
                        <TableCell className='text-end'>
                          <div className='flex items-center justify-end gap-1'>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => handleRegenerateToken(t.id, t.name)}
                              title='توليد مفتاح وكيل جديد'
                            >
                              <IconKey className='size-3.5 mr-1' />
                              المفتاح
                            </Button>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => handleToggleStatus(t.id, t.status)}
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
        <DialogContent className='sm:max-w-[480px]'>
          <form onSubmit={handleCreateTenant}>
            <DialogHeader>
              <DialogTitle>إضافة مخزن جديد (New Warehouse Tenant)</DialogTitle>
              <DialogDescription>
                سيقوم النظام بإنشاء المخزن واستنساخ المخطط (`tenant_template`) وتوليد مفتاح الأمان تلقائياً.
              </DialogDescription>
            </DialogHeader>
            <div className='grid gap-4 py-4'>
              <div className='grid gap-2'>
                <Label htmlFor='name'>اسم المخزن</Label>
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
              <div className='grid gap-2'>
                <Label htmlFor='slug'>المعرف البرمجي (Slug)</Label>
                <Input
                  id='slug'
                  placeholder='مثال: tabarak'
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  required
                />
                <p className='text-xs text-muted-foreground'>
                  اسم المخطط سيكون: <code>tenant_{newSlug || 'slug'}</code>
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setCreateOpen(false)} disabled={creating}>
                إلغاء
              </Button>
              <Button type='submit' disabled={creating}>
                {creating ? 'جاري الإنشاء والاستنساخ...' : 'إنشاء المخزن'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Generated Agent Token */}
      <Dialog open={tokenOpen} onOpenChange={setTokenOpen}>
        <DialogContent className='sm:max-w-[560px]'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-emerald-600'>
              <IconCircleCheck className='size-5' />
              مفتاح وكيل المخزن ({generatedTenantName})
            </DialogTitle>
            <DialogDescription>
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

            <div className='rounded-md bg-muted/60 p-3 text-xs space-y-1'>
              <p className='font-semibold text-foreground'>طريقة الاستخدام في وكيل الويندوز (Agent Config):</p>
              <pre className='overflow-x-auto text-[11px] p-2 bg-background/80 rounded border'>
{`# config.yaml (tabarak-agent)
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
