import { Link } from 'wouter';
import { useGetCatalogSummary, useListFeaturedProducts, useGetCurrentCustomer, useAddCartItem, getGetCartQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { ProductCard } from '@/components/products/ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Package, TrendingUp, Award, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: summary } = useGetCatalogSummary();
  const { data: featured, isLoading: featuredLoading } = useListFeaturedProducts();
  const { data: customer } = useGetCurrentCustomer();
  const addToCart = useAddCartItem();

  const handleAddToCart = (productId: number, quantity: number) => {
    addToCart.mutate(
      { data: { productId, quantity } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
          toast({
            title: 'Added to cart',
            description: `${quantity} item(s) added successfully`,
          });
        },
        onError: () => {
          toast({
            title: 'Error',
            description: 'Failed to add item to cart',
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 space-y-12">
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 p-8 md:p-12">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                Professional Parts. Trade Pricing.
              </h1>
              <p className="text-lg text-muted-foreground">
                The wholesale parts counter built for repair shops. Find the exact part in seconds, check out in two clicks.
              </p>
            </div>

            {customer && (
              <Card className="inline-block border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <Award className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {customer.tier.name} Member
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Saving {customer.tier.discountPercent}% on every order
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/products">
                <Button size="lg" className="gap-2" data-testid="button-browse-catalog">
                  <Search className="h-4 w-4" />
                  Browse Catalog
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/account">
                <Button size="lg" variant="outline" data-testid="button-view-account">
                  View Your Pricing
                </Button>
              </Link>
            </div>
          </div>

          <div className="absolute right-0 top-0 h-full w-1/3 opacity-5">
            <Package className="absolute right-8 top-8 h-32 w-32 text-primary" />
            <Package className="absolute right-24 bottom-12 h-24 w-24 text-primary" />
          </div>
        </section>

        {/* Stats */}
        {summary && (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-3xl font-bold text-primary">{summary.productCount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-1">Products</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-3xl font-bold text-primary">{summary.brandCount}</p>
                <p className="text-sm text-muted-foreground mt-1">Brands</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-3xl font-bold text-primary">{summary.categoryCount}</p>
                <p className="text-sm text-muted-foreground mt-1">Categories</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-3xl font-bold text-green-600 dark:text-green-500">{summary.inStockCount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-1">In Stock</p>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Featured Products */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Popular This Week</h2>
              <p className="text-sm text-muted-foreground mt-1">Best-selling parts at your tier pricing</p>
            </div>
            <Link href="/products">
              <Button variant="outline" className="gap-2" data-testid="button-view-all">
                View All
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {featuredLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-square w-full" />
                  <div className="p-3 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-6 w-1/3" />
                  </div>
                </Card>
              ))}
            </div>
          ) : featured && featured.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {featured.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                  isAdding={addToCart.isPending}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">No featured products available</p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* CTA */}
        <section className="rounded-lg border border-border bg-muted/30 p-8 md:p-12 text-center">
          <TrendingUp className="h-12 w-12 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Ready to upgrade your pricing tier?</h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            The more you order, the better your prices get. Check your progress and see how much you could save.
          </p>
          <Link href="/account">
            <Button size="lg" data-testid="button-check-tier">
              Check Your Tier Progress
            </Button>
          </Link>
        </section>
      </main>
    </div>
  );
}
