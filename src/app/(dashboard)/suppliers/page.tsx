"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from "@/actions/suppliers";
import { Truck, Plus, Pencil, Trash2, X, Mail, Phone } from "lucide-react";
import type { Supplier } from "@/lib/supabase/types";
import { toast } from "sonner";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("inv_suppliers")
      .select("*")
      .order("name");
    setSuppliers(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(formData: FormData) {
    const result = editing
      ? await updateSupplier(editing.id, formData)
      : await createSupplier(formData);

    if (result?.error) {
      const errors = result.error as Record<string, string[]>;
      toast.error(Object.values(errors).flat()[0] || "Error");
      return;
    }

    toast.success(editing ? "Supplier updated" : "Supplier created");
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function handleDelete(id: string) {
    await deleteSupplier(id);
    toast.success("Supplier deleted");
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Suppliers</h1>
          <p className="text-text-muted text-sm mt-1">
            Manage your supplier directory
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
          Add Supplier
        </button>
      </div>

      {showForm && (
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">
              {editing ? "Edit Supplier" : "New Supplier"}
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
          <form action={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              name="name"
              placeholder="Company name"
              required
              defaultValue={editing?.name ?? ""}
              className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <input
              name="contact"
              placeholder="Contact person"
              defaultValue={editing?.contact ?? ""}
              className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <input
              name="email"
              type="email"
              placeholder="Email"
              defaultValue={editing?.email ?? ""}
              className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <input
              name="phone"
              placeholder="Phone"
              defaultValue={editing?.phone ?? ""}
              className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <input
              name="address"
              placeholder="Address"
              defaultValue={editing?.address ?? ""}
              className="sm:col-span-2 px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <textarea
              name="notes"
              placeholder="Notes"
              rows={2}
              defaultValue={editing?.notes ?? ""}
              className="sm:col-span-2 px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim resize-none"
            />
            <button
              type="submit"
              className="sm:col-span-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              {editing ? "Update" : "Create"}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-text-dim text-sm text-center py-8">Loading...</div>
      ) : suppliers.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <Truck className="w-10 h-10 mx-auto mb-3 text-text-dim opacity-40" />
          <p className="text-sm text-text-muted">No suppliers yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((s) => (
            <div
              key={s.id}
              className="bg-surface rounded-xl border border-border p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm">{s.name}</p>
                  {s.contact && (
                    <p className="text-xs text-text-muted mt-0.5">
                      {s.contact}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditing(s);
                      setShowForm(true);
                    }}
                    className="p-1.5 rounded-md text-text-dim hover:text-text hover:bg-surface2"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-1.5 rounded-md text-text-dim hover:text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {s.email && (
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Mail className="w-3 h-3" />
                    {s.email}
                  </div>
                )}
                {s.phone && (
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Phone className="w-3 h-3" />
                    {s.phone}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
