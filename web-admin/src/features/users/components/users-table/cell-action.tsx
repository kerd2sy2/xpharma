'use client';
import { AlertModal } from '@/components/modal/alert-modal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { deleteUserMutation, resetUserDeviceMutation } from '../../api/mutations';
import type { User } from '../../api/types';
import { Icons } from '@/components/icons';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserFormSheet } from '../user-form-sheet';
import { IconDeviceMobileOff } from '@tabler/icons-react';

interface CellActionProps {
  data: User;
}

export function CellAction({ data }: CellActionProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetDeviceOpen, setResetDeviceOpen] = useState(false);

  const deleteMutation = useMutation({
    ...deleteUserMutation,
    onSuccess: () => {
      toast.success('تم حذف المستخدم بنجاح');
      setDeleteOpen(false);
    },
    onError: () => {
      toast.error('فشل حذف المستخدم');
    }
  });

  const resetDeviceMutation = useMutation({
    ...resetUserDeviceMutation,
    onSuccess: () => {
      toast.success(`تم إلغاء ربط الجهاز للمستخدم ${data.name || data.email} بنجاح. يمكنه الآن تسجيل الدخول من هاتفه الجديد.`);
      setResetDeviceOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'فشل إلغاء ربط الجهاز');
    }
  });

  return (
    <>
      <AlertModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate(data.id)}
        loading={deleteMutation.isPending}
        title='حذف المستخدم'
        description={`هل أنت متأكد من حذف الحساب (${data.name || data.email})؟ سيتم إلغاء ارتباط كافة الصيدليات بهذا الحساب.`}
      />
      <AlertModal
        isOpen={resetDeviceOpen}
        onClose={() => setResetDeviceOpen(false)}
        onConfirm={() => resetDeviceMutation.mutate(data.id)}
        loading={resetDeviceMutation.isPending}
        title='إلغاء ربط الجهاز وتفعيل هاتف جديد'
        description={`هل أنت متأكد من فك ارتباط الجهاز الحالي (${data.device_name || 'هاتف مسجل'}) للحساب (${data.name || data.email})؟ سيمكن للعميل تسجيل الدخول فوراً من هاتفه الجديد وتفعيله.`}
      />
      <UserFormSheet user={data} open={editOpen} onOpenChange={setEditOpen} />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger render={<Button variant='ghost' className='h-8 w-8 p-0' />}>
          <span className='sr-only'>فتح القائمة</span>
          <Icons.ellipsis className='h-4 w-4' />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-48'>
          <DropdownMenuGroup>
            <DropdownMenuLabel>خيارات الحساب</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Icons.edit className='mr-2 h-4 w-4' /> تعديل الحساب
            </DropdownMenuItem>
            {data.device_id ? (
              <DropdownMenuItem 
                onClick={() => setResetDeviceOpen(true)}
                className='text-amber-600 dark:text-amber-400 focus:text-amber-600'
              >
                <IconDeviceMobileOff className='mr-2 h-4 w-4' /> إلغاء ربط الجهاز
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem 
              onClick={() => setDeleteOpen(true)}
              className='text-destructive focus:text-destructive'
            >
              <Icons.trash className='mr-2 h-4 w-4' /> حذف الحساب
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
