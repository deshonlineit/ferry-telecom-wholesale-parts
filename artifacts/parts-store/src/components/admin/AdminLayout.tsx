import { Link, useLocation } from 'wouter';
import { Package, FolderTree, Users, ShoppingBag, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import ferryLogo from '@/assets/ferry-logo.png';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { label: 'Products', path: '/admin/products', icon: Package },
    { label: 'Catalog', path: '/admin/catalog', icon: FolderTree },
    { label: 'Customers', path: '/admin/customers', icon: Users },
    { label: 'Orders', path: '/admin/orders', icon: ShoppingBag },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="p-4 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <img src={ferryLogo} alt="Ferry Telecom" className="h-8 w-auto" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-none text-sidebar-foreground">Ferry Telecom</span>
              <span className="text-xs leading-none text-sidebar-foreground/60">Admin</span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path || location.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`}
                data-testid={`admin-nav-${item.label.toLowerCase()}`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Separator className="bg-sidebar-border" />

        <div className="p-3">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground"
              data-testid="button-exit-admin"
            >
              <LogOut className="h-4 w-4" />
              Exit Admin
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
