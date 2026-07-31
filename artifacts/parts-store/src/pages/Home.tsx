import { Link } from 'wouter';
import { useGetCatalogSummary, useListFeaturedProducts, useGetCurrentCustomer, useListCategories, useListBrands, useAddCartItem, getGetCartQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { SmartSearch } from '@/components/home/SmartSearch';
import { ProductCard } from '@/components/products/ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Package, Award, Grid3x3, Smartphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: summary } = useGetCatalogSummary();
  const { data: featured, isLoading: featuredLoading } = useListFeaturedProducts();
  const { data: customer } = useGetCurrentCustomer();
  const { data: categories } = useListCategories();
  const { data: brands } = useListBrands();
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

  // Top brands by model count
  const topBrands = brands?.slice().sort((a, b) => b.models.length - a.models.length).slice(0, 8) || [];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 space-y-12">
        {/* Hero with Smart Search */}
        <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 p-8 md:p-12">
          <div className="relative z-10 max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-3">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                Find Your Part in Seconds
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Type what you need — our smart search understands device models and part names
              </p>
            </div>

            <SmartSearch />

            {customer && (
              <Card className="inline-block border-primary/20 bg-primary/5 mx-auto">
                <CardContent className="p-4 flex items-center gap-3">
                  <Award className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {customer.tier.name} Pricing
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {customer.tier.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="absolute right-0 top-0 h-full w-1/3 opacity-5 pointer-events-none">
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

        {/* Browse by Category */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Grid3x3 className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-bold text-foreground">Browse by Category</h2>
              </div>
              <p className="text-sm text-muted-foreground">Jump straight to what you need</p>
            </div>
          </div>

          {categories && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {categories.map((category) => (
                <Link key={category.id} href={`/products?categoryId=${category.id}`}>
                  <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold text-sm text-foreground leading-tight">
                          {category.name}
                        </h3>
                        <Package className="h-4 w-4 text-primary shrink-0" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {category.productCount.toLocaleString()} products
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Shop by Brand */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-bold text-foreground">Shop by Brand</h2>
              </div>
              <p className="text-sm text-muted-foreground">Popular device manufacturers</p>
            </div>
            <Link href="/products">
              <Button variant="outline" className="gap-2" data-testid="button-view-all-brands">
                All Brands
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {topBrands.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {topBrands.map((brand) => (
                <Link key={brand.id} href={`/products?brandId=${brand.id}`}>
                  <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer">
                    <CardContent className="p-4 text-center">
                      <p className="font-semibold text-sm text-foreground mb-1">
                        {brand.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {brand.models.length} {brand.models.length === 1 ? 'model' : 'models'}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Featured Products */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Popular This Week</h2>
              <p className="text-sm text-muted-foreground mt-1">Best-selling parts at your group pricing</p>
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
      </main>
    </div>
  );
}
