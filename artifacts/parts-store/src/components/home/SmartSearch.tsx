import { useState, useRef } from 'react';
import { Link } from 'wouter';
import { useSmartSearch, getSmartSearchQueryKey, useAddCartItem, getGetCartQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/use-debounce';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Sparkles, ArrowRight, Package, Plus, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function SmartSearch() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const debouncedQuery = useDebounce(query, 300);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results, isLoading } = useSmartSearch(
    { q: debouncedQuery },
    {
      query: {
        enabled: debouncedQuery.trim().length > 0,
        queryKey: getSmartSearchQueryKey({ q: debouncedQuery }),
      },
    }
  );

  const addToCart = useAddCartItem();

  const handleAddToCart = (productId: number) => {
    addToCart.mutate(
      { data: { productId, quantity: 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
          setJustAdded(productId);
          setTimeout(() => setJustAdded(null), 1500);
          toast({
            title: 'Added to cart',
            description: '1 item added successfully',
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

  const buildProductsUrl = () => {
    const params = new URLSearchParams();
    const interp = results?.interpretation;
    if (interp?.categoryId) params.set('categoryId', String(interp.categoryId));
    if (interp?.brandId) params.set('brandId', String(interp.brandId));
    if (interp?.modelId) params.set('modelId', String(interp.modelId));
    // When nothing (or only part of the query) was interpreted, carry the raw
    // text so the full results page still reflects the user's search intent.
    if (!interp || interp.matchedTerms.length === 0) {
      const q = debouncedQuery.trim();
      if (q) params.set('search', q);
    }
    const qs = params.toString();
    return qs ? `/products?${qs}` : '/products';
  };

  const showResults = debouncedQuery.trim().length > 0 && (isLoading || results);
  const hasInterpretation = results?.interpretation && results.interpretation.matchedTerms.length > 0;

  return (
    <div className="relative max-w-4xl mx-auto">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="search"
          placeholder='Try "iPhone 13 screen" or "A52 display"...'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-14 pl-12 pr-4 text-lg border-2 border-primary/20 focus:border-primary shadow-lg"
          data-testid="input-smart-search"
        />
      </div>

      {showResults && (
        <Card className="absolute top-full left-0 right-0 mt-2 shadow-xl border-2 border-primary/20 max-h-[600px] overflow-y-auto z-50">
          {isLoading ? (
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-sm text-muted-foreground">Understanding your search...</span>
              </div>
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-16 w-16 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          ) : results && results.products.length > 0 ? (
            <CardContent className="p-0">
              {hasInterpretation && (
                <div className="p-4 border-b border-border bg-primary/5">
                  <div className="flex items-start gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground mb-1">Smart match:</p>
                      <div className="flex flex-wrap gap-2">
                        {results.interpretation.modelName && (
                          <Badge variant="default" className="font-medium">
                            {results.interpretation.brandName} {results.interpretation.modelName}
                          </Badge>
                        )}
                        {results.interpretation.categoryName && (
                          <Badge variant="outline" className="font-medium">
                            {results.interpretation.categoryName}
                          </Badge>
                        )}
                        {results.interpretation.matchedTerms.map((term, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {term}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-foreground">
                    {results.total} {results.total === 1 ? 'result' : 'results'} found
                  </p>
                  <Link href={buildProductsUrl()}>
                    <Button variant="ghost" size="sm" className="gap-1" data-testid="button-see-all">
                      See all
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>

                {results.products.slice(0, 5).map((product) => {
                  const savings = product.listPrice - product.yourPrice;
                  const inStock = product.stock > 0;
                  const wasJustAdded = justAdded === product.id;

                  return (
                    <div
                      key={product.id}
                      className="flex gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                    >
                      <Link href={`/products/${product.id}`} className="shrink-0">
                        <div className="w-16 h-16 bg-muted rounded flex items-center justify-center overflow-hidden border border-card-border">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="h-6 w-6 text-muted-foreground/30" />
                          )}
                        </div>
                      </Link>

                      <div className="flex-1 min-w-0">
                        <Link href={`/products/${product.id}`}>
                          <h4 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-1">
                            {product.name}
                          </h4>
                        </Link>
                        <p className="text-xs font-mono text-muted-foreground">{product.sku}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-base font-bold text-foreground">
                            ${product.yourPrice.toFixed(2)}
                          </span>
                          {savings > 0 && (
                            <span className="text-xs text-amber-600 dark:text-amber-500 font-medium">
                              Save ${savings.toFixed(2)}
                            </span>
                          )}
                          {inStock && (
                            <Badge variant="outline" className="text-xs ml-auto">
                              {product.stock} in stock
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center">
                        <Button
                          size="sm"
                          onClick={() => handleAddToCart(product.id)}
                          disabled={!inStock || addToCart.isPending}
                          className={`gap-1.5 ${wasJustAdded ? 'animate-cart-add' : ''}`}
                          data-testid={`button-quick-add-${product.id}`}
                        >
                          {wasJustAdded ? (
                            <>
                              <Check className="h-3 w-3" />
                              Added
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3" />
                              Add
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {results.total > 5 && (
                <div className="p-4 border-t border-border bg-muted/30">
                  <Link href={buildProductsUrl()}>
                    <Button variant="outline" className="w-full gap-2" data-testid="button-view-all-results">
                      View all {results.total} results
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          ) : (
            <CardContent className="p-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No matches found for "{debouncedQuery}"</p>
              <Link href="/products">
                <Button variant="link" className="mt-2" data-testid="button-browse-all">
                  Browse all products
                </Button>
              </Link>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
