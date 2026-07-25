"use client";

import { Pause, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const POLL_INTERVAL_MS = 4_000;

type SyncStatus = "connected" | "checking" | "offline";

export function LiveRequests({
  initialVersion,
  paused = false,
}: {
  initialVersion: string;
  paused?: boolean;
}) {
  const router = useRouter();
  const version = useRef(initialVersion);
  const [status, setStatus] = useState<SyncStatus>("connected");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isRefreshing, startTransition] = useTransition();

  useEffect(() => {
    version.current = initialVersion;
  }, [initialVersion]);

  useEffect(() => {
    if (paused) return;

    const controller = new AbortController();
    let running = false;

    async function checkForUpdates() {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      setStatus("checking");

      try {
        const response = await fetch("/api/solicitudes/version", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("No se pudo sincronizar.");

        const data = (await response.json()) as { version: string };
        setStatus("connected");
        setLastSync(new Date());

        if (data.version !== version.current) {
          version.current = data.version;
          startTransition(() => router.refresh());
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setStatus("offline");
        }
      } finally {
        running = false;
      }
    }

    void checkForUpdates();
    const interval = window.setInterval(checkForUpdates, POLL_INTERVAL_MS);
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkForUpdates();
    };
    window.addEventListener("online", checkForUpdates);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("online", checkForUpdates);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [paused, router]);

  function refreshNow() {
    startTransition(() => router.refresh());
  }

  if (paused) {
    return (
      <span className="flex items-center gap-2 text-xs text-muted-foreground" title="Se reanudará al cerrar el detalle">
        <Pause className="size-4" /> Sincronización pausada durante la revisión
      </span>
    );
  }

  const syncing = status === "checking" || isRefreshing;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      {status === "offline" ? (
        <WifiOff className="size-4 text-red-500" />
      ) : (
        <Wifi className={`size-4 ${syncing ? "animate-pulse text-primary" : "text-primary"}`} />
      )}
      <span>
        {status === "offline"
          ? "Sin conexión en tiempo real"
          : syncing
            ? "Sincronizando..."
            : lastSync
              ? `En vivo · ${lastSync.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "Actualización automática activa"}
      </span>
      <button
        type="button"
        onClick={refreshNow}
        disabled={isRefreshing}
        className="rounded-md p-1 hover:bg-secondary disabled:opacity-50"
        aria-label="Actualizar solicitudes ahora"
        title="Actualizar ahora"
      >
        <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
