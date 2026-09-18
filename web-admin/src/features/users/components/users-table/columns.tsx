'use client';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { User } from '../../api/types';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import { CellAction } from './cell-action';
import { ROLE_OPTIONS } from './options';
import { IconDeviceMobile, IconLink } from '@tabler/icons-react';

export const columns: ColumnDef<User>[] = [
  {
    id: 'name',
    accessorFn: (row) => `${row.name || `${row.first_name} ${row.last_name}`} ${row.email}`,
    header: ({ column }: { column: Column<User, unknown> }) => (
      <DataTableColumnHeader column={column} title='المستخدم والبريد الإلكتروني' />
    ),
    cell: ({ row }) => (
      <div className='flex flex-col'>
        <span className='font-semibold text-foreground text-sm'>
          {row.original.name || `${row.original.first_name} ${row.original.last_name}`.trim()}
        </span>
        <span className='text-muted-foreground text-xs font-mono'>{row.original.email}</span>
      </div>
    ),
    meta: {
      label: 'الاسم أو الإيميل',
      placeholder: 'بحث في المستخدمين...',
      variant: 'text' as const,
      icon: Icons.text
    },
    enableColumnFilter: true
  },
  {
    accessorKey: 'phone',
    header: 'رقم الهاتف',
    cell: ({ row }) => {
      const phone = row.original.phone;
      return (
        <span className='font-mono text-xs'>
          {phone && phone !== '-' ? phone : <span className='text-muted-foreground'>غير مسجل</span>}
        </span>
      );
    }
  },
  {
    id: 'device',
    header: 'الجهاز المسجل',
    cell: ({ row }) => {
      const deviceName = row.original.device_name;
      const deviceId = row.original.device_id;
      return (
        <div className='flex flex-col text-xs'>
          {deviceName ? (
            <div className='flex items-center gap-1 font-medium text-foreground'>
              <IconDeviceMobile className='h-3.5 w-3.5 text-primary shrink-0' />
              <span>{deviceName}</span>
            </div>
          ) : (
            <span className='text-muted-foreground text-[11px]'>تطبيق الهاتف</span>
          )}
          {deviceId && (
            <span className='font-mono text-[10px] text-muted-foreground truncate max-w-[120px]' title={deviceId}>
              سيرية: {deviceId.slice(0, 14)}...
            </span>
          )}
        </div>
      );
    }
  },
  {
    id: 'role',
    accessorKey: 'role',
    enableSorting: false,
    header: ({ column }: { column: Column<User, unknown> }) => (
      <DataTableColumnHeader column={column} title='الدور / الصلاحية' />
    ),
    cell: ({ cell }) => {
      const role = cell.getValue<string>() || 'pharmacist';
      const roleMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
        superadmin: { label: 'مدير النظام', variant: 'default' },
        pharmacist: { label: 'صيدلي', variant: 'secondary' },
        pharmacy: { label: 'صيدلية', variant: 'secondary' },
        user: { label: 'مستخدم', variant: 'outline' }
      };
      const info = roleMap[role] || { label: role, variant: 'outline' };
      return (
        <Badge variant={info.variant} className='text-xs'>
          {info.label}
        </Badge>
      );
    },
    enableColumnFilter: true,
    meta: {
      label: 'الصلاحية',
      variant: 'multiSelect' as const,
      options: ROLE_OPTIONS
    }
  },
  {
    id: 'linked_pharmacies_count',
    header: 'الصيدليات المرتبطة',
    cell: ({ row }) => {
      const count = row.original.linked_pharmacies_count || 0;
      return (
        <Badge variant={count > 0 ? 'default' : 'outline'} className='gap-1 text-xs'>
          <IconLink className='h-3 w-3' />
          {count} {count === 1 ? 'صيدلية' : 'صيدليات'}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'status',
    header: 'حالة الحساب',
    cell: ({ cell }) => {
      const status = cell.getValue<string>();
      const isActive = status === 'Active';
      return (
        <Badge variant={isActive ? 'default' : 'destructive'} className='text-xs'>
          {isActive ? 'نشط' : 'معطل'}
        </Badge>
      );
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
];
