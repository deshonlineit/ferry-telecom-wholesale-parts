import { useState } from 'react';
import { Link } from 'wouter';
import { useListCategories, useListBrands } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, Grid3x3, Smartphone } from 'lucide-react';

export function BrowseByCategory() {
  const { data: categories, isLoading: categoriesLoading } = useListCategories();
  const { data: brands, isLoading: brandsLoading } = useListBrands();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<number | null>(null);

  const isLoading = categoriesLoading || brandsLoading;

  const selectedBrandData = brands?.find((b) => b.id === selectedBrand);

  return (
    <div id="browse-by-category" className="space-y-6">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold text-foreground mb-2">Browse by Category</h2>
        <p className="text-muted-foreground">
          Find exactly what you need in three clicks: category, brand, model
        </p>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {/* Categories */}
          <Card className={selectedCategory ? 'border-primary/50' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Grid3x3 className="h-4 w-4 text-primary" />
                1. Choose Category
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {categories?.map((category) => (
                <button
                  key={category.id}
                  onClick={() => {
                    setSelectedCategory(category.id);
                    setSelectedBrand(null);
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedCategory === category.id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-transparent hover:border-border hover:bg-muted/50'
                  }`}
                  data-testid={`button-category-${category.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{category.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {category.productCount.toLocaleString()} products
                      </p>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 transition-transform ${
                        selectedCategory === category.id ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    />
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Brands */}
          <Card className={selectedBrand ? 'border-primary/50' : selectedCategory ? '' : 'opacity-50'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="h-4 w-4 text-primary" />
                2. Choose Brand
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {!selectedCategory ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Select a category first
                </p>
              ) : (
                brands?.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => setSelectedBrand(brand.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedBrand === brand.id
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-transparent hover:border-border hover:bg-muted/50'
                    }`}
                    data-testid={`button-brand-${brand.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground">{brand.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {brand.models.length} {brand.models.length === 1 ? 'model' : 'models'}
                        </p>
                      </div>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 transition-transform ${
                          selectedBrand === brand.id ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      />
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Models */}
          <Card className={selectedBrand && selectedBrandData ? '' : 'opacity-50'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ChevronRight className="h-4 w-4 text-primary" />
                3. Choose Model
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {!selectedBrand ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Select a brand first
                </p>
              ) : selectedBrandData && selectedBrandData.models.length > 0 ? (
                selectedBrandData.models.map((model) => {
                  const url = `/products?categoryId=${selectedCategory}&brandId=${selectedBrand}&modelId=${model.id}`;
                  return (
                    <Link key={model.id} href={url}>
                      <div
                        className="w-full text-left p-3 rounded-lg border border-transparent hover:border-primary hover:bg-primary/5 transition-all group"
                        data-testid={`link-model-${model.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                            {model.name}
                          </p>
                          <Badge variant="outline" className="shrink-0 group-hover:border-primary">
                            View Parts
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No models available
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {selectedCategory && !selectedBrand && (
        <div className="text-center">
          <Link href={`/products?categoryId=${selectedCategory}`}>
            <Button variant="outline" className="gap-2" data-testid="button-view-category-all">
              Or view all products in this category
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}

      {selectedCategory && selectedBrand && (
        <div className="text-center">
          <Link href={`/products?categoryId=${selectedCategory}&brandId=${selectedBrand}`}>
            <Button variant="outline" className="gap-2" data-testid="button-view-brand-all">
              Or view all {selectedBrandData?.name} products in this category
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
