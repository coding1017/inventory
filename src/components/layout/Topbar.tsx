"use client";

import { Menu, X, ScanBarcode } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import MobileNav from "./MobileNav";

export default function Topbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-surface border-b border-border sticky top-0 z-40">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 text-text-muted hover:text-text"
        >
          <Menu className="w-5 h-5" />
        </button>

        <span className="font-semibold text-sm">Inventory</span>

        <Link
          href="/scan"
          className="p-2 -mr-2 text-text-muted hover:text-primary"
        >
          <ScanBarcode className="w-5 h-5" />
        </Link>
      </header>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 bg-surface border-r border-border">
            <div className="flex items-center justify-between px-4 h-14 border-b border-border">
              <span className="font-semibold text-sm">Inventory</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1 text-text-muted hover:text-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <MobileNav onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
