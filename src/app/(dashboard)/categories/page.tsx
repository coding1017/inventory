"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/actions/categories";
import { FolderTree, Plus, Pencil, Trash2, X } from "lucide-react";
import type { Category } from "@/lib/supabase/types";
import { toast } from "sonner";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("inv_categories")
      .select("*")
      .order("sort_order")
      .order("name");
    setCategories(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(formData: FormData) {
    const result = editing
      ? await updateCategory(editing.id, formData)
      : await createCategory(formData);

    if (result?.error) {
      const errors = result.error as Record<string, string[]>;
      const msg = errors._form?.[0] || Object.values(errors).flat()[0];
      toast.error(msg || "Something went wrong");
      return;
    }

    toast.success(editing ? "Category updated" : "Category created");
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function handleDelete(id: string) {
    await deleteCategory(id);
    toast.success("Category deleted");
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Categories</h1>
          <p className="text-text-muted text-sm mt-1">
            Organize products into categories
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">
              {editing ? "Edit Category" : "New Category"}
            </h2>
            <button
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              className="text-text-dim hover:text-text"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form action={handleSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              name="name"
              placeholder="Category name"
              required
              defaultValue={editing?.name ?? ""}
              className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <input
              name="slug"
              placeholder="slug"
              required
              defaultValue={editing?.slug ?? ""}
              className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <input
              name="sort_order"
              type="number"
              placeholder="Sort order"
              defaultValue={editing?.sort_order ?? 0}
              className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              {editing ? "Update" : "Create"}
            </button>
          </form>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-text-dim text-sm text-center py-8">Loading...</div>
      ) : categories.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <FolderTree className="w-10 h-10 mx-auto mb-3 text-text-dim opacity-40" />
          <p className="text-sm text-text-muted">No categories yet</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border divide-y divide-border">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{cat.name}</p>
                <p className="text-xs text-text-dim">{cat.slug}</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setEditing(cat);
                    setShowForm(true);
                  }}
                  className="p-1.5 rounded-md text-text-dim hover:text-text hover:bg-surface2 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(cat.id)}
                  className="p-1.5 rounded-md text-text-dim hover:text-danger hover:bg-danger/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
