// Prévia da conta corrente e da previsão dos títulos do Omie — SÓ LEITURA (20/10/2026).
//
//   npx tsx --env-file=.env scripts/omie-previa-financeiro.ts                 # lista as empresas com conta do Omie
//   npx tsx --env-file=.env scripts/omie-previa-financeiro.ts --empresa <id>  # a prévia de uma empresa
//
// ── Por que isto existe ─────────────────────────────────────────────────────
//
// A leitura das contas do Omie (`sincronizacaoFinanceiro.ts`) passou a gravar
// a conta corrente prevista (`nCodCC`) e a data de previsão (`dDtPrevisao`) do
// título — campos da documentação do `financas/mf` `ListarMovimentos` que
// ainda não tinham sido vistos numa resposta real da listagem de títulos (a
// de 25/09 conferiu só a listagem de conta corrente, `cTpLancamento: "CC"`).
// Esta prévia chama a mesma listagem que a leitura chama e conta, na primeira
// página, quantos títulos trazem cada campo e quantos a leitura preencheria.
//
// ── O que ela NÃO faz ───────────────────────────────────────────────────────
//
// Só `ListarMovimentos` e `ListarContasCorrentes`; o script se recusa a chamar
// qualquer outro método. Não grava no banco do Connect (só lê a conta do Omie
// da empresa e as contas bancárias dela). E não imprime dado do cliente: a
// forma da resposta sai mascarada (letra vira "x", dígito vira "9"), e o resto
// são nomes de campo e contagens. As chaves do Omie nunca aparecem.

import { getPrisma } from "@/lib/prisma";
import { lerConfig } from "@/lib/integracoes/data";
import { nomeExibicao } from "@/lib/companyName";
import type { CredencialOmie } from "@/lib/integracoes/omie/cliente";
import { instanciaDaEmpresa, PREFIXO_DA_EMPRESA, PREFIXO_DO_FINANCEIRO } from "@/lib/integracoes/omie/contas";
import { chamarOmieNaFila } from "@/lib/integracoes/omie/fila";
import { estruturaSemDados } from "@/lib/integracoes/omie/estrutura";
import { instanteDoOmie } from "@/lib/integracoes/omie/notas";
import { lerContasCorrentes, paginaDeContasCorrentes } from "@/lib/integracoes/omie/conciliacao";
import { mapearMovimento, paginaDeMovimentos, type TituloDoOmie } from "@/lib/integracoes/omie/financeiro";

const SO_LEITURA = new Set(["ListarMovimentos", "ListarContasCorrentes"]);
/** Uma página como amostra: o bastante para ver se os campos vêm, sem carga. */
const POR_PAGINA = 100;
const MAX_PAGINAS_DE_CONTAS = 10;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const preenchido = (v: unknown) => texto(v) !== "" && texto(v) !== "0";

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  if (i >= 0) return process.argv[i + 1];
  return process.argv.find((a) => a.startsWith(`${nome}=`))?.split("=")[1];
}

async function chamar(cred: CredencialOmie, modulo: string, call: string, param: Record<string, unknown>, mostrar: boolean): Promise<unknown> {
  if (!SO_LEITURA.has(call)) throw new Error(`A prévia só lê: ${call} não está na lista.`);
  console.log(`\n── ${modulo} ${call}  ${JSON.stringify(param)}`);
  const corpo = await chamarOmieNaFila(cred, modulo, call, param);
  if (mostrar) {
    const linhas = estruturaSemDados(corpo);
    const largura = Math.min(70, Math.max(...linhas.map((l) => l.caminho.length), 10));
    for (const l of linhas) console.log(`   ${l.caminho.padEnd(largura)}  ${l.tipo.padEnd(10)}  ${l.exemplo}`);
    if (linhas.length >= 200) console.log("   … (cortado em 200 campos)");
  }
  return corpo;
}

async function listarContas() {
  const prisma = getPrisma();
  const conexoes = await prisma.tenantIntegration.findMany({
    where: { integrationCode: "omie", instanceKey: { startsWith: PREFIXO_DA_EMPRESA } },
    select: { tenantId: true, instanceKey: true, enabled: true },
  });
  const importaram = new Set(
    (
      await prisma.tenantIntegration.findMany({
        where: { integrationCode: "omie", instanceKey: { startsWith: PREFIXO_DO_FINANCEIRO } },
        select: { instanceKey: true },
      })
    ).map((l) => l.instanceKey.slice(PREFIXO_DO_FINANCEIRO.length))
  );
  const ids = conexoes.map((c) => c.instanceKey.slice(PREFIXO_DA_EMPRESA.length));
  const empresas = await prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, displayName: true } });
  const porId = new Map(empresas.map((e) => [e.id, nomeExibicao(e)]));
  console.log("Empresas com conta do Omie no Connect:\n");
  for (const c of conexoes) {
    const id = c.instanceKey.slice(PREFIXO_DA_EMPRESA.length);
    console.log(`  ${id}  ${c.enabled ? "ligada   " : "DESLIGADA"}  ${importaram.has(id) ? "contas importadas" : "                 "}  ${porId.get(id) ?? "(empresa removida)"}`);
  }
  console.log("\nDe preferência uma com as contas importadas. Rode de novo com --empresa <id>.");
}

async function main() {
  const companyId = argumento("--empresa");
  if (!companyId) return listarContas();

  const prisma = getPrisma();
  const empresa = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, tenantId: true, name: true, displayName: true } });
  if (!empresa) throw new Error(`Empresa ${companyId} não encontrada.`);
  const conexao = await prisma.tenantIntegration.findUnique({
    where: { tenantId_integrationCode_instanceKey: { tenantId: empresa.tenantId, integrationCode: "omie", instanceKey: instanciaDaEmpresa(companyId) } },
    select: { configEnc: true },
  });
  if (!conexao) throw new Error("Esta empresa não tem conta do Omie cadastrada.");
  const config = lerConfig(conexao.configEnc);
  if (!config.appKey || !config.appSecret) throw new Error("Falta App Key ou App Secret na conta desta empresa.");
  const cred = { appKey: config.appKey, appSecret: config.appSecret };

  console.log("Prévia da conta corrente e da previsão dos títulos — só leitura");
  console.log(`Empresa: ${nomeExibicao(empresa)} (${empresa.id})`);

  // 1. Os títulos, como a leitura pede (a janela é a dela: desde 1º de janeiro do ano passado).
  const corpo = await chamar(
    cred,
    "financas/mf",
    "ListarMovimentos",
    { nPagina: 1, nRegPorPagina: POR_PAGINA, dDtVencDe: `01/01/${new Date().getFullYear() - 1}` },
    true
  );
  const itens = paginaDeMovimentos(corpo).itens;
  const detalhes = itens.map((i) => obj(obj(i).detalhes));
  const comTitulo = detalhes.filter((d) => preenchido(d.nCodTitulo));

  // Todo campo de `detalhes` que apareceu na página, com quantos vieram preenchidos.
  const campos = new Map<string, number>();
  for (const d of comTitulo) for (const [k, v] of Object.entries(d)) campos.set(k, (campos.get(k) ?? 0) + (preenchido(v) ? 1 : 0));
  console.log(`\n   → ${itens.length} movimento(s) na página; ${comTitulo.length} com título.`);
  console.log(`   Campos de detalhes (preenchidos de ${comTitulo.length}):`);
  console.log(`     ${[...campos].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k} ${n}`).join(" · ")}`);

  const comConta = comTitulo.filter((d) => preenchido(d.nCodCC));
  const comPrevisao = comTitulo.filter((d) => preenchido(d.dDtPrevisao));
  const previsaoLegivel = comPrevisao.filter((d) => instanteDoOmie(d.dDtPrevisao, null));
  const previsaoDiferente = previsaoLegivel.filter((d) => texto(d.dDtPrevisao) !== texto(d.dDtVenc));
  console.log("\n   nCodCC (conta corrente do título)");
  console.log(`     o campo existe em ${comTitulo.filter((d) => "nCodCC" in d).length} de ${comTitulo.length}; preenchido em ${comConta.length}; ${new Set(comConta.map((d) => texto(d.nCodCC))).size} conta(s) distinta(s)`);
  console.log("   dDtPrevisao (data de previsão)");
  console.log(
    `     o campo existe em ${comTitulo.filter((d) => "dDtPrevisao" in d).length} de ${comTitulo.length}; preenchido em ${comPrevisao.length}; ` +
      `no formato dd/mm/aaaa em ${previsaoLegivel.length}; diferente do vencimento em ${previsaoDiferente.length}`
  );

  // 2. O nCodCC do título é o código de uma conta corrente do Omie?
  const contas: unknown[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS_DE_CONTAS; pagina++) {
    const c = await chamar(cred, "geral/contacorrente", "ListarContasCorrentes", { pagina, registros_por_pagina: 100 }, false);
    const p = paginaDeContasCorrentes(c);
    contas.push(...p.itens);
    if (pagina >= p.totalDePaginas || p.itens.length === 0) break;
  }
  const todas = new Set(contas.map((c) => texto(obj(c).nCodCC)).filter(Boolean));
  const ligaveis = new Set(lerContasCorrentes(contas).map((c) => c.id));
  console.log(`\n   → ${todas.size} conta(s) corrente(s) no Omie; ${ligaveis.size} do tipo conta corrente (as que o Connect liga)`);
  console.log(
    `     títulos cujo nCodCC é uma conta da lista: ${comConta.filter((d) => todas.has(texto(d.nCodCC))).length} de ${comConta.length}; ` +
      `de conta corrente: ${comConta.filter((d) => ligaveis.has(texto(d.nCodCC))).length}`
  );

  // 3. O que a leitura nova faria com esta página.
  const ligadas = await prisma.bankAccount.findMany({
    where: { tenantId: empresa.tenantId, companyId, omieAccountId: { not: null } },
    select: { omieAccountId: true },
  });
  const ligadasNoConnect = new Set(ligadas.map((c) => c.omieAccountId!));
  const titulos = itens.map(mapearMovimento).filter((r): r is TituloDoOmie => !("fora" in r));
  const abertos = titulos.filter((t) => t.situacao === "ABERTO");
  console.log(`\n   → a leitura nova, nesta página (${titulos.length} título(s) que entram, ${abertos.length} em aberto):`);
  console.log(`     conta corrente prevista: ${titulos.filter((t) => t.contaCorrenteId && ligadasNoConnect.has(t.contaCorrenteId)).length} preenchida(s); ` +
    `${titulos.filter((t) => t.contaCorrenteId && !ligadasNoConnect.has(t.contaCorrenteId)).length} com conta do Omie ainda sem conta ligada no Connect ` +
    `(${ligadasNoConnect.size} conta(s) ligada(s) hoje)`);
  console.log(`     previsão: ${titulos.filter((t) => t.previsao).length} preenchida(s) — só em aberto e diferente do vencimento; nula é o próprio vencimento`);

  console.log("\nFim da prévia. Nada foi criado nem alterado no Omie, e nada foi gravado no Connect.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
