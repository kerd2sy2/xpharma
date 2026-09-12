import { NavGroup } from '@/types';

/**
 * Navigation configuration with RBAC support
 *
 * This configuration is used for both the sidebar navigation and Cmd+K bar.
 * Items are organized into groups, each rendered with a SidebarGroupLabel.
 *
 * RBAC Access Control:
 * Each navigation item can have an `access` property that controls visibility
 * based on permissions, plans, features, roles, and organization context.
 *
 * Examples:
 *
 * 1. Require organization:
 *    access: { requireOrg: true }
 *
 * 2. Require specific permission:
 *    access: { requireOrg: true, permission: 'org:teams:manage' }
 *
 * 3. Require specific plan:
 *    access: { plan: 'pro' }
 *
 * 4. Require specific feature:
 *    access: { feature: 'premium_access' }
 *
 * 5. Require specific role:
 *    access: { role: 'admin' }
 *
 * 6. Multiple conditions (all must be true):
 *    access: { requireOrg: true, permission: 'org:teams:manage', plan: 'pro' }
 *
 * Note: The `visible` function is deprecated but still supported for backward compatibility.
 * Use the `access` property for new items.
 */
export const navGroups: NavGroup[] = [
  {
    label: 'منصة إكس فارما',
    items: [
      {
        title: 'نظرة عامة',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        shortcut: ['o', 'v'],
        items: []
      },
      {
        title: 'المخازن والمستأجرين',
        url: '/dashboard/tenants',
        icon: 'server',
        isActive: false,
        shortcut: ['t', 't'],
        items: []
      },
      {
        title: 'قواعد البيانات والتزامن',
        url: '/dashboard/databases',
        icon: 'database',
        isActive: false,
        shortcut: ['d', 'b'],
        items: []
      },
      {
        title: 'مراقبة الوكلاء والخدمات',
        url: '/dashboard/monitoring',
        icon: 'activity',
        isActive: false,
        shortcut: ['m', 'm'],
        items: []
      }
    ]
  },
  {
    label: 'الصيادلة والاشتراكات',
    items: [
      {
        title: 'الصيادلة والمستخدمين',
        url: '/dashboard/users',
        icon: 'teams',
        shortcut: ['u', 'u'],
        isActive: false,
        items: []
      },
      {
        title: 'الفواتير واشتراكات إنستاباي',
        url: '/dashboard/billing-review',
        icon: 'billing',
        isActive: false,
        shortcut: ['b', 'b'],
        items: []
      }
    ]
  },
  {
    label: 'الحساب والنظام',
    items: [
      {
        title: 'الحساب الشخصي',
        url: '#',
        icon: 'account',
        isActive: true,
        items: [
          {
            title: 'الملف الشخصي',
            url: '/dashboard/profile',
            icon: 'profile',
            shortcut: ['p', 'r']
          },
          {
            title: 'الإشعارات والتنبيهات',
            url: '/dashboard/notifications',
            icon: 'notification',
            shortcut: ['n', 'n']
          },
          {
            title: 'تسجيل الخروج',
            shortcut: ['l', 'o'],
            url: '/logout',
            icon: 'logout'
          }
        ]
      }
    ]
  }
];
