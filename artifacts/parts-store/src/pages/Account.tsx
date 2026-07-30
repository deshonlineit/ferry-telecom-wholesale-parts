import { Link } from 'wouter';
import { Header } from '@/components/layout/Header';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Award, TrendingUp, Package, DollarSign, ShoppingBag, ChevronRight, Mail, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { useEffect } from 'react';
import {
  useGetCurrentCustomer,
  useGetDashboardSummary,
  useListPriceTiers,
  useUpdateCustomerProfile,
  getGetCurrentCustomerQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';

export default function Account() {
  const { data: customer, isLoading: customerLoading } = useGetCurrentCustomer();
  const { data: dashboard, isLoading: dashboardLoading } = useGetDashboardSummary();
  const { data: tiers, isLoading: tiersLoading } = useListPriceTiers();

  const isLoading = customerLoading || dashboardLoading || tiersLoading;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Account Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account and view your order history
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
            <div className="grid md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Customer Info & Group */}
            {customer && (
              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Award className="h-8 w-8 text-primary" />
                        <div>
                          <h2 className="text-2xl font-bold text-foreground">{customer.companyName}</h2>
                          <p className="text-sm text-muted-foreground">{customer.contactName} • {customer.email}</p>
                        </div>
                      </div>
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-base px-3 py-1">
                            {customer.tier.name}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground max-w-md">
                          {customer.tier.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Editable Profile */}
            {customer && <ProfileCard customer={customer} />}

            {/* Stats */}
            {dashboard && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded">
                        <Package className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{dashboard.totalOrders}</p>
                        <p className="text-xs text-muted-foreground">Total Orders</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded">
                        <DollarSign className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          ${dashboard.annualSpend.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">Annual Spend</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded">
                        <Award className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{dashboard.tier.name}</p>
                        <p className="text-xs text-muted-foreground">Customer Group</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Recent Orders */}
            {dashboard && dashboard.recentOrders.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Recent Orders</CardTitle>
                      <CardDescription>Your latest purchases</CardDescription>
                    </div>
                    <Link href="/orders">
                      <Button variant="outline" size="sm" className="gap-2" data-testid="button-view-all-orders">
                        View All
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order Number</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.recentOrders.map((order) => (
                        <TableRow key={order.id}>
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
                          <TableCell className="text-muted-foreground">{order.itemCount}</TableCell>
                          <TableCell className="text-right font-semibold">
                            ${order.total.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{order.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Customer Groups */}
            {tiers && tiers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Customer Groups</CardTitle>
                  <CardDescription>
                    Ferry Telecom assigns customer groups based on partnership terms
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Group</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tiers.map((tier) => {
                        const isCurrent = customer?.tier.id === tier.id;
                        return (
                          <TableRow key={tier.id} className={isCurrent ? 'bg-primary/5' : ''}>
                            <TableCell className="font-semibold">
                              {tier.name}
                              {isCurrent && (
                                <Badge variant="default" className="ml-2">
                                  Your Group
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {tier.description}
                            </TableCell>
                            <TableCell>
                              {isCurrent && (
                                <Award className="h-5 w-5 text-primary" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="mt-6 p-4 border border-border rounded-lg bg-muted/30">
                    <div className="flex items-start gap-3">
                      <Mail className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground mb-1">
                          Want better pricing terms?
                        </p>
                        <p className="text-sm text-muted-foreground mb-3">
                          High-volume partners may qualify for Wholesale or Partner group pricing. Contact Ferry Telecom to discuss your options.
                        </p>
                        <Button size="sm" asChild data-testid="button-contact-pricing">
                          <a href="https://ferrytelecom.com" target="_blank" rel="noopener noreferrer">
                            Contact Us
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* CTA */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
              <CardContent className="p-8 text-center">
                <ShoppingBag className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">Ready to order?</h3>
                <p className="text-muted-foreground mb-6">
                  Browse our catalog and enjoy your group pricing on every item
                </p>
                <Link href="/products">
                  <Button size="lg" className="gap-2" data-testid="button-browse-catalog">
                    <Package className="h-4 w-4" />
                    Browse Catalog
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

const profileSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  contactName: z.string().min(1, 'Contact name is required'),
  defaultShippingAddress: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

function ProfileCard({
  customer,
}: {
  customer: { companyName: string; contactName: string; email: string; defaultShippingAddress: string | null };
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateProfile = useUpdateCustomerProfile();

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      companyName: customer.companyName,
      contactName: customer.contactName,
      defaultShippingAddress: customer.defaultShippingAddress ?? '',
    },
  });

  useEffect(() => {
    form.reset({
      companyName: customer.companyName,
      contactName: customer.contactName,
      defaultShippingAddress: customer.defaultShippingAddress ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.companyName, customer.contactName, customer.defaultShippingAddress]);

  const onSubmit = (data: ProfileForm) => {
    updateProfile.mutate(
      {
        data: {
          companyName: data.companyName,
          contactName: data.contactName,
          defaultShippingAddress: data.defaultShippingAddress?.trim() ? data.defaultShippingAddress : null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCurrentCustomerQueryKey() });
          toast({ title: 'Profile updated', description: 'Your company details have been saved.' });
        },
        onError: () => {
          toast({
            title: 'Update failed',
            description: 'Could not save your profile. Please try again.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Company Profile</CardTitle>
            <CardDescription>
              Your company details and default shipping address for faster checkout
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Your shop or company name" data-testid="input-company-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Primary contact person" data-testid="input-contact-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="defaultShippingAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Shipping Address</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Street, city, postal code, country — pre-filled at checkout"
                      className="min-h-24"
                      data-testid="input-default-shipping-address"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={updateProfile.isPending} data-testid="button-save-profile">
                {updateProfile.isPending ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
