// Service worker do Connect — só cobre push notifications (não faz cache
// offline/app-shell; isso fica de fora de escopo por ora).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "Connect", body: "", url: "/notificacoes" };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
    })
  );
});

// O clique no aviso (09/11/2026): com uma janela do Connect já aberta (mesma
// origem), ela vem para a frente e vai para a tela do aviso. Janela nova só
// quando não há nenhuma. Antes, sem uma janela já naquele endereço exato, o
// clique abria outra janela a cada aviso.
//
// A janela vai para a tela pela navegação do próprio app, sem recarregar: o
// service worker manda o pedido e espera a resposta do sino. Sem resposta (o
// portal, uma versão antiga da página, a aba que o navegador congelou), ele
// navega a janela do jeito dele.

/** Quanto o service worker espera a página responder que navegou sozinha. */
const ESPERA_DA_PAGINA_MS = 1500;

function pedirNavegacao(janela, caminho) {
  return new Promise((resolve) => {
    const canal = new MessageChannel();
    const desistir = setTimeout(() => resolve(false), ESPERA_DA_PAGINA_MS);
    canal.port1.onmessage = () => {
      clearTimeout(desistir);
      resolve(true);
    };
    try {
      janela.postMessage({ tipo: "connect:navegar", url: caminho }, [canal.port2]);
    } catch {
      clearTimeout(desistir);
      resolve(false);
    }
  });
}

/** O portal e o Connect da equipe moram na mesma origem: a janela da mesma área vem primeiro. */
function doPortal(url) {
  return new URL(url).pathname.startsWith("/portal");
}

async function abrirNoConnect(destino) {
  const janelas = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter(
    (c) => new URL(c.url).origin === self.location.origin
  );
  if (janelas.length === 0) return self.clients.openWindow ? self.clients.openWindow(destino.href) : undefined;

  const daArea = janelas.filter((c) => doPortal(c.url) === doPortal(destino.href));
  const candidatas = daArea.length ? daArea : janelas;
  const alvo =
    candidatas.find((c) => c.url === destino.href) ||
    candidatas.find((c) => c.focused) ||
    candidatas.find((c) => c.visibilityState === "visible") ||
    candidatas[0];

  let janela = alvo;
  try {
    janela = (await alvo.focus()) || alvo;
  } catch {
    // O navegador não deixou focar: segue para levar a janela mesmo assim.
  }
  if (janela.url === destino.href) return undefined;

  if (await pedirNavegacao(janela, destino.pathname + destino.search + destino.hash)) return undefined;
  try {
    // Só funciona na janela que este service worker controla.
    if ("navigate" in janela && (await janela.navigate(destino.href))) return undefined;
  } catch {
    // Janela fora do controle deste service worker: o último recurso abaixo.
  }
  if (self.clients.openWindow) return self.clients.openWindow(destino.href);
  return undefined;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/notificacoes", self.location.origin);
  // Aviso que apontasse para fora do Connect não abre nada.
  if (destino.origin !== self.location.origin) return;
  event.waitUntil(abrirNoConnect(destino));
});
