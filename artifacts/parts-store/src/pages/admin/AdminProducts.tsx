import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAdminListProducts,
  getAdminListProductsQueryKey,
  useAdminCreateProduct,
  useAdminUpdateProduct,
  useListCategories,
  useListBrands,
  getListCategoriesQueryKey,
  getListBrandsQueryKey,
} from '@workspace/api-client-react';
import type { AdminProduct, ProductInput, ProductPatch } from '@workspace/api-client-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit, Package, ChevronLeft, ChevronRight } from 'lucide-react';

const QUALITY_OPTIONS = [
  'Original',
  'Original New',
  'Servicepack',
  'Standard',
  'Best Possible',
  'Pulled',
  'Refurbished',
  'Aftermarket',
  'Compatible',
  'Retail',
];

export default function AdminProducts() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params = {
    search: search || undefined,
    categoryId: categoryFilter !== 'all' ? Number(categoryFilter) : undefined,
    featured: featuredOnly ? true : undefined,
    page,
    pageSize: 20,
  };

  const { data: productPage, isLoading } = useAdminListProducts(params, {
    query: { queryKey: getAdminListProductsQueryKey(params) },
  });

  const { data: categories } = useListCategories();
  const { data: brands } = useListBrands();

  const createProduct = useAdminCreateProduct();
  const updateProduct = useAdminUpdateProduct();

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const rawCategory = formData.get('categoryId');
    const data: ProductInput = {
      sku: formData.get('sku') as string,
      name: formData.get('name') as string,
      // 'auto' => omit categoryId so the server classifies with AI
      ...(rawCategory && rawCategory !== 'auto' ? { categoryId: Number(rawCategory) } : {}),
      brandId: Number(formData.get('brandId')),
      modelId: formData.get('modelId') && formData.get('modelId') !== 'none' ? Number(formData.get('modelId')) : null,
      quality: formData.get('quality') as string,
      listPrice: Number(formData.get('listPrice')),
      stock: Number(formData.get('stock')),
      featured: formData.get('featured') === 'on',
      imageUrl: (formData.get('imageUrl') as string) || null,
      description: (formData.get('description') as string) || null,
    };

    createProduct.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
          setIsCreateOpen(false);
          toast({ title: 'Product created', description: `${data.name} added to catalog.` });
        },
        onError: (error: any) => {
          toast({
            title: 'Failed to create product',
            description: error?.error || 'An error occurred',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProduct) return;

    const formData = new FormData(e.currentTarget);

    const data: ProductPatch = {
      sku: formData.get('sku') as string,
      name: formData.get('name') as string,
      categoryId: Number(formData.get('categoryId')),
      brandId: Number(formData.get('brandId')),
      modelId: formData.get('modelId') && formData.get('modelId') !== 'none' ? Number(formData.get('modelId')) : null,
      quality: formData.get('quality') as string,
      listPrice: Number(formData.get('listPrice')),
      stock: Number(formData.get('stock')),
      featured: formData.get('featured') === 'on',
      imageUrl: (formData.get('imageUrl') as string) || null,
      description: (formData.get('description') as string) || null,
    };

    updateProduct.mutate(
      { id: editingProduct.id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
          setIsEditOpen(false);
          setEditingProduct(null);
          toast({ title: 'Product updated', description: `${data.name} saved.` });
        },
        onError: (error: any) => {
          toast({
            title: 'Failed to update product',
            description: error?.error || 'An error occurred',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const toggleFeatured = (product: AdminProduct) => {
    updateProduct.mutate(
      { id: product.id, data: { featured: !product.featured } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
          toast({
            title: !product.featured ? 'Marked as featured' : 'Removed from featured',
            description: `${product.name} ${!product.featured ? 'will show in "Popular This Week" on the homepage.' : 'no longer curated for the homepage.'}`,
          });
        },
        onError: (error: any) => {
          toast({
            title: 'Failed to update product',
            description: error?.error || 'An error occurred',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const openEdit = (product: AdminProduct) => {
    setEditingProduct(product);
    setIsEditOpen(true);
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Products</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage inventory, pricing, and product details
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-create-product">
                <Plus className="h-4 w-4" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Product</DialogTitle>
                <DialogDescription>Add a new product to the catalog.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <ProductForm categories={categories} brands={brands} />
                <DialogFooter>
                  <Button type="submit" disabled={createProduct.isPending} data-testid="button-submit-create">
                    {createProduct.isPending ? 'Creating...' : 'Create Product'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name or SKU..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
              data-testid="input-search-products"
            />
          </div>

          <Select
            value={categoryFilter}
            onValueChange={(value) => {
              setCategoryFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48" data-testid="select-category-filter">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 whitespace-nowrap">
            <Switch
              id="featured-only"
              checked={featuredOnly}
              onCheckedChange={(checked) => {
                setFeaturedOnly(checked);
                setPage(1);
              }}
              data-testid="switch-featured-filter"
            />
            <Label htmlFor="featured-only" className="text-sm cursor-pointer">
              Featured only
            </Label>
          </div>
        </div>

        {/* Table */}
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Brand / Model</TableHead>
                <TableHead>Quality</TableHead>
                <TableHead className="text-right">List Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="w-24">Featured</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    Loading products...
                  </TableCell>
                </TableRow>
              ) : !productPage || productPage.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">No products found</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Try adjusting your filters or create a new product
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                productPage.items.map((product, idx) => (
                  <TableRow
                    key={product.id}
                    className="hover:bg-muted/50 transition-colors"
                    style={{ animationDelay: `${idx * 20}ms` }}
                    data-testid={`row-product-${product.id}`}
                  >
                    <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{product.categoryName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {product.brandName}
                      {product.modelName && <span className="text-xs"> · {product.modelName}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {product.quality}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">${product.listPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={product.stock > 0 ? 'secondary' : 'destructive'} className="font-mono text-xs">
                        {product.stock}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={product.featured}
                        onCheckedChange={() => toggleFeatured(product)}
                        aria-label={`Toggle featured for ${product.name}`}
                        data-testid={`switch-featured-${product.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(product)}
                        data-testid={`button-edit-${product.id}`}
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

        {/* Pagination */}
        {productPage && productPage.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {productPage.page} of {productPage.totalPages} · {productPage.total} total products
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= productPage.totalPages}
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>Update product details and inventory.</DialogDescription>
          </DialogHeader>
          {editingProduct && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <ProductForm categories={categories} brands={brands} product={editingProduct} />
              <DialogFooter>
                <Button type="submit" disabled={updateProduct.isPending} data-testid="button-submit-update">
                  {updateProduct.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

interface ProductFormProps {
  categories?: Array<{ id: number; name: string }>;
  brands?: Array<{ id: number; name: string; models: Array<{ id: number; name: string }> }>;
  product?: AdminProduct;
}

function ProductForm({ categories, brands, product }: ProductFormProps) {
  const [selectedBrandId, setSelectedBrandId] = useState<string>(product?.brandId?.toString() || '');

  const selectedBrand = brands?.find((b) => b.id === Number(selectedBrandId));

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <Label htmlFor="sku">SKU *</Label>
        <Input
          id="sku"
          name="sku"
          defaultValue={product?.sku}
          required
          className="font-mono"
          data-testid="input-sku"
        />
      </div>

      <div className="col-span-2">
        <Label htmlFor="name">Product Name *</Label>
        <Input
          id="name"
          name="name"
          defaultValue={product?.name}
          required
          data-testid="input-name"
        />
      </div>

      <div>
        <Label htmlFor="categoryId">Category *</Label>
        <Select
          name="categoryId"
          defaultValue={product ? product.categoryId?.toString() : 'auto'}
          required
        >
          <SelectTrigger id="categoryId" data-testid="select-category">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {!product && <SelectItem value="auto">Automatic (AI)</SelectItem>}
            {categories?.map((cat) => (
              <SelectItem key={cat.id} value={String(cat.id)}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="quality">Quality Grade *</Label>
        <Select name="quality" defaultValue={product?.quality} required>
          <SelectTrigger id="quality" data-testid="select-quality">
            <SelectValue placeholder="Select quality" />
          </SelectTrigger>
          <SelectContent>
            {QUALITY_OPTIONS.map((q) => (
              <SelectItem key={q} value={q}>
                {q}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="brandId">Brand *</Label>
        <Select
          name="brandId"
          defaultValue={product?.brandId?.toString()}
          onValueChange={setSelectedBrandId}
          required
        >
          <SelectTrigger id="brandId" data-testid="select-brand">
            <SelectValue placeholder="Select brand" />
          </SelectTrigger>
          <SelectContent>
            {brands?.map((brand) => (
              <SelectItem key={brand.id} value={String(brand.id)}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="modelId">Model</Label>
        <Select name="modelId" defaultValue={product?.modelId?.toString() || 'none'}>
          <SelectTrigger id="modelId" data-testid="select-model">
            <SelectValue placeholder="No model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No model</SelectItem>
            {selectedBrand?.models.map((model) => (
              <SelectItem key={model.id} value={String(model.id)}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="listPrice">List Price *</Label>
        <Input
          id="listPrice"
          name="listPrice"
          type="number"
          step="0.01"
          min="0"
          defaultValue={product?.listPrice}
          required
          data-testid="input-listPrice"
        />
      </div>

      <div>
        <Label htmlFor="stock">Stock *</Label>
        <Input
          id="stock"
          name="stock"
          type="number"
          min="0"
          defaultValue={product?.stock}
          required
          data-testid="input-stock"
        />
      </div>

      <div className="col-span-2">
        <Label htmlFor="imageUrl">Image URL</Label>
        <Input
          id="imageUrl"
          name="imageUrl"
          type="url"
          defaultValue={product?.imageUrl || ''}
          data-testid="input-imageUrl"
        />
      </div>

      <div className="col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={product?.description || ''}
          data-testid="input-description"
        />
      </div>

      <div className="col-span-2 flex items-center gap-2">
        <Checkbox id="featured" name="featured" defaultChecked={product?.featured} data-testid="checkbox-featured" />
        <Label htmlFor="featured" className="cursor-pointer">
          Feature this product on homepage
        </Label>
      </div>
    </div>
  );
}
