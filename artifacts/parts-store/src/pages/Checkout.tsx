import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { ShoppingCart, CheckCircle, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';
import { useGetCart, useGetCurrentCustomer, useCreateOrder, getGetCartQueryKey, getListOrdersQueryKey, getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';

const checkoutSchema = z.object({
  shippingAddress: z.string().min(1, 'Shipping address is required'),
  notes: z.string().optional(),
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

export default function Checkout() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: cart, isLoading: cartLoading } = useGetCart();
  const { data: customer } = useGetCurrentCustomer();
  const createOrder = useCreateOrder();
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [placedOrderNumber, setPlacedOrderNumber] = useState('');

  const form = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      shippingAddress: '',
      notes: '',
    },
  });

  // Pre-fill the saved default shipping address once it loads,
  // without clobbering anything the user has already typed.
  useEffect(() => {
    if (customer?.defaultShippingAddress && !form.getValues('shippingAddress')) {
      form.setValue('shippingAddress', customer.defaultShippingAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.defaultShippingAddress]);

  const onSubmit = (data: CheckoutForm) => {
    createOrder.mutate(
      {
        data: {
          shippingAddress: data.shippingAddress,
          notes: data.notes || undefined,
        },
      },
      {
        onSuccess: (order) => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setPlacedOrderNumber(order.orderNumber);
          setOrderPlaced(true);
        },
        onError: (error: unknown) => {
          const data = (error as { data?: { code?: string; error?: string } } | null)?.data;
          if (data?.code === 'OUT_OF_STOCK') {
            // Stock ran out between adding to cart and paying: refresh the
            // cart and send the buyer back to review it.
            queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
            toast({
              title: 'Item just sold out / Artikel net uitverkocht',
              description:
                data.error ??
                'An item in your cart sold out while you were checking out. Please review your cart. / Een artikel in uw winkelwagen is zojuist uitverkocht. Controleer uw winkelwagen.',
              variant: 'destructive',
            });
            setLocation('/cart');
            return;
          }
          toast({
            title: 'Order failed',
            description:
              (data?.error) ||
              'There was an error placing your order. Please try again.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  if (cartLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <p className="text-center text-muted-foreground">Loading...</p>
        </main>
      </div>
    );
  }

  const isEmpty = !cart || cart.items.length === 0;

  if (isEmpty && !orderPlaced) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <Card>
            <CardContent className="p-12 text-center">
              <ShoppingCart className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Your cart is empty</h2>
              <p className="text-muted-foreground mb-6">Add products before checking out</p>
              <Link href="/products">
                <Button className="gap-2" data-testid="button-browse-products">
                  <Package className="h-4 w-4" />
                  Browse Products
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="p-12 text-center">
              <CheckCircle className="h-20 w-20 text-green-600 dark:text-green-500 mx-auto mb-6" />
              <h1 className="text-3xl font-bold text-foreground mb-2">Order Confirmed!</h1>
              <p className="text-lg text-muted-foreground mb-1">
                Your order has been placed successfully
              </p>
              <p className="text-sm font-mono text-muted-foreground mb-8">
                Order #{placedOrderNumber}
              </p>
              <div className="space-y-3">
                <Link href="/orders">
                  <Button size="lg" className="w-full" data-testid="button-view-orders">
                    View Your Orders
                  </Button>
                </Link>
                <Link href="/products">
                  <Button size="lg" variant="outline" className="w-full" data-testid="button-continue-shopping">
                    Continue Shopping
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold text-foreground mb-6">Checkout</h1>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Shipping Information</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="shippingAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shipping Address *</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter your full shipping address..."
                              className="min-h-32"
                              data-testid="input-shipping-address"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Order Notes (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Any special instructions or notes..."
                              className="min-h-24"
                              data-testid="input-notes"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-3">
                      <Link href="/cart" className="flex-1">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          data-testid="button-back-to-cart"
                        >
                          Back to Cart
                        </Button>
                      </Link>
                      <Button
                        type="submit"
                        disabled={createOrder.isPending}
                        className="flex-1"
                        data-testid="button-place-order"
                      >
                        {createOrder.isPending ? 'Placing Order...' : 'Place Order'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
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
                    <span className="text-muted-foreground">Items ({cart?.itemCount || 0})</span>
                    <span className="font-medium">${cart?.subtotal.toFixed(2) || '0.00'}</span>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>${cart?.subtotal.toFixed(2) || '0.00'}</span>
                  </div>
                </div>

                <div className="border-t border-border pt-4 space-y-2">
                  {cart?.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {item.name} × {item.quantity}
                      </span>
                      <span className="font-medium">${item.lineTotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
