import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAdminListOrders,
  getAdminListOrdersQueryKey,
  useAdminUpdateOrderStatus,
} from '@workspace/api-client-react';
import type { AdminOrder } from '@workspace/api-client-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ShoppingBag, ChevronRight } from 'lucide-react';

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  processing: 'outline',
  shipped: 'secondary',
  delivered: 'default',
};

const STATUS_OPTIONS = [
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
];

export default function AdminOrders() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: orders, isLoading } = useAdminListOrders();
  const updateStatus = useAdminUpdateOrderStatus();

  const handleStatusChange = (orderId: number, orderNumber: string, newStatus: string) => {
    updateStatus.mutate(
      {
        id: orderId,
        data: { status: newStatus as 'processing' | 'shipped' | 'delivered' },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });
          toast({
            title: 'Order updated',
            description: `${orderNumber} marked as ${newStatus}.`,
          });
        },
        onError: (error: any) => {
          toast({
            title: 'Failed to update order',
            description: error?.error || 'An error occurred',
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fulfill orders and update shipping status
          </p>
        </div>

        {/* Table */}
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-center">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-48">Update Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Loading orders...
                  </TableCell>
                </TableRow>
              ) : !orders || orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <ShoppingBag className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">No orders found</p>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order, idx) => (
                  <TableRow
                    key={order.id}
                    className="hover:bg-muted/50 transition-colors"
                    style={{ animationDelay: `${idx * 20}ms` }}
                    data-testid={`row-order-${order.id}`}
                  >
                    <TableCell className="font-mono text-sm font-medium">{order.orderNumber}</TableCell>
                    <TableCell className="font-medium">{order.companyName}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {order.itemCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      ${order.total.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[order.status] || 'outline'} className="capitalize">
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={order.status}
                        onValueChange={(newStatus) => handleStatusChange(order.id, order.orderNumber, newStatus)}
                      >
                        <SelectTrigger
                          className="h-8 text-xs"
                          data-testid={`select-status-${order.id}`}
                        >
                          <SelectValue />
                          <ChevronRight className="h-3 w-3 opacity-50 ml-1" />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary Stats */}
        {orders && orders.length > 0 && (
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Orders</p>
              <p className="text-2xl font-semibold mt-1">{orders.length}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Processing</p>
              <p className="text-2xl font-semibold mt-1">
                {orders.filter((o) => o.status === 'processing').length}
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Shipped</p>
              <p className="text-2xl font-semibold mt-1">
                {orders.filter((o) => o.status === 'shipped').length}
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delivered</p>
              <p className="text-2xl font-semibold mt-1">
                {orders.filter((o) => o.status === 'delivered').length}
              </p>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
