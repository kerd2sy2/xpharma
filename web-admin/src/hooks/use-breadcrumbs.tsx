'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

type BreadcrumbItem = {
  title: string;
  link: string;
};

const segmentTranslations: Record<string, string> = {
  dashboard: 'لوحة التحكم',
  overview: 'نظرة عامة',
  tenants: 'المخازن والمستأجرين',
  databases: 'قواعد البيانات المنسوخة',
  'billing-review': 'الفواتير والاشتراكات',
  monitoring: 'مراقبة الوكلاء',
  workspaces: 'مساحات العمل',
  team: 'فرق العمل',
  product: 'المنتجات والأدوية',
  users: 'المستخدمين',
  kanban: 'لوحة المهام',
  chat: 'المحادثات',
  'ai-chat': 'المساعد الذكي',
  profile: 'الملف الشخصي',
  notifications: 'الإشعارات',
  billing: 'الاشتراكات والمدفوعات',
  forms: 'النماذج',
  basic: 'بسيط',
  'multi-step': 'متعدد الخطوات',
  'sheet-form': 'نموذج منبثق',
  advanced: 'متقدم',
  'react-query': 'ريأكت كويري',
  elements: 'العناصر',
  icons: 'الأيقونات',
  exclusive: 'ميزات حصرية'
};

const routeMapping: Record<string, BreadcrumbItem[]> = {
  '/dashboard': [{ title: 'لوحة التحكم', link: '/dashboard' }],
  '/dashboard/overview': [
    { title: 'لوحة التحكم', link: '/dashboard' },
    { title: 'نظرة عامة', link: '/dashboard/overview' }
  ],
  '/dashboard/tenants': [
    { title: 'لوحة التحكم', link: '/dashboard' },
    { title: 'المخازن والمستأجرين', link: '/dashboard/tenants' }
  ],
  '/dashboard/banners': [
    { title: 'لوحة التحكم', link: '/dashboard' },
    { title: 'الإعلانات والبانرات', link: '/dashboard/banners' }
  ],
  '/dashboard/databases': [
    { title: 'لوحة التحكم', link: '/dashboard' },
    { title: 'قواعد البيانات المنسوخة', link: '/dashboard/databases' }
  ],
  '/dashboard/billing-review': [
    { title: 'لوحة التحكم', link: '/dashboard' },
    { title: 'الفواتير والاشتراكات', link: '/dashboard/billing-review' }
  ],
  '/dashboard/monitoring': [
    { title: 'لوحة التحكم', link: '/dashboard' },
    { title: 'مراقبة الوكلاء', link: '/dashboard/monitoring' }
  ]
};

export function useBreadcrumbs() {
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => {
    if (routeMapping[pathname]) {
      return routeMapping[pathname];
    }

    const segments = pathname.split('/').filter(Boolean);
    return segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join('/')}`;
      const title = segmentTranslations[segment.toLowerCase()] || segment.charAt(0).toUpperCase() + segment.slice(1);
      return {
        title,
        link: path
      };
    });
  }, [pathname]);

  return breadcrumbs;
}
