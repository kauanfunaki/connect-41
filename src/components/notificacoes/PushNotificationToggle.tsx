"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

type Status = "unsupported" | "unconfigured" | "loading" | "subscribed" | "unsubscribed" | "denied";

// A chave chega por prop, vinda de um Server Component (getVapidPublicKey em
// src/lib/vapid.ts) — e NÃO de process.env.NEXT_PUBLIC_* lido aqui. Ler aqui
// significa inlinar em tempo de build, e o build roda no Docker sem as env
// vars do EasyPanel; ver o comentário em src/lib/vapid.ts. Ausente = o
// ambiente não consegue assinar push, e o estado é detectado na montagem:
// antes o botão "Ativar" aparecia normalmente e só depois do clique dizia que
// não estava configurado, o que parecia bug do botão.
/**
 * Gravar e apagar a assinatura chegam por prop, não por import.
 *
 * A equipe e o cliente do portal gravam em tabelas diferentes, com sessões
 * diferentes — e importar a action interna aqui dentro faria este componente
 * arrastar código de `(app)` para dentro do portal, que é exatamente a costura
 * que o layout separado do portal existe para não ter.
 *
 * Elas ficam **fora das dependências** do efeito de propósito: server action
 * recebida por prop não tem identidade estável (muda a cada `revalidatePath`),
 * e o efeito re-registraria o service worker a cada render.
 */
export type AcoesDePush = {
  salvar: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) => Promise<{ error: string } | null>;
  remover: (endpoint: string) => Promise<void>;
};

export function PushNotificationToggle({
  publicKey,
  acoes,
  descricao = "Receba um aviso mesmo com o Connect fechado.",
  semChaves = "explicar",
}: {
  publicKey: string | null;
  acoes: AcoesDePush;
  descricao?: string;
  /**
   * O que fazer quando o ambiente não tem as chaves VAPID. A equipe vê o que
   * precisa ser configurado; para o cliente do portal isso não é informação —
   * ele não tem o que fazer com o nome de uma variável de ambiente, e um aviso
   * de indisponibilidade que ele não pode resolver só gera chamado.
   */
  semChaves?: "explicar" | "esconder";
}) {
  const VAPID_PUBLIC_KEY = publicKey;
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (!VAPID_PUBLIC_KEY) {
        if (!cancelled) setStatus("unconfigured");
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
  }, [VAPID_PUBLIC_KEY]);

  async function handleSubscribe() {
    setError(null);
    const publicKey = VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setStatus("unconfigured");
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
      const result = await acoes.salvar({ endpoint: json.endpoint, keys: json.keys });
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
        await acoes.remover(endpoint);
      }
      setStatus("unsubscribed");
    } catch {
      setError("Não foi possível desativar notificações push.");
    }
  }

  if (status === "unsupported") return null;
  if (status === "unconfigured" && semChaves === "esconder") return null;

  return (
    <div className="bg-surface border border-border rounded-lg p-4 mb-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-[13px] font-medium text-fg">Notificações no navegador</p>
        <p className="text-[12px] text-fg-muted mt-0.5">
          {status === "unconfigured"
            ? "Indisponível neste ambiente: faltam as chaves VAPID (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT). Um administrador precisa configurá-las nas variáveis de ambiente do servidor e reiniciar — não é necessário rebuild."
            : status === "denied"
              ? "Bloqueadas nas configurações do navegador."
              : status === "subscribed"
                ? "Ativadas neste navegador."
                : descricao}
        </p>
        {error && <p className="text-[12px] text-danger mt-1">{error}</p>}
      </div>
      {status !== "denied" && status !== "loading" && status !== "unconfigured" && (
        <Button
          variant="secondary"
          size="sm"
          className="bg-surface-hover hover:border-brand flex-shrink-0"
          onClick={status === "subscribed" ? handleUnsubscribe : handleSubscribe}
        >
          {status === "subscribed" ? "Desativar" : "Ativar"}
        </Button>
      )}
    </div>
  );
}
