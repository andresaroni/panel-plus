"use client";

import { Bell, BellOff, LoaderCircle, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

type AlertState =
  | "checking"
  | "available"
  | "subscribing"
  | "active"
  | "denied"
  | "install-required"
  | "unsupported"
  | "error";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function pushSupported() {
  return (
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error("No se pudo guardar la suscripción.");
}

async function getPublicKey() {
  const keyResponse = await fetch("/api/push/public-key", { cache: "no-store" });
  if (!keyResponse.ok) throw new Error("Las alertas no están configuradas.");
  const { publicKey } = (await keyResponse.json()) as { publicKey: string };
  return applicationServerKey(publicKey);
}

function usesApplicationServerKey(subscription: PushSubscription, expected: Uint8Array) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

async function ensureSubscription(registration: ServiceWorkerRegistration) {
  const serverKey = await getPublicKey();
  const existing = await registration.pushManager.getSubscription();
  if (existing && usesApplicationServerKey(existing, serverKey)) {
    await saveSubscription(existing);
    return;
  }
  if (existing) await existing.unsubscribe();

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: serverKey,
  });
  await saveSubscription(subscription);
}

export function RequestNotifications() {
  const [state, setState] = useState<AlertState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      if (!pushSupported()) {
        if (!cancelled) setState(isIos() && !isStandalone() ? "install-required" : "unsupported");
        return;
      }
      if (isIos() && !isStandalone()) {
        if (!cancelled) setState("install-required");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/push-sw.js");
        if (Notification.permission === "granted") {
          await ensureSubscription(registration);
          if (!cancelled) setState("active");
          return;
        }
        if (!cancelled) setState("available");
      } catch {
        if (!cancelled) setState("error");
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  async function activate() {
    if (state === "install-required") {
      window.alert(
        "En iPhone o iPad, abre el menú Compartir, selecciona ‘Agregar a inicio’ y activa las alertas desde la aplicación instalada.",
      );
      return;
    }
    if (state === "denied") {
      window.alert("Habilita las notificaciones para este sitio desde la configuración del navegador.");
      return;
    }
    if (!["available", "error"].includes(state)) return;

    setState("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "available");
        return;
      }
      const registration = await navigator.serviceWorker.register("/push-sw.js");
      await ensureSubscription(registration);
      setState("active");
    } catch {
      setState("error");
    }
  }

  const content = {
    checking: { label: "Comprobando alertas", Icon: LoaderCircle },
    available: { label: "Activar alertas", Icon: Bell },
    subscribing: { label: "Activando alertas", Icon: LoaderCircle },
    active: { label: "Alertas activas", Icon: Bell },
    denied: { label: "Alertas bloqueadas", Icon: BellOff },
    "install-required": { label: "Instalar para alertas", Icon: Smartphone },
    unsupported: { label: "Alertas no compatibles", Icon: BellOff },
    error: { label: "Reintentar alertas", Icon: BellOff },
  }[state];
  const Icon = content.Icon;
  const disabled = ["checking", "subscribing", "active", "unsupported"].includes(state);

  return (
    <button
      type="button"
      onClick={activate}
      disabled={disabled}
      title={content.label}
      className={`flex h-9 items-center gap-2 rounded-full border bg-card px-3 text-xs transition hover:bg-secondary disabled:cursor-default ${
        state === "active" ? "text-primary" : "text-muted-foreground"
      }`}
    >
      <Icon className={`size-4 ${state === "checking" || state === "subscribing" ? "animate-spin" : ""}`} />
      <span className="hidden md:inline">{content.label}</span>
      <span className="sr-only md:hidden">{content.label}</span>
    </button>
  );
}
