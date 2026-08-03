import { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useListProducts, useListCategories, useListBrands, useAddCartItem, getGetCartQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { ProductsSidebar } from '@/components/products/ProductsSidebar';
import { ProductListRow } from '@/components/products/ProductListRow';
import { ModelQuickPicker } from '@/components/products/ModelQuickPicker';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Search, Package, ChevronLeft, ChevronRight, Menu, X, ChevronRight as Chevron } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Products() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // URL is the single source of truth for all filter state
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const search = params.get('search') || '';
  const categoryId = params.get('categoryId') ? Number(params.get('categoryId')) : undefined;
  const brandId = params.get('brandId') ? Number(params.get('brandId')) : undefined;
  const modelId = params.get('modelId') ? Number(params.get('modelId')) : undefined;
  const quality = params.get('quality') || undefined;
  const inStockOnly = params.get('inStockOnly') === 'true';
  const sort = params.get('sort') || 'name';
  const page = Number(params.get('page')) || 1;

  // Local state only for the search input (kept in sync with the URL)
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const updateParams = (
    patch: Record<string, string | undefined>,
    opts?: { replace?: boolean }
  ) => {
    const next = new URLSearchParams(searchString);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    // Any filter change resets pagination unless page is set explicitly
    if (!('page' in patch)) next.delete('page');
    const qs = next.toString();
    navigate(qs ? `/products?${qs}` : '/products', { replace: opts?.replace });
  };

  const setCategoryId = (id: number | undefined) => updateParams({ categoryId: id ? String(id) : undefined });
  const setBrandId = (id: number | undefined) =>
    updateParams({ brandId: id ? String(id) : undefined, modelId: undefined });
  const setModel = (id: number | undefined, parentBrandId?: number) =>
    updateParams({
      modelId: id ? String(id) : undefined,
      brandId: id && parentBrandId ? String(parentBrandId) : params.get('brandId') || undefined,
    });
  const setQuality = (q: string | undefined) => updateParams({ quality: q });
  const setInStockOnly = (v: boolean) => updateParams({ inStockOnly: v ? 'true' : undefined });
  const setSort = (s: string) => updateParams({ sort: s === 'name' ? undefined : s });
  const setPage = (p: number) => updateParams({ page: p > 1 ? String(p) : undefined });
  const setSearch = (value: string) => {
    setSearchInput(value);
    updateParams({ search: value || undefined }, { replace: true });
  };

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
    pageSize: 50,
  });
  const addToCart = useAddCartItem();

  const selectedCategory = categories?.find((c) => c.id === categoryId);
  const selectedBrand = brands?.find((b) => b.id === brandId);
  const selectedModel = selectedBrand?.models.find((m) => m.id === modelId);

  const activeFilters = [
    { key: 'category', value: categoryId, label: selectedCategory?.name },
    { key: 'brand', value: brandId, label: selectedBrand?.name },
    { key: 'model', value: modelId, label: selectedModel?.name },
    { key: 'quality', value: quality, label: quality },
    { key: 'stock', value: inStockOnly, label: 'In Stock' },
  ].filter((f) => f.value);

  const clearFilter = (key: string) => {
    if (key === 'category') updateParams({ categoryId: undefined });
    if (key === 'brand') updateParams({ brandId: undefined, modelId: undefined });
    if (key === 'model') updateParams({ modelId: undefined });
    if (key === 'quality') updateParams({ quality: undefined });
    if (key === 'stock') updateParams({ inStockOnly: undefined });
  };

  const clearAllFilters = () =>
    updateParams({
      categoryId: undefined,
      brandId: undefined,
      modelId: undefined,
      quality: undefined,
      inStockOnly: undefined,
    });

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

  const breadcrumb = [
    selectedCategory?.name,
    selectedBrand?.name,
    selectedModel?.name,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="flex">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <ProductsSidebar
            categoryId={categoryId}
            brandId={brandId}
            modelId={modelId}
            quality={quality}
            inStockOnly={inStockOnly}
            onCategoryChange={setCategoryId}
            onBrandChange={setBrandId}
            onModelChange={setModel}
            onQualityChange={setQuality}
            onInStockChange={setInStockOnly}
          />
        </div>

        {/* Main Content */}
        <main className="flex-1 container mx-auto px-4 py-6">
          {/* Toolbar */}
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            {/* Mobile Sidebar Toggle */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden gap-2">
                  <Menu className="h-4 w-4" />
                  Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72">
                <ProductsSidebar
                  categoryId={categoryId}
                  brandId={brandId}
                  modelId={modelId}
                  quality={quality}
                  inStockOnly={inStockOnly}
                  onCategoryChange={(id) => { setCategoryId(id); setSidebarOpen(false); }}
                  onBrandChange={setBrandId}
                  onModelChange={(id, pBrandId) => { setModel(id, pBrandId); setSidebarOpen(false); }}
                  onQualityChange={(q) => { setQuality(q); setSidebarOpen(false); }}
                  onInStockChange={(stock) => { setInStockOnly(stock); setSidebarOpen(false); }}
                />
              </SheetContent>
            </Sheet>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by name, SKU, or model..."
                value={searchInput}
                onChange={(e) => setSearch(e.target.value)}
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
                <SelectItem value="stockDesc">Stock: High to Low</SelectItem>
                <SelectItem value="stockAsc">Stock: Low to High</SelectItem>
                <SelectItem value="newest">Newest First</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Breadcrumb + Active Filters */}
          {(breadcrumb.length > 0 || activeFilters.length > 0) && (
            <div className="mb-4 space-y-2">
              {breadcrumb.length > 0 && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  {breadcrumb.map((crumb, i) => (
                    <div key={i} className="flex items-center gap-1">
                      {i > 0 && <Chevron className="h-3 w-3" />}
                      <span className={i === breadcrumb.length - 1 ? 'text-foreground font-medium' : ''}>
                        {crumb}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 items-center">
                {activeFilters.map((filter) => (
                  <Badge
                    key={filter.key}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {filter.label}
                    <button
                      onClick={() => clearFilter(filter.key)}
                      className="hover:bg-background/50 rounded-full p-0.5"
                      data-testid={`remove-filter-${filter.key}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {activeFilters.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="h-6 text-xs"
                    data-testid="button-clear-all"
                  >
                    Clear all
                  </Button>
                )}
              </div>
            </div>
          )}

          <ModelQuickPicker
            categoryId={categoryId}
            brandId={brandId}
            modelId={modelId}
            onModelChange={setModel}
            onBrandChange={setBrandId}
          />

          {/* Results */}
          {isLoading ? (
            <Card>
              <CardContent className="p-0">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 border-b border-border last:border-0">
                    <Skeleton className="h-14 w-14 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-28" />
                    <Skeleton className="h-9 w-44" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : productsPage && productsPage.items.length > 0 ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, productsPage.total)} of {productsPage.total.toLocaleString()} products
                </p>
              </div>

              <Card className="mb-8">
                <CardContent className="p-0">
                  {productsPage.items.map((product) => (
                    <ProductListRow
                      key={product.id}
                      product={product}
                      onAddToCart={handleAddToCart}
                      isAdding={addToCart.isPending}
                    />
                  ))}
                </CardContent>
              </Card>

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
                <Button onClick={clearAllFilters} variant="outline" data-testid="button-clear-all-empty">
                  Clear All Filters
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
