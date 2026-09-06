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
import { Label } from '@/components/ui/label';
import { ShoppingCart, CheckCircle, Package, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useRef, useState } from 'react';
import { useGetCart, useListCustomerAddresses, useCreateOrder, getListCustomerAddressesQueryKey, getGetCartQueryKey, getListOrdersQueryKey, getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';

const checkoutSchema = z.object({
  shippingAddress: z.string().trim().min(1, 'Shipping address is required').max(2000, 'Use at most 2,000 characters'),
  notes: z.string().optional(),
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

export default function Checkout() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: cart, isLoading: cartLoading } = useGetCart({
    query: {
      queryKey: getGetCartQueryKey(),
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      refetchInterval: 30000,
    },
  });
  const addressesQuery = useListCustomerAddresses({
    query: { queryKey: getListCustomerAddressesQueryKey(), staleTime: 0, refetchOnWindowFocus: true },
  });
  const [selectedAddress, setSelectedAddress] = useState('new');
  const addressInitialized = useRef(false);
  const newAddressDraft = useRef('');
  const createOrder = useCreateOrder();
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [placedOrderNumber, setPlacedOrderNumber] = useState('');
  const hasStockIssues = cart?.items.some((item) => item.quantity > item.stock) ?? false;

  const form = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      shippingAddress: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (addressInitialized.current || !addressesQuery.data) return;
    addressInitialized.current = true;
    const defaultAddress = addressesQuery.data.find((address) => address.isDefault);
    if (defaultAddress) {
      setSelectedAddress(String(defaultAddress.id));
      form.setValue('shippingAddress', defaultAddress.shippingAddress);
    }
  }, [addressesQuery.data, form]);

  // Keep the submitted text identical to the displayed selection. A deleted
  // selection becomes a one-time address; never discard a buyer's draft.
  useEffect(() => {
    if (selectedAddress === 'new' || !addressesQuery.data) return;
    const address = addressesQuery.data.find((item) => String(item.id) === selectedAddress);
    if (address) {
      form.setValue('shippingAddress', address.shippingAddress);
    } else {
      newAddressDraft.current = form.getValues('shippingAddress');
      setSelectedAddress('new');
      toast({ title: 'Saved address removed', description: 'Review the address below. It will be used for this order only.' });
    }
  }, [addressesQuery.data, selectedAddress, form, toast]);

  function selectAddress(value: string) {
    addressInitialized.current = true;
    if (selectedAddress === 'new') newAddressDraft.current = form.getValues('shippingAddress');
    const address = addressesQuery.data?.find((item) => String(item.id) === value);
    setSelectedAddress(value);
    form.setValue('shippingAddress', address?.shippingAddress ?? newAddressDraft.current, { shouldValidate: true });
  }

  const onSubmit = (data: CheckoutForm) => {
    if (hasStockIssues || createOrder.isPending || addressesQuery.isPending) return;

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

        {hasStockIssues && (
          <Card
            className="mb-6 border-destructive/50 bg-destructive/5"
            role="alert"
            id="checkout-stock-warning"
            data-testid="banner-stock-warning"
          >
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-semibold text-foreground">
                  Some items exceed available stock
                </p>
                <p className="text-muted-foreground">
                  Stock has changed. Adjust quantities or remove sold-out items before placing your order.
                </p>
                <Link
                  href="/cart"
                  className="mt-2 inline-block font-medium text-destructive underline underline-offset-4"
                  data-testid="link-fix-cart-stock"
                >
                  Back to Cart to fix stock issues
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Shipping Information</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="saved-shipping-address">Delivery Location</Label>
                      <select
                        id="saved-shipping-address"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={selectedAddress}
                        onChange={(event) => selectAddress(event.target.value)}
                        disabled={addressesQuery.isPending || createOrder.isPending}
                        data-testid="select-shipping-address"
                      >
                        {addressesQuery.data?.map((address) => (
                          <option key={address.id} value={String(address.id)}>{address.label}{address.isDefault ? ' (Default)' : ''}</option>
                        ))}
                        <option value="new">New address — for this order</option>
                      </select>
                      {addressesQuery.isPending && <p role="status" className="text-sm text-muted-foreground">Loading saved addresses...</p>}
                      {addressesQuery.isError && (
                        <div role="alert" className="text-sm text-destructive">
                          Could not load saved addresses. Enter an address for this order or{' '}
                          <button type="button" className="underline" disabled={addressesQuery.isFetching} onClick={() => addressesQuery.refetch()}>retry</button>.
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {selectedAddress === 'new' ? 'This address will only be used for this order. ' : 'To use a different one-time address, choose “New address”. '}
                        <Link href="/account" className="text-primary underline">Manage saved addresses</Link>
                      </p>
                    </div>
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
                              maxLength={2000}
                              readOnly={selectedAddress !== 'new'}
                              disabled={addressesQuery.isPending || createOrder.isPending}
                              onChange={(event) => {
                                addressInitialized.current = true;
                                field.onChange(event);
                              }}
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
                        disabled={createOrder.isPending || addressesQuery.isPending || hasStockIssues}
                        aria-describedby={hasStockIssues ? 'checkout-stock-warning' : undefined}
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
                    <div key={item.id} className="text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">
                          {item.name} × {item.quantity}
                        </span>
                        <span className="font-medium">${item.lineTotal.toFixed(2)}</span>
                      </div>
                      {item.quantity > item.stock && (
                        <p
                          className="mt-1 text-xs font-medium text-destructive flex items-center gap-1"
                          data-testid={`warning-stock-${item.id}`}
                        >
                          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {item.stock <= 0 ? 'Sold out' : `Only ${item.stock} left`}
                        </p>
                      )}
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
