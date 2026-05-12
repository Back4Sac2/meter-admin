import { AdminSidebar, AdminTopBar, AdminBottomNav } from '@/components/admin/AdminNav';

export const metadata = {
  title: { default: '야장관리자', template: '%s | 야장관리자' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950">
      <AdminSidebar />
      <AdminTopBar />
      <div className="md:ml-52 pt-12 md:pt-0 pb-20 md:pb-0 min-h-screen">
        <div className="p-4 md:p-8">{children}</div>
      </div>
      <AdminBottomNav />
    </div>
  );
}
