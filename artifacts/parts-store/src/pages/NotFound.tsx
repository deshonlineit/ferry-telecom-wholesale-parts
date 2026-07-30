import { Link } from 'wouter';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-12">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-12 text-center">
            <div className="text-8xl font-bold text-primary mb-4">404</div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Page Not Found</h1>
            <p className="text-muted-foreground mb-8">
              The page you're looking for doesn't exist or has been moved.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/">
                <Button className="gap-2" data-testid="button-home">
                  <Home className="h-4 w-4" />
                  Go Home
                </Button>
              </Link>
              <Link href="/products">
                <Button variant="outline" className="gap-2" data-testid="button-products">
                  <Search className="h-4 w-4" />
                  Browse Products
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
