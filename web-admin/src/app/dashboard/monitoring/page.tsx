'use client';

import React, { useState, useEffect } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  IconActivity,
  IconRefresh,
  IconServer,
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconBug,
  IconWifi,
  IconWifiOff,
} from '@tabler/icons-react';
import { toast } from 'sonner';

interface AgentMonitoringData {
  id: string;
  name: string;
  slug: string;
  schema_name: string;
  tenant_status: string;
  last_heartbeat_at: string | null;
  sync_status: string;
  last_sync_at: string | null;
  last_invoice_cursor: string | null;
  last_return_cursor: string | null;
  last_receipt_cursor: string | null;
  last_ledger_cursor: string | null;
  last_error: string | null;
  agent_health: 'online' | 'offline_alert' | 'idle' | 'never';
  total_pharmacies: number;
}

interface MonitoringKPIs {
  totalTenants: number;
  onlineAgents: number;
  offlineAlerts: number;
  errorSyncs: number;
}

export default function MonitoringPage() {
  const [agents, setAgents] = useState<AgentMonitoringData[]>([]);
  const [kpis, setKpis] = useState<MonitoringKPIs>({
    totalTenants: 0,
    onlineAgents: 0,
    offlineAlerts: 0,
    errorSyncs: 0,
  });
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedError, setSelectedError] = useState<{ name: string; error: string } | null>(null);

  const fetchMonitoring = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/monitoring');
      const data = await res.json();
      if (data.success) {
        setAgents(data.agents || []);
        setKpis(data.kpis || { totalTenants: 0, onlineAgents: 0, offlineAlerts: 0, errorSyncs: 0 });
      } else {
        toast.error('فشل جلب بيانات المراقبة');
      }
    } catch {
      toast.error('خطأ في الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitoring();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMonitoring();
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'لم يتصل بعد';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return `منذ ${diffSecs} ثانية`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    const diffDays = Math.floor(diffHours / 24);
    return `منذ ${diffDays} يوم`;
  };

  return (
    <PageContainer>
      <div className='flex flex-col gap-6'>
        {/* Header */}
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>مراقبة صحة الوكلاء والمزامنة (Agent & Sync Health)</h1>
            <p className='text-sm text-muted-foreground'>
              متابعة نبضات الاتصال (Heartbeats)، زمن التأخير (Sync Lag)، ومؤشرات الحركات المتزايدة من Firebird.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant={autoRefresh ? 'default' : 'outline'}
              size='sm'
              onClick={() => setAutoRefresh(!autoRefresh)}
              className='text-xs'
            >
              {autoRefresh ? 'التحديث التلقائي مفعّل (15s)' : 'تفعيل التحديث التلقائي'}
            </Button>
            <Button variant='outline' size='sm' onClick={fetchMonitoring} disabled={loading}>
              <IconRefresh className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </Button>
          </div>
        </div>

        {/* KPI Row */}
        <div className='grid gap-4 md:grid-cols-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>إجمالي الوكلاء المسجلين</CardTitle>
              <IconServer className='size-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{kpis.totalTenants}</div>
              <p className='text-xs text-muted-foreground'>وكيل مخزن مثبت</p>
            </CardContent>
          </Card>
          <Card className='border-emerald-500/30 bg-emerald-500/5'>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>متصلون الآن (Online)</CardTitle>
              <IconWifi className='size-4 text-emerald-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-emerald-600'>{kpis.onlineAgents}</div>
              <p className='text-xs text-muted-foreground'>آخر نبضة منذ أقل من 5 دقائق</p>
            </CardContent>
          </Card>
          <Card className={kpis.offlineAlerts > 0 ? 'border-rose-500/50 bg-rose-500/5' : ''}>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>تحذيرات انقطاع (&gt;24h)</CardTitle>
              <IconWifiOff className='size-4 text-rose-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-rose-600'>{kpis.offlineAlerts}</div>
              <p className='text-xs text-muted-foreground'>بحاجة لفحص خادم المخزن</p>
            </CardContent>
          </Card>
          <Card className={kpis.errorSyncs > 0 ? 'border-amber-500/50 bg-amber-500/5' : ''}>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>أخطاء المزامنة</CardTitle>
              <IconAlertTriangle className='size-4 text-amber-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-amber-600'>{kpis.errorSyncs}</div>
              <p className='text-xs text-muted-foreground'>حالات توقف أو تأخر</p>
            </CardContent>
          </Card>
        </div>

        {/* Live Agents Table */}
        <Card>
          <CardHeader>
            <CardTitle>سجل المراقبة الحية لوكلاء الويندوز (Live Agents Tracker)</CardTitle>
            <CardDescription>
              تتبع المؤشرات الأخيرة (Cursors) للتحقق من وصول آخر فواتير، مرتجعات، وسندات قبض من قاعدة بيانات ORGA.GDB.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المخزن</TableHead>
                    <TableHead>نبض الاتصال (Heartbeat)</TableHead>
                    <TableHead>حالة المزامنة</TableHead>
                    <TableHead>مؤشر الفواتير (Invoice Cursor)</TableHead>
                    <TableHead>مؤشر المرتجعات (Return Cursor)</TableHead>
                    <TableHead>مؤشر المقبوضات (Receipt Cursor)</TableHead>
                    <TableHead>آخر مزامنة ناجحة</TableHead>
                    <TableHead className='text-end'>السجلات والأخطاء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && agents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className='text-center py-8 text-muted-foreground'>
                        جاري فحص مؤشرات الوكلاء...
                      </TableCell>
                    </TableRow>
                  ) : agents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className='text-center py-8 text-muted-foreground'>
                        لا توجد مخازن مسجلة حالياً.
                      </TableCell>
                    </TableRow>
                  ) : (
                    agents.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className='font-semibold'>{a.name}</div>
                          <div className='text-xs text-muted-foreground'>{a.schema_name}</div>
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center gap-1.5'>
                            {a.agent_health === 'online' ? (
                              <div className='size-2 rounded-full bg-emerald-500 animate-ping' />
                            ) : a.agent_health === 'offline_alert' ? (
                              <div className='size-2 rounded-full bg-rose-500' />
                            ) : (
                              <div className='size-2 rounded-full bg-amber-500' />
                            )}
                            <span className='text-xs font-medium'>
                              {formatTimeAgo(a.last_heartbeat_at)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {a.sync_status === 'in_progress' ? (
                            <Badge variant='outline' className='border-sky-500 text-sky-600 bg-sky-50 dark:bg-sky-950/30 animate-pulse'>
                              جاري المزامنة...
                            </Badge>
                          ) : a.sync_status === 'error' ? (
                            <Badge variant='outline' className='border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-950/30'>
                              خطأ مزامنة
                            </Badge>
                          ) : (
                            <Badge variant='outline' className='border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'>
                              منتظم (Idle)
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <code className='text-xs bg-muted px-1 py-0.5 rounded font-mono'>
                            {a.last_invoice_cursor || '0'}
                          </code>
                        </TableCell>
                        <TableCell>
                          <code className='text-xs bg-muted px-1 py-0.5 rounded font-mono'>
                            {a.last_return_cursor || '0'}
                          </code>
                        </TableCell>
                        <TableCell>
                          <code className='text-xs bg-muted px-1 py-0.5 rounded font-mono'>
                            {a.last_receipt_cursor || '0'}
                          </code>
                        </TableCell>
                        <TableCell>
                          <span className='text-xs text-muted-foreground'>
                            {formatTimeAgo(a.last_sync_at)}
                          </span>
                        </TableCell>
                        <TableCell className='text-end'>
                          {a.last_error ? (
                            <Button
                              variant='outline'
                              size='sm'
                              className='h-7 text-xs border-rose-500/50 text-rose-600 gap-1'
                              onClick={() => setSelectedError({ name: a.name, error: a.last_error! })}
                            >
                              <IconBug className='size-3.5' />
                              عرض الخطأ
                            </Button>
                          ) : (
                            <span className='text-xs text-emerald-600 flex items-center justify-end gap-1'>
                              <IconCheck className='size-3.5' /> سليم
                            </span>
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

      {/* Dialog: Error Log Viewer */}
      <Dialog open={!!selectedError} onOpenChange={(open) => !open && setSelectedError(null)}>
        <DialogContent className='sm:max-w-[580px]'>
          <DialogHeader>
            <DialogTitle className='text-rose-600 flex items-center gap-2'>
              <IconBug className='size-5' />
              سجل خطأ الوكيل - {selectedError?.name}
            </DialogTitle>
            <DialogDescription>
              آخر رسالة خطأ مسجلة تم استقبالها من وكيل الويندوز المحلي أثناء محاولة استخراج أو ضغط البيانات.
            </DialogDescription>
          </DialogHeader>

          <div className='py-3'>
            <pre className='text-xs font-mono p-3 bg-muted rounded-md overflow-x-auto whitespace-pre-wrap border border-rose-500/30 text-rose-800 dark:text-rose-300'>
              {selectedError?.error}
            </pre>
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={() => setSelectedError(null)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
