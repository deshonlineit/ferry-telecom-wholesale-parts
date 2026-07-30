import { Link } from 'wouter';
import { useGetCurrentCustomer, useGetDashboardSummary, useListPriceTiers } from '@workspace/api-client-react';
import { Header } from '@/components/layout/Header';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Award, Package, DollarSign, ShoppingBag, ChevronRight, Mail } from 'lucide-react';
import { format } from 'date-fns';

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
