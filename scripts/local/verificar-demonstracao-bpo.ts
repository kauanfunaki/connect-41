// Confere, num banco LOCAL com a demonstração do BPO já gravada, o que as telas
// vão mostrar — pelas mesmas funções que as telas usam (15/10/2026):
//
// - DRE de caixa da matriz no mês passado: uma categoria sem classificação, a
//   do delivery, e a diferença de fechamento zerada;
// - Conciliação da matriz: as duas transações pendentes com sugestão, e o saldo
//   do banco igual ao calculado em cada conta;
// - Meu dia de quem apresenta: os cards, a pendência e as solicitações dele;
// - Meu time do coordenador: a carga das quatro pessoas fictícias da equipe;
// - os avisos automáticos: o motor roda inteiro e não avisa nada sobre as
//   empresas "[demo]" (a conta que vence hoje, a pendência atrasada, os cards
//   vencidos, o orçamento).
//
// Recusa banco que não seja local. Uso:
//   node scripts/local/com-banco-local.mjs npx tsx scripts/local/verificar-demonstracao-bpo.ts --usuario <e-mail>

import { getPrisma } from "../../src/lib/prisma";
import { saoPauloParts } from "../../src/lib/agenda";
import { centavosDeDecimal, dreDoMes } from "../../src/lib/dre/data";
import { rankearCandidatos, sugestaoDaTransacao } from "../../src/lib/financeiro/conciliacao/casamento";
import { saldosDasContas } from "../../src/lib/financeiro/conciliacao/saldoDasContas";
import { itensDaGestao } from "../../src/lib/gestao/itens";
import { cargaPorPessoa } from "../../src/lib/gestao/regras";
import { nomesDasPessoas } from "../../src/lib/gestao/telas";
import { runAlertEngine } from "../../src/lib/alerts";
import { isModuleEnabled } from "../../src/lib/modules";
import { FONTE_DA_DEMO, SLUG_DO_TENANT } from "../../src/lib/demonstracao/bpo/plano";

const falhas: string[] = [];
function conferir(ok: boolean, texto: string) {
  console.log(`${ok ? "  ok " : "  FALHOU "} ${texto}`);
  if (!ok) falhas.push(texto);
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const host = new URL(url.replace(/^mysql:/, "http:")).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error("Recusado: só em banco local.");
  const p = getPrisma();
  const tenant = await p.tenant.findUnique({ where: { slug: SLUG_DO_TENANT }, select: { id: true } });
  if (!tenant) throw new Error("escritório não encontrado");
  const t = tenant.id;
  const email = process.argv[process.argv.indexOf("--usuario") + 1];
  const eu = await p.user.findFirst({ where: { tenantId: t, email }, select: { id: true } });
  if (!eu) throw new Error("--usuario não encontrado");

  const empresas = await p.company.findMany({ where: { tenantId: t, source: FONTE_DA_DEMO }, select: { id: true, name: true, parentCompanyId: true } });
  const matriz = empresas.find((e) => !e.parentCompanyId)!;
  conferir(empresas.length === 3 && !!matriz, "três empresas da demonstração, uma matriz");

  // ── DRE de caixa do mês passado ───────────────────────────────────────────
  const hoje = saoPauloParts(new Date()).dateKey;
  const [ano, mes] = hoje.split("-").map(Number) as [number, number];
  const passado = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const dre = await dreDoMes(t, matriz.id, passado);
  const soltas = dre.resultado.naoClassificado;
  console.log(`\nDRE de caixa ${passado.mes}/${passado.ano}: ${dre.lancamentos} lançamentos, fonte ${dre.fonte.tipo}`);
  conferir(dre.fonte.tipo === "financeiro", "a DRE sai dos lançamentos (nenhum mês importado)");
  conferir(soltas.length === 1 && /delivery/i.test(soltas[0]!.categoria), `uma categoria sem classificação: ${soltas.map((s) => s.categoria).join(", ") || "nenhuma"}`);
  conferir(dre.resultado.diferencaDeFechamento === 0, "diferença de fechamento zero");
  console.log(`  por grupo (R$): ${Object.entries(dre.resultado.porGrupo).filter(([, v]) => v !== 0).map(([g, v]) => `${g} ${(v / 100).toFixed(2)}`).join(" · ")}`);

  // ── Conciliação ───────────────────────────────────────────────────────────
  console.log("\nConciliação");
  const contas = await p.bankAccount.findMany({ where: { tenantId: t, companyId: { in: empresas.map((e) => e.id) } }, select: { id: true, nickname: true, openingBalance: true, openingBalanceDate: true, companyId: true } });
  const saldos = await saldosDasContas(t, contas);
  for (const c of contas) {
    const s = saldos.get(c.id);
    const bate = s?.tipo === "conferido" && s.calculadoNaDataCentavos === s.bancoCentavos;
    conferir(bate, `${c.nickname}: saldo do banco = calculado (${s?.tipo === "conferido" ? `${s.bancoCentavos / 100} × ${s.calculadoNaDataCentavos / 100}` : s?.tipo})`);
  }
  const contaDaMatriz = contas.find((c) => c.companyId === matriz.id)!;
  const pendentes = await p.bankTransaction.findMany({ where: { tenantId: t, bankAccountId: contaDaMatriz.id, status: "PENDENTE" }, select: { amount: true, postedAt: true, memo: true, payeeName: true } });
  const lancamentos = await p.financeEntry.findMany({
    where: { tenantId: t, companyId: matriz.id, status: { not: "CANCELADO" }, bankMatch: { is: null } },
    select: { id: true, kind: true, status: true, amount: true, dueDate: true, paidAt: true, description: true, counterparty: { select: { name: true, document: true } } },
  });
  const candidatos = lancamentos.map((l) => ({
    id: l.id,
    kind: l.kind,
    status: l.status,
    centavos: centavosDeDecimal(l.amount),
    vencimentoKey: saoPauloParts(l.dueDate).dateKey,
    pagoEmKey: l.paidAt ? saoPauloParts(l.paidAt).dateKey : null,
    contraparteNome: l.counterparty.name,
    contraparteDocumento: l.counterparty.document,
    conciliado: false,
    bloqueioDeBaixa: null,
  }));
  const descricao = new Map(lancamentos.map((l) => [l.id, l.description]));
  let comSugestao = 0;
  for (const tx of pendentes) {
    const ranking = rankearCandidatos({ centavos: centavosDeDecimal(tx.amount), dataKey: saoPauloParts(tx.postedAt).dateKey, memo: tx.memo, nome: tx.payeeName }, candidatos);
    const forte = sugestaoDaTransacao(ranking);
    if (forte) comSugestao++;
    console.log(`  ${tx.memo} → ${forte ? descricao.get(forte.candidato.lancamento.id) : "sem sugestão"}`);
  }
  conferir(comSugestao === 2, `duas transações pendentes com sugestão (${comSugestao})`);

  // ── Meu dia ───────────────────────────────────────────────────────────────
  const meus = await itensDaGestao(t, "todos", new Date(), { responsavel: eu.id });
  const daDemo = meus.filter((i) => i.item.empresaId && empresas.some((e) => e.id === i.item.empresaId));
  console.log(`\nMeu dia de quem apresenta: ${daDemo.length} itens da demonstração`);
  for (const i of daDemo) console.log(`  [${i.item.origem}] ${i.item.titulo} — ${i.c.coluna}${i.c.prazo ? ` (${i.c.prazo.situacao} ${i.c.prazo.dias})` : ""}`);
  conferir(daDemo.some((i) => i.item.origem === "CARD" && i.c.prazo?.situacao === "VENCIDO"), "um card vencido no Meu dia");
  conferir(daDemo.some((i) => i.item.origem === "CARD" && i.c.prazo?.dias === 0), "um card que vence hoje");

  // ── Meu time (o coordenador, com o setor do BPO) ──────────────────────────
  const doSetor = await itensDaGestao(t, ["bpo"], new Date());
  const carga = cargaPorPessoa(doSetor);
  const nomes = await nomesDasPessoas(t, [...carga.keys()]);
  console.log("\nMeu time (setor BPO)");
  for (const pessoa of carga.values()) {
    console.log(`  ${nomes.get(pessoa.userId) ?? pessoa.userId}: ${pessoa.abertos} abertos, ${pessoa.vencidos} vencidos, ${pessoa.vencendo} vencendo, ${pessoa.parados} parados`);
  }
  const daEquipe = [...carga.values()].filter((x) => (nomes.get(x.userId) ?? "").startsWith("[demo] "));
  conferir(daEquipe.length === 4, `as quatro pessoas fictícias aparecem com carga (${daEquipe.length})`);
  conferir(daEquipe.some((x) => x.vencidos > 0) && daEquipe.some((x) => x.parados > 0), "há gente com atrasado e gente com parado");
  const semResponsavel = doSetor.filter((x) => x.c.coluna !== "CONCLUIDO" && x.item.responsaveis.length === 0).length;
  conferir(semResponsavel > 0, `itens sem responsável (${semResponsavel})`);

  // ── Avisos automáticos ────────────────────────────────────────────────────
  console.log("\nAvisos automáticos");
  for (const m of ["bpo_contas_pagar", "bpo_pendencias", "portal_solicitacoes", "gestao_painel", "dre_orcamento"]) {
    console.log(`  módulo ${m}: ${(await isModuleEnabled(t, m)) ? "ligado" : "desligado"}`);
  }
  const antes = await p.notification.count({ where: { tenantId: t } });
  const r = await runAlertEngine();
  const novas = await p.notification.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" }, take: Math.max(0, (await p.notification.count({ where: { tenantId: t } })) - antes), select: { type: true, message: true } });
  for (const n of novas) console.log(`  aviso novo: ${n.type} — ${n.message}`);
  conferir(novas.length === 0, `o motor de avisos não avisou nada (${r.alertsSent} enviados, ${novas.length} notificações novas)`);

  console.log(falhas.length === 0 ? "\nTudo conferido." : `\n${falhas.length} conferência(s) falharam.`);
  if (falhas.length > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => getPrisma().$disconnect().catch(() => {}));
