"use client";

import { useState } from "react";
import type { Category, Supplier, Product } from "@/lib/supabase/types";
import { BARCODE_TYPES } from "@/lib/constants";
import { createProduct, updateProduct } from "@/actions/products";

type FormErrors = Record<string, string[]> | undefined;

export default function ProductForm({
  categories,
  suppliers,
  product,
}: {
  categories: Category[];
  suppliers: Supplier[];
  product?: Product;
}) {
  const [errors, setErrors] = useState<FormErrors>(undefined);
  const [pending, setPending] = useState(false);

  async function formAction(formData: FormData) {
    setPending(true);
    setErrors(undefined);
    const action = product
      ? updateProduct.bind(null, product.id)
      : createProduct;
    const result = await action(formData);
    if (result?.error) {
      setErrors(result.error as FormErrors);
    }
    setPending(false);
  }

  return (
    <form action={formAction} className="space-y-6 max-w-2xl">
      {errors?._form && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {errors._form[0]}
        </div>
      )}

      {/* Basic Info */}
      <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
        <h2 className="text-sm font-medium">Basic Information</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Product Name"
            name="name"
            required
            defaultValue={product?.name}
            error={errors?.name}
          />
          <Field
            label="SKU"
            name="sku"
            required
            defaultValue={product?.sku}
            error={errors?.sku}
            placeholder="e.g. POUCH-001"
          />
        </div>

        <Field
          label="Description"
          name="description"
          defaultValue={product?.description ?? ""}
          textarea
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label="Category"
            name="category_id"
            defaultValue={product?.category_id ?? ""}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          <SelectField
            label="Supplier"
            name="supplier_id"
            defaultValue={product?.supplier_id ?? ""}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
      </div>

      {/* Barcode */}
      <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
        <h2 className="text-sm font-medium">Barcode</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Barcode Value"
            name="barcode"
            defaultValue={product?.barcode ?? ""}
            placeholder="Scan or enter barcode"
          />
          <SelectField
            label="Barcode Type"
            name="barcode_type"
            defaultValue={product?.barcode_type ?? ""}
            options={BARCODE_TYPES.map((b) => ({
              value: b.value,
              label: b.label,
            }))}
          />
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
        <h2 className="text-sm font-medium">Pricing & Units</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field
            label="Cost Price"
            name="cost_price"
            type="number"
            step="0.01"
            defaultValue={product?.cost_price?.toString() ?? ""}
            placeholder="0.00"
          />
          <Field
            label="Sell Price"
            name="sell_price"
            type="number"
            step="0.01"
            defaultValue={product?.sell_price?.toString() ?? ""}
            placeholder="0.00"
          />
          <Field
            label="Unit"
            name="unit"
            defaultValue={product?.unit ?? "each"}
            placeholder="each, kg, liter..."
          />
        </div>
      </div>

      {/* Status & Threshold */}
      <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
        <h2 className="text-sm font-medium">Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SelectField
            label="Status"
            name="status"
            defaultValue={product?.status ?? "active"}
            options={[
              { value: "active", label: "Active" },
              { value: "draft", label: "Draft" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <Field
            label="Low Stock Threshold"
            name="low_stock_threshold"
            type="number"
            defaultValue={product?.low_stock_threshold?.toString() ?? "5"}
          />
          <Field
            label="Tags"
            name="tags"
            defaultValue={product?.tags?.join(", ") ?? ""}
            placeholder="tag1, tag2, ..."
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {pending
            ? "Saving..."
            : product
              ? "Update Product"
              : "Create Product"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  defaultValue,
  error,
  placeholder,
  type = "text",
  step,
  textarea,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  error?: string[];
  placeholder?: string;
  type?: string;
  step?: string;
  textarea?: boolean;
}) {
  const cls =
    "w-full px-3 py-2 rounded-lg bg-bg border border-border text-text placeholder:text-text-dim text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-colors";

  return (
    <div>
      <label className="block text-xs font-medium text-text-muted mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {textarea ? (
        <textarea
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          rows={3}
          className={cls + " resize-none"}
        />
      ) : (
        <input
          name={name}
          type={type}
          step={step}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className={cls}
        />
      )}
      {error && <p className="text-danger text-xs mt-1">{error[0]}</p>}
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted mb-1.5">
        {label}
      </label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
