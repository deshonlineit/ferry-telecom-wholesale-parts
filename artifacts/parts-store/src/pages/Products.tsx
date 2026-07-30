import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useListProducts, useListCategories, useListBrands, useAddCartItem, getGetCartQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { ProductCard } from '@/components/products/ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, X, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Products() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Parse URL params
  const searchParams = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [categoryId, setCategoryId] = useState<number | undefined>(
    searchParams.get('categoryId') ? Number(searchParams.get('categoryId')) : undefined
  );
  const [brandId, setBrandId] = useState<number | undefined>(
    searchParams.get('brandId') ? Number(searchParams.get('brandId')) : undefined
  );
  const [modelId, setModelId] = useState<number | undefined>(
    searchParams.get('modelId') ? Number(searchParams.get('modelId')) : undefined
  );
  const [quality, setQuality] = useState<string | undefined>(searchParams.get('quality') || undefined);
  const [inStockOnly, setInStockOnly] = useState(searchParams.get('inStockOnly') === 'true');
  const [sort, setSort] = useState(searchParams.get('sort') || 'name');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);

  const { data: categories } = useListCategories();
  const { data: brands } = useListBrands();
  const { data: productsPage, isLoading } = useListProducts({
    search: search || undefined,
    categoryId,
    brandId,
    modelId,
    quality,
    inStockOnly: inStockOnly || undefined,
    sort: sort as any,
    page,
    pageSize: 24,
  });
  const addToCart = useAddCartItem();

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (categoryId) params.set('categoryId', String(categoryId));
    if (brandId) params.set('brandId', String(brandId));
    if (modelId) params.set('modelId', String(modelId));
    if (quality) params.set('quality', quality);
    if (inStockOnly) params.set('inStockOnly', 'true');
    if (sort !== 'name') params.set('sort', sort);
    if (page > 1) params.set('page', String(page));

    const newUrl = params.toString() ? `/products?${params.toString()}` : '/products';
    if (newUrl !== location) {
      window.history.replaceState({}, '', newUrl);
    }
  }, [search, categoryId, brandId, modelId, quality, inStockOnly, sort, page]);

  const selectedBrand = brands?.find((b) => b.id === brandId);
  const models = selectedBrand?.models || [];

  const activeFiltersCount = [categoryId, brandId, modelId, quality, inStockOnly].filter(Boolean).length;

  const clearFilters = () => {
    setCategoryId(undefined);
    setBrandId(undefined);
    setModelId(undefined);
    setQuality(undefined);
    setInStockOnly(false);
    setPage(1);
  };

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

      <main className="container mx-auto px-4 py-6">
        {/* Search & Filters */}
        <div className="space-y-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by name, SKU, or model..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v)}>
              <SelectTrigger className="w-full md:w-48" data-testid="select-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="priceAsc">Price: Low to High</SelectItem>
                <SelectItem value="priceDesc">Price: High to Low</SelectItem>
                <SelectItem value="newest">Newest First</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-3">
            <Select
              value={categoryId ? String(categoryId) : 'all'}
              onValueChange={(v) => {
                setCategoryId(v === 'all' ? undefined : Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48" data-testid="select-category">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    {cat.name} ({cat.productCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={brandId ? String(brandId) : 'all'}
              onValueChange={(v) => {
                setBrandId(v === 'all' ? undefined : Number(v));
                setModelId(undefined);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48" data-testid="select-brand">
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands?.map((brand) => (
                  <SelectItem key={brand.id} value={String(brand.id)}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {brandId && models.length > 0 && (
              <Select
                value={modelId ? String(modelId) : 'all'}
                onValueChange={(v) => {
                  setModelId(v === 'all' ? undefined : Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-48" data-testid="select-model">
                  <SelectValue placeholder="All Models" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={String(model.id)}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select
              value={quality || 'all'}
              onValueChange={(v) => {
                setQuality(v === 'all' ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48" data-testid="select-quality">
                <SelectValue placeholder="All Quality Grades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Quality Grades</SelectItem>
                <SelectItem value="OEM Original">OEM Original</SelectItem>
                <SelectItem value="OEM Pulled">OEM Pulled</SelectItem>
                <SelectItem value="Aftermarket Premium">Aftermarket Premium</SelectItem>
                <SelectItem value="Aftermarket Standard">Aftermarket Standard</SelectItem>
                <SelectItem value="Refurbished A">Refurbished A</SelectItem>
                <SelectItem value="Refurbished B">Refurbished B</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={inStockOnly ? 'default' : 'outline'}
              onClick={() => {
                setInStockOnly(!inStockOnly);
                setPage(1);
              }}
              className="gap-2"
              data-testid="button-in-stock"
            >
              <Filter className="h-4 w-4" />
              In Stock Only
            </Button>

            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                onClick={clearFilters}
                className="gap-2"
                data-testid="button-clear-filters"
              >
                <X className="h-4 w-4" />
                Clear Filters
                <Badge variant="secondary" className="ml-1">
                  {activeFiltersCount}
                </Badge>
              </Button>
            )}
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(24)].map((_, i) => (
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
        ) : productsPage && productsPage.items.length > 0 ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * 24) + 1}–{Math.min(page * 24, productsPage.total)} of {productsPage.total.toLocaleString()} products
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
              {productsPage.items.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                  isAdding={addToCart.isPending}
                />
              ))}
            </div>

            {/* Pagination */}
            {productsPage.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="gap-1"
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {[...Array(Math.min(5, productsPage.totalPages))].map((_, i) => {
                    let pageNum = i + 1;
                    if (productsPage.totalPages > 5) {
                      if (page > 3) pageNum = page - 2 + i;
                      if (page > productsPage.totalPages - 3) pageNum = productsPage.totalPages - 4 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? 'default' : 'outline'}
                        onClick={() => setPage(pageNum)}
                        className="w-10"
                        data-testid={`button-page-${pageNum}`}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  onClick={() => setPage(page + 1)}
                  disabled={page === productsPage.totalPages}
                  className="gap-1"
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No products found</h3>
              <p className="text-muted-foreground mb-4">
                Try adjusting your filters or search terms
              </p>
              <Button onClick={clearFilters} variant="outline" data-testid="button-clear-all">
                Clear All Filters
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
