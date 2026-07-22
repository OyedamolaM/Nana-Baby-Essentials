"use client";

import Script from "next/script";

export function DebugConsole() {
  return (
    <Script
      src="https://cdn.jsdelivr.net/npm/eruda"
      strategy="afterInteractive"
      onLoad={() => {
        // @ts-expect-error - eruda is loaded globally by the script above
        window.eruda?.init();
      }}
    />
  );
}