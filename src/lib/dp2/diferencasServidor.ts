// Diferenças retroativas: leitura das competências fechadas e gravação
// (26/11/2026, funcionalidade-760). A regra está em diferencasRetroativas.ts.

import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { regimeDaCategoria } from "./categorias";
import { diferencaDoMes, mesesDoPeriodo, salarioFamiliaRetroativo, type DiferencaDoMes, type PedidoDeDiferencas } from "./diferencasRetroativas";
import type { ItemDoHolerite } from "./mensal";
import { salarioNoMes } from "./reajuste";
import { tabelasDoEscritorio } from "./servidor";
import { competenciaDe, tabelasDaCompetencia } from "./tabelas";

export type ResultadoDasDiferencas = { ok: true; pessoas: number; linhas: number; total: number; inss: number; jaLancadas: number } | { ok: false; erro: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Calcula e grava, na competência mensal aberta, as diferenças dos meses
 * fechados do período, uma linha por pessoa e mês. `personIds` nulo = todos
 * com cálculo no período. Quem já tem diferença do mesmo tipo e mês nesta
 * competência fica de fora (não duplica).
 */
export async function lancarDiferencas(tenantId: string, competenciaId: string, pedido: PedidoDeDiferencas, personIds: string[] | null, userId: string): Promise<ResultadoDasDiferencas> {
  const prisma = getPrisma();
  const comp = await prisma.dp2Competencia.findFirst({ where: { id: competenciaId, tenantId } });
  if (!comp) return { ok: false, erro: "Competência não encontrada." };
  if (comp.tipo !== "MENSAL") return { ok: false, erro: "As diferenças são pagas na folha mensal." };
  if (comp.situacao === "FECHADA") return { ok: false, erro: "Competência fechada: reabra para lançar." };
  const destino = competenciaDe(comp.ano, comp.mes);
  if (pedido.ate >= destino) return { ok: false, erro: `O período tem de terminar antes de ${destino.split("-").reverse().join("/")}, o mês em que a diferença é paga.` };
  const meses = new Set(mesesDoPeriodo(pedido.de, pedido.ate));
  const fechadas = (await prisma.dp2Competencia.findMany({ where: { tenantId, companyId: comp.companyId, tipo: "MENSAL", situacao: "FECHADA" }, select: { id: true, ano: true, mes: true } })).filter((c) =>
    meses.has(competenciaDe(c.ano, c.mes))
  );
  if (fechadas.length === 0) return { ok: false, erro: "Não há competência mensal fechada da empresa no período." };
  const perRefDe = new Map(fechadas.map((c) => [c.id, competenciaDe(c.ano, c.mes)]));
  const calculos = await prisma.dp2Calculo.findMany({
    where: { tenantId, competenciaId: { in: fechadas.map((c) => c.id) }, ...(personIds ? { personId: { in: personIds } } : {}) },
    select: { personId: true, competenciaId: true, itens: true },
  });
  if (calculos.length === 0) return { ok: false, erro: "Ninguém tem cálculo nas competências fechadas do período." };
  const ids = [...new Set(calculos.map((c) => c.personId))];
  const [vinculos, historico, escritorio, jaExistem] = await Promise.all([
    prisma.dp2Vinculo.findMany({ where: { tenantId, personId: { in: ids } }, select: { personId: true, salarioBase: true, tipoSalario: true, horasMensais: true, categoria: true } }),
    prisma.dp2HistoricoSalarial.findMany({ where: { tenantId, personId: { in: ids } }, select: { personId: true, data: true, salario: true, salarioAnterior: true } }),
    tabelasDoEscritorio(tenantId),
    prisma.dp2DiferencaRetroativa.findMany({ where: { tenantId, competenciaId, origem: pedido.tipo }, select: { personId: true, perRef: true } }),
  ]);
  const vinculoDe = new Map(vinculos.map((v) => [v.personId, v]));
  const ja = new Set(jaExistem.map((j) => `${j.personId}|${j.perRef}`));
  const tabelasDe = new Map<string, ReturnType<typeof tabelasDaCompetencia>>();
  for (const perRef of perRefDe.values()) tabelasDe.set(perRef, tabelasDaCompetencia(perRef, escritorio));
  const faltam = [...tabelasDe.entries()].filter(([, t]) => !t.ok).map(([m]) => m);
  if (faltam.length) return { ok: false, erro: `Faltam tabelas para ${faltam.join(", ")}.` };

  const loteId = randomUUID();
  const linhas: { personId: string; d: DiferencaDoMes }[] = [];
  let jaLancadas = 0;
  for (const c of calculos) {
    const v = vinculoDe.get(c.personId);
    if (!v || regimeDaCategoria(v.categoria) !== "CLT") continue;
    const perRef = perRefDe.get(c.competenciaId)!;
    if (ja.has(`${c.personId}|${perRef}`)) {
      jaLancadas++;
      continue;
    }
    const tab = tabelasDe.get(perRef)!;
    if (!tab.ok) continue;
    const itens = (c.itens ?? []) as unknown as ItemDoHolerite[];
    const fimDoMes = iso(new Date(Date.UTC(Number(perRef.slice(0, 4)), Number(perRef.slice(5, 7)), 0)));
    let d: DiferencaDoMes | null;
    if (pedido.tipo === "SALARIO_FAMILIA") {
      d = salarioFamiliaRetroativo({ perRef, itens }, pedido.filhos, tab.tabelas.salarioFamilia.dados);
    } else {
      const salario = salarioNoMes(
        historico.filter((h) => h.personId === c.personId).map((h) => ({ data: iso(h.data), salario: Number(h.salario), salarioAnterior: h.salarioAnterior === null ? null : Number(h.salarioAnterior) })),
        fimDoMes,
        Number(v.salarioBase)
      );
      d = diferencaDoMes({ perRef, itens, salario, tipoSalario: v.tipoSalario, horasMensais: v.horasMensais }, pedido, tab.tabelas.inss.dados);
    }
    if (d) linhas.push({ personId: c.personId, d });
  }
  if (linhas.length === 0) {
    return jaLancadas
      ? { ok: false, erro: "As diferenças desse período já foram lançadas nesta competência." }
      : pedido.tipo === "SALARIO_FAMILIA"
        ? { ok: false, erro: "Ninguém tem salário-família a receber no período: a remuneração passou do limite da tabela ou o salário-família já foi pago." }
        : { ok: false, erro: "Ninguém tem diferença no período (o reajuste já foi aplicado aos meses fechados?)." };
  }
  const instrumento = pedido.tipo === "SALARIO_FAMILIA" ? null : pedido.instrumento;
  const dataInstrumento = pedido.tipo === "SALARIO_FAMILIA" || !pedido.dataInstrumento ? null : new Date(`${pedido.dataInstrumento}T00:00:00Z`);
  await prisma.dp2DiferencaRetroativa.createMany({
    data: linhas.map(({ personId, d }) => ({
      tenantId,
      companyId: comp.companyId,
      competenciaId,
      personId,
      loteId,
      origem: pedido.tipo,
      perRef: d.perRef,
      instrumento,
      dataInstrumento,
      descricao: pedido.descricao,
      valor: d.valor,
      inss: d.inss,
      memoria: d.memoria,
      criadoPorId: userId,
    })),
  });
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ok: true,
    pessoas: new Set(linhas.map((l) => l.personId)).size,
    linhas: linhas.length,
    total: r2(linhas.reduce((s, l) => s + l.d.valor, 0)),
    inss: r2(linhas.reduce((s, l) => s + l.d.inss, 0)),
    jaLancadas,
  };
}
