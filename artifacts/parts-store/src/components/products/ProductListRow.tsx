import { useState } from 'react';
import { Link } from 'wouter';
import { Package, Plus, Check } from 'lucide-react';
import type { Product } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface ProductListRowProps {
  product: Product;
  onAddToCart: (productId: number, quantity: number) => void;
  isAdding?: boolean;
}

export function ProductListRow({ product, onAddToCart, isAdding }: ProductListRowProps) {
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const inStock = product.stock > 0;
  const hasDifferentPrice = product.listPrice !== product.yourPrice;

  const handleAdd = () => {
    onAddToCart(product.id, quantity);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  return (
    <div className="flex items-center gap-3 p-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      {/* Thumbnail */}
      <Link href={`/products/${product.id}`} className="shrink-0">
        <div className="w-14 h-14 bg-muted rounded border border-card-border flex items-center justify-center overflow-hidden">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-contain p-1"
            />
          ) : (
            <Package className="h-6 w-6 text-muted-foreground/30" />
          )}
        </div>
      </Link>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <Link href={`/products/${product.id}`}>
          <h3 className="font-semibold text-sm leading-tight text-foreground hover:text-primary transition-colors line-clamp-1">
            {product.name}
          </h3>
        </Link>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs font-mono text-muted-foreground">{product.sku}</span>
          <Badge variant="outline" className="text-xs py-0 h-4">
            {product.quality}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {product.brandName}
            {product.modelName && ` • ${product.modelName}`}
          </span>
        </div>
      </div>

      {/* Stock Status */}
      <div className="shrink-0 w-24 text-right">
        {inStock ? (
          <div>
            <p className="text-sm font-semibold text-foreground">{product.stock}</p>
            <p className="text-xs text-muted-foreground">in stock</p>
          </div>
        ) : (
          <Badge variant="secondary" className="text-xs">
            Out of stock
          </Badge>
        )}
      </div>

      {/* Price */}
      <div className="shrink-0 w-28 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-lg font-bold text-foreground">
            ${product.yourPrice.toFixed(2)}
          </span>
          {hasDifferentPrice && (
            <span className="text-xs text-muted-foreground line-through">
              ${product.listPrice.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Quantity + Add to Cart */}
      <div className="shrink-0 flex items-center gap-2">
        <Input
          type="number"
          min="1"
          max={product.stock}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-16 h-9 text-sm"
          disabled={!inStock}
          data-testid={`input-quantity-${product.id}`}
        />
        <Button
          onClick={handleAdd}
          disabled={!inStock || isAdding}
          size="sm"
          className={`gap-1.5 min-w-28 ${justAdded ? 'animate-cart-add' : ''}`}
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
  );
}
