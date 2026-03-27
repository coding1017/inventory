"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function CameraScanner({
  onScan,
  continuous = false,
}: {
  onScan: (barcode: string) => void;
  continuous?: boolean;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const isRunningRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const lastScanRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;

    async function startScanner() {
      try {
        const scanner = new Html5Qrcode("scanner-region");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            if (!mounted) return;

            const now = Date.now();
            if (
              decodedText === lastScanRef.current &&
              now - lastScanTimeRef.current < 2000
            ) {
              return;
            }

            lastScanRef.current = decodedText;
            lastScanTimeRef.current = now;
            onScanRef.current(decodedText);

            if (!continuous && isRunningRef.current) {
              isRunningRef.current = false;
              scanner.stop().catch(() => {});
              setScanning(false);
            }
          },
          () => {}
        );

        if (mounted) {
          isRunningRef.current = true;
          setScanning(true);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to access camera. Please allow camera permissions."
          );
        }
      }
    }

    startScanner();

    return () => {
      mounted = false;
      const scanner = scannerRef.current;
      if (scanner && isRunningRef.current) {
        isRunningRef.current = false;
        scanner.stop().then(() => {
          scanner.clear();
        }).catch(() => {
          try { scanner.clear(); } catch {}
        });
      }
    };
  }, [continuous]);

  if (error) {
    return (
      <div className="bg-danger/10 border border-danger/20 rounded-xl p-6 text-center">
        <p className="text-danger text-sm">{error}</p>
        <p className="text-text-muted text-xs mt-2">
          Make sure camera permissions are enabled in your browser settings.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        id="scanner-region"
        className="rounded-xl overflow-hidden"
      />
      {scanning && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <div className="px-3 py-1.5 rounded-full bg-black/70 text-xs text-white backdrop-blur-sm">
            {continuous ? "Scanning continuously..." : "Point camera at barcode"}
          </div>
        </div>
      )}
    </div>
  );
}
