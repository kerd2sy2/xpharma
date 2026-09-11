'use client';

import React, { useState, useEffect } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  IconServer,
  IconRefresh,
  IconSearch,
  IconFileText,
  IconReceipt,
  IconBuildingStore,
  IconBox,
  IconFileDescription,
  IconCheck,
  IconCopy,
  IconCircleCheck,
  IconClock,
  IconAlertCircle,
  IconDownload,
  IconChevronRight,
  IconChevronLeft,
  IconArrowUpRight,
  IconDatabase,
  IconRotate,
} from '@tabler/icons-react';
import { toast } from 'sonner';

interface DatabaseReplica {
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
  last_receipt_cursor: string | null;
  last_ledger_cursor: string | null;
  last_error: string | null;
  agent_health: 'online' | 'offline_alert' | 'idle' | 'never';
  metrics: {
    receipts_count: number;
    total_receipts_amount: number;
    latest_receipt_date: string | null;
    invoices_count: number;
    total_invoices_amount: number;
    latest_invoice_date: string | null;
    pharmacies_count: number;
    products_count: number;
    ledger_count: number;
    returns_count: number;
    total_replicated_records: number;
  };
}

interface FinancialSummary {
  total_invoices_amount: number;
  total_invoices_count: number;
  total_returns_amount: number;
  total_returns_count: number;
  total_receipts_amount: number;
  total_receipts_count: number;
  net_balance: number;
  balance_type: 'debit' | 'credit';
  matched_pharmacy?: {
    code: string;
    name: string;
    phone?: string;
    address?: string;
  } | null;
}

export default function DatabasesPage() {
  const [databases, setDatabases] = useState<DatabaseReplica[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDb, setSelectedDb] = useState<DatabaseReplica | null>(null);

  // Table exploration state
  const [activeTable, setActiveTable] = useState<string>('cash_receipts');
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableTotal, setTableTotal] = useState<number>(0);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchDatabases = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/databases');
      const data = await res.json();
      if (data.success) {
        setDatabases(data.databases || []);
        if (data.databases?.length > 0) {
          if (!selectedDb) {
            setSelectedDb(data.databases[0]);
          } else {
            const updated = data.databases.find((d: DatabaseReplica) => d.id === selectedDb.id);
            if (updated) setSelectedDb(updated);
          }
        }
      } else {
        toast.error('فشل جلب بيانات النسخ: ' + (data.error || ''));
      }
    } catch (err: any) {
      toast.error('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  const fetchTableData = async (tenantId: string, table: string, search: string, pageNum: number) => {
    try {
      setTableLoading(true);
      const offset = (pageNum - 1) * limit;
      const url = `/api/databases/${tenantId}/tables?table=${table}&search=${encodeURIComponent(
        search
      )}&limit=${limit}&offset=${offset}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setTableData(data.rows || []);
        setTableTotal(data.totalCount || 0);
        if (data.summary) {
          setFinancialSummary(data.summary);
        }
      } else {
        toast.error('خطأ في جلب بيانات الجدول: ' + (data.error || ''));
      }
    } catch (err: any) {
      toast.error('تعذر جلب سجلات الجدول المنسوخة');
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    fetchDatabases();
  }, []);

  useEffect(() => {
    if (selectedDb) {
      fetchTableData(selectedDb.id, activeTable, searchTerm, page);
    }
  }, [selectedDb, activeTable, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    if (selectedDb) {
      fetchTableData(selectedDb.id, activeTable, searchTerm, 1);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('تم النسخ إلى الحافظة');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportToCSV = () => {
    if (!tableData || tableData.length === 0) {
      toast.error('لا توجد بيانات متاحة للتصدير');
      return;
    }
    const headers = Object.keys(tableData[0]).join(',');
    const rows = tableData
      .map((row) =>
        Object.values(row)
          .map((v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + headers + '\n' + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${selectedDb?.slug}_${activeTable}_replica.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('تم تصدير ملف CSV بنجاح');
  };

  // Aggregated totals
  const totalWarehouses = databases.length;
  const totalReplicatedRecords = databases.reduce(
    (acc, d) => acc + (d.metrics?.total_replicated_records || 0),
    0
  );
  const totalReceiptsCount = databases.reduce((acc, d) => acc + (d.metrics?.receipts_count || 0), 0);
  const totalReceiptsValue = databases.reduce(
    (acc, d) => acc + (d.metrics?.total_receipts_amount || 0),
    0
  );
  const totalInvoicesCount = databases.reduce((acc, d) => acc + (d.metrics?.invoices_count || 0), 0);
  const totalPharmaciesCount = databases.reduce(
    (acc, d) => acc + (d.metrics?.pharmacies_count || 0),
    0
  );

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col space-y-6 pb-12'>
        {/* Page Header */}
        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b pb-5'>
          <div>
            <div className='flex items-center gap-2 mb-1'>
              <Badge variant='outline' className='bg-primary/5 text-primary border-primary/20 gap-1.5 py-0.5 px-2.5'>
                <span className='h-2 w-2 rounded-full bg-emerald-500 animate-pulse' />
                مزامنة حية ولحظية للبيانات
              </Badge>
              <span className='text-xs text-muted-foreground'>Multi-Tenant Isolated Replicas</span>
            </div>
            <h1 className='text-2xl font-bold tracking-tight'>
              قواعد البيانات المتزامنة والنسخ السحابي (Databases Replicas)
            </h1>
            <p className='text-sm text-muted-foreground mt-0.5'>
              استعراض مباشر وموثق للجداول والبيانات المنسوخة لحظياً من قواعد بيانات الفايربيرد المحلية إلى السحابة.
            </p>
          </div>

          <div className='flex items-center gap-2.5'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                fetchDatabases();
                if (selectedDb) fetchTableData(selectedDb.id, activeTable, searchTerm, page);
                toast.success('تم تحديث البيانات المتزامنة بنجاح');
              }}
              disabled={loading}
              className='gap-2'
            >
              <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              تحديث فوري
            </Button>
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5'>
          <Card className='shadow-xs border-emerald-500/20 bg-emerald-500/5'>
            <CardHeader className='pb-2 pt-4 px-4'>
              <CardDescription className='text-xs font-medium text-emerald-700 dark:text-emerald-400'>
                المستودعات المتصلة (Online Replicas)
              </CardDescription>
              <CardTitle className='text-2xl font-bold text-emerald-950 dark:text-emerald-50 mt-1'>
                {totalWarehouses}
              </CardTitle>
            </CardHeader>
            <CardContent className='px-4 pb-4 text-xs text-muted-foreground'>
              حالة اتصال نشطة مع سيرفرات المخازن
            </CardContent>
          </Card>

          <Card className='shadow-xs'>
            <CardHeader className='pb-2 pt-4 px-4'>
              <CardDescription className='text-xs font-medium'>
                سندات القبض المنسوخة (Cash Receipts)
              </CardDescription>
              <CardTitle className='text-2xl font-bold mt-1 text-primary'>
                {totalReceiptsCount.toLocaleString('ar-EG')}
              </CardTitle>
            </CardHeader>
            <CardContent className='px-4 pb-4 text-xs text-muted-foreground flex justify-between items-center'>
              <span>القيمة المحصلة:</span>
              <span className='font-semibold text-foreground'>
                {totalReceiptsValue.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م
              </span>
            </CardContent>
          </Card>

          <Card className='shadow-xs'>
            <CardHeader className='pb-2 pt-4 px-4'>
              <CardDescription className='text-xs font-medium'>
                الفواتير المرفوعة (Synced Invoices)
              </CardDescription>
              <CardTitle className='text-2xl font-bold mt-1'>
                {totalInvoicesCount.toLocaleString('ar-EG')}
              </CardTitle>
            </CardHeader>
            <CardContent className='px-4 pb-4 text-xs text-muted-foreground'>
              فواتير المبيعات الصادرة من الفايربيرد
            </CardContent>
          </Card>

          <Card className='shadow-xs'>
            <CardHeader className='pb-2 pt-4 px-4'>
              <CardDescription className='text-xs font-medium'>
                دليل الصيدليات المعتمد (Pharmacies)
              </CardDescription>
              <CardTitle className='text-2xl font-bold mt-1'>
                {totalPharmaciesCount.toLocaleString('ar-EG')}
              </CardTitle>
            </CardHeader>
            <CardContent className='px-4 pb-4 text-xs text-muted-foreground'>
              صيدليات وعملاء مربوطين في السحابة
            </CardContent>
          </Card>

          <Card className='shadow-xs'>
            <CardHeader className='pb-2 pt-4 px-4'>
              <CardDescription className='text-xs font-medium'>
                إجمالي السجلات المنسوخة (Replicated Records)
              </CardDescription>
              <CardTitle className='text-2xl font-bold mt-1 text-blue-600 dark:text-blue-400'>
                {totalReplicatedRecords.toLocaleString('ar-EG')}
              </CardTitle>
            </CardHeader>
            <CardContent className='px-4 pb-4 text-xs text-muted-foreground'>
              حركات مسجلة داخل مخططات PostgreSQL
            </CardContent>
          </Card>
        </div>

        {/* Database Replicas Cards Section */}
        <div>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='text-base font-semibold flex items-center gap-2'>
              <IconServer className='h-4 w-4 text-primary' />
              قواعد البيانات النشطة والمربوطة بالسحابة
            </h2>
            <span className='text-xs text-muted-foreground'>اختر قاعدة البيانات لاستعراض جداولها المنسوخة</span>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {databases.map((db) => {
              const isSelected = selectedDb?.id === db.id;
              const isOnline = db.agent_health === 'online';

              return (
                <div
                  key={db.id}
                  onClick={() => setSelectedDb(db)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 relative overflow-hidden ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/40'
                      : 'border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/20'
                  }`}
                >
                  <div className='flex items-start justify-between gap-3 mb-2.5'>
                    <div>
                      <div className='flex items-center gap-2'>
                        <h3 className='font-bold text-base text-foreground'>{db.name}</h3>
                        <Badge variant='outline' className='text-[10px] font-mono px-1.5 py-0'>
                          {db.schema_name}
                        </Badge>
                      </div>
                      <p className='text-xs text-muted-foreground mt-0.5'>
                        محرك المصدر: Firebird 2.5 (ORGA.GDB)
                      </p>
                    </div>

                    {isOnline ? (
                      <Badge className='bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1 text-xs py-0.5'>
                        <span className='h-2 w-2 rounded-full bg-emerald-500 animate-pulse' />
                        متصل ومُزامَن
                      </Badge>
                    ) : (
                      <Badge variant='secondary' className='text-xs text-muted-foreground gap-1'>
                        <IconClock className='h-3 w-3' />
                        خامل
                      </Badge>
                    )}
                  </div>

                  {/* Replicated metrics tags */}
                  <div className='grid grid-cols-4 gap-1.5 my-3 py-2 px-2 rounded-lg bg-background/80 border border-border/50 text-center'>
                    <div>
                      <span className='text-[10px] text-muted-foreground block truncate'>الفواتير</span>
                      <span className='font-bold text-xs text-foreground'>
                        {db.metrics?.invoices_count || 0}
                      </span>
                    </div>
                    <div>
                      <span className='text-[10px] text-muted-foreground block truncate'>المرتجعات</span>
                      <span className='font-bold text-xs text-amber-600 dark:text-amber-400'>
                        {db.metrics?.returns_count || 0}
                      </span>
                    </div>
                    <div>
                      <span className='text-[10px] text-muted-foreground block truncate'>سندات القبض</span>
                      <span className='font-bold text-xs text-primary'>
                        {db.metrics?.receipts_count || 0}
                      </span>
                    </div>
                    <div>
                      <span className='text-[10px] text-muted-foreground block truncate'>الصيدليات</span>
                      <span className='font-bold text-xs text-foreground'>
                        {db.metrics?.pharmacies_count || 0}
                      </span>
                    </div>
                  </div>

                  <div className='flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40'>
                    <span className='flex items-center gap-1'>
                      <IconClock className='h-3.5 w-3.5' />
                      آخر مزامنة:{' '}
                      {db.last_sync_at ? new Date(db.last_sync_at).toLocaleTimeString('ar-EG') : 'غير متوفر'}
                    </span>
                    <span className='text-primary font-medium flex items-center gap-0.5'>
                      {isSelected ? 'محدد حالياً' : 'استعراض الجداول'}
                      <IconChevronRight className='h-3.5 w-3.5' />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Replicated Database Explorer & Records Viewer */}
        {selectedDb && (
          <Card className='border shadow-sm'>
            <CardHeader className='border-b bg-muted/20 pb-4'>
              <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
                <div>
                  <div className='flex items-center gap-2'>
                    <IconDatabase className='h-5 w-5 text-primary' />
                    <CardTitle className='text-lg font-bold'>
                      مستكشف سجلات القاعدة: {selectedDb.name} ({selectedDb.schema_name})
                    </CardTitle>
                  </div>
                  <CardDescription className='text-xs mt-1'>
                    عرض الحركات الفعلية المنسوخة من سيرفر المخزن إلى سحابة xpharma مع إمكانية البحث والفلترة الفورية.
                  </CardDescription>
                </div>

                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={exportToCSV}
                    className='gap-1.5 text-xs'
                    disabled={tableLoading || tableData.length === 0}
                  >
                    <IconDownload className='h-4 w-4' />
                    تصدير CSV
                  </Button>
                </div>
              </div>

              {/* Table Selector Tabs */}
              <div className='mt-4'>
                <Tabs
                  value={activeTable}
                  onValueChange={(val) => {
                    setActiveTable(val);
                    setPage(1);
                  }}
                  className='w-full'
                >
                  <TabsList className='grid grid-cols-2 md:grid-cols-5 w-full h-auto p-1 bg-muted/60'>
                    <TabsTrigger value='cash_receipts' className='gap-2 py-2 text-xs'>
                      <IconReceipt className='h-4 w-4' />
                      سندات القبض (النقدية)
                      <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                        {selectedDb.metrics?.receipts_count || 0}
                      </Badge>
                    </TabsTrigger>

                    <TabsTrigger value='invoices' className='gap-2 py-2 text-xs'>
                      <IconFileText className='h-4 w-4' />
                      الفواتير (المشتريات)
                      <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                        {selectedDb.metrics?.invoices_count || 0}
                      </Badge>
                    </TabsTrigger>

                    <TabsTrigger value='returns' className='gap-2 py-2 text-xs'>
                      <IconRotate className='h-4 w-4' />
                      مرتجع المبيعات
                      <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                        {selectedDb.metrics?.returns_count || 0}
                      </Badge>
                    </TabsTrigger>

                    <TabsTrigger value='ledger' className='gap-2 py-2 text-xs'>
                      <IconFileDescription className='h-4 w-4' />
                      كشف الحساب
                      <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                        {selectedDb.metrics?.ledger_count || 0}
                      </Badge>
                    </TabsTrigger>

                    <TabsTrigger value='pharmacies' className='gap-2 py-2 text-xs'>
                      <IconBuildingStore className='h-4 w-4' />
                      دليل الصيدليات
                      <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                        {selectedDb.metrics?.pharmacies_count || 0}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>

            <CardContent className='p-0'>
              {/* Pharmacy Balance & Financial Totals Summary Banner */}
              {financialSummary && (
                <div className='p-4 border-b bg-gradient-to-r from-background via-muted/30 to-background'>
                  <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
                    <div>
                      <div className='flex items-center gap-2 mb-1'>
                        <Badge
                          variant='outline'
                          className={
                            financialSummary.balance_type === 'debit'
                              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 text-xs font-semibold'
                              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-xs font-semibold'
                          }
                        >
                          {financialSummary.balance_type === 'debit'
                            ? 'مدين لصالح المستودع (مطلوب سداده)'
                            : 'دائن للصيدلية (رصيد فائض)'}
                        </Badge>
                        {financialSummary.matched_pharmacy && (
                          <span className='text-xs text-muted-foreground font-mono'>
                            كود الصيدلية: {financialSummary.matched_pharmacy.code}
                          </span>
                        )}
                      </div>
                      <h3 className='text-lg font-bold text-foreground flex items-center gap-2'>
                        {financialSummary.matched_pharmacy ? (
                          <>
                            <span>{financialSummary.matched_pharmacy.name}</span>
                            {financialSummary.matched_pharmacy.phone && (
                              <span className='text-xs font-normal font-mono text-muted-foreground'>
                                ({financialSummary.matched_pharmacy.phone})
                              </span>
                            )}
                          </>
                        ) : searchTerm ? (
                          <span>نتائج وإجمالي الحساب للبحث: &quot;{searchTerm}&quot;</span>
                        ) : (
                          <span>إجمالي المعاملات والمديونيات العامة للمستودع</span>
                        )}
                      </h3>
                      {financialSummary.matched_pharmacy?.address && (
                        <p className='text-xs text-muted-foreground mt-0.5'>
                          {financialSummary.matched_pharmacy.address}
                        </p>
                      )}
                    </div>

                    {/* Main Net Balance Badge */}
                    <div className='flex items-center gap-4 bg-card border rounded-xl p-3 shadow-xs'>
                      <div className='text-right'>
                        <span className='text-xs text-muted-foreground block font-medium'>صافي الرصيد الحالي:</span>
                        <span
                          className={`text-2xl font-black font-mono ${
                            financialSummary.net_balance > 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : financialSummary.net_balance < 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-foreground'
                          }`}
                        >
                          {Math.abs(financialSummary.net_balance).toLocaleString('ar-EG', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          ج.م
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Metric Cards Row */}
                  <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3.5 pt-3 border-t border-border/60'>
                    {/* 1. Invoices / Purchases */}
                    <div className='bg-background/80 border rounded-lg p-2.5 flex items-center justify-between'>
                      <div>
                        <span className='text-[11px] text-muted-foreground block'>إجمالي الفواتير</span>
                        <span className='text-sm font-bold text-foreground font-mono'>
                          {financialSummary.total_invoices_amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}{' '}
                          ج.م
                        </span>
                      </div>
                      <Badge variant='outline' className='text-[10px] font-mono'>
                        {financialSummary.total_invoices_count} فواتير
                      </Badge>
                    </div>

                    {/* 2. Returns */}
                    <div className='bg-background/80 border rounded-lg p-2.5 flex items-center justify-between'>
                      <div>
                        <span className='text-[11px] text-muted-foreground block'>إجمالي المرتجعات</span>
                        <span className='text-sm font-bold text-amber-600 dark:text-amber-400 font-mono'>
                          {financialSummary.total_returns_amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}{' '}
                          ج.م
                        </span>
                      </div>
                      <Badge variant='outline' className='text-[10px] font-mono'>
                        {financialSummary.total_returns_count} مرتجع
                      </Badge>
                    </div>

                    {/* 3. Cash Receipts / Paid */}
                    <div className='bg-background/80 border rounded-lg p-2.5 flex items-center justify-between'>
                      <div>
                        <span className='text-[11px] text-muted-foreground block'>إجمالي النقدية المسددة</span>
                        <span className='text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono'>
                          {financialSummary.total_receipts_amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}{' '}
                          ج.م
                        </span>
                      </div>
                      <Badge variant='outline' className='text-[10px] font-mono'>
                        {financialSummary.total_receipts_count} سند
                      </Badge>
                    </div>

                    {/* 4. Statement Action */}
                    <div className='bg-background/80 border rounded-lg p-2.5 flex items-center justify-between'>
                      <div>
                        <span className='text-[11px] text-muted-foreground block'>كشف الحساب</span>
                        <span className='text-xs font-semibold text-primary block mt-0.5'>
                          {activeTable === 'ledger' ? 'المعروض حالياً' : 'جميع القيود والحركات'}
                        </span>
                      </div>
                      {activeTable !== 'ledger' && (
                        <Button
                          size='sm'
                          variant='outline'
                          className='h-7 text-[11px] px-2 gap-1 text-primary hover:bg-primary/10'
                          onClick={() => {
                            setActiveTable('ledger');
                            setPage(1);
                          }}
                        >
                          عرض الكشف
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Search Bar */}
              <div className='p-4 border-b bg-background/50'>
                <form onSubmit={handleSearchSubmit} className='flex gap-2'>
                  <div className='relative flex-1'>
                    <IconSearch className='absolute right-3 top-2.5 h-4 w-4 text-muted-foreground' />
                    <Input
                      placeholder={
                        activeTable === 'cash_receipts'
                          ? 'ابحث برقم السند، كود الصيدلية (مثال: 2877 أو 6887)، أو اسم المحصل...'
                          : activeTable === 'invoices'
                          ? 'ابحث برقم الفاتورة، كود الصيدلية...'
                          : activeTable === 'returns'
                          ? 'ابحث برقم المرتجع، كود الصيدلية، اسم الصيدلية، أو سبب الإرجاع...'
                          : activeTable === 'ledger'
                          ? 'ابحث في كشف الحساب برقم المستند، كود أو اسم الصيدلية، أو البيان...'
                          : activeTable === 'pharmacies'
                          ? 'ابحث بكود الصيدلية، اسم الصيدلية، رقم الهاتف...'
                          : 'ابحث في السجلات...'
                      }
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className='pr-9 text-xs'
                    />
                  </div>
                  <Button type='submit' size='sm' className='gap-1.5 text-xs'>
                    بحث
                  </Button>
                  {searchTerm && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => {
                        setSearchTerm('');
                        setPage(1);
                        fetchTableData(selectedDb.id, activeTable, '', 1);
                      }}
                      className='text-xs'
                    >
                      إلغاء البحث
                    </Button>
                  )}
                </form>
              </div>

              {/* Data Table */}
              <div className='overflow-x-auto min-h-[350px]'>
                {tableLoading ? (
                  <div className='py-24 text-center'>
                    <IconRefresh className='h-8 w-8 animate-spin mx-auto text-primary mb-3' />
                    <p className='text-sm text-muted-foreground'>جارٍ تحميل السجلات المنسوخة من السحابة...</p>
                  </div>
                ) : tableData.length === 0 ? (
                  <div className='py-20 text-center'>
                    <IconAlertCircle className='h-10 w-10 text-muted-foreground/40 mx-auto mb-3' />
                    <h4 className='font-medium text-sm text-foreground'>لا توجد سجلات منسوخة مطابقة</h4>
                    <p className='text-xs text-muted-foreground mt-1 max-w-sm mx-auto'>
                      {searchTerm
                        ? `لم يتم العثور على أي نتائج تطابق "${searchTerm}" في جدول ${activeTable}.`
                        : `جدول ${activeTable} في المخطط ${selectedDb.schema_name} فارغ حالياً، وسيتم تحديثه مع دورة المزامنة القادمة للوكيل.`}
                    </p>
                  </div>
                ) : (
                  <Table className='text-xs'>
                    <TableHeader className='bg-muted/40'>
                      {activeTable === 'cash_receipts' && (
                        <TableRow>
                          <TableHead className='text-right'>رقم السند</TableHead>
                          <TableHead className='text-right'>كود الصيدلية</TableHead>
                          <TableHead className='text-right'>اسم الصيدلية</TableHead>
                          <TableHead className='text-right'>تاريخ السند</TableHead>
                          <TableHead className='text-right'>المبلغ المحصل</TableHead>
                          <TableHead className='text-right'>طريقة الدفع</TableHead>
                          <TableHead className='text-right'>المحصل</TableHead>
                          <TableHead className='text-right'>ملاحظات</TableHead>
                        </TableRow>
                      )}

                      {activeTable === 'invoices' && (
                        <TableRow>
                          <TableHead className='text-right'>رقم الفاتورة</TableHead>
                          <TableHead className='text-right'>كود الصيدلية</TableHead>
                          <TableHead className='text-right'>اسم الصيدلية</TableHead>
                          <TableHead className='text-right'>تاريخ الفاتورة</TableHead>
                          <TableHead className='text-right'>الإجمالي</TableHead>
                          <TableHead className='text-right'>الخصم</TableHead>
                          <TableHead className='text-right'>الصافي</TableHead>
                          <TableHead className='text-right'>المدفوع</TableHead>
                          <TableHead className='text-right'>المتبقي</TableHead>
                          <TableHead className='text-right'>الحالة</TableHead>
                        </TableRow>
                      )}

                      {activeTable === 'returns' && (
                        <TableRow>
                          <TableHead className='text-right'>رقم المرتجع</TableHead>
                          <TableHead className='text-right'>كود الصيدلية</TableHead>
                          <TableHead className='text-right'>اسم الصيدلية</TableHead>
                          <TableHead className='text-right'>تاريخ المرتجع</TableHead>
                          <TableHead className='text-right'>الإجمالي</TableHead>
                          <TableHead className='text-right'>الصافي المسترد</TableHead>
                          <TableHead className='text-right'>سبب الإرجاع</TableHead>
                          <TableHead className='text-right'>الحالة</TableHead>
                        </TableRow>
                      )}

                      {activeTable === 'pharmacies' && (
                        <TableRow>
                          <TableHead className='text-right'>كود الصيدلية</TableHead>
                          <TableHead className='text-right'>اسم الصيدلية</TableHead>
                          <TableHead className='text-right'>رقم الهاتف</TableHead>
                          <TableHead className='text-right'>العنوان</TableHead>
                          <TableHead className='text-right'>المشتريات (الفواتير)</TableHead>
                          <TableHead className='text-right'>المرتجعات</TableHead>
                          <TableHead className='text-right'>المسدد نقداً</TableHead>
                          <TableHead className='text-right font-bold'>صافي الرصيد الحالي</TableHead>
                          <TableHead className='text-right'>الحالة</TableHead>
                          <TableHead className='text-right'>الإجراءات</TableHead>
                        </TableRow>
                      )}

                      {activeTable === 'ledger' && (
                        <TableRow>
                          <TableHead className='text-right'>التاريخ</TableHead>
                          <TableHead className='text-right'>كود الصيدلية</TableHead>
                          <TableHead className='text-right'>اسم الصيدلية</TableHead>
                          <TableHead className='text-right'>نوع المستند</TableHead>
                          <TableHead className='text-right'>رقم المستند</TableHead>
                          <TableHead className='text-right'>مدين</TableHead>
                          <TableHead className='text-right'>دائن</TableHead>
                          <TableHead className='text-right'>الرصيد</TableHead>
                          <TableHead className='text-right'>البيان</TableHead>
                        </TableRow>
                      )}
                    </TableHeader>

                    <TableBody>
                      {activeTable === 'cash_receipts' &&
                        tableData.map((row) => (
                          <TableRow key={row.id} className='hover:bg-muted/30'>
                            <TableCell className='font-mono font-medium text-foreground'>
                              {row.receipt_number || `RCP-${row.remote_id}`}
                            </TableCell>
                            <TableCell>
                              <div className='flex items-center gap-1.5'>
                                <Badge variant='outline' className='font-mono text-[11px] px-1.5 py-0'>
                                  {row.pharmacy_code}
                                </Badge>
                                <button
                                  onClick={() => handleCopy(row.pharmacy_code, `p-${row.id}`)}
                                  className='text-muted-foreground hover:text-foreground'
                                  title='نسخ كود الصيدلية'
                                >
                                  {copiedId === `p-${row.id}` ? (
                                    <IconCheck className='h-3.5 w-3.5 text-emerald-500' />
                                  ) : (
                                    <IconCopy className='h-3.5 w-3.5' />
                                  )}
                                </button>
                              </div>
                            </TableCell>
                            <TableCell className='font-medium text-foreground'>
                              {row.pharmacy_name}
                            </TableCell>
                            <TableCell className='text-muted-foreground'>
                              {row.receipt_date
                                ? new Date(row.receipt_date).toLocaleDateString('ar-EG', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : '—'}
                            </TableCell>
                            <TableCell className='font-bold text-emerald-600 dark:text-emerald-400'>
                              {Number(row.amount).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                            </TableCell>
                            <TableCell>
                              <Badge variant='secondary' className='text-[10px]'>
                                {row.payment_method === 'cash' ? 'نقدي' : row.payment_method}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[11px] font-medium'>
                                {row.collector_name || '—'}
                              </span>
                            </TableCell>
                            <TableCell className='text-muted-foreground max-w-[200px] truncate' title={row.notes}>
                              {row.notes || '—'}
                            </TableCell>
                          </TableRow>
                        ))}

                      {activeTable === 'invoices' &&
                        tableData.map((row) => (
                          <TableRow key={row.id} className='hover:bg-muted/30'>
                            <TableCell className='font-mono font-bold text-foreground'>
                              {row.invoice_number || `INV-${row.remote_id}`}
                            </TableCell>
                            <TableCell>
                              <Badge variant='outline' className='font-mono text-[11px] px-1.5 py-0'>
                                {row.pharmacy_code}
                              </Badge>
                            </TableCell>
                            <TableCell className='font-medium text-foreground'>
                              {row.pharmacy_name}
                            </TableCell>
                            <TableCell className='text-muted-foreground'>
                              {row.invoice_date
                                ? new Date(row.invoice_date).toLocaleDateString('ar-EG')
                                : '—'}
                            </TableCell>
                            <TableCell>{Number(row.total_amount).toLocaleString('ar-EG')} ج.م</TableCell>
                            <TableCell className='text-rose-500'>
                              {Number(row.discount_amount).toLocaleString('ar-EG')} ج.م
                            </TableCell>
                            <TableCell className='font-bold text-foreground'>
                              {Number(row.net_amount).toLocaleString('ar-EG')} ج.م
                            </TableCell>
                            <TableCell className='text-emerald-600 font-medium'>
                              {Number(row.paid_amount).toLocaleString('ar-EG')} ج.م
                            </TableCell>
                            <TableCell className='text-amber-600 font-medium'>
                              {Number(row.remaining_amount).toLocaleString('ar-EG')} ج.م
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  row.status === 'paid'
                                    ? 'default'
                                    : row.status === 'partially_paid'
                                    ? 'secondary'
                                    : 'outline'
                                }
                                className='text-[10px]'
                              >
                                {row.status === 'paid'
                                  ? 'مدفوعة'
                                  : row.status === 'partially_paid'
                                  ? 'سداد جزئي'
                                  : 'مفتوحة'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}

                      {activeTable === 'returns' &&
                        tableData.map((row) => (
                          <TableRow key={row.id} className='hover:bg-muted/30'>
                            <TableCell className='font-mono font-bold text-amber-600 dark:text-amber-400'>
                              {row.return_number || `RET-${row.remote_id}`}
                            </TableCell>
                            <TableCell>
                              <div className='flex items-center gap-1.5'>
                                <Badge variant='outline' className='font-mono text-[11px] px-1.5 py-0'>
                                  {row.pharmacy_code}
                                </Badge>
                                <button
                                  onClick={() => handleCopy(row.pharmacy_code, `ret-p-${row.id}`)}
                                  className='text-muted-foreground hover:text-foreground'
                                  title='نسخ كود الصيدلية'
                                >
                                  {copiedId === `ret-p-${row.id}` ? (
                                    <IconCheck className='h-3.5 w-3.5 text-emerald-500' />
                                  ) : (
                                    <IconCopy className='h-3.5 w-3.5' />
                                  )}
                                </button>
                              </div>
                            </TableCell>
                            <TableCell className='font-medium text-foreground'>
                              {row.pharmacy_name}
                            </TableCell>
                            <TableCell className='text-muted-foreground'>
                              {row.return_date
                                ? new Date(row.return_date).toLocaleDateString('ar-EG', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : '—'}
                            </TableCell>
                            <TableCell>{Number(row.total_amount || 0).toLocaleString('ar-EG')} ج.م</TableCell>
                            <TableCell className='font-bold text-amber-600 dark:text-amber-400'>
                              {Number(row.net_amount || 0).toLocaleString('ar-EG')} ج.م
                            </TableCell>
                            <TableCell className='text-muted-foreground max-w-[200px] truncate' title={row.reason}>
                              {row.reason || 'مرتجع مبيعات'}
                            </TableCell>
                            <TableCell>
                              <Badge variant='outline' className='bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 text-[10px]'>
                                مرتجع معتمد
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}

                      {activeTable === 'pharmacies' &&
                        tableData.map((row) => (
                          <TableRow key={row.id} className='hover:bg-muted/30'>
                            <TableCell className='font-mono font-bold text-primary'>
                              {row.code}
                            </TableCell>
                            <TableCell className='font-medium text-foreground text-sm'>
                              {row.name}
                            </TableCell>
                            <TableCell className='font-mono text-muted-foreground'>
                              {row.phone || '—'}
                            </TableCell>
                            <TableCell className='text-muted-foreground max-w-[180px] truncate' title={row.address}>
                              {row.address || '—'}
                            </TableCell>
                            <TableCell className='font-bold text-foreground whitespace-nowrap'>
                              {Number(row.total_invoices || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                            </TableCell>
                            <TableCell className='text-amber-600 font-medium whitespace-nowrap'>
                              {Number(row.total_returns || 0) > 0 ? `${Number(row.total_returns).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م` : '—'}
                            </TableCell>
                            <TableCell className='text-emerald-600 font-medium whitespace-nowrap'>
                              {Number(row.total_paid || 0) > 0 ? `${Number(row.total_paid).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م` : '—'}
                            </TableCell>
                            <TableCell className='whitespace-nowrap'>
                              {Number(row.current_balance || 0) !== 0 ? (
                                <Badge
                                  variant='outline'
                                  className={`font-mono text-xs px-2 py-0.5 ${
                                    Number(row.current_balance || 0) > 0
                                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-300'
                                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300'
                                  }`}
                                >
                                  {Math.abs(Number(row.current_balance)).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                                  {Number(row.current_balance) > 0 ? 'مدين' : 'دائن'}
                                </Badge>
                              ) : (
                                <span className='text-muted-foreground font-mono text-xs'>0.00 ج.م</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {row.is_active ? (
                                <Badge className='bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]'>
                                  نشط
                                </Badge>
                              ) : (
                                <Badge variant='outline' className='text-[10px]'>
                                  معطل
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                size='sm'
                                variant='outline'
                                className='h-7 text-xs text-primary hover:bg-primary/10 gap-1 font-semibold'
                                onClick={() => {
                                  setSearchTerm(row.code);
                                  setActiveTable('ledger');
                                  setPage(1);
                                }}
                              >
                                <IconFileDescription className='h-3.5 w-3.5' />
                                كشف الحساب
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}

                      {activeTable === 'ledger' &&
                        tableData.map((row) => (
                          <TableRow key={row.id} className='hover:bg-muted/30'>
                            <TableCell className='text-muted-foreground whitespace-nowrap'>
                              {row.entry_date
                                ? new Date(row.entry_date).toLocaleDateString('ar-EG', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : '—'}
                            </TableCell>
                            <TableCell>
                              <div className='flex items-center gap-1.5'>
                                <Badge variant='outline' className='font-mono text-[11px] px-1.5 py-0'>
                                  {row.pharmacy_code}
                                </Badge>
                                <button
                                  onClick={() => handleCopy(row.pharmacy_code, `led-p-${row.id}`)}
                                  className='text-muted-foreground hover:text-foreground'
                                  title='نسخ كود الصيدلية'
                                >
                                  {copiedId === `led-p-${row.id}` ? (
                                    <IconCheck className='h-3.5 w-3.5 text-emerald-500' />
                                  ) : (
                                    <IconCopy className='h-3.5 w-3.5' />
                                  )}
                                </button>
                              </div>
                            </TableCell>
                            <TableCell className='font-medium text-foreground'>
                              {row.pharmacy_name}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant='outline'
                                className={`text-[10px] px-2 py-0.5 font-medium whitespace-nowrap ${
                                  row.doc_type === 'فاتورة مبيعات'
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200'
                                    : row.doc_type === 'سند قبض نقدي'
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200'
                                    : row.doc_type === 'مرتجع مبيعات'
                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {row.doc_type}
                              </Badge>
                            </TableCell>
                            <TableCell className='font-mono font-medium'>{row.doc_number}</TableCell>
                            <TableCell className='text-rose-600 font-semibold whitespace-nowrap'>
                              {Number(row.debit) > 0 ? `${Number(row.debit).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م` : '—'}
                            </TableCell>
                            <TableCell className='text-emerald-600 font-semibold whitespace-nowrap'>
                              {Number(row.credit) > 0 ? `${Number(row.credit).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م` : '—'}
                            </TableCell>
                            <TableCell className={`font-bold whitespace-nowrap ${
                              Number(row.balance) > 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : Number(row.balance) < 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-foreground'
                            }`}>
                              {Number(row.balance).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                            </TableCell>
                            <TableCell className='text-muted-foreground max-w-[200px] truncate' title={row.description}>
                              {row.description || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Pagination Controls */}
              {tableTotal > limit && (
                <div className='flex items-center justify-between p-4 border-t bg-muted/10 text-xs text-muted-foreground'>
                  <span>
                    عرض {(page - 1) * limit + 1} إلى {Math.min(page * limit, tableTotal)} من أصل{' '}
                    {tableTotal.toLocaleString('ar-EG')} سجل
                  </span>

                  <div className='flex items-center gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(p - 1, 1))}
                      className='h-8 gap-1 text-xs'
                    >
                      <IconChevronRight className='h-4 w-4' />
                      السابق
                    </Button>
                    <span className='font-medium px-2'>
                      صفحة {page} من {Math.ceil(tableTotal / limit)}
                    </span>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page * limit >= tableTotal}
                      onClick={() => setPage((p) => p + 1)}
                      className='h-8 gap-1 text-xs'
                    >
                      التالي
                      <IconChevronLeft className='h-4 w-4' />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
