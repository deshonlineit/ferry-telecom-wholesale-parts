import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useGetProduct, useAddCartItem, getGetCartQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, Package, Plus, Check, Award } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ProductDetail() {
  const params = useParams();
  const productId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const { data: product, isLoading } = useGetProduct(productId, {
    query: {
      enabled: !!productId,
      queryKey: ['product', productId] as any,
    },
  });
  const addToCart = useAddCartItem();

  const handleAddToCart = () => {
    addToCart.mutate(
      { data: { productId, quantity } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
          setJustAdded(true);
          setTimeout(() => setJustAdded(false), 1500);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <Skeleton className="h-10 w-32 mb-6" />
          <div className="grid md:grid-cols-2 gap-8">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Product not found</h2>
              <p className="text-muted-foreground mb-6">The product you're looking for doesn't exist</p>
              <Link href="/products">
                <Button data-testid="button-back-to-products">Back to Products</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const savings = product.listPrice - product.yourPrice;
  const savingsPercent = ((savings / product.listPrice) * 100).toFixed(0);
  const inStock = product.stock > 0;
  const currentTier = product.tierPrices.find((t) => t.isCurrent);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <Link href="/products">
          <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
            <ChevronLeft className="h-4 w-4" />
            Back to Products
          </Button>
        </Link>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Image */}
          <div className="aspect-square bg-muted rounded-lg border border-card-border flex items-center justify-center overflow-hidden">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Package className="h-32 w-32 text-muted-foreground/30" />
            )}
          </div>

          {/* Details */}
          <div className="space-y-6">
            <div>
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="text-3xl font-bold text-foreground">{product.name}</h1>
                <Badge variant={inStock ? 'default' : 'secondary'} className="shrink-0">
                  {inStock ? `${product.stock} in stock` : 'Out of stock'}
                </Badge>
              </div>
              <p className="text-sm font-mono text-muted-foreground">SKU: {product.sku}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{product.categoryName}</Badge>
              <Badge variant="outline">{product.brandName}</Badge>
              {product.modelName && <Badge variant="outline">{product.modelName}</Badge>}
              <Badge variant="outline">{product.quality}</Badge>
            </div>

            {product.description && (
              <p className="text-muted-foreground leading-relaxed">{product.description}</p>
            )}

            {/* Pricing */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold text-foreground">
                    ${product.yourPrice.toFixed(2)}
                  </span>
                  {savings > 0 && (
                    <span className="text-lg text-muted-foreground line-through">
                      ${product.listPrice.toFixed(2)}
                    </span>
                  )}
                </div>
                {savings > 0 && currentTier && (
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                    <p className="text-sm font-semibold text-foreground">
                      {currentTier.tierName} pricing saves you ${savings.toFixed(2)} ({savingsPercent}%)
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Your tier-discounted price</p>
              </CardContent>
            </Card>

            {/* Add to Cart */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-foreground">Quantity</label>
                <Input
                  type="number"
                  min="1"
                  max={product.stock}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24"
                  disabled={!inStock}
                  data-testid="input-quantity"
                />
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <span className="text-sm font-medium text-transparent">_</span>
                <Button
                  onClick={handleAddToCart}
                  disabled={!inStock || addToCart.isPending}
                  size="lg"
                  className={`w-full gap-2 ${justAdded ? 'animate-cart-add' : ''}`}
                  data-testid="button-add-to-cart"
                >
                  {justAdded ? (
                    <>
                      <Check className="h-5 w-5" />
                      Added to Cart
                    </>
                  ) : (
                    <>
                      <Plus className="h-5 w-5" />
                      Add to Cart
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Tier Pricing Table */}
        {product.tierPrices.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pricing by Tier</CardTitle>
              <p className="text-sm text-muted-foreground">
                See what you could save at different membership tiers
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tier</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Savings vs. List</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.tierPrices.map((tier) => {
                    const tierSavings = product.listPrice - tier.price;
                    const tierSavingsPercent = ((tierSavings / product.listPrice) * 100).toFixed(0);
                    return (
                      <TableRow key={tier.tierId} className={tier.isCurrent ? 'bg-primary/5' : ''}>
                        <TableCell className="font-medium">
                          {tier.tierName}
                          {tier.isCurrent && (
                            <Badge variant="outline" className="ml-2">
                              Your Tier
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold text-lg">
                          ${tier.price.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {tierSavings > 0 ? (
                            <span className="text-amber-600 dark:text-amber-500 font-medium">
                              ${tierSavings.toFixed(2)} ({tierSavingsPercent}%)
                            </span>
                          ) : (
                            <span className="text-muted-foreground">List price</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {tier.isCurrent && (
                            <Award className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Specifications */}
        {product.specs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                {product.specs.map((spec, i) => (
                  <div key={i} className="flex justify-between gap-4 py-2 border-b border-border last:border-0">
                    <span className="text-sm font-medium text-muted-foreground">{spec.label}</span>
                    <span className="text-sm text-foreground font-medium text-right">{spec.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
