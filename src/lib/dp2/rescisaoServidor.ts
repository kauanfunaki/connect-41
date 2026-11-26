// Rescisão gravada no DP 2 (25/11/2026, funcionalidade-746, entrega 2.3): o
// cálculo de uma pessoa a partir das entradas da tela (o mesmo para mostrar,
// gravar e gerar o S-2299).

import type { MotivoCanonico } from "@/lib/rescisao/motivos";
import { calcularRescisaoDoDp2, type CalculoDaRescisao } from "./rescisao";
import { mediaDaPessoa, tabelasDoEscritorio, vinculoDoMotor } from "./servidor";
import { tabelasDaCompetencia } from "./tabelas";
import type { Prisma } from "@/generated/prisma/client";

export type AvisoDaRescisao = "INDENIZADO" | "TRABALHADO" | "DISPENSADO";

export type EntradaDaTela = {
  desligamento: string;
  motivo: MotivoCanonico;
  aviso: AvisoDaRescisao;
  vencidos: number;
  faltas: number;
  saldoFgts: number | null;
  adiantado: number;
};

type PessoaComContrato = { id: string; admissionDate: Date | null; dp2Vinculo: Parameters<typeof vinculoDoMotor>[0] | null };

/** Calcula a rescisão de uma pessoa pelas tabelas e pela média do DP 2. */
export async function calcularRescisaoDaPessoa(
  tenantId: string,
  pessoa: PessoaComContrato,
  e: EntradaDaTela
): Promise<{ ok: true; calculo: CalculoDaRescisao; media: { media: number; memoria: string } } | { ok: false; erro: string }> {
  if (!pessoa.dp2Vinculo) return { ok: false, erro: "Sem contrato no DP 2." };
  if (!pessoa.admissionDate) return { ok: false, erro: "Sem data de admissão no cadastro da pessoa." };
  const competencia = e.desligamento.slice(0, 7);
  const tab = tabelasDaCompetencia(competencia, await tabelasDoEscritorio(tenantId));
  if (!tab.ok) return { ok: false, erro: `Faltam tabelas para ${competencia}: ${tab.faltam.join(", ")}.` };
  const media = await mediaDaPessoa(tenantId, pessoa.id, competencia, "RESCISAO");
  const calculo = calcularRescisaoDoDp2({
    motivo: e.motivo,
    admissao: pessoa.admissionDate,
    desligamento: new Date(`${e.desligamento}T00:00:00.000Z`),
    avisoIndenizado: e.aviso === "INDENIZADO",
    avisoDispensado: e.aviso === "DISPENSADO",
    vinculo: vinculoDoMotor(pessoa.dp2Vinculo),
    mediaVariaveis: media.media,
    periodosVencidos: e.vencidos,
    faltas: e.faltas,
    saldoFgts: e.saldoFgts,
    decimoAdiantado: e.adiantado,
    tabelas: tab.tabelas,
  });
  return { ok: true, calculo, media };
}

/** Os dados da rescisão para gravar (valores e linhas como saíram do cálculo). */
export function dadosDaRescisao(c: CalculoDaRescisao, media: { memoria: string }) {
  return {
    proventos: c.proventos,
    descontos: c.descontos,
    liquido: c.liquido,
    fgts: c.fgts,
    multaFgts: c.multaFgts,
    linhas: c.linhas as unknown as Prisma.InputJsonValue,
    alertas: [...c.alertas, ...c.faltando, `Média de variáveis: ${media.memoria}`] as unknown as Prisma.InputJsonValue,
  };
}
