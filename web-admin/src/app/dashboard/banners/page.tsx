'use client';

import React, { useState, useEffect, useRef } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  IconRefresh,
  IconPhoto,
  IconUpload,
  IconEdit,
  IconTrash,
  IconCheck,
  IconExternalLink,
  IconBuildingStore,
  IconEye,
  IconSparkles,
  IconDeviceMobile,
} from '@tabler/icons-react';
import { toast } from 'sonner';

interface Banner {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  badge_text: string;
  action_type: 'none' | 'url' | 'warehouse' | 'category';
  action_value: string;
  bg_color: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [badgeText, setBadgeText] = useState('إعلان');
  const [actionType, setActionType] = useState<'none' | 'url' | 'warehouse' | 'category'>('none');
  const [actionValue, setActionValue] = useState('');
  const [bgColor, setBgColor] = useState('#3F0082');
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState('0');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Delete Confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBanners = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/banners');
      const data = await res.json();
      if (data.success) {
        setBanners(data.banners || []);
      } else {
        toast.error('فشل جلب الإعلانات: ' + (data.error || ''));
      }
    } catch (err: any) {
      toast.error('تعذر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  const openCreateDialog = () => {
    setEditingBanner(null);
    setTitle('');
    setSubtitle('');
    setImageUrl('');
    setBadgeText('عرض خاص');
    setActionType('none');
    setActionValue('');
    setBgColor('#3F0082');
    setIsActive(true);
    setSortOrder('0');
    setDialogOpen(true);
  };

  const openEditDialog = (banner: Banner) => {
    setEditingBanner(banner);
    setTitle(banner.title || '');
    setSubtitle(banner.subtitle || '');
    setImageUrl(banner.image_url || '');
    setBadgeText(banner.badge_text || 'إعلان');
    setActionType(banner.action_type || 'none');
    setActionValue(banner.action_value || '');
    setBgColor(banner.bg_color || '#3F0082');
    setIsActive(banner.is_active !== false);
    setSortOrder(String(banner.sort_order || 0));
    setDialogOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success && data.url) {
        setImageUrl(data.url);
        toast.success('تم رفع الصورة بنجاح');
      } else {
        toast.error(data.error || 'فشل رفع الصورة');
      }
    } catch (err) {
      toast.error('خطأ أثناء رفع الصورة');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!imageUrl.trim()) {
      toast.error('يرجى اختيار أو رفع صورة للإعلان');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        title: title.trim(),
        subtitle: subtitle.trim(),
        image_url: imageUrl.trim(),
        badge_text: badgeText.trim() || 'إعلان',
        action_type: actionType,
        action_value: actionValue.trim(),
        bg_color: bgColor,
        is_active: isActive,
        sort_order: parseInt(sortOrder, 10) || 0,
      };

      const url = editingBanner ? `/api/banners/${editingBanner.id}` : '/api/banners';
      const method = editingBanner ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(editingBanner ? 'تم تحديث الإعلان بنجاح' : 'تمت إضافة الإعلان بنجاح');
        setDialogOpen(false);
        fetchBanners();
      } else {
        toast.error(data.error || 'فشلت العملية');
      }
    } catch (err) {
      toast.error('حدث خطأ أثناء حفظ الإعلان');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (banner: Banner) => {
    try {
      const newStatus = !banner.is_active;
      const res = await fetch(`/api/banners/${banner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...banner, is_active: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(newStatus ? 'تم تفعيل الإعلان' : 'تم إيقاف الإعلان');
        setBanners((prev) =>
          prev.map((b) => (b.id === banner.id ? { ...b, is_active: newStatus } : b))
        );
      }
    } catch (err) {
      toast.error('فشل تغيير الحالة');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/banners/${deleteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('تم حذف الإعلان بنجاح');
        setBanners((prev) => prev.filter((b) => b.id !== deleteId));
        setDeleteId(null);
      } else {
        toast.error(data.error || 'فشل حذف الإعلان');
      }
    } catch (err) {
      toast.error('حدث خطأ أثناء الحذف');
    } finally {
      setDeleting(false);
    }
  };

  const activeCount = banners.filter((b) => b.is_active).length;

  return (
    <PageContainer>
      <div className="space-y-6" dir="rtl">
        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-primary flex items-center gap-2.5">
              <IconSparkles className="size-7 text-secondary" />
              إدارة الإعلانات والبانرات الترويجية
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              التحكم في البانرات والكروت الإعلانية المعروضة في هيدر تطبيق الهاتف بنمط موحد وجذاب
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchBanners} disabled={loading}>
              <IconRefresh className={`size-4 ml-1.5 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </Button>
            <Button onClick={openCreateDialog} className="bg-primary hover:bg-primary/90 text-white shadow-md">
              <IconPlus className="size-4 ml-1.5" />
              إضافة إعلان جديد
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-border/60 bg-gradient-to-br from-primary/5 via-card to-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold">إجمالي البانرات</CardDescription>
              <CardTitle className="text-2xl font-black text-primary">{banners.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-border/60 bg-gradient-to-br from-emerald-500/10 via-card to-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold text-emerald-700">البانرات النشطة في التطبيق</CardDescription>
              <CardTitle className="text-2xl font-black text-emerald-600">{activeCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-border/60 bg-gradient-to-br from-amber-500/10 via-card to-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold text-amber-700">بانرات متوقفة</CardDescription>
              <CardTitle className="text-2xl font-black text-amber-600">{banners.length - activeCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Banners Table */}
        <Card className="shadow-xs border-border/60">
          <CardHeader>
            <CardTitle className="text-lg font-bold">قائمة الإعلانات والبانرات</CardTitle>
            <CardDescription>
              يتم عرض الإعلانات النشطة في أعلى الشاشة الرئيسية لتطبيق الصيدليات بحجم موحد مع دعم التمرير التلقائي.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
                <IconRefresh className="size-6 animate-spin text-primary" />
                <span>جاري تحميل الإعلانات...</span>
              </div>
            ) : banners.length === 0 ? (
              <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
                <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <IconPhoto className="size-7" />
                </div>
                <h3 className="font-bold text-base">لا توجد إعلانات حالياً</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  أضف أول إعلان أو بانر ترويجي لمخزنك أو عروضك الخاصة لتظهر في أعلى واجهة التطبيق.
                </p>
                <Button onClick={openCreateDialog} className="mt-2">
                  <IconPlus className="size-4 ml-1.5" />
                  إضافة إعلان الآن
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20 text-right">المعاينة</TableHead>
                      <TableHead className="text-right">العنوان والوصف</TableHead>
                      <TableHead className="text-right">الشارة (Badge)</TableHead>
                      <TableHead className="text-right">الإجراء عند الضغط</TableHead>
                      <TableHead className="text-center">الترتيب</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="w-28 text-center">خيارات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {banners.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="size-14 rounded-xl overflow-hidden bg-slate-100 border relative shrink-0">
                            {b.image_url ? (
                              <img
                                src={b.image_url}
                                alt={b.title || 'Banner'}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <IconPhoto className="size-6" />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-sm text-slate-900">{b.title || '(بدون عنوان)'}</div>
                          {b.subtitle && (
                            <div className="text-xs text-muted-foreground line-clamp-1 max-w-xs">{b.subtitle}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-bold text-xs">
                            {b.badge_text || 'إعلان'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            {b.action_type === 'none' && <span className="text-slate-400">بدون رابط</span>}
                            {b.action_type === 'url' && (
                              <a
                                href={b.action_value}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline flex items-center gap-1"
                              >
                                <IconExternalLink className="size-3.5" />
                                <span className="line-clamp-1 max-w-[160px]">{b.action_value}</span>
                              </a>
                            )}
                            {b.action_type === 'warehouse' && (
                              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                <IconBuildingStore className="size-3.5" />
                                مخزن: {b.action_value}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">{b.sort_order}</TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={b.is_active}
                            onCheckedChange={() => handleToggleActive(b)}
                            aria-label="تفعيل الإعلان"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-primary hover:bg-primary/10"
                              onClick={() => openEditDialog(b)}
                              title="تعديل"
                            >
                              <IconEdit className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => setDeleteId(b.id)}
                              title="حذف"
                            >
                              <IconTrash className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create / Edit Dialog with Real-Time Mobile Preview */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-primary">
                {editingBanner ? 'تعديل الإعلان والبانر' : 'إضافة إعلان ترويجي جديد'}
              </DialogTitle>
              <DialogDescription>
                قم بضبط تفاصيل الإعلان وسيظهر مباشرة بالحجم الموحد في تطبيق الموبايل.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveBanner} className="space-y-4 pt-2">
              {/* Image Upload / URL */}
              <div className="space-y-2">
                <Label className="text-xs font-bold">صورة الإعلان (مطلوبة)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://example.com/banner.jpg أو ارفع صورة مباشرة..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="text-xs"
                    required
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="shrink-0 text-xs gap-1.5"
                  >
                    <IconUpload className={`size-4 ${uploadingImage ? 'animate-spin' : ''}`} />
                    {uploadingImage ? 'جاري الرفع...' : 'رفع صورة'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  موصى بنسبة أبعاد 16:9 أو 2:1 (مثل 1080x600 بكسل). سيقوم التطبيق بضبط الحجم والمحاذاة تلقائياً دون تشويه.
                </p>
              </div>

              {/* Title & Badge */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs font-bold">عنوان الإعلان الرئيسي (اختياري)</Label>
                  <Input
                    placeholder="مثال: عروض وتخفيضات الأدوية المستوردة"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">نص الشارة (Badge)</Label>
                  <Input
                    placeholder="مثال: عرض خاص / إعلان / جديد"
                    value={badgeText}
                    onChange={(e) => setBadgeText(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Subtitle / Description */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">الوصف الترويجي القصير (اختياري)</Label>
                <Input
                  placeholder="مثال: احصل على بونص إضافي يصل إلى 20% عند الطلب اليوم"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="text-xs"
                />
              </div>

              {/* Action Type & Value */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">نوع الإجراء عند الضغط</Label>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value as any)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="none">بدون رابط (عرض فقط)</option>
                    <option value="url">فتح رابط خارجي (موقع / واتساب)</option>
                    <option value="warehouse">فتح مخزن محدد مباشرة (معرف المخزن / Slug)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">قيمة الرابط أو الهدف</Label>
                  <Input
                    placeholder={
                      actionType === 'url'
                        ? 'https://example.com أو https://wa.me/...'
                        : actionType === 'warehouse'
                        ? 'معرف المخزن (مثال: baraka)'
                        : 'غير مفعل'
                    }
                    value={actionValue}
                    onChange={(e) => setActionValue(e.target.value)}
                    disabled={actionType === 'none'}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Sort Order & Active */}
              <div className="grid grid-cols-2 gap-3 items-center pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">ترتيب الظهور (الأقل يظهر أولاً)</Label>
                  <Input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="text-xs w-28"
                  />
                </div>
                <div className="flex items-center gap-3 justify-end pt-5">
                  <Label htmlFor="active-toggle" className="text-xs font-bold cursor-pointer">
                    تفعيل الإعلان فوراً
                  </Label>
                  <Switch
                    id="active-toggle"
                    checked={isActive}
                    onCheckedChange={setIsActive}
                  />
                </div>
              </div>

              {/* Real-time Mobile Preview Card */}
              <div className="pt-3 border-t">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                  <IconDeviceMobile className="size-4 text-primary" />
                  معاينة حية لشكل الكارت الموحد في التطبيق (Mobile Preview):
                </div>

                <div className="w-full max-w-md mx-auto bg-slate-900 rounded-3xl p-3 shadow-xl border border-slate-700/50">
                  <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-gradient-to-br from-primary via-purple-900 to-slate-950 flex flex-col justify-between p-4 shadow-md">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="Preview"
                        className="absolute inset-0 w-full h-full object-cover opacity-85"
                      />
                    ) : null}
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/20 pointer-events-none" />

                    {/* Top Row: Badge */}
                    <div className="relative z-10 flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-white/90 text-primary backdrop-blur-sm shadow-xs">
                        {badgeText || 'إعلان'}
                      </span>
                    </div>

                    {/* Bottom Row: Title & Subtitle */}
                    <div className="relative z-10 space-y-1">
                      <h4 className="text-white font-black text-base leading-tight drop-shadow-md">
                        {title || 'عنوان الإعلان الترويجي'}
                      </h4>
                      <p className="text-white/85 text-xs line-clamp-2 leading-relaxed drop-shadow-sm font-medium">
                        {subtitle || 'شرح وتفاصيل العرض والخصومات تظهر هنا بوضوح وسلاسة.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={submitting} className="bg-primary text-white">
                  {submitting ? 'جاري الحفظ...' : editingBanner ? 'حفظ التعديلات' : 'إضافة الإعلان'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-red-600 font-bold">تأكيد حذف الإعلان</DialogTitle>
              <DialogDescription>
                هل أنت متأكد من حذف هذا الإعلان نهائياً؟ لن يظهر في تطبيق الهاتف بعد الحذف.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 pt-3">
              <Button variant="outline" onClick={() => setDeleteId(null)}>
                إلغاء
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? 'جاري الحذف...' : 'تأكيد الحذف'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  );
}
