// Gravador dos vídeos de passo a passo da ajuda (01/10/2026).
//
// Cada vídeo é um roteiro: uma sequência de "aponte aqui, diga isto, clique".
// O Playwright navega pelo Connect LOCAL e grava a tela; por cima da página vão
// uma legenda (os vídeos são sem voz), um cursor visível e um anel de destaque
// no elemento da vez. Nada disso é do Connect: é injetado no navegador da
// gravação e só existe no vídeo.
//
// Só grava contra localhost: o vídeo vai para o YouTube, e dado de cliente
// real não pode aparecer nele. Os dados vêm de scripts/local/recriar-banco.mjs.

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

export const BASE = (process.env.APP_PUBLIC_URL ?? "http://localhost:3100").replace(/\/$/, "");
// 16:9. Em 1280x720 o menu do portal não cabe inteiro na altura e os últimos
// itens ("Com a equipe") ficam escondidos atrás da rolagem.
export const TAMANHO = { width: 1600, height: 900 };

export function garantirAmbienteLocal() {
  const host = new URL(BASE).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`Recusado: os vídeos só são gravados no Connect local (APP_PUBLIC_URL aponta para "${host}").`);
  }
}

// ─── A camada visual ────────────────────────────────────────────────────────
//
// Roda dentro da página, a cada documento novo (addInitScript). O estado
// (legenda e posição do cursor) mora no sessionStorage para atravessar as
// navegações: sem isso a legenda piscaria e o cursor voltaria ao canto a cada
// troca de tela.
function camadaVisual() {
  const w = window as unknown as Record<string, unknown>;
  if (w.__gv) return;

  type Estado = { legenda: string | null; x: number; y: number };
  const ler = (): Estado => {
    try {
      return JSON.parse(sessionStorage.getItem("__gv") ?? "") as Estado;
    } catch {
      return { legenda: null, x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
  };
  const salvar = (e: Estado) => {
    try {
      sessionStorage.setItem("__gv", JSON.stringify(e));
    } catch {
      /* sem storage, só não persiste */
    }
  };

  const montar = () => {
    if (document.getElementById("gv-raiz")) return;
    const estilo = document.createElement("style");
    estilo.textContent = `
      #gv-raiz, #gv-raiz * { box-sizing: border-box; }
      #gv-raiz { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
        font-family: var(--font-sans, "IBM Plex Sans"), system-ui, sans-serif; }
      #gv-legenda { position: absolute; left: 50%; bottom: 40px; transform: translate(-50%, 12px);
        max-width: 64%; padding: 16px 28px; border-radius: 14px; background: rgba(13, 27, 62, .92);
        color: #fff; font-size: 26px; line-height: 1.35; font-weight: 500; text-align: center;
        box-shadow: 0 12px 40px rgba(13, 27, 62, .35); opacity: 0; transition: opacity .35s ease, transform .35s ease;
        text-wrap: balance; }
      #gv-legenda.gv-visivel { opacity: 1; transform: translate(-50%, 0); }
      #gv-cursor { position: absolute; left: 0; top: 0; width: 30px; height: 30px; margin: -3px 0 0 -5px;
        transition: left .7s cubic-bezier(.4, 0, .2, 1), top .7s cubic-bezier(.4, 0, .2, 1);
        filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .35)); }
      #gv-pulso { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
        background: rgba(31, 94, 234, .35); transform: scale(0); opacity: 0; }
      #gv-pulso.gv-clique { animation: gv-clique .45s ease-out; }
      @keyframes gv-clique { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }
      #gv-anel { position: absolute; border: 3px solid #1F5EEA; border-radius: 12px; opacity: 0;
        box-shadow: 0 0 0 6px rgba(31, 94, 234, .18); transition: opacity .3s ease, left .3s ease, top .3s ease,
        width .3s ease, height .3s ease; }
      #gv-anel.gv-visivel { opacity: 1; }
      #gv-cartaz { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 18px; padding: 0 12%; text-align: center; color: #fff;
        background: radial-gradient(120% 120% at 30% 20%, #1F5EEA 0%, #12347D 55%, #0D1B3E 100%);
        opacity: 0; transition: opacity .5s ease; }
      #gv-cartaz.gv-visivel { opacity: 1; }
      #gv-cartaz small { font-size: 18px; letter-spacing: .14em; text-transform: uppercase; opacity: .75; }
      #gv-cartaz strong { font-size: 54px; line-height: 1.12; font-weight: 600; text-wrap: balance; }
      #gv-cartaz span { font-size: 24px; line-height: 1.4; opacity: .85; max-width: 900px; text-wrap: balance; }
    `;
    const raiz = document.createElement("div");
    raiz.id = "gv-raiz";
    raiz.innerHTML = `
      <div id="gv-anel"></div>
      <div id="gv-legenda"></div>
      <div id="gv-pulso"></div>
      <svg id="gv-cursor" viewBox="0 0 24 24"><path d="M4 2.5 L4 19.5 L8.6 15.3 L11.6 22 L14.6 20.7 L11.7 14.1 L18 14.1 Z"
        fill="#0D1B3E" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <div id="gv-cartaz"><small></small><strong></strong><span></span></div>`;
    document.documentElement.appendChild(estilo);
    document.documentElement.appendChild(raiz);

    const e = ler();
    posicionarCursor(e.x, e.y);
    if (e.legenda) mostrarLegenda(e.legenda, false);
  };

  const el = (id: string) => document.getElementById(id) as HTMLElement;

  function posicionarCursor(x: number, y: number) {
    el("gv-cursor").style.left = `${x}px`;
    el("gv-cursor").style.top = `${y}px`;
  }
  function mostrarLegenda(texto: string | null, animar = true) {
    const l = el("gv-legenda");
    if (!texto) {
      l.classList.remove("gv-visivel");
      return;
    }
    l.textContent = texto;
    if (!animar) l.style.transition = "none";
    l.classList.add("gv-visivel");
    if (!animar) requestAnimationFrame(() => (l.style.transition = ""));
  }

  w.__gv = {
    legenda(texto: string | null) {
      montar();
      mostrarLegenda(texto);
      salvar({ ...ler(), legenda: texto });
    },
    cursor(x: number, y: number) {
      montar();
      posicionarCursor(x, y);
      salvar({ ...ler(), x, y });
    },
    clique(x: number, y: number) {
      montar();
      const p = el("gv-pulso");
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.classList.remove("gv-clique");
      void p.offsetWidth;
      p.classList.add("gv-clique");
    },
    anel(r: { x: number; y: number; width: number; height: number } | null) {
      montar();
      const a = el("gv-anel");
      if (!r) {
        a.classList.remove("gv-visivel");
        return;
      }
      // Rente à borda da tela (o menu lateral), o anel sairia cortado: encosta
      // nele por dentro.
      const folga = 6;
      const esquerda = Math.max(4, r.x - folga);
      const topo = Math.max(4, r.y - folga);
      a.style.left = `${esquerda}px`;
      a.style.top = `${topo}px`;
      a.style.width = `${r.x + r.width + folga - esquerda}px`;
      a.style.height = `${r.y + r.height + folga - topo}px`;
      a.classList.add("gv-visivel");
    },
    cartaz(c: { selo: string; titulo: string; texto?: string } | null) {
      montar();
      const k = el("gv-cartaz");
      if (!c) {
        k.classList.remove("gv-visivel");
        return;
      }
      (k.querySelector("small") as HTMLElement).textContent = c.selo;
      (k.querySelector("strong") as HTMLElement).textContent = c.titulo;
      (k.querySelector("span") as HTMLElement).textContent = c.texto ?? "";
      k.classList.add("gv-visivel");
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
}

// O tsx compila com `keepNames`, que embrulha as funções internas em
// `__name(fn, "nome")`. A função vai para o navegador como texto, e lá
// `__name` não existe — sem este calço a camada quebra na primeira chamada.
const SHIM_DO_TSX = "globalThis.__name = globalThis.__name || ((f) => f);";

// ─── O roteiro ──────────────────────────────────────────────────────────────

/** Tempo de leitura de uma legenda: ~14 caracteres por segundo, com piso. */
function tempoDeLeitura(texto: string) {
  return Math.max(2600, texto.length * 72) + 500;
}

export class Roteiro {
  private fotos = 0;

  constructor(
    readonly page: Page,
    /** Pasta das fotos de conferência (uma por legenda), para revisar sem assistir. */
    private readonly pastaDeFotos: string
  ) {}

  private async gv<T>(fn: string, ...args: unknown[]): Promise<T> {
    // Garante a camada numa página onde o init script não rodou (about:blank).
    await this.page.evaluate(SHIM_DO_TSX);
    await this.page.evaluate(camadaVisual);
    return this.page.evaluate(
      ([f, a]) => ((window as unknown as { __gv: Record<string, (...x: unknown[]) => unknown> }).__gv[f as string](...(a as unknown[])) as T),
      [fn, args] as const
    );
  }

  async pausa(ms: number) {
    await this.page.waitForTimeout(ms);
  }

  /** Abre a tela e espera ela assentar antes de seguir. */
  async ir(caminho: string) {
    await this.page.goto(BASE + caminho, { waitUntil: "domcontentloaded", timeout: 60000 });
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.pausa(400);
  }

  async esperarTela(caminho: string | RegExp) {
    await this.page.waitForURL(typeof caminho === "string" ? (u) => u.pathname === caminho : caminho, { timeout: 20000 });
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.pausa(500);
  }

  /** Mostra a legenda e espera o tempo de leitura dela. */
  async legenda(texto: string, ms = tempoDeLeitura(texto)) {
    await this.gv("legenda", texto);
    await this.pausa(450);
    await this.foto();
    await this.pausa(Math.max(0, ms - 450));
  }

  async semLegenda() {
    await this.gv("legenda", null);
    await this.pausa(350);
  }

  /** Tela cheia de abertura/encerramento. */
  async cartaz(selo: string, titulo: string, texto?: string, ms = 3800) {
    await this.gv("legenda", null);
    await this.gv("cartaz", { selo, titulo, texto });
    await this.pausa(600);
    await this.foto();
    await this.pausa(ms);
    await this.gv("cartaz", null);
    await this.pausa(600);
  }

  private async centro(alvo: Locator) {
    await alvo.scrollIntoViewIfNeeded();
    await this.pausa(250);
    const caixa = await alvo.boundingBox();
    if (!caixa) throw new Error(`Elemento sem posição na tela: ${alvo}`);
    return caixa;
  }

  /** Leva o cursor até o elemento, contorna-o e (opcionalmente) explica. */
  async apontar(alvo: Locator, legenda?: string) {
    const c = await this.centro(alvo);
    const x = c.x + c.width / 2;
    const y = c.y + c.height / 2;
    await this.page.mouse.move(x, y, { steps: 12 });
    await this.gv("cursor", x, y);
    await this.gv("anel", c);
    await this.pausa(750);
    if (legenda) await this.legenda(legenda);
  }

  /** Contorna um bloco que vai do primeiro ao último elemento (um trecho de menu). */
  async apontarGrupo(primeiro: Locator, ultimo: Locator, legenda?: string) {
    const a = await this.centro(primeiro);
    const b = await this.centro(ultimo);
    const caixa = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
      height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y),
    };
    const x = a.x + a.width / 2;
    const y = a.y + a.height / 2;
    await this.page.mouse.move(x, y, { steps: 12 });
    await this.gv("cursor", x, y);
    await this.gv("anel", caixa);
    await this.pausa(750);
    if (legenda) await this.legenda(legenda);
  }

  async soltar() {
    await this.gv("anel", null);
  }

  async clicar(alvo: Locator, legenda?: string) {
    await this.apontar(alvo, legenda);
    const c = await this.centro(alvo);
    await this.gv("clique", c.x + c.width / 2, c.y + c.height / 2);
    await this.pausa(200);
    await this.gv("anel", null);
    await alvo.click();
    await this.pausa(500);
  }

  /** Digita no ritmo de uma pessoa, para dar tempo de ler o que entra. */
  async digitar(alvo: Locator, texto: string, legenda?: string) {
    await this.clicar(alvo, legenda);
    await alvo.pressSequentially(texto, { delay: texto.length > 80 ? 22 : 45 });
    await this.pausa(500);
  }

  async rolarAte(alvo: Locator) {
    await alvo.evaluate((n) => n.scrollIntoView({ behavior: "smooth", block: "center" }));
    await this.pausa(900);
  }

  async foto() {
    this.fotos += 1;
    await this.page.screenshot({ path: path.join(this.pastaDeFotos, `${String(this.fotos).padStart(2, "0")}.png`) });
  }
}

// ─── A sessão de gravação ───────────────────────────────────────────────────

export type DefinicaoDeVideo = {
  /** Nome do arquivo, sem extensão. A ordem vem do prefixo numérico. */
  arquivo: string;
  titulo: string;
  /** Uma frase sobre o que o vídeo ensina — vai no cartaz de abertura. */
  resumo: string;
  /** Precisa começar logado? (o de "entrar no portal" não.) */
  logado: boolean;
  executar: (r: Roteiro) => Promise<void>;
};

export async function abrirNavegador(): Promise<Browser> {
  garantirAmbienteLocal();
  return chromium.launch();
}

/** Faz o login uma vez, fora da gravação, e devolve o estado da sessão. */
export async function sessaoLogada(
  browser: Browser,
  login: { url: string; email: string; senha: string; destino: RegExp },
  arquivo: string
) {
  const ctx = await browser.newContext({ viewport: TAMANHO, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await ctx.newPage();
  await page.goto(BASE + login.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#email").fill(login.email);
  await page.locator("#senha").fill(login.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(login.destino, { timeout: 30000 });
  await ctx.storageState({ path: arquivo });
  await ctx.close();
  return arquivo;
}

export async function gravar(
  browser: Browser,
  video: DefinicaoDeVideo,
  opcoes: { pastaDeSaida: string; estadoLogado?: string }
) {
  const temporaria = path.join(opcoes.pastaDeSaida, ".bruto", video.arquivo);
  const fotos = path.join(opcoes.pastaDeSaida, "_conferencia", video.arquivo);
  rmSync(temporaria, { recursive: true, force: true });
  rmSync(fotos, { recursive: true, force: true });
  mkdirSync(fotos, { recursive: true });

  const ctx: BrowserContext = await browser.newContext({
    viewport: TAMANHO,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: video.logado ? opcoes.estadoLogado : undefined,
    recordVideo: { dir: temporaria, size: TAMANHO },
  });
  await ctx.addInitScript({ content: SHIM_DO_TSX });
  await ctx.addInitScript(camadaVisual);
  const page = await ctx.newPage();
  const roteiro = new Roteiro(page, fotos);
  let erro: unknown = null;
  try {
    await video.executar(roteiro);
  } catch (e) {
    erro = e;
    await page.screenshot({ path: path.join(fotos, "ERRO.png") }).catch(() => {});
  }
  await ctx.close();
  const destino = path.join(opcoes.pastaDeSaida, `${video.arquivo}.webm`);
  if (!erro) await page.video()?.saveAs(destino);
  rmSync(temporaria, { recursive: true, force: true });
  if (erro) throw erro;
  return destino;
}
