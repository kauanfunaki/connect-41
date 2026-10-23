// PIS e COFINS no modo motor (API-CONNECT §11.3, 23/10/2026).
//
// Fechamento: só leituras leves (blocos, faturamento, conferência, duplicatas
// e aluguéis). Demonstrativo: a lista de competências é leve; o demonstrativo
// lê um arquivo por competência e é `pesada`. Tudo por raiz: o motor converte
// a raiz na matriz (`422 matriz_nao_cadastrada` sem ela).

import "server-only";
import { doMotor, type Leitura } from "../leitura";
import type { AlugueisDeImoveis, ConferenciaDoFechamento, DemonstrativoContrib, Faturamento, FechamentoContrib } from "@/lib/sped/telasDoMotor";
import type { ContextoDoMotor } from "../estabelecimentos";
import { param } from "../url";
import { cursorDaUrl, falha, MODULO, opcaoDaUrl, podeLer, SEM_PERMISSAO, type Params, type TelaDeLeitura } from "./comum";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const ANO = /^\d{4}$/;

/** O período do Fechamento: `periodo` da URL (mês ou ano), senão a competência do recorte. */
export function periodoDoFechamento(params: Params, contexto: ContextoDoMotor): string {
  const p = param(params, "periodo");
  return p && (MES.test(p) || ANO.test(p)) ? p : contexto.competencia;
}

export type FechamentoDaTela = {
  periodo: string;
  competencias: Leitura<string[]>;
  blocos: Leitura<FechamentoContrib>;
  faturamento: Leitura<Faturamento>;
  conferencia: Leitura<ConferenciaDoFechamento>;
  duplicatas: Leitura<Awaited<ReturnType<TelaDeLeitura["motor"]["cliente"]["duplicatas"]>>>;
  alugueis: Leitura<AlugueisDeImoveis>;
  cursorDuplicatas: string | null;
  /** A conferência mostra a fila inteira (sem competência), como o padrão do painel. */
  filaInteira: boolean;
  semCredito: boolean;
};

/**
 * A aba Fechamento. A conferência segue o período escolhido; com `fila=toda`,
 * a fila inteira, que é o padrão do painel (§11.3.5: "a fila não é escopada
 * por padrão"). As duplicatas paginam por cursor (`c_dup`).
 */
export async function carregarFechamento(tela: TelaDeLeitura, params: Params): Promise<FechamentoDaTela | null> {
  const { contexto, motor } = tela;
  if (!contexto || !podeLer(tela, MODULO.contribuicoes)) return null;
  const raiz = contexto.raiz;
  const periodo = periodoDoFechamento(params, contexto);
  const filaInteira = param(params, "fila") === "toda";
  const semCredito = param(params, "sem_credito") === "1";
  const cursorDuplicatas = cursorDaUrl(params, "c_dup");
  const tipo = param(params, "tipo_dup");
  const [competencias, blocos, faturamento, conferencia, duplicatas, alugueis] = await Promise.all([
    doMotor(async () => (await motor.cliente.competenciasDoFechamento(raiz)).competencias),
    doMotor(() => motor.cliente.fechamento(raiz, periodo)),
    doMotor(() => motor.cliente.faturamento(raiz, periodo)),
    doMotor(() => motor.cliente.conferenciaDoFechamento(raiz, { competencia: filaInteira ? undefined : periodo, sem_credito: semCredito })),
    doMotor(() => motor.cliente.duplicatas(raiz, { competencia: periodo, tipo: tipo && /^[a-z_]{1,30}$/.test(tipo) ? tipo : undefined, limite: 50, cursor: cursorDuplicatas })),
    doMotor(() => motor.cliente.alugueisDeImoveis(raiz)),
  ]);
  return { periodo, competencias, blocos, faturamento, conferencia, duplicatas, alugueis, cursorDuplicatas, filaInteira, semCredito };
}

export const RELATORIOS = ["entradas", "saidas"] as const;
export const ORDENS = ["cst", "cfop", "valor"] as const;

export type FiltroDoDemonstrativo = {
  ano?: string;
  competencia?: string;
  filial: "todas" | number;
  relatorio: (typeof RELATORIOS)[number];
  ordenar: (typeof ORDENS)[number];
};

/** As competências com SPED de Contribuições (leve), para o seletor. */
export async function competenciasDoDemonstrativo(tela: TelaDeLeitura): Promise<Leitura<{ competencias: string[]; anos: string[] }>> {
  if (!podeLer(tela, MODULO.contribuicoes)) return falha(SEM_PERMISSAO, "sem_permissao", 403);
  if (!tela.contexto) return falha("Nenhuma raiz de CNPJ liberada.");
  const raiz = tela.contexto.raiz;
  return doMotor(() => tela.motor.cliente.competenciasDoDemonstrativoContrib(raiz));
}

/**
 * O recorte do demonstrativo: `visao=ano` pede o ano da competência (ou o
 * `ano` da URL); senão, a competência do recorte quando ela tem arquivo, e na
 * falta dela o ano mais recente. Filial só entre os estabelecimentos visíveis.
 * `null` quando não há nada gerado.
 */
export function filtroDoDemonstrativo(params: Params, tela: Pick<TelaDeLeitura, "contexto" | "mapa">, disponiveis: { competencias: string[]; anos: string[] }): FiltroDoDemonstrativo | null {
  const { contexto } = tela;
  if (!contexto) return null;
  const relatorio = opcaoDaUrl(params, "relatorio", RELATORIOS) ?? "entradas";
  const ordenar = opcaoDaUrl(params, "ordenar", ORDENS) ?? "cst";
  const filialId = Number(param(params, "filial"));
  const filial = Number.isSafeInteger(filialId) && tela.mapa.visiveis.some((e) => e.id === filialId) ? filialId : "todas" as const;
  const anoUrl = param(params, "ano");
  const base = { filial, relatorio, ordenar };
  if (param(params, "visao") === "ano") {
    const ano = anoUrl && ANO.test(anoUrl) ? anoUrl : contexto.competencia.slice(0, 4);
    return { ...base, ano };
  }
  if (disponiveis.competencias.includes(contexto.competencia)) return { ...base, competencia: contexto.competencia };
  const ano = disponiveis.anos[0] ?? disponiveis.competencias[0]?.slice(0, 4);
  return ano ? { ...base, ano } : null;
}

export async function carregarDemonstrativoContrib(tela: TelaDeLeitura, filtro: FiltroDoDemonstrativo): Promise<Leitura<DemonstrativoContrib>> {
  if (!podeLer(tela, MODULO.contribuicoes)) return falha(SEM_PERMISSAO, "sem_permissao", 403);
  if (!tela.contexto) return falha("Nenhuma raiz de CNPJ liberada.");
  const raiz = tela.contexto.raiz;
  return doMotor(() => tela.motor.cliente.demonstrativoContribuicoes(raiz, filtro));
}
