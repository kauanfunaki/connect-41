// Telas em manutenção (13/11/2026, pedido do Kauan) — as regras, sem banco.
//
// Enquanto a Tech corrige um erro numa tela, ela sai do ar para os setores:
// quem abre vê o aviso de manutenção, e não uma tela pela metade, que confunde
// ou grava dado errado. Quem conserta continua entrando, para testar.
//
// Puro de propósito: o proxy e o menu (componente de cliente) usam as mesmas
// regras, e nenhum dos dois pode puxar o Prisma.

import { MODULE_ROUTES, getModuleDef } from "@/lib/module-catalog";
import { ACENDEM_JUNTO } from "@/lib/caminhoDoMenu";
import { formatInstantDate, formatInstantTime } from "@/lib/format";

/** O setor que conserta as telas — quem é dele passa pela manutenção. */
export const SETOR_QUE_CONSERTA = "tech";

/** A página do aviso. O proxy reescreve para ela, sem mudar o endereço. */
export const PAGINA_DE_MANUTENCAO = "/manutencao";

/** Até onde vai o motivo que a equipe do setor lê no aviso (a coluna é de 280). */
export const MOTIVO_MAXIMO = 280;

/**
 * Os endereços de cada tela, do mais comprido para o mais curto: uma tela que
 * mora debaixo de outra (`/processos/painel` debaixo de `/processos`) é ela,
 * e não a de cima. As abas que acendem o item de outra tela (Desligamentos e
 * Férias, nas Admissões) entram em manutenção com ela.
 */
const ENDERECOS: readonly { prefixo: string; codigo: string }[] = Object.entries(MODULE_ROUTES)
  .flatMap(([codigo, rota]) => {
    const base = rota.split("?")[0];
    return [base, ...(ACENDEM_JUNTO[base] ?? [])].map((prefixo) => ({ prefixo, codigo }));
  })
  .sort((a, b) => b.prefixo.length - a.prefixo.length);

const dentro = (caminho: string, prefixo: string) => caminho === prefixo || caminho.startsWith(`${prefixo}/`);

/**
 * A tela (código do módulo) de um endereço, ou `null` quando ele não é de
 * tela de setor — Início, Empresas, Admin e o resto do menu Geral.
 *
 * Tela sem endereço próprio abre em `/setor/{setor}/{código}`: vale o código,
 * qualquer que seja o setor do endereço.
 */
export function telaDoCaminho(caminho: string): string | null {
  const limpo = caminho.length > 1 && caminho.endsWith("/") ? caminho.slice(0, -1) : caminho;
  const achado = ENDERECOS.find((e) => dentro(limpo, e.prefixo));
  if (achado) return achado.codigo;
  const doSetor = /^\/setor\/[^/]+\/([^/]+)(?:\/|$)/.exec(limpo);
  if (doSetor && getModuleDef(doSetor[1])) return doSetor[1];
  return null;
}

/**
 * Quem pode abrir uma tela em manutenção para testar: quem pode colocar e
 * tirar a manutenção (administrador e super admin) e quem é do setor que
 * conserta. A tela é bloqueada para eles também; entram só pelo "Abrir para
 * testar" do aviso (13/11/2026, o Kauan pediu o bloqueio no lugar da faixa).
 */
export function passaPelaManutencao(quem: { role: string; sectors: readonly string[] }): boolean {
  return quem.role === "SUPER_ADMIN" || quem.role === "ADMIN" || quem.sectors.includes(SETOR_QUE_CONSERTA);
}

/** "13/11/2026" no fuso de São Paulo — a chave do dia. */
const diaNoFuso = (d: Date) => formatInstantDate(d, { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Quando, no jeito de falar do aviso: "hoje às 15:00", "amanhã às 09:30",
 * "ontem às 18:10" ou "20/11 às 14:00" (com o ano, se for outro). No fuso de
 * São Paulo, e não no do servidor.
 */
export function quandoNoAviso(data: Date, agora: Date): string {
  const hora = formatInstantTime(data, { hour: "2-digit", minute: "2-digit" });
  const dia = diaNoFuso(data);
  const umDia = 86_400_000;
  if (dia === diaNoFuso(agora)) return `hoje às ${hora}`;
  if (dia === diaNoFuso(new Date(agora.getTime() + umDia))) return `amanhã às ${hora}`;
  if (dia === diaNoFuso(new Date(agora.getTime() - umDia))) return `ontem às ${hora}`;
  const mesmoAno = dia.slice(-4) === diaNoFuso(agora).slice(-4);
  return `${mesmoAno ? dia.slice(0, 5) : dia} às ${hora}`;
}

/**
 * A tela que o proxy confere: só a abertura de página (GET/HEAD, inclusive a
 * navegação pelo menu, que pede o RSC no mesmo endereço). Ficam de fora as
 * rotas de API e as ações (POST): quem já estava com a tela aberta termina o
 * que estava fazendo, e o aviso aparece na próxima vez que abrir.
 */
export function telaParaConferir(metodo: string, caminho: string): string | null {
  if (metodo !== "GET" && metodo !== "HEAD") return null;
  if (caminho.startsWith("/api/") || caminho.startsWith("/_next/") || dentro(caminho, PAGINA_DE_MANUTENCAO)) return null;
  return telaDoCaminho(caminho);
}

// ── Abrir para testar (13/11/2026, pedido do Kauan) ──────────────────────────
//
// A tela em manutenção fica bloqueada para todos, inclusive para quem conserta.
// Quem passa pela manutenção vê, no aviso, o botão "Abrir para testar": ele
// grava neste cookie a manutenção que a pessoa abriu, e o proxy deixa só ela
// entrar. O cookie guarda o id da manutenção, e não o código da tela: liberada
// e colocada de novo, a tela volta a bloquear até a pessoa abrir outra vez.
// O cookie sozinho não abre nada: o proxy confere também o papel e o setor do
// token.

export const COOKIE_DE_TESTE = "manutencao_em_teste";

/** Quanto dura o "Abrir para testar": um dia de trabalho. */
export const HORAS_DE_TESTE = 10;

/** Quantas manutenções o cookie guarda — as mais recentes. */
const MAXIMO_NO_COOKIE = 20;

const ID_VALIDO = /^[0-9a-f-]{36}$/i;

/** As manutenções que a pessoa abriu para testar, do valor do cookie. */
export function manutencoesEmTeste(valor: string | undefined): string[] {
  if (!valor) return [];
  return valor.split(",").filter((id) => ID_VALIDO.test(id));
}

/** O valor novo do cookie, com a manutenção aberta agora por último. */
export function comManutencaoEmTeste(valor: string | undefined, id: string): string {
  const outras = manutencoesEmTeste(valor).filter((x) => x !== id);
  return [...outras, id].slice(-MAXIMO_NO_COOKIE).join(",");
}

/** O valor novo do cookie, sem a manutenção — vazio quando não sobra nenhuma. */
export function semManutencaoEmTeste(valor: string | undefined, id: string): string {
  return manutencoesEmTeste(valor).filter((x) => x !== id).join(",");
}

// ── O aviso a cada entrada (25/11/2026, bug-833) ─────────────────────────────
//
// Até aqui, o "Abrir para testar" valia pelas 10 horas do cookie: depois do
// clique, o aviso nunca mais aparecia para quem conserta, que esquecia que a
// tela estava em manutenção. Agora o aviso volta toda vez que a pessoa ENTRA
// na tela; o teste vale enquanto ela está DENTRO dela.
//
// - Entrar: o "Abrir para testar" grava, além do cookie de teste, um passe de
//   entrada de um minuto, gasto na primeira abertura da tela.
// - Estar dentro: o pedido vem da própria tela (o Referer é dela) — os
//   cliques e filtros de dentro, a navegação para uma página de dentro dela.
// - Vindo de fora (menu, outra tela, link), o aviso aparece de novo, e o teste
//   sai do cookie: até o "Tentar de novo" do aviso pede outro clique.
// - Recarregar a página (F5) conta como entrar: o navegador repete o Referer
//   de quando a página abriu.

/** As opções dos dois cookies: fora do alcance do JavaScript, no site inteiro. */
export function opcoesDoCookieDeTeste(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}

/** O passe de entrada, gravado pelo "Abrir para testar" e gasto pelo proxy. */
export const COOKIE_DE_ENTRADA = "manutencao_entrada";

/** Quanto dura o passe: o tempo de a página recarregar. */
export const SEGUNDOS_DE_ENTRADA = 60;

/** O caminho de um Referer, ou `null` sem Referer ou com um que não se lê. */
export function caminhoDoReferer(referer: string | null | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).pathname;
  } catch {
    return null;
  }
}

export type TesteNaManutencao = {
  /** A tela abre para a pessoa (e não o aviso). */
  abre: boolean;
  /** O passe de entrada foi usado agora: o proxy apaga o cookie dele. */
  gastaEntrada: boolean;
  /** O teste desta manutenção sai do cookie (o aviso voltou a aparecer). */
  tiraDoTeste: boolean;
};

/**
 * Se quem conserta entra na tela em manutenção, ou vê o aviso. Quem não
 * conserta nunca entra, e nada muda nos cookies dele. Prefetch (o Next
 * buscando de antemão o link do menu) não mexe nos cookies: a pessoa ainda
 * não saiu de onde está.
 */
export function testeNaManutencao(p: {
  conserta: boolean;
  manutencao: string;
  tela: string;
  cookieDeTeste: string | undefined;
  cookieDeEntrada: string | undefined;
  referer: string | null | undefined;
  prefetch: boolean;
}): TesteNaManutencao {
  const emTeste = p.conserta && manutencoesEmTeste(p.cookieDeTeste).includes(p.manutencao);
  if (!emTeste) return { abre: false, gastaEntrada: false, tiraDoTeste: false };
  const deDentro = (() => {
    const caminho = caminhoDoReferer(p.referer);
    return caminho !== null && caminho !== PAGINA_DE_MANUTENCAO && telaDoCaminho(caminho) === p.tela;
  })();
  if (deDentro) return { abre: true, gastaEntrada: false, tiraDoTeste: false };
  const comPasse = p.cookieDeEntrada === p.manutencao;
  if (comPasse) return { abre: true, gastaEntrada: !p.prefetch, tiraDoTeste: false };
  return { abre: false, gastaEntrada: false, tiraDoTeste: !p.prefetch };
}

/** O pedido é um prefetch do Next (o link buscado de antemão), e não a pessoa abrindo. */
export function ehPrefetch(cabecalhos: { get(nome: string): string | null }): boolean {
  if (cabecalhos.get("next-router-prefetch")) return true;
  const proposito = `${cabecalhos.get("sec-purpose") ?? ""} ${cabecalhos.get("purpose") ?? ""}`;
  return /prefetch/i.test(proposito);
}
