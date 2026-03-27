"use client";

import { useState } from "react";
import CameraScanner from "@/components/scanner/CameraScanner";
import ScanResult from "@/components/scanner/ScanResult";
import { ScanBarcode, Keyboard } from "lucide-react";

export default function ScanPage() {
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = useState("");

  function handleScan(barcode: string) {
    setScannedBarcode(barcode);
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualInput.trim()) {
      setScannedBarcode(manualInput.trim());
    }
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Scanner</h1>
        <p className="text-text-muted text-sm mt-1">
          Scan a barcode or QR code to look up products
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setMode("camera");
            setScannedBarcode(null);
          }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            mode === "camera"
              ? "bg-primary/15 text-primary"
              : "bg-surface border border-border text-text-muted hover:text-text"
          }`}
        >
          <ScanBarcode className="w-4 h-4" />
          Camera
        </button>
        <button
          onClick={() => {
            setMode("manual");
            setScannedBarcode(null);
          }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            mode === "manual"
              ? "bg-primary/15 text-primary"
              : "bg-surface border border-border text-text-muted hover:text-text"
          }`}
        >
          <Keyboard className="w-4 h-4" />
          Manual Entry
        </button>
      </div>

      {/* Scanner or manual input */}
      {!scannedBarcode && (
        <>
          {mode === "camera" ? (
            <CameraScanner onScan={handleScan} />
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <input
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Enter barcode or SKU..."
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-text placeholder:text-text-dim text-sm focus:border-primary transition-colors"
              />
              <button
                type="submit"
                className="w-full px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
              >
                Look Up
              </button>
            </form>
          )}
        </>
      )}

      {/* Result */}
      {scannedBarcode && (
        <ScanResult
          barcode={scannedBarcode}
          onClear={() => {
            setScannedBarcode(null);
            setManualInput("");
          }}
        />
      )}
    </div>
  );
}
