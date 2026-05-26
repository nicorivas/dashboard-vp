"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshButton({ fetchedAt }: { fetchedAt?: number | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      // Invalida la caché del servidor (esto fuerza re-lectura del Sheet).
      await fetch("/api/sheet?refresh=1", { cache: "no-store" });
    } catch {
      // ignore — igual hacemos router.refresh para re-renderizar
    } finally {
      startTransition(() => router.refresh());
      setBusy(false);
    }
  }

  const loading = busy || isPending;

  return (
    <button
      onClick={refresh}
      disabled={loading}
      title="Volver a leer el Sheet"
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
    >
      <span className={loading ? "animate-spin" : ""}>↻</span>
      <span>{loading ? "Actualizando…" : "Refrescar"}</span>
      {!loading && fetchedAt && (
        <span className="hidden text-gray-400 lg:inline" suppressHydrationWarning>
          ·{" "}
          {new Date(fetchedAt).toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
    </button>
  );
}
