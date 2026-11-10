// A assinatura de push deste navegador (09/11/2026) — tirada do
// `PushNotificationToggle` para servir também ao "Aviso no computador" da tela
// de Notificações. Só roda no navegador.

export type AssinaturaDePush = { endpoint: string; keys: { p256dh: string; auth: string } };

/** O ícone dos avisos do computador, o mesmo do push (`public/sw.js`). */
export const ICONE_DO_AVISO = "/icons/icon-192.png";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

/** O navegador sabe mostrar aviso no computador. */
export function temAvisoNoComputador(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

/** O navegador sabe receber push (aviso com o Connect fechado). */
export function temPush(): boolean {
  return temAvisoNoComputador() && "PushManager" in window;
}

/** O service worker do Connect, registrado e ativo. */
export async function registroDoConnect(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/** A assinatura de push que este navegador já tem, se tiver. */
export async function assinaturaAtual(): Promise<PushSubscription | null> {
  if (!temPush()) return null;
  const registro = await registroDoConnect();
  return registro.pushManager.getSubscription();
}

/** Assina o push neste navegador (a permissão já foi dada) e devolve o que gravar no servidor. */
export async function assinarPush(publicKey: string): Promise<AssinaturaDePush> {
  const registro = await registroDoConnect();
  const assinatura = await registro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = assinatura.toJSON() as AssinaturaDePush;
  return { endpoint: json.endpoint, keys: json.keys };
}

/** Cancela o push neste navegador. Devolve o endereço da assinatura, para apagar no servidor. */
export async function cancelarPush(): Promise<string | null> {
  const assinatura = await assinaturaAtual();
  if (!assinatura) return null;
  const endpoint = assinatura.endpoint;
  await assinatura.unsubscribe();
  return endpoint;
}
