'use client';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail
} from '@/components/ui/sidebar';
import { navGroups } from '@/config/nav-config';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useClerk, useUser } from '@clerk/nextjs';
import { useFilteredNavGroups } from '@/hooks/use-nav';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { Icons } from '../icons';
import { OrgSwitcher } from '../org-switcher';

export default function AppSidebar() {
  const pathname = usePathname();
  const { isOpen } = useMediaQuery();
  const { user } = useUser();
  const { signOut } = useClerk();
  const filteredGroups = useFilteredNavGroups(navGroups);

  const [localUser, setLocalUser] = React.useState<any>(null);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('xpharma_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        setLocalUser({
          fullName: parsed.name || parsed.fullName || 'Admin',
          imageUrl: parsed.picture || parsed.imageUrl || '',
          emailAddresses: [{ emailAddress: parsed.email || '' }]
        });
      } else {
        setLocalUser(null);
      }
    } catch (_) {
      setLocalUser(null);
    }
  }, []);

  const activeUser = user || localUser;

  const handleLogout = async () => {
    try {
      document.cookie = 'xpharma_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0; SameSite=Lax';
      localStorage.removeItem('xpharma_user');
      sessionStorage.clear();
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (_) {}
      if (signOut) {
        try {
          await signOut();
        } catch (_) {}
      }
    } finally {
      window.location.href = '/login';
    }
  };

  React.useEffect(() => {
    // Side effects based on sidebar state changes
  }, [isOpen]);

  return (
    <Sidebar collapsible='icon' side='right'>
      <SidebarHeader className='group-data-[collapsible=icon]:pt-4'>
        <OrgSwitcher />
      </SidebarHeader>
      <SidebarContent className='overflow-x-hidden'>
        {filteredGroups.map((group) => (
          <SidebarGroup key={group.label || 'ungrouped'} className='py-0'>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = item.icon ? Icons[item.icon] : Icons.logo;
                const isUserAccount = item.icon === 'account' || item.title === 'الحساب الشخصي';

                return item?.items && item?.items?.length > 0 ? (
                  <Collapsible
                    key={item.title}
                    defaultOpen={item.isActive}
                    render={<SidebarMenuItem />}
                  >
                    <CollapsibleTrigger
                      render={
                        <SidebarMenuButton
                          tooltip={item.title}
                          isActive={pathname === item.url}
                          className='group/collapsible'
                        />
                      }
                    >
                      {isUserAccount && activeUser?.imageUrl ? (
                        <img
                          src={activeUser.imageUrl}
                          alt=''
                          className='size-5 rounded-full object-cover shrink-0'
                        />
                      ) : (
                        item.icon && <Icon />
                      )}
                      <span>{item.title}</span>
                      <Icons.chevronRight className='mr-auto transition-transform duration-200 group-data-panel-open/collapsible:rotate-90 rtl:rotate-180 rtl:group-data-panel-open/collapsible:rotate-90' />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items?.map((subItem) => {
                          const SubIcon = subItem.icon ? Icons[subItem.icon] : null;
                          const isLogout = subItem.url === '/logout' || subItem.icon === 'logout';

                          return (
                            <SidebarMenuSubItem key={subItem.title}>
                              {isLogout ? (
                                <SidebarMenuSubButton
                                  render={
                                    <button
                                      type='button'
                                      onClick={handleLogout}
                                      className='flex w-full items-center gap-2 text-right text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer font-medium'
                                    />
                                  }
                                >
                                  {SubIcon && <SubIcon className='size-4 shrink-0' />}
                                  <span>{subItem.title}</span>
                                </SidebarMenuSubButton>
                              ) : (
                                <SidebarMenuSubButton
                                  render={<Link href={subItem.url} aria-label={subItem.title} />}
                                  isActive={pathname === subItem.url}
                                >
                                  {SubIcon && <SubIcon className='size-4 shrink-0' />}
                                  <span>{subItem.title}</span>
                                </SidebarMenuSubButton>
                              )}
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link href={item.url} aria-label={item.title} />}
                      tooltip={item.title}
                      isActive={pathname === item.url}
                    >
                      <Icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
