"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createLocation,
  updateLocation,
  deleteLocation,
} from "@/actions/locations";
import { Warehouse, Plus, Pencil, Trash2, X, Star } from "lucide-react";
import type { Location } from "@/lib/supabase/types";
import { LOCATION_TYPES } from "@/lib/constants";
import Badge from "@/components/ui/Badge";
import { toast } from "sonner";

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("inv_locations")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name");
    setLocations(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(formData: FormData) {
    const result = editing
      ? await updateLocation(editing.id, formData)
      : await createLocation(formData);

    if (result?.error) {
      const errors = result.error as Record<string, string[]>;
      toast.error(Object.values(errors).flat()[0] || "Error");
      return;
    }

    toast.success(editing ? "Location updated" : "Location created");
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function handleDelete(id: string) {
    const result = await deleteLocation(id);
    if (result?.error) {
      toast.error(typeof result.error === "string" ? result.error : "Cannot delete location");
      return;
    }
    toast.success("Location deleted");
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Locations</h1>
          <p className="text-text-muted text-sm mt-1">
            Warehouses, stores, and storage locations
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
          Add Location
        </button>
      </div>

      {showForm && (
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">
              {editing ? "Edit Location" : "New Location"}
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
              placeholder="Location name"
              required
              defaultValue={editing?.name ?? ""}
              className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <select
              name="type"
              defaultValue={editing?.type ?? "warehouse"}
              className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text"
            >
              {Object.entries(LOCATION_TYPES).map(([val, info]) => (
                <option key={val} value={val}>
                  {info.label}
                </option>
              ))}
            </select>
            <input
              name="address"
              placeholder="Address (optional)"
              defaultValue={editing?.address ?? ""}
              className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  name="is_default"
                  value="true"
                  defaultChecked={editing?.is_default ?? false}
                  className="rounded border-border"
                />
                Default
              </label>
              <button
                type="submit"
                className="flex-1 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
              >
                {editing ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-text-dim text-sm text-center py-8">Loading...</div>
      ) : locations.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <Warehouse className="w-10 h-10 mx-auto mb-3 text-text-dim opacity-40" />
          <p className="text-sm text-text-muted">No locations yet</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border divide-y divide-border">
          {locations.map((loc) => {
            const typeInfo =
              LOCATION_TYPES[loc.type as keyof typeof LOCATION_TYPES];
            return (
              <div
                key={loc.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{loc.name}</p>
                      {loc.is_default && (
                        <Star className="w-3 h-3 text-warning fill-warning" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge>{typeInfo?.label}</Badge>
                      {loc.address && (
                        <span className="text-xs text-text-dim">
                          {loc.address}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditing(loc);
                      setShowForm(true);
                    }}
                    className="p-1.5 rounded-md text-text-dim hover:text-text hover:bg-surface2"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(loc.id)}
                    className="p-1.5 rounded-md text-text-dim hover:text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
