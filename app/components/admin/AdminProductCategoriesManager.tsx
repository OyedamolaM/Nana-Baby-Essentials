"use client";

import { useMemo, useState } from "react";
import { Edit, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { type ProductRecord } from "../../../lib/commerce";
import {
  createCategorySlug,
  type ProductCategoryRecord,
} from "../../../lib/productCategories";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

export function AdminProductCategoriesManager({
  categories,
  onReload,
  onRevalidateProducts,
  products,
}: {
  categories: ProductCategoryRecord[];
  onReload: () => Promise<void>;
  onRevalidateProducts: () => Promise<void>;
  products: ProductRecord[];
}) {
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategoryRecord | null>(null);
  const [categoryLabel, setCategoryLabel] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState("0");
  const [categoryIsActive, setCategoryIsActive] = useState(true);
  const [savingCategory, setSavingCategory] = useState(false);

  const productCounts = useMemo(() => {
    return products.reduce<Record<string, number>>((counts, product) => {
      const label = product.category?.trim();
      if (!label) {
        return counts;
      }

      counts[label] = (counts[label] ?? 0) + 1;
      return counts;
    }, {});
  }, [products]);

  const resetCategoryForm = () => {
    setEditingCategory(null);
    setCategoryLabel("");
    setCategorySortOrder("0");
    setCategoryIsActive(true);
  };

  const handleEditCategory = (category: ProductCategoryRecord) => {
    setEditingCategory(category);
    setCategoryLabel(category.label);
    setCategorySortOrder(String(category.sort_order ?? 0));
    setCategoryIsActive(category.is_active !== false);
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const label = categoryLabel.trim();
    if (!label) {
      toast.error("Add a category name first.");
      return;
    }

    const slug = createCategorySlug(label);
    if (!slug) {
      toast.error("Add a valid category name.");
      return;
    }

    setSavingCategory(true);

    const payload = {
      label,
      slug,
      sort_order: Number(categorySortOrder || 0),
      is_active: categoryIsActive,
    };

    const { error } = editingCategory
      ? await supabase.from("product_categories").update(payload).eq("id", editingCategory.id)
      : await supabase.from("product_categories").insert(payload);

    if (error) {
      setSavingCategory(false);
      toast.error("Could not save this product category.");
      return;
    }

    if (editingCategory && editingCategory.label !== label) {
      const { error: productUpdateError } = await supabase
        .from("products")
        .update({ category: label })
        .eq("category", editingCategory.label);

      if (productUpdateError) {
        setSavingCategory(false);
        toast.error("Category saved, but existing products could not be updated to the new name.");
        return;
      }
    }

    setSavingCategory(false);
    toast.success(editingCategory ? "Category updated." : "Category created.");
    setShowCategoryModal(false);
    resetCategoryForm();
    await onRevalidateProducts();
    await onReload();
  };

  const handleDeleteCategory = async (category: ProductCategoryRecord) => {
    if ((productCounts[category.label] ?? 0) > 0) {
      toast.error("You can only delete a category after reassigning its products.");
      return;
    }

    if (!window.confirm("Delete this category?")) {
      return;
    }

    const { error } = await supabase.from("product_categories").delete().eq("id", category.id);
    if (error) {
      toast.error("Could not delete this category.");
      return;
    }

    toast.success("Category deleted.");
    await onRevalidateProducts();
    await onReload();
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-4">
          <div className="space-y-1 flex justify-between items-center">
            <CardTitle>Product Categories</CardTitle>
            <Button
              onClick={() => {
                resetCategoryForm();
                setShowCategoryModal(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
            
          </div>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-sm text-gray-500">No categories yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow
                    key={category.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleEditCategory(category)}
                  >
                    <TableCell>
                      <div className="font-medium">{category.label}</div>
                    </TableCell>
                    <TableCell>{category.slug}</TableCell>
                    <TableCell>{productCounts[category.label] ?? 0}</TableCell>
                    <TableCell>{category.is_active === false ? "Inactive" : "Active"}</TableCell>
                    <TableCell>{Number(category.sort_order ?? 0)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEditCategory(category);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteCategory(category);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveCategory} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category-label">Category Name</Label>
              <Input
                id="category-label"
                value={categoryLabel}
                onChange={(event) => setCategoryLabel(event.target.value)}
                placeholder="e.g. Feeding"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-sort-order">Sort Order</Label>
              <Input
                id="category-sort-order"
                type="number"
                min="0"
                value={categorySortOrder}
                onChange={(event) => setCategorySortOrder(event.target.value)}
              />
              <p className="text-xs text-gray-500">
                Lower numbers appear first in product filters and product forms.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={categoryIsActive}
                onChange={(event) => setCategoryIsActive(event.target.checked)}
              />
              Category is active
            </label>

            <Button type="submit" className="w-full" disabled={savingCategory}>
              <Tags className="mr-2 h-4 w-4" />
              {savingCategory
                ? "Saving..."
                : editingCategory
                  ? "Update Category"
                  : "Create Category"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}