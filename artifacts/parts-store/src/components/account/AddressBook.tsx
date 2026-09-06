import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  type CustomerAddress,
  useListCustomerAddresses,
  useCreateCustomerAddress,
  useUpdateCustomerAddress,
  useDeleteCustomerAddress,
  getListCustomerAddressesQueryKey,
  getGetCurrentCustomerQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

const addressSchema = z.object({
  label: z.string().trim().min(1, 'Address name is required').max(80, 'Use at most 80 characters'),
  shippingAddress: z.string().trim().min(1, 'Shipping address is required').max(2000, 'Use at most 2,000 characters'),
  isDefault: z.boolean(),
});
type AddressForm = z.infer<typeof addressSchema>;

export function AddressBook() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const addressesQuery = useListCustomerAddresses({
    query: { queryKey: getListCustomerAddressesQueryKey(), staleTime: 0, refetchOnWindowFocus: true },
  });
  const addresses = addressesQuery.data ?? [];
  const createAddress = useCreateCustomerAddress();
  const updateAddress = useUpdateCustomerAddress();
  const deleteAddress = useDeleteCustomerAddress();
  const [editor, setEditor] = useState<CustomerAddress | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CustomerAddress | null>(null);
  const busy = createAddress.isPending || updateAddress.isPending || deleteAddress.isPending;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListCustomerAddressesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetCurrentCustomerQueryKey() }),
    ]);
  }

  function failed() {
    toast({
      title: 'Address not saved',
      description: 'Your change could not be completed. Please try again.',
      variant: 'destructive',
    });
  }

  async function save(data: AddressForm) {
    try {
      if (editor === 'new') {
        await createAddress.mutateAsync({ data });
      } else if (editor) {
        await updateAddress.mutateAsync({ id: editor.id, data });
      }
      setEditor(null);
      await refresh();
      toast({ title: 'Address saved', description: 'Your address book has been updated.' });
    } catch {
      failed();
    }
  }

  async function makeDefault(address: CustomerAddress) {
    try {
      await updateAddress.mutateAsync({ id: address.id, data: { isDefault: true } });
      await refresh();
      toast({ title: 'Default address updated', description: `${address.label} will be selected at checkout.` });
    } catch {
      failed();
    }
  }

  async function remove() {
    if (!deleting) return;
    try {
      await deleteAddress.mutateAsync({ id: deleting.id });
      setDeleting(null);
      await refresh();
      toast({ title: 'Address deleted' });
    } catch {
      toast({ title: 'Delete failed', description: 'The address was not deleted. Please try again.', variant: 'destructive' });
    }
  }

  return (
    <Card id="address-book">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Shipping Address Book</CardTitle>
          <CardDescription className="mt-2">Save your shop, branches and other delivery locations. Your default is selected at checkout.</CardDescription>
        </div>
        <Button type="button" className="gap-2" disabled={busy || addressesQuery.isPending || addressesQuery.isError} onClick={() => setEditor('new')} data-testid="button-add-address">
          <Plus className="h-4 w-4" />Add Address
        </Button>
      </CardHeader>
      <CardContent>
        {addressesQuery.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">Loading addresses...</p>
        ) : addressesQuery.isError ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm text-destructive">Could not load your address book. Your saved addresses have not been changed.</p>
            <Button type="button" variant="outline" disabled={addressesQuery.isFetching} onClick={() => addressesQuery.refetch()}>Retry</Button>
          </div>
        ) : addresses.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No saved addresses yet. Add your first delivery location to speed up checkout.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {addresses.map((address) => (
              <div key={address.id} className="rounded-lg border p-4 min-w-0" data-testid={`address-card-${address.id}`}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="font-semibold break-words min-w-0">{address.label}</h3>
                  {address.isDefault && <Badge>Default</Badge>}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{address.shippingAddress}</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditor(address)} aria-label={`Edit ${address.label}`}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                  {!address.isDefault && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => makeDefault(address)}>Set as Default</Button>}
                  <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setDeleting(address)} aria-label={`Delete ${address.label}`}><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={editor !== null} onOpenChange={(open) => { if (!open && !busy) setEditor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor === 'new' ? 'Add Shipping Address' : 'Edit Shipping Address'}</DialogTitle>
            <DialogDescription>Name this location so you can quickly find it at checkout.</DialogDescription>
          </DialogHeader>
          {editor !== null && (
            <AddressEditor
              key={editor === 'new' ? 'new' : editor.id}
              address={editor === 'new' ? undefined : editor}
              firstAddress={addresses.length === 0}
              busy={busy}
              onSave={save}
              onCancel={() => setEditor(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the address from your address book. Previous orders will keep their original shipping address.
              {deleting?.isDefault && addresses.length > 1 && ' Your oldest remaining address will become the default.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={busy} onClick={remove} data-testid="button-confirm-delete-address">{busy ? 'Deleting...' : 'Delete Address'}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function AddressEditor({ address, firstAddress, busy, onSave, onCancel }: {
  address?: CustomerAddress;
  firstAddress: boolean;
  busy: boolean;
  onSave: (data: AddressForm) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: address?.label ?? '',
      shippingAddress: address?.shippingAddress ?? '',
      isDefault: address?.isDefault ?? firstAddress,
    },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
        <FormField control={form.control} name="label" render={({ field }) => (
          <FormItem>
            <FormLabel>Address Name *</FormLabel>
            <FormControl><Input {...field} disabled={busy} maxLength={80} placeholder="Main shop or Branch" data-testid="input-address-label" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="shippingAddress" render={({ field }) => (
          <FormItem>
            <FormLabel>Full Shipping Address *</FormLabel>
            <FormControl><Textarea {...field} disabled={busy} maxLength={2000} className="min-h-32" placeholder="Recipient, street, city, postal code, country" data-testid="input-address-details" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="isDefault" render={({ field }) => (
          <FormItem className="flex items-center gap-2 space-y-0">
            <FormControl><Checkbox checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} disabled={busy || firstAddress || address?.isDefault} data-testid="checkbox-default-address" /></FormControl>
            <FormLabel>Use as default shipping address</FormLabel>
          </FormItem>
        )} />
        {address?.isDefault && <p className="text-xs text-muted-foreground">To change your default, select another address in your address book.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={busy} data-testid="button-save-address">{busy ? 'Saving...' : 'Save Address'}</Button>
        </div>
      </form>
    </Form>
  );
}