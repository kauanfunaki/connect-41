// A Academia (Fase 1, 10/11/2026, pedido do Kauan): a área de aprendizado da
// equipe, com digitação, digitação de números e lógica, ranking do mês e
// certificado para o pódio. Paridade com os testes do 41 Hub, que seguem no ar.
//
// Este arquivo é a regra sem banco — a tela (componente de cliente), o
// servidor, a API e a importação usam a mesma conta. Quem lê e grava o banco
// mora em `servidor.ts`.

import type { AuthContext } from "@/lib/auth/context";
import { canManageSector } from "@/lib/auth/papeis";
import { MESES, hojeIso } from "@/lib/datas/calendario";

/** O código do módulo no catálogo (`module-catalog.ts`). */
export const MODULO_ACADEMIA = "academia";
/**
 * O setor que administra a Academia: o coordenador da Tech, além do
 * Administrador e do Super Admin. O módulo é `fixedSector` no Tech.
 */
export const SETOR_DA_ACADEMIA = "tech";

export const TESTES = ["digitacao", "numeros", "logica"] as const;
export type Teste = (typeof TESTES)[number];
export const NIVEIS = ["facil", "medio", "dificil"] as const;
export type Nivel = (typeof NIVEIS)[number];

export const ROTULO_DO_TESTE: Record<Teste, string> = {
  digitacao: "Digitação",
  numeros: "Digitação de números",
  logica: "Lógica",
};
/** O rótulo curto, para abas e cartões de métrica. */
export const ROTULO_CURTO_DO_TESTE: Record<Teste, string> = { digitacao: "Digitação", numeros: "Números", logica: "Lógica" };
export const ROTULO_DO_NIVEL: Record<Nivel, string> = { facil: "Fácil", medio: "Médio", dificil: "Difícil" };

export const ehTeste = (v: unknown): v is Teste => typeof v === "string" && (TESTES as readonly string[]).includes(v);
export const ehNivel = (v: unknown): v is Nivel => typeof v === "string" && (NIVEIS as readonly string[]).includes(v);

/** O teste é de digitar (ppm e precisão) ou de responder (acertos)? */
export const ehDeDigitar = (t: Teste) => t !== "logica";

// ─── Tempos (paridade com o Hub) ─────────────────────────────────────────────

/** O relógio da digitação: 60 s, contados a partir da primeira tecla (como no Hub). */
export const TEMPO_DA_DIGITACAO_S = 60;
/** O relógio da lógica: 3 minutos para 10 questões (como no Hub). */
export const TEMPO_DA_LOGICA_S = 180;
export const QUESTOES_POR_RODADA = 10;
/** Até quando a sessão aceita o envio: 3 min na digitação e 6 min na lógica (Hub). */
export const VALIDADE_DA_SESSAO_MS: Record<Teste, number> = { digitacao: 3 * 60_000, numeros: 3 * 60_000, logica: 6 * 60_000 };

// ─── Quem pode ───────────────────────────────────────────────────────────────

type Quem = Pick<AuthContext, "role" | "sectors" | "subscriptionReadOnly">;

/**
 * Quem administra textos, questões e o prêmio do mês: Administrador, Super
 * Admin e o coordenador da Tech (gestor do setor Tech).
 */
export function podeAdministrarAcademia(ctx: Quem): boolean {
  return canManageSector(ctx, SETOR_DA_ACADEMIA);
}

/**
 * Quem faz os testes: toda a equipe, menos o Somente leitura (que vê a
 * Academia, mas não grava resultado), o escritório em somente leitura e o
 * Super Admin visitando outro escritório — o resultado entraria no ranking de
 * uma equipe que não é a dele.
 */
export function podeFazerTeste(ctx: Quem & Pick<AuthContext, "tenantId" | "homeTenantId">): boolean {
  return !ctx.subscriptionReadOnly && ctx.role !== "READONLY" && ctx.tenantId === ctx.homeTenantId;
}

export function motivoSemTeste(ctx: Quem & Pick<AuthContext, "tenantId" | "homeTenantId">): string {
  if (ctx.subscriptionReadOnly) return "O escritório está em modo somente leitura: os testes voltam quando a assinatura for regularizada.";
  if (ctx.tenantId !== ctx.homeTenantId) return "Você está visitando outro escritório: os testes são feitos no seu escritório de origem.";
  return "Seu perfil é somente leitura: você vê a Academia e o ranking, mas não faz os testes.";
}

// ─── Mês e dia (São Paulo) ───────────────────────────────────────────────────

/** "AAAA-MM" do instante, no relógio do escritório. */
export const mesDoInstante = (agora: Date = new Date()) => hojeIso(agora).slice(0, 7);
/** "AAAA-MM-DD" do instante, no relógio do escritório. */
export const diaDoInstante = (agora: Date = new Date()) => hojeIso(agora);

export const ehMes = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/** O mês acabou (para o certificado): é anterior ao mês de hoje. */
export const mesFechado = (mes: string, agora: Date = new Date()) => mes < mesDoInstante(agora);

/** "novembro" — o nome do mês, para "Posição em novembro". */
export function nomeDoMes(mes: string): string {
  const m = Number(mes.slice(5, 7));
  return (MESES[m - 1] ?? mes).toLowerCase();
}
/** "novembro de 2026". */
export const mesPorExtensoLongo = (mes: string) => `${nomeDoMes(mes)} de ${mes.slice(0, 4)}`;

/** Os meses do seletor do ranking: do atual para trás, até `quantos`. */
export function mesesParaEscolher(atual: string, quantos = 12): string[] {
  const lista = [atual];
  while (lista.length < quantos) lista.push(mesAnterior(lista[lista.length - 1]));
  return lista;
}

// ─── A tentativa do dia ──────────────────────────────────────────────────────

/**
 * O dia gravado na sessão valendo; nulo no treino livre. A chave única
 * (userId, teste, nivel, diaValendo) faz o resto: a segunda tentativa valendo
 * do mesmo dia, no mesmo nível, não entra — nem com duas abas ao mesmo tempo.
 *
 * Começar conta: a tentativa do dia é gasta quando o texto ou as questões
 * aparecem, e não quando o resultado é enviado. No Hub ela só contava ao
 * enviar, e dava para abrir as questões, desistir e começar de novo com
 * outras (o "aperto barato" pedido pelo Kauan).
 */
export const diaValendoDaSessao = (valendo: boolean, agora: Date = new Date()) => (valendo ? diaDoInstante(agora) : null);

/** Pode começar valendo neste nível? `usadosHoje` são os níveis já tentados hoje neste teste. */
export function podeComecarValendo(usadosHoje: Iterable<string>, nivel: Nivel): boolean {
  for (const n of usadosHoje) if (n === nivel) return false;
  return true;
}

// ─── Nível do Hub ────────────────────────────────────────────────────────────

/**
 * No Hub, o texto e a questão têm dificuldade de 1 a 5, e o nível sai dela:
 * 1–2 fácil, 3 médio, 4–5 difícil. O resultado do Hub já grava o nível em
 * inglês ("easy" | "medium" | "hard").
 */
export function nivelDaDificuldadeDoHub(dificuldade: number): Nivel {
  if (dificuldade <= 2) return "facil";
  if (dificuldade <= 3) return "medio";
  return "dificil";
}
export function nivelDoHub(level: string | null | undefined): Nivel | null {
  const v = (level ?? "").trim().toLowerCase();
  if (v === "easy") return "facil";
  if (v === "medium") return "medio";
  if (v === "hard") return "dificil";
  return null;
}

/** O setor gravado com o resultado: o setor ativo, se a pessoa é dele; senão o primeiro dela. */
export function setorDoResultado(ctx: Pick<AuthContext, "sectors" | "activeSector">): string | null {
  if (ctx.activeSector && ctx.sectors.includes(ctx.activeSector)) return ctx.activeSector;
  return [...ctx.sectors].sort()[0] ?? null;
}
