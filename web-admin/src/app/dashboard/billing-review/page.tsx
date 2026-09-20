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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Textarea } from '@/components/ui/textarea';
import {
  IconRefresh,
  IconCheck,
  IconX,
  IconReceipt,
  IconCreditCard,
  IconAlertCircle,
  IconCircleCheck,
  IconClock,
  IconCalendarTime,
  IconHourglassHigh,
  IconUserPlus,
  IconEdit,
  IconPlayerPause,
  IconPlayerPlay,
  IconBan,
  IconCalendarPlus,
  IconDotsVertical,
  IconEye,
  IconGift,
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
  status: 'active' | 'pending_approval' | 'rejected' | 'expired' | 'superseded' | 'paused' | 'cancelled' | (string & {});
  start_date: string;
  end_date: string;
  days_left?: number;
  is_expired?: boolean;
  receipt_url: string | null;
  receipt_ref: string | null;
  notes: string | null;
  created_at: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

const PLAN_PRICES: Record<string, number> = {
  '1 صيدلية': 100,
  '2 صيدليات': 150,
  '3 صيدليات': 200,
  '4 صيدليات': 250,
  '5 صيدليات': 300,
};

export default function BillingReviewPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [usersList, setUsersList] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'paused' | 'pending' | 'kashier' | 'rejected'>('all');

  // Receipt Preview modal
  const [previewSub, setPreviewSub] = useState<Subscription | null>(null);

  // Reject modal
  const [rejectSub, setRejectSub] = useState<Subscription | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Add / Grant Subscription modal
  const [addSubOpen, setAddSubOpen] = useState(false);
  const [newSubUserId, setNewSubUserId] = useState<string>('manual');
  const [newSubEmail, setNewSubEmail] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubPhone, setNewSubPhone] = useState('');
  const [newSubPlan, setNewSubPlan] = useState('3 صيدليات');
  const [newSubDuration, setNewSubDuration] = useState(30);
  const [newSubPaymentMethod, setNewSubPaymentMethod] = useState<'admin_grant' | 'kashier' | 'instapay' | 'cash' | 'bank_transfer'>('admin_grant');
  const [newSubAmount, setNewSubAmount] = useState<number>(0);
  const [newSubNotes, setNewSubNotes] = useState('');

  // Edit Subscription modal
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [editPlan, setEditPlan] = useState('3 صيدليات');
  const [editDurationOption, setEditDurationOption] = useState<'keep' | 'renew30' | 'add30'>('keep');
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editNotes, setEditNotes] = useState('');

  // Confirmation modal for Pause / Cancel / Resume / Extend
  const [confirmModal, setConfirmModal] = useState<{
    sub: Subscription;
    action: 'pause' | 'resume' | 'cancel' | 'extend';
    title: string;
    description: string;
    confirmText: string;
    variant: 'default' | 'destructive' | 'warning';
  } | null>(null);

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

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users?limit=100');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setUsersList(data.data);
      }
    } catch {
      // Non-critical
    }
  };

  useEffect(() => {
    fetchSubscriptions();
    fetchUsers();
  }, []);

  // Sync amount when plan or payment method changes in Add modal
  const handlePaymentMethodChange = (method: 'admin_grant' | 'kashier' | 'instapay' | 'cash' | 'bank_transfer') => {
    setNewSubPaymentMethod(method);
    if (method === 'admin_grant') {
      setNewSubAmount(0);
      if (!newSubNotes) setNewSubNotes('منحة اشتراك مجاني بقرار الإدارة');
    } else {
      setNewSubAmount(PLAN_PRICES[newSubPlan] || 200);
    }
  };

  const handlePlanChange = (plan: string) => {
    setNewSubPlan(plan);
    if (newSubPaymentMethod !== 'admin_grant') {
      setNewSubAmount(PLAN_PRICES[plan] || 200);
    }
  };

  const handleUserSelect = (val: string) => {
    setNewSubUserId(val);
    if (val === 'manual') {
      setNewSubEmail('');
      setNewSubName('');
      setNewSubPhone('');
    } else {
      const found = usersList.find((u) => u.id === val);
      if (found) {
        setNewSubEmail(found.email || '');
        setNewSubName(found.name || '');
        setNewSubPhone(found.phone || '');
      }
    }
  };

  // 1. CREATE SUBSCRIPTION DIRECTLY
  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubEmail.trim()) {
      toast.error('البريد الإلكتروني للصيدلي مطلوب');
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: newSubEmail.trim().toLowerCase(),
          user_name: newSubName.trim() || 'دكتور صيدلي',
          user_phone: newSubPhone.trim(),
          plan_type: newSubPlan,
          duration_days: newSubDuration,
          payment_method: newSubPaymentMethod,
          amount: newSubAmount,
          status: 'active',
          notes: newSubNotes.trim() || (newSubPaymentMethod === 'admin_grant' ? 'منحة اشتراك من الإدارة' : `سداد يدوي: ${newSubPlan}`),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'تم منح وتفعيل الاشتراك بنجاح!');
        setAddSubOpen(false);
        // Reset
        setNewSubUserId('manual');
        setNewSubEmail('');
        setNewSubName('');
        setNewSubPhone('');
        setNewSubPlan('3 صيدليات');
        setNewSubDuration(30);
        setNewSubPaymentMethod('admin_grant');
        setNewSubAmount(0);
        setNewSubNotes('');
        fetchSubscriptions();
      } else {
        toast.error(data.error || 'فشل إنشاء الاشتراك');
      }
    } catch {
      toast.error('حدث خطأ أثناء حفظ الاشتراك');
    } finally {
      setActionLoading(false);
    }
  };

  // 2. OPEN EDIT MODAL
  const openEditModal = (sub: Subscription) => {
    setEditSub(sub);
    const rawPlan = sub.plan_type || '3 صيدليات';
    let matchedPlan = '3 صيدليات';
    for (const key of Object.keys(PLAN_PRICES)) {
      if (rawPlan.includes(key.charAt(0))) {
        matchedPlan = key;
        break;
      }
    }
    setEditPlan(matchedPlan);
    setEditDurationOption('keep');
    setEditAmount(Number(sub.amount) || 0);
    setEditNotes(sub.notes || '');
  };

  // 3. SUBMIT EDIT MODAL
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSub) return;
    try {
      setActionLoading(true);
      const res = await fetch('/api/billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editSub.id,
          action: 'change_plan',
          plan_type: editPlan,
          renew_cycle: editDurationOption === 'renew30',
          days: editDurationOption === 'add30' ? 30 : (editDurationOption === 'renew30' ? 30 : undefined),
          amount: editAmount,
          notes: editNotes.trim() || `تعديل الباقة إلى ${editPlan} من قبل الإدارة`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'تم تحديث الباقة بنجاح!');
        setEditSub(null);
        fetchSubscriptions();
      } else {
        toast.error(data.error || 'فشل تعديل الاشتراك');
      }
    } catch {
      toast.error('حدث خطأ أثناء التعديل');
    } finally {
      setActionLoading(false);
    }
  };

  // 4. CONFIRM LIFECYCLE ACTION (Pause, Resume, Cancel, Extend)
  const executeConfirmedAction = async () => {
    if (!confirmModal) return;
    const { sub, action } = confirmModal;
    try {
      setActionLoading(true);
      const res = await fetch('/api/billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sub.id,
          action,
          days: action === 'extend' ? 30 : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'تم تنفيذ العملية بنجاح');
        setConfirmModal(null);
        fetchSubscriptions();
      } else {
        toast.error(data.error || 'فشل تنفيذ الإجراء');
      }
    } catch {
      toast.error('حدث خطأ أثناء الاتصال بالسيرفر');
    } finally {
      setActionLoading(false);
    }
  };

  // Quick Action Triggers
  const triggerPause = (sub: Subscription) => {
    setConfirmModal({
      sub,
      action: 'pause',
      title: 'إيقاف الاشتراك مؤقتاً (تجميد)',
      description: `هل أنت متأكد من إيقاف اشتراك (${sub.user_name || sub.pharmacy_name || sub.user_email}) مؤقتاً؟ سيتوقف تطبيق الصيدلي عن استخدام الميزات المدفوعة حتى تقوم باستئنافه.`,
      confirmText: 'تأكيد الإيقاف المؤقت',
      variant: 'warning',
    });
  };

  const triggerResume = (sub: Subscription) => {
    setConfirmModal({
      sub,
      action: 'resume',
      title: 'استئناف وتفعيل الاشتراك',
      description: `سيتم إعادة تفعيل اشتراك (${sub.user_name || sub.pharmacy_name || sub.user_email}) فوراً على باقته (${sub.plan_type}).`,
      confirmText: 'تفعيل واستئناف الآن',
      variant: 'default',
    });
  };

  const triggerCancel = (sub: Subscription) => {
    setConfirmModal({
      sub,
      action: 'cancel',
      title: 'إلغاء الاشتراك نهائياً',
      description: `تحذير: سيتم إلغاء اشتراك (${sub.user_name || sub.pharmacy_name || sub.user_email}) بالكامل وإعادة حساب المستخدم للباقة المجانية (0 صيدليات إضافية).`,
      confirmText: 'تأكيد الإلغاء النهائي',
      variant: 'destructive',
    });
  };

  const triggerExtend = (sub: Subscription) => {
    setConfirmModal({
      sub,
      action: 'extend',
      title: 'تمديد مدة الاشتراك 30 يوماً',
      description: `سيتم إضافة 30 يوماً إضافية لتاريخ انتهاء اشتراك (${sub.user_name || sub.pharmacy_name || sub.user_email}) مجاناً من الإدارة.`,
      confirmText: 'إضافة 30 يوماً وتمديد',
      variant: 'default',
    });
  };

  // Existing Approve / Reject
  const handleApprove = async (id: string, pharmacyName: string) => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'active', notes: 'تم الاعتماد والتفعيل عبر لوحة الإدارة' }),
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
    if (filterTab === 'paused') return s.status === 'paused';
    if (filterTab === 'kashier') return s.payment_method === 'kashier' || !!s.transaction_id;
    if (filterTab === 'rejected') return s.status === 'rejected' || s.status === 'cancelled';
    return true;
  });

  const pendingCount = subscriptions.filter((s) => s.status === 'pending_approval').length;
  const activeCount = subscriptions.filter((s) => s.status === 'active').length;
  const pausedCount = subscriptions.filter((s) => s.status === 'paused').length;
  const kashierCount = subscriptions.filter((s) => s.payment_method === 'kashier' || !!s.transaction_id).length;
  const rejectedCount = subscriptions.filter((s) => s.status === 'rejected' || s.status === 'cancelled').length;
  const totalRevenue = subscriptions
    .filter((s) => s.status === 'active')
    .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  const formatPlanName = (plan: string) => {
    if (!plan) return 'غير محدد';
    if (plan === 'yearly') return 'سنوي';
    if (plan === 'quarterly') return 'ربع سنوي';
    if (plan === 'monthly') return 'شهري';
    if (plan.startsWith('P') || plan.includes('صيدل')) return plan;
    return `${plan} صيدليات`;
  };

  const getCountdownInfo = (s: Subscription) => {
    let days = typeof s.days_left === 'number' ? s.days_left : 30;
    if (s.end_date && typeof s.days_left !== 'number') {
      const end = new Date(s.end_date);
      const now = new Date();
      const utcNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const utcEnd = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
      days = Math.ceil((utcEnd - utcNow) / (1000 * 60 * 60 * 24));
    }
    days = Math.min(30, Math.max(0, days));

    if (s.status === 'pending_approval') {
      return {
        label: '30 يوماً (عند التفعيل)',
        days: 30,
        variant: 'pending',
      };
    }
    if (s.status === 'paused') {
      return {
        label: `موقوف مؤقتاً (باقي ${days} يوم)`,
        days,
        variant: 'paused',
      };
    }
    if (s.status === 'cancelled') {
      return {
        label: 'ملغي من الإدارة',
        days: 0,
        variant: 'cancelled',
      };
    }
    if (s.status === 'rejected') {
      return {
        label: 'مرفوض',
        days: 0,
        variant: 'rejected',
      };
    }
    if (s.status === 'superseded') {
      return {
        label: 'منتهي (ترقية سابقة)',
        days: 0,
        variant: 'expired',
      };
    }
    if (days <= 0 || s.status === 'expired') {
      return {
        label: days < 0 ? `منتهي منذ ${Math.abs(days)} يوم` : 'منتهي اليوم',
        days: 0,
        variant: 'expired',
      };
    }
    if (days <= 3) {
      return {
        label: `باقي ${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومان' : 'أيام'} (ينتهي قريباً)`,
        days,
        variant: 'urgent',
      };
    }
    return {
      label: `باقي ${days} يوم`,
      days,
      variant: 'active',
    };
  };

  return (
    <PageContainer>
      <div className='flex flex-col gap-6'>
        {/* Header */}
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>مراجعة الفواتير والاشتراكات (Billing & Subscriptions)</h1>
            <p className='text-sm text-muted-foreground'>
              إدارة وتعديل باقات المشتركين (1-5 صيدليات)، تفعيل ومنح الاشتراكات المباشرة، وتجميد أو إلغاء الحسابات فورياً.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button
              className='bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm'
              size='sm'
              onClick={() => setAddSubOpen(true)}
            >
              <IconUserPlus className='size-4' />
              إضافة اشتراك لمستخدم
            </Button>
            <Button variant='outline' size='sm' onClick={fetchSubscriptions} disabled={loading}>
              <IconRefresh className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              تحديث الفواتير
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
          <Card className={pendingCount > 0 ? 'border-amber-500/60 bg-amber-500/5' : ''}>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-xs font-medium'>معاملات بانتظار المراجعة</CardTitle>
              <IconReceipt className='size-4 text-amber-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-amber-600'>{pendingCount}</div>
              <p className='text-[11px] text-muted-foreground'>إيصالات بحاجة للاعتماد</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-xs font-medium'>الاشتراكات النشطة</CardTitle>
              <IconCircleCheck className='size-4 text-emerald-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-emerald-600'>{activeCount}</div>
              <p className='text-[11px] text-muted-foreground'>مفعلة وتعمل بالتطبيق</p>
            </CardContent>
          </Card>
          <Card className={pausedCount > 0 ? 'border-amber-500/50 bg-amber-500/5' : ''}>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-xs font-medium'>موقوفة مؤقتاً (مجمدة)</CardTitle>
              <IconPlayerPause className='size-4 text-amber-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-amber-600'>{pausedCount}</div>
              <p className='text-[11px] text-muted-foreground'>معطلة بقرار الإدارة</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-xs font-medium'>إجمالي الإيرادات</CardTitle>
              <IconCreditCard className='size-4 text-primary' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-primary'>{totalRevenue.toLocaleString()} ج.م</div>
              <p className='text-[11px] text-muted-foreground'>المحصل من الاشتراكات</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-xs font-medium'>إجمالي العمليات</CardTitle>
              <IconReceipt className='size-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{subscriptions.length}</div>
              <p className='text-[11px] text-muted-foreground'>عملية مسجلة بالنظام</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Table */}
        <Card>
          <CardHeader className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <div>
              <CardTitle>سجل الفواتير والاشتراكات الشهرية</CardTitle>
              <CardDescription>عرض فوري للاشتراكات وباقي كم يوم لانتهاء كل اشتراك مع أدوات التحكم الكاملة.</CardDescription>
            </div>
            <Tabs value={filterTab} onValueChange={(v: any) => setFilterTab(v)}>
              <TabsList className='flex-wrap h-auto p-1'>
                <TabsTrigger value='all'>الكل ({subscriptions.length})</TabsTrigger>
                <TabsTrigger value='active'>النشطة ({activeCount})</TabsTrigger>
                <TabsTrigger value='paused'>الموقوفة ({pausedCount})</TabsTrigger>
                <TabsTrigger value='pending' className='relative'>
                  المعلقة ({pendingCount})
                  {pendingCount > 0 && (
                    <span className='size-2 rounded-full bg-amber-500 absolute -top-0.5 -right-0.5' />
                  )}
                </TabsTrigger>
                <TabsTrigger value='kashier'>كاشير ({kashierCount})</TabsTrigger>
                <TabsTrigger value='rejected'>المرفوضة/الملغاة ({rejectedCount})</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <div className='rounded-md border overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العميل / الصيدلية</TableHead>
                    <TableHead>طريقة الدفع</TableHead>
                    <TableHead>نوع الباقة</TableHead>
                    <TableHead>المبلغ المدفوع</TableHead>
                    <TableHead>عداد الاشتراك (شهر)</TableHead>
                    <TableHead>المرجع / الطلب</TableHead>
                    <TableHead>تاريخ العملية</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className='text-end min-w-[130px]'>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && subscriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className='text-center py-8 text-muted-foreground'>
                        جاري تحميل الفواتير والاشتراكات...
                      </TableCell>
                    </TableRow>
                  ) : filteredSubs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className='text-center py-8 text-muted-foreground'>
                        لا توجد اشتراكات تطابق الفلتر المختار.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSubs.map((s) => {
                      const countdown = getCountdownInfo(s);
                      return (
                        <TableRow key={s.id} className={s.status === 'paused' ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}>
                          <TableCell>
                            <div className='font-semibold'>{s.user_name || s.pharmacy_name || 'مشترك تطبيق'}</div>
                            <div className='text-xs text-muted-foreground font-mono'>
                              {s.user_email || s.pharmacy_phone || s.pharmacy_code || '-'}
                            </div>
                          </TableCell>
                          <TableCell>
                            {s.payment_method === 'admin_grant' ? (
                              <Badge variant='outline' className='border-purple-500 text-purple-600 bg-purple-50 dark:bg-purple-950/30 gap-1 text-xs'>
                                <IconGift className='size-3' />
                                منحة إدارة 🎁
                              </Badge>
                            ) : s.payment_method === 'kashier' || s.transaction_id ? (
                              <Badge variant='outline' className='border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 gap-1 text-xs'>
                                <IconCreditCard className='size-3' />
                                كاشير (أونلاين)
                              </Badge>
                            ) : s.payment_method === 'cash' || s.payment_method === 'bank_transfer' ? (
                              <Badge variant='outline' className='border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 gap-1 text-xs'>
                                <IconReceipt className='size-3' />
                                سداد نقدي/بنكي
                              </Badge>
                            ) : (
                              <Badge variant='outline' className='border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30 gap-1 text-xs'>
                                <IconReceipt className='size-3' />
                                إنستاباي (تحويل)
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant='secondary' className='text-xs font-semibold'>
                              {formatPlanName(s.plan_type)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className='font-bold text-emerald-600 dark:text-emerald-400 font-mono'>
                              {s.amount ? `${s.amount} ج.م` : (s.payment_method === 'admin_grant' ? 'مجاني (0 ج.م)' : '-')}
                            </span>
                          </TableCell>
                          <TableCell>
                            {countdown.variant === 'active' ? (
                              <div className='flex flex-col gap-1 min-w-[125px]'>
                                <div className='flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400'>
                                  <IconClock className='size-3.5 shrink-0' />
                                  <span>{countdown.label}</span>
                                </div>
                                <div className='w-full bg-emerald-100 dark:bg-emerald-950/50 rounded-full h-1.5 overflow-hidden'>
                                  <div
                                    className='bg-emerald-500 h-1.5 rounded-full transition-all'
                                    style={{ width: `${Math.min(100, Math.max(0, Math.round((countdown.days / 30) * 100)))}%` }}
                                  />
                                </div>
                                <span className='text-[10px] text-muted-foreground'>من دورة 30 يوماً</span>
                              </div>
                            ) : countdown.variant === 'paused' ? (
                              <Badge variant='outline' className='border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30 gap-1 text-xs'>
                                <IconPlayerPause className='size-3.5' />
                                {countdown.label}
                              </Badge>
                            ) : countdown.variant === 'urgent' ? (
                              <Badge variant='outline' className='border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30 gap-1 text-xs animate-pulse'>
                                <IconHourglassHigh className='size-3.5' />
                                {countdown.label}
                              </Badge>
                            ) : countdown.variant === 'expired' ? (
                              <Badge variant='outline' className='border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-950/30 gap-1 text-xs'>
                                <IconAlertCircle className='size-3.5' />
                                {countdown.label}
                              </Badge>
                            ) : countdown.variant === 'pending' ? (
                              <Badge variant='outline' className='border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950/30 gap-1 text-xs'>
                                <IconCalendarTime className='size-3.5' />
                                {countdown.label}
                              </Badge>
                            ) : (
                              <span className='text-xs text-muted-foreground'>{countdown.label}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {s.receipt_ref || s.transaction_id || s.order_id ? (
                              <code className='text-xs bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-[140px] block'>
                                {s.receipt_ref || s.transaction_id || s.order_id}
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
                            ) : s.status === 'paused' ? (
                              <Badge variant='outline' className='border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30 font-semibold'>
                                موقوف مؤقتاً
                              </Badge>
                            ) : s.status === 'cancelled' ? (
                              <Badge variant='outline' className='border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-950/30'>
                                ملغي
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
                              <Badge variant='outline' className='text-muted-foreground'>منتهي</Badge>
                            )}
                          </TableCell>
                          <TableCell className='text-end'>
                            <div className='flex items-center justify-end gap-1'>
                              <Button
                                variant='ghost'
                                size='sm'
                                className='h-8 px-2 text-xs gap-1'
                                onClick={() => setPreviewSub(s)}
                              >
                                <IconEye className='size-3.5' />
                                التفاصيل
                              </Button>

                              <DropdownMenu>
                                <DropdownMenuTrigger render={<Button variant='ghost' size='sm' className='h-8 w-8 p-0' />}>
                                  <IconDotsVertical className='size-4' />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align='end' className='w-48'>
                                  <DropdownMenuLabel>إجراءات الاشتراك</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => openEditModal(s)} className='gap-2 cursor-pointer'>
                                    <IconEdit className='size-4 text-primary' />
                                    تعديل الباقة والمدة
                                  </DropdownMenuItem>

                                  {s.status === 'active' && (
                                    <DropdownMenuItem onClick={() => triggerPause(s)} className='gap-2 cursor-pointer text-amber-600'>
                                      <IconPlayerPause className='size-4' />
                                      إيقاف مؤقت للاشتراك
                                    </DropdownMenuItem>
                                  )}

                                  {s.status === 'paused' && (
                                    <DropdownMenuItem onClick={() => triggerResume(s)} className='gap-2 cursor-pointer text-emerald-600'>
                                      <IconPlayerPlay className='size-4' />
                                      استئناف تفعيل الاشتراك
                                    </DropdownMenuItem>
                                  )}

                                  <DropdownMenuItem onClick={() => triggerExtend(s)} className='gap-2 cursor-pointer text-blue-600'>
                                    <IconCalendarPlus className='size-4' />
                                    تمديد 30 يوماً
                                  </DropdownMenuItem>

                                  {s.status !== 'cancelled' && s.status !== 'superseded' && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => triggerCancel(s)} className='gap-2 cursor-pointer text-rose-600'>
                                        <IconBan className='size-4' />
                                        إلغاء الاشتراك نهائياً
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog: Add / Grant Subscription Directly */}
      <Dialog open={addSubOpen} onOpenChange={setAddSubOpen}>
        <DialogContent className='sm:max-w-[560px] max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-primary'>
              <IconUserPlus className='size-5' />
              إضافة ومنح اشتراك مباشر لمستخدم
            </DialogTitle>
            <DialogDescription>
              تفعيل باقة لصيدلي مسجل أو إدخال بريد إلكتروني، وتحديد مدة الاشتراك وطريقة الدفع فورياً.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubscription} className='space-y-4 py-2'>
            {/* User Selection */}
            <div className='space-y-1.5'>
              <Label>اختيار المستخدم المسجل</Label>
              <select
                value={newSubUserId}
                onChange={(e) => handleUserSelect(e.target.value)}
                className='w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
              >
                <option value='manual'>-- كتابة البريد الإلكتروني يدوياً --</option>
                {usersList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || 'مستخدم'} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label htmlFor='sub-email'>البريد الإلكتروني <span className='text-rose-500'>*</span></Label>
                <Input
                  id='sub-email'
                  type='email'
                  placeholder='doctor@example.com'
                  value={newSubEmail}
                  onChange={(e) => setNewSubEmail(e.target.value)}
                  required
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='sub-name'>اسم الصيدلي</Label>
                <Input
                  id='sub-name'
                  placeholder='د. أحمد'
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                />
              </div>
            </div>

            {/* Plan Tier Selection */}
            <div className='space-y-1.5'>
              <Label>نوع الباقة (عدد الصيدليات المسموح بها)</Label>
              <div className='grid grid-cols-5 gap-2'>
                {Object.entries(PLAN_PRICES).map(([plan, price]) => {
                  const isSelected = newSubPlan === plan;
                  return (
                    <button
                      key={plan}
                      type='button'
                      onClick={() => handlePlanChange(plan)}
                      className={`p-2 rounded-lg border text-center transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm'
                          : 'border-border hover:border-primary/50 text-muted-foreground'
                      }`}
                    >
                      <div className='text-xs'>{plan}</div>
                      <div className='text-[11px] font-mono mt-0.5'>{price} ج.م</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration & Payment Method */}
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <Label>مدة الاشتراك</Label>
                <select
                  value={newSubDuration}
                  onChange={(e) => setNewSubDuration(Number(e.target.value))}
                  className='w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
                >
                  <option value={30}>30 يوماً (شهر كامل)</option>
                  <option value={60}>60 يوماً (شهران)</option>
                  <option value={90}>90 يوماً (3 شهور)</option>
                  <option value={180}>180 يوماً (6 شهور)</option>
                  <option value={365}>365 يوماً (سنة كاملة)</option>
                </select>
              </div>

              <div className='space-y-1'>
                <Label>طريقة السداد / نوع العملية</Label>
                <select
                  value={newSubPaymentMethod}
                  onChange={(e) => handlePaymentMethodChange(e.target.value as any)}
                  className='w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
                >
                  <option value='admin_grant'>منحة مجانية بقرار الإدارة 🎁</option>
                  <option value='kashier'>كاشير (دفع إلكتروني أونلاين)</option>
                  <option value='instapay'>إنستاباي (تحويل)</option>
                  <option value='cash'>سداد نقدي مباشر</option>
                  <option value='bank_transfer'>تحويل بنكي</option>
                </select>
              </div>
            </div>

            {/* Amount */}
            <div className='space-y-1'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='sub-amt'>المبلغ المحصل (ج.م)</Label>
                {newSubPaymentMethod === 'admin_grant' && (
                  <span className='text-xs text-purple-600 font-semibold'>منحة مجانية (المبلغ 0 ج.م)</span>
                )}
              </div>
              <Input
                id='sub-amt'
                type='number'
                min={0}
                value={newSubAmount}
                onChange={(e) => setNewSubAmount(Number(e.target.value))}
              />
            </div>

            {/* Notes */}
            <div className='space-y-1'>
              <Label htmlFor='sub-notes'>ملاحظات الإدارة</Label>
              <Textarea
                id='sub-notes'
                placeholder='مثال: تم منح الاشتراك الترويجي للصيدلية مع بداية الافتتاح'
                value={newSubNotes}
                onChange={(e) => setNewSubNotes(e.target.value)}
                rows={2}
              />
            </div>

            <DialogFooter className='pt-2'>
              <Button type='button' variant='outline' onClick={() => setAddSubOpen(false)} disabled={actionLoading}>
                إلغاء
              </Button>
              <Button type='submit' className='bg-emerald-600 hover:bg-emerald-700 text-white' disabled={actionLoading}>
                {actionLoading ? 'جاري الحفظ والتفعيل...' : 'تفعيل ومنح الاشتراك الآن'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit Subscription Plan & Duration */}
      <Dialog open={!!editSub} onOpenChange={(open) => !open && setEditSub(null)}>
        <DialogContent className='sm:max-w-[520px]'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-primary'>
              <IconEdit className='size-5' />
              تعديل باقة وصلاحية الاشتراك
            </DialogTitle>
            <DialogDescription>
              تعديل عدد الصيدليات المسموح بها للمشترك وتحديد مدة التجديد.
            </DialogDescription>
          </DialogHeader>

          {editSub && (
            <form onSubmit={handleSaveEdit} className='space-y-4 py-2'>
              {/* User Summary Box */}
              <div className='bg-muted/50 p-3 rounded-lg flex items-center justify-between text-xs'>
                <div>
                  <div className='font-bold text-sm'>{editSub.user_name || editSub.pharmacy_name || 'مشترك'}</div>
                  <div className='text-muted-foreground font-mono'>{editSub.user_email || '-'}</div>
                </div>
                <div className='text-end'>
                  <Badge variant='secondary' className='mb-1'>{editSub.plan_type}</Badge>
                  <div className='text-emerald-600 font-semibold'>{getCountdownInfo(editSub).label}</div>
                </div>
              </div>

              {/* Plan Selection */}
              <div className='space-y-1.5'>
                <Label>تغيير الباقة إلى:</Label>
                <div className='grid grid-cols-5 gap-2'>
                  {Object.entries(PLAN_PRICES).map(([plan, price]) => {
                    const isSelected = editPlan === plan;
                    return (
                      <button
                        key={plan}
                        type='button'
                        onClick={() => {
                          setEditPlan(plan);
                          setEditAmount(price);
                        }}
                        className={`p-2 rounded-lg border text-center transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm'
                            : 'border-border hover:border-primary/50 text-muted-foreground'
                        }`}
                      >
                        <div className='text-xs'>{plan}</div>
                        <div className='text-[10px] font-mono mt-0.5'>{price} ج.م</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration Options */}
              <div className='space-y-1.5'>
                <Label>مدة الصلاحية والتجديد</Label>
                <div className='space-y-2'>
                  <label className='flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50 text-xs'>
                    <input
                      type='radio'
                      name='durationOption'
                      checked={editDurationOption === 'keep'}
                      onChange={() => setEditDurationOption('keep')}
                      className='text-primary'
                    />
                    <span>الاحتفاظ بالأيام المتبقية الحالية (تغيير الباقة فقط دون تجديد)</span>
                  </label>
                  <label className='flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50 text-xs'>
                    <input
                      type='radio'
                      name='durationOption'
                      checked={editDurationOption === 'renew30'}
                      onChange={() => setEditDurationOption('renew30')}
                      className='text-primary'
                    />
                    <span>تجديد دورة كاملة جديدة (30 يوماً تبدأ من اليوم)</span>
                  </label>
                  <label className='flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50 text-xs'>
                    <input
                      type='radio'
                      name='durationOption'
                      checked={editDurationOption === 'add30'}
                      onChange={() => setEditDurationOption('add30')}
                      className='text-primary'
                    />
                    <span>إضافة 30 يوماً إضافية فوق الرصيد الحالي</span>
                  </label>
                </div>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <Label htmlFor='edit-amt'>المبلغ (ج.م)</Label>
                  <Input
                    id='edit-amt'
                    type='number'
                    min={0}
                    value={editAmount}
                    onChange={(e) => setEditAmount(Number(e.target.value))}
                  />
                </div>
                <div className='space-y-1'>
                  <Label htmlFor='edit-notes'>ملاحظات المشرف</Label>
                  <Input
                    id='edit-notes'
                    placeholder='سبب التعديل...'
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setEditSub(null)} disabled={actionLoading}>
                  إلغاء
                </Button>
                <Button type='submit' disabled={actionLoading}>
                  {actionLoading ? 'جاري الحفظ...' : 'حفظ التعديلات والتطبيق الفوري'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Action Confirmation (Pause / Resume / Cancel / Extend) */}
      <Dialog open={!!confirmModal} onOpenChange={(open) => !open && setConfirmModal(null)}>
        <DialogContent className='sm:max-w-[440px]'>
          <DialogHeader>
            <DialogTitle className={confirmModal?.variant === 'destructive' ? 'text-rose-600' : confirmModal?.variant === 'warning' ? 'text-amber-600' : 'text-primary'}>
              {confirmModal?.title}
            </DialogTitle>
            <DialogDescription className='pt-2 leading-relaxed'>
              {confirmModal?.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='pt-3 gap-2'>
            <Button variant='outline' onClick={() => setConfirmModal(null)} disabled={actionLoading}>
              إلغاء
            </Button>
            <Button
              variant={confirmModal?.variant === 'destructive' ? 'destructive' : confirmModal?.variant === 'warning' ? 'default' : 'default'}
              className={confirmModal?.variant === 'warning' ? 'bg-amber-600 hover:bg-amber-700 text-white' : confirmModal?.variant === 'default' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
              onClick={executeConfirmedAction}
              disabled={actionLoading}
            >
              {actionLoading ? 'جاري التنفيذ...' : confirmModal?.confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Receipt Preview */}
      <Dialog open={!!previewSub} onOpenChange={(open) => !open && setPreviewSub(null)}>
        <DialogContent className='sm:max-w-[560px]'>
          <DialogHeader>
            <DialogTitle>فحص بيانات وتفاصيل الاشتراك</DialogTitle>
            <DialogDescription>
              مراجعة بيانات الدفع الخاصة بـ ({previewSub?.pharmacy_name || previewSub?.user_name || 'الصيدلية'}) - {previewSub?.tenant_name}
            </DialogDescription>
          </DialogHeader>

          {previewSub && (
            <div className='space-y-4 py-3'>
              {/* Countdown & Dates Panel */}
              <div className='bg-primary/5 border border-primary/20 p-3 rounded-lg flex flex-col gap-2'>
                <div className='flex items-center justify-between text-sm'>
                  <span className='text-muted-foreground flex items-center gap-1.5'>
                    <IconClock className='size-4 text-primary' />
                    عداد مدة الاشتراك:
                  </span>
                  <span className='font-bold text-primary'>
                    {getCountdownInfo(previewSub).label}
                  </span>
                </div>
                <div className='grid grid-cols-2 gap-2 text-xs pt-2 border-t border-primary/10'>
                  <div>
                    <span className='text-muted-foreground block'>تاريخ بداية الاشتراك:</span>
                    <span className='font-semibold'>
                      {previewSub.start_date ? new Date(previewSub.start_date).toLocaleDateString('ar-EG') : 'تاريخ الاعتماد'}
                    </span>
                  </div>
                  <div>
                    <span className='text-muted-foreground block'>تاريخ نهاية الاشتراك (شهر):</span>
                    <span className='font-semibold'>
                      {previewSub.end_date ? new Date(previewSub.end_date).toLocaleDateString('ar-EG') : 'بعد 30 يوماً'}
                    </span>
                  </div>
                </div>
              </div>

              <div className='grid grid-cols-2 gap-2 text-sm bg-muted/50 p-3 rounded-md'>
                <div>
                  <span className='text-xs text-muted-foreground block'>رقم المعاملة (Ref ID):</span>
                  <span className='font-mono font-semibold'>{previewSub.receipt_ref || previewSub.transaction_id || previewSub.order_id || 'غير مسجل'}</span>
                </div>
                <div>
                  <span className='text-xs text-muted-foreground block'>نوع الباقة:</span>
                  <span className='font-semibold'>{previewSub.plan_type}</span>
                </div>
                <div>
                  <span className='text-xs text-muted-foreground block'>البريد الإلكتروني:</span>
                  <span className='font-mono text-xs'>{previewSub.user_email || '-'}</span>
                </div>
                <div>
                  <span className='text-xs text-muted-foreground block'>المبلغ المسدد:</span>
                  <span className='font-bold text-emerald-600'>{previewSub.amount ? `${previewSub.amount} ج.م` : '-'}</span>
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
