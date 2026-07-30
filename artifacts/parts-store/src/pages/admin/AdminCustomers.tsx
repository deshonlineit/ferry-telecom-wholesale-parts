import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAdminListCustomers,
  getAdminListCustomersQueryKey,
  useListPriceTiers,
  useAdminUpdateCustomerTier,
} from '@workspace/api-client-react';
import type { AdminCustomer } from '@workspace/api-client-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Users, Edit } from 'lucide-react';

export default function AdminCustomers() {
  const [editingCustomer, setEditingCustomer] = useState<AdminCustomer | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string>('');

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: customers, isLoading } = useAdminListCustomers();
  const { data: tiers } = useListPriceTiers();
  const updateTier = useAdminUpdateCustomerTier();

  const openEdit = (customer: AdminCustomer) => {
    setEditingCustomer(customer);
    setSelectedTierId(String(customer.tierId));
    setIsEditOpen(true);
  };

  const handleUpdateTier = () => {
    if (!editingCustomer || !selectedTierId) return;

    updateTier.mutate(
      {
        id: editingCustomer.id,
        data: { tierId: Number(selectedTierId) },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListCustomersQueryKey() });
          setIsEditOpen(false);
          setEditingCustomer(null);
          const newTier = tiers?.find((t) => t.id === Number(selectedTierId));
          toast({
            title: 'Tier updated',
            description: `${editingCustomer.companyName} moved to ${newTier?.name}.`,
          });
        },
        onError: (error: any) => {
          toast({
            title: 'Failed to update tier',
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
          <h1 className="text-2xl font-semibold text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage customer accounts and price tier assignments
          </p>
        </div>

        {/* Tier Reference */}
        <div className="bg-muted/30 border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Price Tiers</h3>
          <div className="grid grid-cols-4 gap-3">
            {tiers?.map((tier) => (
              <div
                key={tier.id}
                className="bg-card border border-border rounded p-3"
                data-testid={`tier-reference-${tier.id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-sm">{tier.name}</p>
                  <Badge variant="outline" className="text-xs">
                    {tier.discountPercent}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  ${tier.minAnnualSpend.toLocaleString()}+ annual
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Price Tier</TableHead>
                <TableHead className="text-right">Annual Spend</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    Loading customers...
                  </TableCell>
                </TableRow>
              ) : !customers || customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">No customers found</p>
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer, idx) => (
                  <TableRow
                    key={customer.id}
                    className="hover:bg-muted/50 transition-colors"
                    style={{ animationDelay: `${idx * 20}ms` }}
                    data-testid={`row-customer-${customer.id}`}
                  >
                    <TableCell className="font-semibold">{customer.companyName}</TableCell>
                    <TableCell className="text-sm">{customer.contactName}</TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">{customer.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{customer.tierName}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${customer.annualSpend.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(customer)}
                        data-testid={`button-edit-customer-${customer.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit Tier Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Price Tier</DialogTitle>
            <DialogDescription>
              Assign {editingCustomer?.companyName} to a new price tier.
            </DialogDescription>
          </DialogHeader>
          {editingCustomer && (
            <div className="space-y-4">
              <div className="bg-muted/50 border border-border rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium">{editingCustomer.companyName}</p>
                <p className="text-xs text-muted-foreground">{editingCustomer.email}</p>
                <p className="text-xs text-muted-foreground">
                  Annual spend: ${editingCustomer.annualSpend.toLocaleString()}
                </p>
              </div>

              <div>
                <Label htmlFor="tierId">New Price Tier</Label>
                <Select value={selectedTierId} onValueChange={setSelectedTierId}>
                  <SelectTrigger id="tierId" data-testid="select-tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers?.map((tier) => (
                      <SelectItem key={tier.id} value={String(tier.id)}>
                        <div className="flex items-center justify-between gap-4">
                          <span>{tier.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {tier.discountPercent}% discount
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button onClick={handleUpdateTier} disabled={updateTier.isPending} data-testid="button-submit-tier">
                  {updateTier.isPending ? 'Updating...' : 'Update Tier'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
