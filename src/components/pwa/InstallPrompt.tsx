"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already dismissed recently
    const dismissedAt = localStorage.getItem("pwa-install-dismissed");
    if (dismissedAt && Date.now() - parseInt(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
      setDismissed(true);
      return;
    }

    // Check if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      return;
    }

    // Android/Chrome: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS: detect Safari on iPhone/iPad
    const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    const isSafari = /safari/.test(navigator.userAgent.toLowerCase()) && !/crios|fxios|chrome/.test(navigator.userAgent.toLowerCase());
    if (isIOS && isSafari) {
      // Delay showing the iOS prompt
      const timer = setTimeout(() => setShowIOSPrompt(true), 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIOSPrompt(false);
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  }

  // Nothing to show
  if (dismissed || (!deferredPrompt && !showIOSPrompt)) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-80 z-50 animate-slide-up">
      <div className="bg-surface border border-border rounded-2xl p-4 shadow-2xl shadow-black/40">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Install Inventory</p>
            <p className="text-text-muted text-xs mt-0.5 leading-relaxed">
              {showIOSPrompt
                ? "Tap the Share button, then \"Add to Home Screen\" for the full app experience."
                : "Add to your home screen for instant access — works like a native app."}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="p-1 -mt-1 -mr-1 text-text-dim hover:text-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {deferredPrompt && (
          <button
            onClick={handleInstall}
            className="w-full mt-3 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
          >
            Install App
          </button>
        )}

        {showIOSPrompt && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-surface2 text-xs text-text-muted">
            <span>Tap</span>
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            <span>then &quot;Add to Home Screen&quot;</span>
          </div>
        )}
      </div>
    </div>
  );
}
