export const MOVEMENT_TYPES = {
  receive: { label: "Received", color: "text-green-400", sign: "+" },
  sale: { label: "Sold", color: "text-red-400", sign: "-" },
  adjustment: { label: "Adjusted", color: "text-yellow-400", sign: "~" },
  transfer_in: { label: "Transferred In", color: "text-blue-400", sign: "+" },
  transfer_out: { label: "Transferred Out", color: "text-blue-400", sign: "-" },
  return: { label: "Returned", color: "text-green-400", sign: "+" },
  damaged: { label: "Damaged", color: "text-red-400", sign: "-" },
  reserved: { label: "Reserved", color: "text-orange-400", sign: "-" },
  unreserved: { label: "Unreserved", color: "text-orange-400", sign: "+" },
} as const;

export const PRODUCT_STATUSES = {
  active: { label: "Active", color: "bg-green-500/20 text-green-400" },
  draft: { label: "Draft", color: "bg-yellow-500/20 text-yellow-400" },
  archived: { label: "Archived", color: "bg-zinc-500/20 text-zinc-400" },
} as const;

export const LOCATION_TYPES = {
  warehouse: { label: "Warehouse", icon: "Warehouse" },
  store: { label: "Store", icon: "Store" },
  bin: { label: "Bin", icon: "Archive" },
  virtual: { label: "Virtual", icon: "Cloud" },
} as const;

export const BARCODE_TYPES = [
  { value: "ean13", label: "EAN-13" },
  { value: "upc", label: "UPC-A" },
  { value: "code128", label: "Code 128" },
  { value: "qr", label: "QR Code" },
  { value: "custom", label: "Custom" },
] as const;
