import { useParams, Link } from 'wouter';
import { useGetOrder } from '@workspace/api-client-react';
import { Header } from '@/components/layout/Header';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, Package } from 'lucide-react';
import { format } from 'date-fns';

export default function OrderDetail() {
  const params = useParams();
  const orderId = Number(params.id);

  const { data: order, isLoading } = useGetOrder(orderId, {
    query: {
      enabled: !!orderId,
      queryKey: ['order', orderId] as any,
    },
  });

  const getStatusVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'secondary';
      case 'processing':
        return 'default';
      case 'shipped':
        return 'default';
      case 'delivered':
        return 'default';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <Skeleton className="h-10 w-48 mb-6" />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
            </div>
            <div>
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-48 w-full" />
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Order not found</h2>
              <p className="text-muted-foreground mb-6">The order you're looking for doesn't exist</p>
              <Link href="/orders">
                <Button data-testid="button-back-to-orders">Back to Orders</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <Link href="/orders">
          <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
            <ChevronLeft className="h-4 w-4" />
            Back to Orders
          </Button>
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground font-mono">{order.orderNumber}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Placed on {format(new Date(order.createdAt), 'MMMM d, yyyy')}
            </p>
          </div>
          <Badge variant={getStatusVariant(order.status)} className="text-base px-3 py-1">
            {order.status}
          </Badge>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Order Items</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-center">Quantity</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <Link href={`/products/${line.productId}`}>
                            <div className="hover:text-primary transition-colors">
                              <p className="font-medium text-foreground">{line.name}</p>
                              <p className="text-xs font-mono text-muted-foreground">{line.sku}</p>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-center">{line.quantity}</TableCell>
                        <TableCell className="text-right font-semibold">
                          ${line.unitPrice.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-lg">
                          ${line.lineTotal.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {order.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Order Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">${order.total.toFixed(2)}</span>
                  </div>
                  {order.savings > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-500">
                      <span className="font-semibold">Tier savings</span>
                      <span className="font-semibold">-${order.savings.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>${order.total.toFixed(2)}</span>
                  </div>
                  {order.savings > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Saved ${order.savings.toFixed(2)} with tier pricing
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Shipping Address</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {order.shippingAddress}
                </p>
              </CardContent>
            </Card>

            <Link href="/products">
              <Button className="w-full" data-testid="button-shop-again">
                Shop Again
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
