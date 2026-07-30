import { Link } from 'wouter';
import { useGetCurrentCustomer, useGetDashboardSummary, useListPriceTiers } from '@workspace/api-client-react';
import { Header } from '@/components/layout/Header';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Award, TrendingUp, Package, DollarSign, ShoppingBag, ChevronRight } from 'lucide-react';
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
            Manage your account and track your savings
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
            {/* Customer Info & Tier Progress */}
            {customer && (
              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <Award className="h-8 w-8 text-primary" />
                        <div>
                          <h2 className="text-2xl font-bold text-foreground">{customer.companyName}</h2>
                          <p className="text-sm text-muted-foreground">{customer.contactName} • {customer.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <Badge variant="default" className="text-base px-3 py-1">
                          {customer.tier.name}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {customer.tier.discountPercent}% discount on all orders
                        </span>
                      </div>
                    </div>

                    {customer.nextTier && (
                      <Card className="min-w-80">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">
                              Progress to {customer.nextTier.tier.name}
                            </span>
                            <span className="text-sm font-bold text-primary">
                              {customer.nextTier.progressPercent.toFixed(0)}%
                            </span>
                          </div>
                          <Progress value={customer.nextTier.progressPercent} className="h-2" />
                          <p className="text-xs text-muted-foreground">
                            ${customer.nextTier.remainingSpend.toFixed(2)} more to unlock {customer.nextTier.tier.discountPercent}% savings
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stats */}
            {dashboard && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      <div className="p-2 bg-amber-500/10 rounded">
                        <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          ${dashboard.totalSavings.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">Total Savings</p>
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
                        <p className="text-xs text-muted-foreground">Current Tier</p>
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

            {/* Price Tiers Ladder */}
            {tiers && tiers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Membership Tiers</CardTitle>
                  <CardDescription>
                    The more you order over the year, the better your pricing gets
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tier</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Annual Spend Required</TableHead>
                        <TableHead>Benefits</TableHead>
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
                                  Current
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-lg font-bold text-primary">
                                {tier.discountPercent}%
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {tier.minAnnualSpend > 0
                                ? `$${tier.minAnnualSpend.toLocaleString()}`
                                : 'No minimum'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {tier.description}
                            </TableCell>
                            <TableCell>
                              {isCurrent && (
                                <Award className="h-5 w-5 text-amber-600 dark:text-amber-500" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* CTA */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
              <CardContent className="p-8 text-center">
                <ShoppingBag className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">Ready to order?</h3>
                <p className="text-muted-foreground mb-6">
                  Browse our catalog and enjoy your tier pricing on every item
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
