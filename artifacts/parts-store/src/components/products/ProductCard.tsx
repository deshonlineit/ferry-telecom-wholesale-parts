import { useState } from 'react';
import { Link } from 'wouter';
import { Package, Plus, Check } from 'lucide-react';
import type { Product } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface ProductCardProps {
  product: Product;
  onAddToCart: (productId: number, quantity: number) => void;
  isAdding?: boolean;
}

export function ProductCard({ product, onAddToCart, isAdding }: ProductCardProps) {
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const inStock = product.stock > 0;

  const handleAdd = () => {
    onAddToCart(product.id, quantity);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  return (
    <Card className="group relative overflow-hidden border border-card-border hover:shadow-md transition-shadow">
      <Link href={`/products/${product.id}`}>
        <div className="aspect-square bg-muted border-b border-card-border flex items-center justify-center overflow-hidden">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <Package className="h-16 w-16 text-muted-foreground/30" />
          )}
        </div>
      </Link>

      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link href={`/products/${product.id}`}>
              <h3 className="font-semibold text-sm leading-tight text-foreground hover:text-primary transition-colors line-clamp-2">
                {product.name}
              </h3>
            </Link>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">{product.sku}</p>
          </div>
          <Badge variant={inStock ? 'default' : 'secondary'} className="shrink-0 text-xs">
            {inStock ? `${product.stock} in stock` : 'Out of stock'}
          </Badge>
        </div>

        <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
          <span>{product.brandName}</span>
          {product.modelName && (
            <>
              <span>•</span>
              <span>{product.modelName}</span>
            </>
          )}
        </div>

        <div className="pt-1">
          <Badge variant="outline" className="text-xs font-normal">
            {product.quality}
          </Badge>
        </div>

        <div className="pt-2">
          <span className="text-lg font-bold text-foreground">
            ${product.yourPrice.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Input
            type="number"
            min="1"
            max={product.stock}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 h-8 text-sm"
            disabled={!inStock}
            data-testid={`input-quantity-${product.id}`}
          />
          <Button
            onClick={handleAdd}
            disabled={!inStock || isAdding}
            size="sm"
            className={`flex-1 gap-1.5 transition-all ${justAdded ? 'animate-cart-add' : ''}`}
            data-testid={`button-add-cart-${product.id}`}
          >
            {justAdded ? (
              <>
                <Check className="h-4 w-4" />
                Added
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Add to Cart
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
