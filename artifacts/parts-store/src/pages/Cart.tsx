import { Link } from 'wouter';
import { useGetCart, useUpdateCartItem, useRemoveCartItem, useClearCart, getGetCartQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShoppingCart, Trash2, Package, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Cart() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: cart, isLoading } = useGetCart();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const clearCart = useClearCart();

  const handleUpdateQuantity = (itemId: number, newQuantity: number, stock: number) => {
    if (newQuantity < 1 || newQuantity > stock) return;
    updateItem.mutate(
      { id: itemId, data: { quantity: newQuantity } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        },
        onError: () => {
          toast({
            title: 'Error',
            description: 'Failed to update quantity',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleRemove = (itemId: number) => {
    removeItem.mutate(
      { id: itemId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
          toast({
            title: 'Removed from cart',
            description: 'Item removed successfully',
          });
        },
        onError: () => {
          toast({
            title: 'Error',
            description: 'Failed to remove item',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleClear = () => {
    clearCart.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        toast({
          title: 'Cart cleared',
          description: 'All items removed from cart',
        });
      },
      onError: () => {
        toast({
          title: 'Error',
          description: 'Failed to clear cart',
          variant: 'destructive',
        });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <Skeleton className="h-10 w-48 mb-6" />
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-24 w-full mb-4" />
                  <Skeleton className="h-24 w-full mb-4" />
                  <Skeleton className="h-24 w-full" />
                </CardContent>
              </Card>
            </div>
            <div>
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const isEmpty = !cart || cart.items.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-foreground">Shopping Cart</h1>
          {!isEmpty && (
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={clearCart.isPending}
              className="gap-2"
              data-testid="button-clear-cart"
            >
              <Trash2 className="h-4 w-4" />
              Clear Cart
            </Button>
          )}
        </div>

        {isEmpty ? (
          <Card>
            <CardContent className="p-12 text-center">
              <ShoppingCart className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Your cart is empty</h2>
              <p className="text-muted-foreground mb-6">Add some products to get started</p>
              <Link href="/products">
                <Button className="gap-2" data-testid="button-browse-products">
                  <Package className="h-4 w-4" />
                  Browse Products
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16"></TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead className="w-32">Quantity</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="h-5 w-5 text-muted-foreground/30" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link href={`/products/${item.productId}`}>
                            <div className="hover:text-primary transition-colors">
                              <p className="font-medium text-foreground">{item.name}</p>
                              <p className="text-xs font-mono text-muted-foreground">{item.sku}</p>
                              <p className="text-xs text-muted-foreground">{item.quality}</p>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">${item.unitPrice.toFixed(2)}</span>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            max={item.stock}
                            value={item.quantity}
                            onChange={(e) =>
                              handleUpdateQuantity(
                                item.id,
                                parseInt(e.target.value) || 1,
                                item.stock
                              )
                            }
                            className="w-20"
                            data-testid={`input-quantity-${item.id}`}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.stock} available
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-bold text-lg">
                            ${item.lineTotal.toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemove(item.id)}
                            disabled={removeItem.isPending}
                            data-testid={`button-remove-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>

            <div>
              <Card className="sticky top-20">
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Items ({cart.itemCount})</span>
                      <span className="font-medium">${cart.subtotal.toFixed(2)}</span>
                    </div>
                    {cart.savings > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">List subtotal</span>
                          <span className="line-through text-muted-foreground">
                            ${cart.listSubtotal.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-amber-600 dark:text-amber-500">
                          <span className="font-semibold">Your tier savings ({cart.discountPercent}%)</span>
                          <span className="font-semibold">
                            -${cart.savings.toFixed(2)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="border-t border-border pt-4">
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total</span>
                      <span>${cart.subtotal.toFixed(2)}</span>
                    </div>
                    {cart.savings > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Includes ${cart.savings.toFixed(2)} in tier discounts
                      </p>
                    )}
                  </div>

                  <Link href="/checkout">
                    <Button className="w-full gap-2" size="lg" data-testid="button-checkout">
                      Proceed to Checkout
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>

                  <Link href="/products">
                    <Button variant="outline" className="w-full" data-testid="button-continue-shopping">
                      Continue Shopping
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
