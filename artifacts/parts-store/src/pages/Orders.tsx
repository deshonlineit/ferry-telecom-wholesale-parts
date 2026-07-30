import { Link } from 'wouter';
import { useListOrders } from '@workspace/api-client-react';
import { Header } from '@/components/layout/Header';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, ChevronRight, ShoppingBag } from 'lucide-react';
import { format } from 'date-fns';

export default function Orders() {
  const { data: orders, isLoading } = useListOrders();

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

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Order History</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View and track all your orders
            </p>
          </div>
          <Link href="/products">
            <Button className="gap-2" data-testid="button-shop-again">
              <ShoppingBag className="h-4 w-4" />
              Shop Again
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="mb-4 last:mb-0">
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : orders && orders.length > 0 ? (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <Link href={`/orders/${order.id}`}>
                        <span className="font-mono font-semibold text-foreground hover:text-primary transition-colors">
                          {order.orderNumber}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(order.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{order.itemCount} items</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-lg">${order.total.toFixed(2)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(order.status)}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/orders/${order.id}`}>
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`button-view-order-${order.id}`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">No orders yet</h2>
              <p className="text-muted-foreground mb-6">Start shopping to see your orders here</p>
              <Link href="/products">
                <Button className="gap-2" data-testid="button-start-shopping">
                  <ShoppingBag className="h-4 w-4" />
                  Start Shopping
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
