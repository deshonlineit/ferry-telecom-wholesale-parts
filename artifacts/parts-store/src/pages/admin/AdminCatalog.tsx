import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListCategories,
  useListBrands,
  getListCategoriesQueryKey,
  getListBrandsQueryKey,
  useAdminCreateCategory,
  useAdminUpdateCategory,
  useAdminCreateBrand,
  useAdminCreateModel,
} from '@workspace/api-client-react';
import type { Category, Brand, CategoryInput, CategoryPatch, BrandInput, DeviceModelInput } from '@workspace/api-client-react';
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, FolderTree, Smartphone } from 'lucide-react';

export default function AdminCatalog() {
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isCategoryCreateOpen, setIsCategoryCreateOpen] = useState(false);
  const [isCategoryEditOpen, setIsCategoryEditOpen] = useState(false);
  const [isBrandCreateOpen, setIsBrandCreateOpen] = useState(false);
  const [isModelCreateOpen, setIsModelCreateOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: categories } = useListCategories();
  const { data: brands } = useListBrands();

  const createCategory = useAdminCreateCategory();
  const updateCategory = useAdminUpdateCategory();
  const createBrand = useAdminCreateBrand();
  const createModel = useAdminCreateModel();

  const handleCreateCategory = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const data: CategoryInput = {
      name: formData.get('name') as string,
      slug: formData.get('slug') as string,
      description: (formData.get('description') as string) || null,
    };

    createCategory.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setIsCategoryCreateOpen(false);
          toast({ title: 'Category created', description: `${data.name} added.` });
          (e.target as HTMLFormElement).reset();
        },
        onError: (error: any) => {
          toast({
            title: 'Failed to create category',
            description: error?.error || 'An error occurred',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleUpdateCategory = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCategory) return;

    const formData = new FormData(e.currentTarget);

    const data: CategoryPatch = {
      name: formData.get('name') as string,
      slug: formData.get('slug') as string,
      description: (formData.get('description') as string) || null,
    };

    updateCategory.mutate(
      { id: editingCategory.id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setIsCategoryEditOpen(false);
          setEditingCategory(null);
          toast({ title: 'Category updated', description: `${data.name} saved.` });
        },
        onError: (error: any) => {
          toast({
            title: 'Failed to update category',
            description: error?.error || 'An error occurred',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleCreateBrand = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const data: BrandInput = {
      name: formData.get('name') as string,
    };

    createBrand.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
          setIsBrandCreateOpen(false);
          toast({ title: 'Brand created', description: `${data.name} added.` });
          (e.target as HTMLFormElement).reset();
        },
        onError: (error: any) => {
          toast({
            title: 'Failed to create brand',
            description: error?.error || 'An error occurred',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleCreateModel = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const data: DeviceModelInput = {
      brandId: Number(formData.get('brandId')),
      name: formData.get('name') as string,
    };

    createModel.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
          setIsModelCreateOpen(false);
          toast({ title: 'Model created', description: `${data.name} added.` });
          (e.target as HTMLFormElement).reset();
        },
        onError: (error: any) => {
          toast({
            title: 'Failed to create model',
            description: error?.error || 'An error occurred',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const openEditCategory = (category: Category) => {
    setEditingCategory(category);
    setIsCategoryEditOpen(true);
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Catalog Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize products by categories, brands, and device models
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Categories */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FolderTree className="h-5 w-5 text-primary" />
                  Categories
                </CardTitle>
                <CardDescription className="mt-1.5">Product classification groups</CardDescription>
              </div>
              <Dialog open={isCategoryCreateOpen} onOpenChange={setIsCategoryCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2" data-testid="button-create-category">
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Category</DialogTitle>
                    <DialogDescription>Add a new product category.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateCategory} className="space-y-4">
                    <div>
                      <Label htmlFor="cat-name">Name *</Label>
                      <Input
                        id="cat-name"
                        name="name"
                        required
                        data-testid="input-category-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cat-slug">Slug *</Label>
                      <Input
                        id="cat-slug"
                        name="slug"
                        required
                        className="font-mono text-sm"
                        data-testid="input-category-slug"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cat-description">Description</Label>
                      <Textarea
                        id="cat-description"
                        name="description"
                        rows={3}
                        data-testid="input-category-description"
                      />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createCategory.isPending} data-testid="button-submit-create-category">
                        {createCategory.isPending ? 'Creating...' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {categories?.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    data-testid={`category-${cat.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{cat.name}</p>
                        <Badge variant="secondary" className="text-xs font-mono">
                          {cat.productCount}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">{cat.slug}</p>
                      {cat.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{cat.description}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditCategory(cat)}
                      data-testid={`button-edit-category-${cat.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Brands & Models */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-primary" />
                  Brands & Models
                </CardTitle>
                <CardDescription className="mt-1.5">Device manufacturers and models</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Dialog open={isModelCreateOpen} onOpenChange={setIsModelCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-2" data-testid="button-create-model">
                      <Plus className="h-4 w-4" />
                      Model
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Model</DialogTitle>
                      <DialogDescription>Add a device model to a brand.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateModel} className="space-y-4">
                      <div>
                        <Label htmlFor="model-brandId">Brand *</Label>
                        <Select name="brandId" required>
                          <SelectTrigger id="model-brandId" data-testid="select-model-brand">
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
                        <Label htmlFor="model-name">Model Name *</Label>
                        <Input
                          id="model-name"
                          name="name"
                          required
                          placeholder="e.g., iPhone 15 Pro"
                          data-testid="input-model-name"
                        />
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={createModel.isPending} data-testid="button-submit-create-model">
                          {createModel.isPending ? 'Creating...' : 'Create'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>

                <Dialog open={isBrandCreateOpen} onOpenChange={setIsBrandCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2" data-testid="button-create-brand">
                      <Plus className="h-4 w-4" />
                      Brand
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Brand</DialogTitle>
                      <DialogDescription>Add a new device brand.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateBrand} className="space-y-4">
                      <div>
                        <Label htmlFor="brand-name">Brand Name *</Label>
                        <Input
                          id="brand-name"
                          name="name"
                          required
                          placeholder="e.g., Apple, Samsung"
                          data-testid="input-brand-name"
                        />
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={createBrand.isPending} data-testid="button-submit-create-brand">
                          {createBrand.isPending ? 'Creating...' : 'Create'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {brands?.map((brand) => (
                  <div
                    key={brand.id}
                    className="p-3 rounded-lg border border-border"
                    data-testid={`brand-${brand.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-sm">{brand.name}</p>
                      <Badge variant="outline" className="text-xs font-mono">
                        {brand.models.length} models
                      </Badge>
                    </div>
                    {brand.models.length > 0 && (
                      <>
                        <Separator className="my-2" />
                        <div className="flex flex-wrap gap-1.5">
                          {brand.models.map((model) => (
                            <Badge
                              key={model.id}
                              variant="secondary"
                              className="text-xs"
                              data-testid={`model-${model.id}`}
                            >
                              {model.name}
                            </Badge>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Category Dialog */}
      <Dialog open={isCategoryEditOpen} onOpenChange={setIsCategoryEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>Update category details.</DialogDescription>
          </DialogHeader>
          {editingCategory && (
            <form onSubmit={handleUpdateCategory} className="space-y-4">
              <div>
                <Label htmlFor="edit-cat-name">Name *</Label>
                <Input
                  id="edit-cat-name"
                  name="name"
                  defaultValue={editingCategory.name}
                  required
                  data-testid="input-edit-category-name"
                />
              </div>
              <div>
                <Label htmlFor="edit-cat-slug">Slug *</Label>
                <Input
                  id="edit-cat-slug"
                  name="slug"
                  defaultValue={editingCategory.slug}
                  required
                  className="font-mono text-sm"
                  data-testid="input-edit-category-slug"
                />
              </div>
              <div>
                <Label htmlFor="edit-cat-description">Description</Label>
                <Textarea
                  id="edit-cat-description"
                  name="description"
                  defaultValue={editingCategory.description || ''}
                  rows={3}
                  data-testid="input-edit-category-description"
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={updateCategory.isPending} data-testid="button-submit-update-category">
                  {updateCategory.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
