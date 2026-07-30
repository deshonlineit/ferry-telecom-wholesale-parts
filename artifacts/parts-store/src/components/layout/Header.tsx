import { Link, useLocation } from 'wouter';
import { ShoppingCart, User, Package } from 'lucide-react';
import { useGetCart } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ferryLogo from '@/assets/ferry-logo.png';

export function Header() {
  const [location] = useLocation();
  const { data: cart } = useGetCart();

  const navItems = [
    { label: 'Home', path: '/' },
    { label: 'Products', path: '/products' },
    { label: 'Orders', path: '/orders' },
    { label: 'Account', path: '/account' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <img src={ferryLogo} alt="Ferry Telecom" className="h-8 w-auto" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-none text-foreground">Ferry Telecom</span>
              <span className="text-xs leading-none text-muted-foreground">Wholesale</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`px-3 py-2 text-sm font-medium rounded transition-colors ${
                  location === item.path
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/cart">
            <Button
              variant="outline"
              size="sm"
              className="relative gap-2"
              data-testid="button-cart"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Cart</span>
              {cart && cart.itemCount > 0 && (
                <Badge variant="destructive" className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-xs">
                  {cart.itemCount}
                </Badge>
              )}
            </Button>
          </Link>

          <Link href="/account">
            <Button variant="ghost" size="sm" className="gap-2" data-testid="button-account">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Account</span>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
