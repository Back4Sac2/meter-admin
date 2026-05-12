'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, LogOut, FileSpreadsheet } from 'lucide-react';
import { logoutAction } from '@/app/admin/_actions';

const NAV_ITEMS = [
  { href: '/admin/meter', label: '야장관리', icon: ClipboardList },
  { href: '/admin/meter-excel', label: '엑셀관리자', icon: FileSpreadsheet },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-52 shrink-0 border-r border-zinc-800 flex-col h-full fixed left-0 top-0 z-30 bg-zinc-950">
      <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
        <ClipboardList size={16} className="text-emerald-400" />
        <Link href="/admin/meter" className="text-sm font-semibold text-white">
          야장관리자
        </Link>
      </div>
      <nav className="flex-1 p-2 space-y-1 text-sm overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              pathname.startsWith(href)
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Icon size={15} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-2 border-t border-zinc-800">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <LogOut size={15} />
            로그아웃
          </button>
        </form>
      </div>
    </aside>
  );
}

export function AdminTopBar() {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((i) => pathname.startsWith(i.href));

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 h-12 bg-zinc-950 border-b border-zinc-800 flex items-center px-4 z-30">
      <ClipboardList size={15} className="text-emerald-400 mr-2 shrink-0" />
      <span className="text-sm font-semibold text-white">
        {current?.label ?? '야장관리자'}
      </span>
    </header>
  );
}

export function AdminBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 flex z-30">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
              active ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon size={20} />
            <span className="text-xs font-medium">{label}</span>
          </Link>
        );
      })}
      <form action={logoutAction} className="flex-1">
        <button
          type="submit"
          className="w-full h-full flex flex-col items-center justify-center py-3 gap-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <LogOut size={20} />
          <span className="text-xs font-medium">로그아웃</span>
        </button>
      </form>
    </nav>
  );
}
