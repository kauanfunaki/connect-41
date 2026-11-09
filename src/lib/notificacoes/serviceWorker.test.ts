import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O clique no push do navegador (09/11/2026), rodando o `public/sw.js` de
// verdade num escopo de service worker simulado: com uma janela do Connect
// aberta, ela vem para a frente e vai para a tela do aviso; janela nova só
// quando não há nenhuma.

const ORIGEM = "https://connect.exemplo.invalid";
const CODIGO = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

type Janela = {
  url: string;
  focused: boolean;
  visibilityState: "visible" | "hidden";
  focus: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
};

/** Uma janela aberta; `responde`: a página do Connect atende o pedido de navegar (o sino montado). */
function janela(caminho: string, { responde = true, focused = false, origem = ORIGEM } = {}): Janela {
  const j: Janela = {
    url: `${origem}${caminho}`,
    focused,
    visibilityState: focused ? "visible" : "hidden",
    focus: vi.fn(async () => j),
    postMessage: vi.fn((_msg: unknown, portas: { postMessage: (m: unknown) => void }[]) => {
      if (responde) portas[0].postMessage({ ok: true });
    }),
    navigate: vi.fn(async (url: string) => ({ ...j, url })),
  };
  return j;
}

/** O MessageChannel do navegador, sem as portas reais do Node (que seguram o processo). */
class CanalFalso {
  port1: { onmessage: ((e: { data: unknown }) => void) | null } = { onmessage: null };
  port2 = { postMessage: (data: unknown) => this.port1.onmessage?.({ data }) };
}

function carregarSw(janelas: Janela[]) {
  const ouvintes: Record<string, (e: unknown) => void> = {};
  const clients = {
    matchAll: vi.fn(async () => janelas),
    openWindow: vi.fn(async () => null),
    claim: vi.fn(async () => {}),
  };
  const self = {
    location: { origin: ORIGEM },
    clients,
    registration: { showNotification: vi.fn() },
    skipWaiting: vi.fn(),
    addEventListener: (tipo: string, f: (e: unknown) => void) => {
      ouvintes[tipo] = f;
    },
  };
  runInNewContext(CODIGO, { self, URL, MessageChannel: CanalFalso, setTimeout, clearTimeout });
  async function clicar(url: string | undefined) {
    let espera: Promise<unknown> = Promise.resolve();
    ouvintes.notificationclick({
      notification: { data: url === undefined ? {} : { url }, close: vi.fn() },
      waitUntil: (p: Promise<unknown>) => {
        espera = p;
      },
    });
    // O pedido que fica sem resposta espera 1,5 s antes de navegar do outro jeito.
    await vi.advanceTimersByTimeAsync(2000);
    await espera;
  }
  return { clients, clicar };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("o clique no push do navegador (public/sw.js)", () => {
  it("com o Connect aberto: foca a janela e leva à tela do aviso pela navegação do app", async () => {
    const aberta = janela("/licencas", { focused: true });
    const { clients, clicar } = carregarSw([aberta]);
    await clicar("/robo/assistir/t1");
    expect(aberta.focus).toHaveBeenCalled();
    expect(aberta.postMessage).toHaveBeenCalledWith({ tipo: "connect:navegar", url: "/robo/assistir/t1" }, expect.anything());
    expect(aberta.navigate).not.toHaveBeenCalled();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it("a página não responde (portal, versão antiga): navega a janela mesmo assim, sem abrir outra", async () => {
    const aberta = janela("/licencas", { responde: false });
    const { clients, clicar } = carregarSw([aberta]);
    await clicar("/robo/assistir/t1");
    expect(aberta.focus).toHaveBeenCalled();
    expect(aberta.navigate).toHaveBeenCalledWith(`${ORIGEM}/robo/assistir/t1`);
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it("janela já na tela do aviso: só vem para a frente", async () => {
    const naTela = janela("/robo/assistir/t1");
    const outra = janela("/licencas", { focused: true });
    const { clients, clicar } = carregarSw([outra, naTela]);
    await clicar("/robo/assistir/t1");
    expect(naTela.focus).toHaveBeenCalled();
    expect(naTela.postMessage).not.toHaveBeenCalled();
    expect(outra.focus).not.toHaveBeenCalled();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it("várias janelas: a que está em foco é a que vai", async () => {
    const atras = janela("/empresas");
    const naFrente = janela("/licencas", { focused: true });
    const { clicar } = carregarSw([atras, naFrente]);
    await clicar("/certidoes?recorte=positivas");
    expect(naFrente.postMessage).toHaveBeenCalledWith({ tipo: "connect:navegar", url: "/certidoes?recorte=positivas" }, expect.anything());
    expect(atras.focus).not.toHaveBeenCalled();
  });

  it("sem janela do Connect (só de outro site): abre uma nova", async () => {
    const deFora = janela("/qualquer", { origem: "https://outro.exemplo.invalid", focused: true });
    const { clients, clicar } = carregarSw([deFora]);
    await clicar("/robo/assistir/t1");
    expect(deFora.focus).not.toHaveBeenCalled();
    expect(clients.openWindow).toHaveBeenCalledWith(`${ORIGEM}/robo/assistir/t1`);
  });

  it("sem endereço no aviso, vai para as notificações", async () => {
    const { clients, clicar } = carregarSw([]);
    await clicar(undefined);
    expect(clients.openWindow).toHaveBeenCalledWith(`${ORIGEM}/notificacoes`);
  });

  it("aviso apontando para fora do Connect não abre nada", async () => {
    const aberta = janela("/licencas", { focused: true });
    const { clients, clicar } = carregarSw([aberta]);
    await clicar("https://outro.exemplo.invalid/x");
    expect(aberta.focus).not.toHaveBeenCalled();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });
});
