import { useState } from 'react';
import { useListCategories, useListBrands } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ChevronRight, ChevronDown, Grid3x3, Smartphone, Filter } from 'lucide-react';

interface ProductsSidebarProps {
  categoryId?: number;
  brandId?: number;
  modelId?: number;
  quality?: string;
  inStockOnly: boolean;
  onCategoryChange: (categoryId: number | undefined) => void;
  onBrandChange: (brandId: number | undefined) => void;
  onModelChange: (modelId: number | undefined, brandId?: number) => void;
  onQualityChange: (quality: string | undefined) => void;
  onInStockChange: (inStock: boolean) => void;
}

export function ProductsSidebar({
  categoryId,
  brandId,
  modelId,
  quality,
  inStockOnly,
  onCategoryChange,
  onBrandChange,
  onModelChange,
  onQualityChange,
  onInStockChange,
}: ProductsSidebarProps) {
  const { data: categories } = useListCategories();
  const { data: brands } = useListBrands();
  const [expandedBrandId, setExpandedBrandId] = useState<number | null>(brandId || null);

  const qualityOptions = [
    'OEM Original',
    'OEM Pulled',
    'Aftermarket Premium',
    'Aftermarket Standard',
    'Refurbished A',
    'Refurbished B',
    'Standard',
  ];

  const handleBrandClick = (clickedBrandId: number) => {
    if (expandedBrandId === clickedBrandId) {
      setExpandedBrandId(null);
    } else {
      setExpandedBrandId(clickedBrandId);
    }
  };

  const handleBrandSelect = (selectedBrandId: number) => {
    onBrandChange(brandId === selectedBrandId ? undefined : selectedBrandId);
    onModelChange(undefined);
    setExpandedBrandId(selectedBrandId);
  };

  const handleModelSelect = (selectedModelId: number, parentBrandId: number) => {
    if (modelId === selectedModelId) {
      onModelChange(undefined);
    } else {
      onModelChange(selectedModelId, parentBrandId);
    }
  };

  return (
    <div className="w-64 border-r border-border bg-card">
      <ScrollArea className="h-[calc(100vh-4rem)]">
        <div className="p-4 space-y-6">
          {/* Categories */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Grid3x3 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Categorieën</h3>
            </div>
            <div className="space-y-1">
              <button
                onClick={() => onCategoryChange(undefined)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  !categoryId
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
                data-testid="category-all"
              >
                Alle categorieën
              </button>
              {categories?.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => onCategoryChange(cat.id)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between gap-2 ${
                    categoryId === cat.id
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-muted text-foreground'
                  }`}
                  data-testid={`category-${cat.id}`}
                >
                  <span className="truncate">{cat.name}</span>
                  <Badge variant={categoryId === cat.id ? 'secondary' : 'outline'} className="shrink-0 text-xs">
                    {cat.productCount}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Shop by Device */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Smartphone className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Shop by Device</h3>
            </div>
            <div className="space-y-1">
              {brands?.map((brand) => {
                const isExpanded = expandedBrandId === brand.id;
                const isSelected = brandId === brand.id;
                return (
                  <div key={brand.id}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleBrandClick(brand.id)}
                        className="p-1 hover:bg-muted rounded shrink-0"
                        data-testid={`brand-expand-${brand.id}`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <button
                        onClick={() => handleBrandSelect(brand.id)}
                        className={`flex-1 text-left px-2 py-1.5 rounded text-sm transition-colors ${
                          isSelected
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover:bg-muted text-foreground'
                        }`}
                        data-testid={`brand-${brand.id}`}
                      >
                        {brand.name}
                      </button>
                    </div>
                    {isExpanded && brand.models.length > 0 && (
                      <div className="ml-6 mt-1 space-y-0.5">
                        {brand.models.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => handleModelSelect(model.id, brand.id)}
                            className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                              modelId === model.id
                                ? 'bg-primary text-primary-foreground font-medium'
                                : 'hover:bg-muted text-muted-foreground'
                            }`}
                            data-testid={`model-${model.id}`}
                          >
                            {model.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Quality Filter */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Quality</h3>
            </div>
            <div className="space-y-1">
              <button
                onClick={() => onQualityChange(undefined)}
                className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                  !quality
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
                data-testid="quality-all"
              >
                All Quality Grades
              </button>
              {qualityOptions.map((q) => (
                <button
                  key={q}
                  onClick={() => onQualityChange(q)}
                  className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                    quality === q
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-muted text-muted-foreground'
                  }`}
                  data-testid={`quality-${q}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Stock Filter */}
          <div>
            <Button
              variant={inStockOnly ? 'default' : 'outline'}
              onClick={() => onInStockChange(!inStockOnly)}
              className="w-full justify-start text-sm"
              data-testid="filter-in-stock"
            >
              <Filter className="h-4 w-4 mr-2" />
              In Stock Only
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
