"use client";

import { cn } from "@aptransit/ui";
import { create } from "qrcode";
import { useMemo } from "react";

const QUIET_ZONE = 4;

/**
 * The QR as one SVG path (docs/04: qrcode). Error correction M, quiet zone 4, black modules on
 * white in both themes (qr-ink and qr-paper tokens), at least 240 px.
 */
export function QrSvg({ value, label, className }: { value: string; label: string; className?: string }) {
  const { path, size } = useMemo(() => {
    const { modules } = create(value, { errorCorrectionLevel: "M" });
    let d = "";
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { path: d, size: modules.size + QUIET_ZONE * 2 };
  }, [value]);

  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className={cn("size-64 rounded-md", className)}>
      <rect width={size} height={size} className="fill-qr-paper" />
      <path d={path} className="fill-qr-ink" />
    </svg>
  );
}
