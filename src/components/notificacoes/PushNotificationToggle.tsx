"use client";

import { useEffect, useState } from "react";
import { salvarPushSubscription, removerPushSubscription } from "@/app/(app)/notificacoes/actions";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

type Status = "unsupported" | "loading" | "subscribed" | "unsubscribed" | "denied";

export function PushNotificationToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setStatus(existing ? "subscribed" : "unsubscribed");
      } catch {
        if (!cancelled) setStatus("unsupported");
      }
    }

    setup();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubscribe() {
    setError(null);
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setError("Notificações push não configuradas neste ambiente.");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const result = await salvarPushSubscription({ endpoint: json.endpoint, keys: json.keys });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setStatus("subscribed");
    } catch {
      setError("Não foi possível ativar notificações push.");
    }
  }

  async function handleUnsubscribe() {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await removerPushSubscription(endpoint);
      }
      setStatus("unsubscribed");
    } catch {
      setError("Não foi possível desativar notificações push.");
    }
  }

  if (status === "unsupported") return null;

  return (
    <div className="bg-surface border border-border rounded-lg p-4 mb-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-[13px] font-medium text-fg">Notificações no navegador</p>
        <p className="text-[12px] text-fg-muted mt-0.5">
          {status === "denied"
            ? "Bloqueadas nas configurações do navegador."
            : status === "subscribed"
              ? "Ativadas neste navegador."
              : "Receba um aviso mesmo com o Connect fechado."}
        </p>
        {error && <p className="text-[12px] text-danger mt-1">{error}</p>}
      </div>
      {status !== "denied" && status !== "loading" && (
        <button
          type="button"
          onClick={status === "subscribed" ? handleUnsubscribe : handleSubscribe}
          className="h-8 px-3 rounded-md border border-border-strong bg-surface-hover text-fg text-[12px] font-medium hover:border-brand transition-colors flex-shrink-0"
        >
          {status === "subscribed" ? "Desativar" : "Ativar"}
        </button>
      )}
    </div>
  );
}
