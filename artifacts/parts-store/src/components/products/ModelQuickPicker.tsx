import { useState, useEffect } from 'react';
import { useListBrands } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { X, Search, Smartphone, ChevronRight } from 'lucide-react';

interface ModelQuickPickerProps {
  categoryId?: number;
  brandId?: number;
  modelId?: number;
  onModelChange: (modelId: number | undefined, brandId?: number) => void;
  onBrandChange: (brandId: number | undefined) => void;
}

export function ModelQuickPicker({
  categoryId,
  brandId,
  modelId,
  onModelChange,
  onBrandChange,
}: ModelQuickPickerProps) {
  const { data: brands } = useListBrands();
  
  // Local state for the selected brand in the picker
  const [localBrandId, setLocalBrandId] = useState<number | undefined>(brandId);
  const [modelSearch, setModelSearch] = useState('');
  
  // Keep localBrandId in sync with external changes, or auto-select first available brand
  useEffect(() => {
    if (brandId) {
      setLocalBrandId(brandId);
    } else if (!localBrandId && brands && brands.length > 0) {
      const firstWithModels = brands.find(b => b.models.length > 0);
      if (firstWithModels) setLocalBrandId(firstWithModels.id);
    }
  }, [brandId, brands, localBrandId]);

  // If no category is selected, don't show the quick picker at all
  if (!categoryId) return null;

  if (!brands) {
    return !modelId ? (
      <Card className="mb-4 border-primary/20 bg-primary/5">
        <CardContent className="p-4 h-32 flex items-center justify-center">
           <div className="animate-pulse flex space-x-4">
             <div className="h-4 bg-primary/20 rounded w-24"></div>
             <div className="h-4 bg-primary/20 rounded w-24"></div>
           </div>
        </CardContent>
      </Card>
    ) : null;
  }

  const selectedBrand = brands.find(b => b.id === (modelId ? brandId : localBrandId));
  const selectedModel = brands.flatMap(b => b.models).find(m => m.id === modelId);

  // Expanded picker state (no model selected)
  if (!modelId) {
    const activeModels = selectedBrand?.models || [];
    const filteredModels = modelSearch 
      ? activeModels.filter(m => m.name.toLowerCase().includes(modelSearch.toLowerCase()))
      : activeModels;

    return (
      <Card className="mb-4 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent shadow-sm overflow-hidden" data-testid="model-quick-picker">
        <CardContent className="p-0">
          <div className="flex flex-col md:flex-row">
            {/* Brands Column */}
            <div className="w-full md:w-48 lg:w-56 border-b md:border-b-0 md:border-r border-primary/20 bg-background/50 p-2 flex flex-row md:flex-col gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              <div className="hidden md:block px-2 py-1.5 text-xs font-semibold text-primary uppercase tracking-wider mb-1">
                Select Brand
              </div>
              {brands.filter(b => b.models.length > 0).map(brand => (
                <button
                  key={brand.id}
                  onClick={() => {
                    setLocalBrandId(brand.id);
                    setModelSearch('');
                  }}
                  className={`flex-shrink-0 text-left px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap md:whitespace-normal flex items-center justify-between ${
                    localBrandId === brand.id 
                      ? 'bg-primary text-primary-foreground shadow-sm' 
                      : 'hover:bg-primary/10 text-foreground'
                  }`}
                  data-testid={`quickpick-brand-${brand.id}`}
                >
                  {brand.name}
                  <ChevronRight className={`hidden md:block h-4 w-4 ${localBrandId === brand.id ? 'opacity-100' : 'opacity-0'}`} />
                </button>
              ))}
            </div>
            
            {/* Models Area */}
            <div className="flex-1 p-3 md:p-4 flex flex-col min-h-[200px]">
              {!localBrandId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm py-8">
                  <Smartphone className="h-10 w-10 text-primary/20 mb-3" />
                  <p>Select a brand to view available models</p>
                </div>
              ) : (
                <>
                  <div className="relative mb-3 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder={`Filter ${selectedBrand?.name} models...`}
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      className="pl-9 bg-background border-primary/20 h-9 text-sm focus-visible:ring-primary"
                      data-testid="quickpick-model-search"
                    />
                  </div>
                  
                  {filteredModels.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4 flex flex-col items-center justify-center flex-1">
                      <Search className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p>No models match "{modelSearch}"</p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 overflow-y-auto max-h-48 md:max-h-[320px] pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-primary/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-primary/40">
                      {filteredModels.map(model => (
                        <button
                          key={model.id}
                          onClick={() => onModelChange(model.id, localBrandId)}
                          className="px-3 py-1.5 bg-background border border-primary/20 hover:border-primary hover:bg-primary/10 hover:text-primary rounded-md text-sm font-medium transition-all text-left shadow-sm"
                          data-testid={`quickpick-model-${model.id}`}
                        >
                          {model.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Collapsed slim bar state (model IS selected)
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 bg-primary/10 border border-primary/20 rounded-lg px-4 py-2.5 shadow-sm" data-testid="quickpick-active">
      <div className="flex items-center gap-3">
        <div className="bg-background rounded-md p-1.5 border border-primary/20 shadow-sm text-primary">
          <Smartphone className="h-4 w-4" />
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground mr-1.5">Model selected:</span>
          <span className="font-semibold text-foreground">{selectedBrand?.name} {selectedModel?.name}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 text-xs border-primary/20 hover:bg-primary/10 bg-background" 
          onClick={() => onModelChange(undefined, brandId)}
          data-testid="quickpick-switch-model"
        >
          Switch Model
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10" 
          onClick={() => onBrandChange(undefined)}
          data-testid="quickpick-clear-model"
          title="Clear Model & Brand"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
