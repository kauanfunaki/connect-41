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
 * Quem passa pela manutenção e vê a tela como ela está: quem pode colocar e
 * tirar a manutenção (administrador e super admin) e quem é do setor que
 * conserta. Os dois veem a faixa de aviso no alto, para não esquecer que os
 * setores estão vendo o aviso.
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
