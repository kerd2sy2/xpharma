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
    label: 'مركز إدارة XPharma',
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
        title: 'قواعد البيانات المنسوخة',
        url: '/dashboard/databases',
        icon: 'database',
        isActive: false,
        shortcut: ['d', 'b'],
        items: []
      },
      {
        title: 'الفواتير واشتراكات إنستاباي',
        url: '/dashboard/billing-review',
        icon: 'billing',
        isActive: false,
        shortcut: ['b', 'b'],
        items: []
      },
      {
        title: 'مراقبة الوكلاء والتزامن',
        url: '/dashboard/monitoring',
        icon: 'activity',
        isActive: false,
        shortcut: ['m', 'm'],
        items: []
      }
    ]
  },
  {
    label: 'إدارة النظام',
    items: [
      {
        title: 'مساحات العمل',
        url: '/dashboard/workspaces',
        icon: 'workspace',
        isActive: false,
        items: []
      },
      {
        title: 'فرق العمل',
        url: '/dashboard/workspaces/team',
        icon: 'teams',
        isActive: false,
        items: [],
        access: { requireOrg: true }
      },
      {
        title: 'المستخدمين',
        url: '/dashboard/users',
        icon: 'teams',
        shortcut: ['u', 'u'],
        isActive: false,
        items: []
      },
      {
        title: 'لوحة المهام (كانبان)',
        url: '/dashboard/kanban',
        icon: 'kanban',
        shortcut: ['k', 'k'],
        isActive: false,
        items: []
      },
      {
        title: 'المحادثات',
        url: '/dashboard/chat',
        icon: 'chat',
        shortcut: ['c', 'c'],
        isActive: false,
        items: []
      },
      {
        title: 'المساعد الذكي (AI Chat)',
        url: '/dashboard/ai-chat',
        icon: 'sparkles',
        shortcut: ['a', 'i'],
        isActive: false,
        items: []
      }
    ]
  },
  {
    label: 'عناصر الواجهة',
    items: [
      {
        title: 'النماذج والاستمارات',
        url: '#',
        icon: 'forms',
        isActive: true,
        items: [
          {
            title: 'نموذج بسيط',
            url: '/dashboard/forms/basic',
            icon: 'forms',
            shortcut: ['f', 'f']
          },
          {
            title: 'نموذج متعدد الخطوات',
            url: '/dashboard/forms/multi-step',
            icon: 'forms'
          },
          {
            title: 'نافذة جانبية وحوار',
            url: '/dashboard/forms/sheet-form',
            icon: 'forms'
          },
          {
            title: 'أنماط متقدمة',
            url: '/dashboard/forms/advanced',
            icon: 'forms'
          }
        ]
      },
      {
        title: 'ريأكت كويري',
        url: '/dashboard/react-query',
        icon: 'code',
        isActive: false,
        items: []
      },
      {
        title: 'الأيقونات',
        url: '/dashboard/elements/icons',
        icon: 'palette',
        isActive: false,
        items: []
      }
    ]
  },
  {
    label: 'الحساب والإعدادات',
    items: [
      {
        title: 'العضوية المميزة',
        url: '#',
        icon: 'pro',
        isActive: false,
        items: [
          {
            title: 'ميزات حصرية',
            url: '/dashboard/exclusive',
            icon: 'exclusive',
            shortcut: ['e', 'e']
          }
        ]
      },
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
            shortcut: ['m', 'm']
          },
          {
            title: 'الإشعارات',
            url: '/dashboard/notifications',
            icon: 'notification',
            shortcut: ['n', 'n']
          },
          {
            title: 'الاشتراكات والمدفوعات',
            url: '/dashboard/billing-review',
            icon: 'billing',
            shortcut: ['b', 'b']
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
