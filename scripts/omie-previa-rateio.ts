// Prévia do rateio dos títulos do Omie — SÓ LEITURA (20/10/2026).
//
//   npx tsx --env-file=.env scripts/omie-previa-rateio.ts                                    # lista as empresas com conta do Omie
//   npx tsx --env-file=.env scripts/omie-previa-rateio.ts --empresa <id>                     # 5 páginas de títulos, do começo da janela
//   npx tsx --env-file=.env scripts/omie-previa-rateio.ts --empresa <id> --paginas 20 --fim  # as 20 últimas páginas (as mais recentes)
//
// ── Por que isto existe ─────────────────────────────────────────────────────
//
// A leitura das contas do Omie vai gravar o rateio do título (categorias e
// departamentos) como linhas de `finance_entry_allocations`. A documentação
// do `financas/mf` `ListarMovimentos` fala de uma lista `categorias` com
// `cCodCateg`, `nValor` e `nPerc`, e de departamentos; nada disso foi visto
// numa resposta real. Esta prévia:
//
// 1. percorre os títulos do `ListarMovimentos`, como a leitura pede, e conta
//    os campos de `detalhes` e toda lista que vier no movimento;
// 2. lê a primeira e a última página do `ListarContasPagar` e do
//    `ListarContasReceber`, onde o Omie guarda o rateio do título, e separa
//    os rateados;
// 3. pede ao `ListarMovimentos`, pelo `nCodTitulo`, alguns desses títulos
//    rateados — para ver o que a leitura recebe quando o título é rateado;
// 4. lê `geral/departamentos` `ListarDepartamentos` e confere se os
//    departamentos casam com os centros de custo da empresa no Connect.
//
// A primeira rodada (20/10/2026, numa empresa cliente) mostrou o que a leitura passou
// a fazer: **sem `cExibirDepartamentos: "S"` o movimento vem sem as listas**
// (só `detalhes` e `resumo`, em 824 títulos); com ele, a listagem traz
// `categorias[]` { cCodCateg, nDistrPercentual, nDistrValor, nValorFixo } quando
// há duas ou mais categorias, e `departamentos[]` { cCodDepartamento, … }
// desde um departamento. As linhas batem, código e valor, com as do
// `ListarContasPagar` (lá, `valor` soma o título em 188 de 188). No título
// rateado, o `detalhes.cCodCateg` traz um código que não é nenhuma das linhas.
// O `cCodDepartamento` é o `codigo` do `ListarDepartamentos`.
//
// ── O que ela NÃO faz ───────────────────────────────────────────────────────
//
// Só as quatro listagens acima; o script se recusa a chamar qualquer outro
// método. Não grava no banco do Connect (só lê a conta do Omie da empresa e
// os centros de custo dela). E não imprime dado do cliente: a forma dos
// títulos rateados sai mascarada (letra vira "x", dígito vira "9"), e o resto
// são nomes de campo e contagens. As chaves do Omie nunca aparecem.

import { getPrisma } from "@/lib/prisma";
import { lerConfig } from "@/lib/integracoes/data";
import { nomeExibicao } from "@/lib/companyName";
import { chaveDaCategoria } from "@/lib/dre/calculo";
import type { CredencialOmie } from "@/lib/integracoes/omie/cliente";
import { instanciaDaEmpresa, PREFIXO_DA_EMPRESA, PREFIXO_DO_FINANCEIRO } from "@/lib/integracoes/omie/contas";
import { chamarOmieNaFila } from "@/lib/integracoes/omie/fila";
import { estruturaSemDados } from "@/lib/integracoes/omie/estrutura";
import { paginaDeMovimentos } from "@/lib/integracoes/omie/financeiro";

const SO_LEITURA = new Set(["ListarMovimentos", "ListarContasPagar", "ListarContasReceber", "ListarDepartamentos"]);
const POR_PAGINA = 500;
const PAGINAS_PADRAO = 5;
const MAX_PAGINAS_DE_DEPARTAMENTOS = 10;
/** Quantos títulos rateados das contas a pagar/receber pedir ao ListarMovimentos. */
const RATEADOS_A_CONFERIR = 3;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const preenchido = (v: unknown) => texto(v) !== "" && texto(v) !== "0";

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = texto(v);
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  if (i >= 0) return process.argv[i + 1];
  return process.argv.find((a) => a.startsWith(`${nome}=`))?.split("=")[1];
}

async function chamar(cred: CredencialOmie, modulo: string, call: string, param: Record<string, unknown>): Promise<unknown> {
  if (!SO_LEITURA.has(call)) throw new Error(`A prévia só lê: ${call} não está na lista.`);
  console.log(`── ${modulo} ${call}  ${JSON.stringify(param)}`);
  return chamarOmieNaFila(cred, modulo, call, param);
}

function mostrarEstrutura(valor: unknown) {
  const linhas = estruturaSemDados(valor);
  const largura = Math.min(70, Math.max(...linhas.map((l) => l.caminho.length), 10));
  for (const l of linhas) console.log(`     ${l.caminho.padEnd(largura)}  ${l.tipo.padEnd(10)}  ${l.exemplo}`);
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
  console.log("\nDe preferência uma que rateia no Omie. Rode de novo com --empresa <id>.");
}

/** Quantos itens trouxeram cada campo, e quantos com valor. */
function contarCampos(itens: Obj[]): string {
  const campos = new Map<string, { existe: number; preenchido: number }>();
  for (const i of itens) {
    for (const [k, v] of Object.entries(i)) {
      const c = campos.get(k) ?? { existe: 0, preenchido: 0 };
      c.existe++;
      if (Array.isArray(v) ? v.length > 0 : preenchido(v)) c.preenchido++;
      campos.set(k, c);
    }
  }
  return [...campos]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, c]) => `${k} ${c.preenchido}/${c.existe}`)
    .join(" · ");
}

/** Os campos numéricos de uma lista, com em quantos títulos a soma deles fecha o valor do título (ou 100). */
function somasQueFecham(titulos: { lista: Obj[]; alvo: number }[]): string {
  const campos = new Set(titulos.flatMap((t) => t.lista.flatMap((i) => Object.keys(i))));
  const partes: string[] = [];
  for (const campo of [...campos].sort()) {
    const comCampo = titulos.filter((t) => t.lista.every((i) => numero(i[campo]) !== null));
    if (comCampo.length === 0) continue;
    const soma = (t: (typeof comCampo)[number]) => t.lista.reduce((s, i) => s + numero(i[campo])!, 0);
    const fechaValor = comCampo.filter((t) => Math.abs(soma(t) - t.alvo) < 0.005).length;
    const fechaCem = comCampo.filter((t) => Math.abs(soma(t) - 100) < 0.005).length;
    partes.push(`${campo}: soma = valor do título em ${fechaValor} de ${comCampo.length}; soma = 100 em ${fechaCem}`);
  }
  return partes.length ? partes.join("\n       ") : "(nenhum campo numérico)";
}

/**
 * Toda lista de objetos que vier dentro de cada item (o nome não importa: é o
 * que se quer descobrir), com quantos itens a trazem com 1 e com 2 ou mais
 * linhas, os campos das linhas e se as somas fecham `valorDe(item)`.
 */
function analisarListas(rotulo: string, itens: Obj[], valorDe: (i: Obj) => number) {
  const porNome = new Map<string, { item: Obj; linhas: Obj[] }[]>();
  for (const item of itens) {
    for (const [k, v] of Object.entries(item)) {
      if (!Array.isArray(v)) continue;
      const lista = porNome.get(k) ?? [];
      lista.push({ item, linhas: v.map(obj) });
      porNome.set(k, lista);
    }
  }
  if (porNome.size === 0) {
    console.log(`   ${rotulo}: nenhuma lista dentro dos itens.`);
    return;
  }
  for (const [nome, ocorrencias] of porNome) {
    const uma = ocorrencias.filter((o) => o.linhas.length === 1).length;
    const varias = ocorrencias.filter((o) => o.linhas.length >= 2);
    console.log(`   ${rotulo}.${nome}[]: existe em ${ocorrencias.length} de ${itens.length}; vazia em ${ocorrencias.filter((o) => o.linhas.length === 0).length}; ` +
      `com 1 linha em ${uma}; com 2 ou mais em ${varias.length} (até ${Math.max(0, ...ocorrencias.map((o) => o.linhas.length))})`);
    console.log(`     campos das linhas (preenchidos/presentes): ${contarCampos(ocorrencias.flatMap((o) => o.linhas)) || "(nenhuma linha)"}`);
    const comLinhas = ocorrencias.filter((o) => o.linhas.length >= 1);
    if (comLinhas.length) console.log(`     ${somasQueFecham(comLinhas.map((o) => ({ lista: o.linhas, alvo: valorDe(o.item) })))}`);
  }
}

/** Itens de uma página de cadastro do Omie (a lista do corpo, qualquer que seja o nome). */
function itensDe(corpo: unknown, preferido: string): { itens: Obj[]; totalDePaginas: number } {
  const o = obj(corpo);
  const lista = Array.isArray(o[preferido]) ? (o[preferido] as unknown[]) : ((Object.values(o).find(Array.isArray) as unknown[] | undefined) ?? []);
  const total = Number(o.total_de_paginas);
  return { itens: lista.map(obj), totalDePaginas: Number.isFinite(total) && total > 0 ? Math.floor(total) : 1 };
}

async function main() {
  const companyId = argumento("--empresa");
  if (!companyId) return listarContas();
  const paginas = Math.max(1, Math.min(100, Number(argumento("--paginas") ?? PAGINAS_PADRAO) || PAGINAS_PADRAO));
  const doFim = process.argv.includes("--fim");

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

  console.log("Prévia do rateio dos títulos — só leitura");
  console.log(`Empresa: ${nomeExibicao(empresa)} (${empresa.id})\n`);

  // ─── 1. Os títulos, como a leitura pede (desde 1º de janeiro do ano passado) ──
  const janela = `01/01/${new Date().getFullYear() - 1}`;
  // `cExibirDepartamentos`: pela documentação, mostra a distribuição por departamento.
  const exibir = process.argv.includes("--sem-exibir") ? {} : { cExibirDepartamentos: "S" };
  const pagina = (n: number) => chamar(cred, "financas/mf", "ListarMovimentos", { nPagina: n, nRegPorPagina: POR_PAGINA, dDtVencDe: janela, ...exibir });
  const primeira = await pagina(1);
  const total = paginaDeMovimentos(primeira).totalDePaginas;
  const quais = doFim
    ? Array.from({ length: Math.min(paginas, total) }, (_, i) => total - Math.min(paginas, total) + 1 + i)
    : Array.from({ length: Math.min(paginas, total) }, (_, i) => i + 1);
  const movimentos: Obj[] = [];
  for (const n of quais) {
    const corpo = n === 1 ? primeira : await pagina(n);
    movimentos.push(...paginaDeMovimentos(corpo).itens.map(obj));
  }
  const titulos = movimentos.filter((m) => preenchido(obj(m.detalhes).nCodTitulo));
  console.log(`\n   → ${titulos.length} título(s) em ${quais.length} página(s) (${quais[0]}–${quais[quais.length - 1]}) de ${total}; ${movimentos.length} movimento(s) por todo.`);
  console.log(`   chaves do movimento (presentes/com valor): ${contarCampos(titulos)}`);
  console.log(`   campos de detalhes (com valor/presentes): ${contarCampos(titulos.map((t) => obj(t.detalhes)))}`);
  const semCategoria = titulos.filter((t) => !preenchido(obj(t.detalhes).cCodCateg));
  console.log(`   títulos com detalhes.cCodCateg vazio: ${semCategoria.length} de ${titulos.length}`);
  analisarListas("movimento", titulos, (t) => numero(obj(t.detalhes).nValorTitulo) ?? 0);

  // ─── 2. As contas a pagar e a receber (onde o Omie guarda o rateio) ─────────
  const rateados: { natureza: "P" | "R"; codigo: string; conta: Obj }[] = [];
  for (const [call, modulo, lista, natureza] of [
    ["ListarContasPagar", "financas/contapagar", "conta_pagar_cadastro", "P"],
    ["ListarContasReceber", "financas/contareceber", "conta_receber_cadastro", "R"],
  ] as const) {
    console.log("");
    const p1 = itensDe(await chamar(cred, modulo, call, { pagina: 1, registros_por_pagina: 100, apenas_importado_api: "N" }), lista);
    const contas = [...p1.itens];
    if (p1.totalDePaginas > 1) {
      contas.push(...itensDe(await chamar(cred, modulo, call, { pagina: p1.totalDePaginas, registros_por_pagina: 100, apenas_importado_api: "N" }), lista).itens);
    }
    console.log(`\n   → ${call}: ${contas.length} conta(s) na primeira e na última página (de ${p1.totalDePaginas}).`);
    console.log(`   campos (com valor/presentes): ${contarCampos(contas)}`);
    analisarListas(lista, contas, (c) => numero(c.valor_documento) ?? 0);
    const rateadaNesta = contas.filter((c) => Object.values(c).some((v) => Array.isArray(v) && v.length >= 2));
    console.log(`   contas com alguma lista de 2 ou mais linhas: ${rateadaNesta.length}`);
    const comDepartamento = contas.filter((c) => Array.isArray(c.distribuicao) && c.distribuicao.length >= 1);
    const exemplo = rateadaNesta[0] ?? contas.find((c) => Object.values(c).some((v) => Array.isArray(v) && v.length >= 1));
    if (exemplo) {
      console.log("   forma das listas de uma conta (mascarada):");
      const soListas = Object.fromEntries(Object.entries(exemplo).filter(([k, v]) => Array.isArray(v) || k === "codigo_categoria" || k === "valor_documento"));
      mostrarEstrutura(soListas);
    }
    for (const c of [...rateadaNesta, ...comDepartamento.filter((c) => !rateadaNesta.includes(c))]) {
      const codigo = texto(c.codigo_lancamento_omie);
      if (codigo) rateados.push({ natureza, codigo, conta: c });
    }
  }

  // ─── 3. O que o ListarMovimentos devolve para um título rateado ────────────
  console.log("");
  const temDepartamento = (r: (typeof rateados)[number]) => Array.isArray(r.conta.distribuicao) && r.conta.distribuicao.length >= 1;
  const emCategoria = rateados.filter((r) => !temDepartamento(r));
  const conferir = [...emCategoria.slice(0, 2), ...rateados.filter(temDepartamento).slice(0, 1)].slice(0, RATEADOS_A_CONFERIR);
  if (conferir.length === 0) console.log("   Nenhuma conta rateada nas páginas lidas — o passo 3 não roda.");
  for (const r of conferir) {
    const corpo = await chamar(cred, "financas/mf", "ListarMovimentos", { nPagina: 1, nRegPorPagina: 50, nCodTitulo: Number(r.codigo), ...exibir });
    const doTitulo = paginaDeMovimentos(corpo).itens.map(obj).filter((m) => texto(obj(m.detalhes).nCodTitulo) === r.codigo);
    const linhas = (k: string) => (Array.isArray(r.conta[k]) ? (r.conta[k] as unknown[]).length : 0);
    console.log(`   título ${r.natureza === "P" ? "a pagar" : "a receber"} com ${linhas("categorias")} categoria(s) e ${linhas("distribuicao")} departamento(s) na conta: ${doTitulo.length} movimento(s) do título`);
    for (const m of doTitulo.slice(0, 2)) {
      const d = obj(m.detalhes);
      console.log(`     chaves: ${Object.keys(m).join(", ")}; cTpLancamento ${texto(d.cTpLancamento) || "(vazio)"}; ` +
        `cCodCateg ${preenchido(d.cCodCateg) ? (r.conta.categorias && Array.isArray(r.conta.categorias) && (r.conta.categorias as unknown[]).map(obj).some((c) => texto(c.codigo_categoria) === texto(d.cCodCateg)) ? "preenchido, igual a uma das linhas do rateio" : "preenchido, fora das linhas do rateio") : "vazio"}`);
      const listas = Object.fromEntries(Object.entries(m).filter(([, v]) => Array.isArray(v)));
      if (Object.keys(listas).length) mostrarEstrutura(listas);
      // As listas do movimento dizem o mesmo que as da conta? Código e valor, linha a linha.
      const pares = (lista: unknown, codigo: string[], valor: string[]) =>
        (Array.isArray(lista) ? lista.map(obj) : [])
          .map((l) => `${codigo.map((k) => texto(l[k])).find(Boolean) ?? ""}=${(valor.map((k) => numero(l[k])).find((n) => n !== null) ?? 0).toFixed(2)}`)
          .sort()
          .join("|");
      const mesmo = (a: string, b: string) => (a === b ? "iguais" : a && b ? "DIFERENTES" : a ? "só no movimento" : b ? "só na conta" : "nenhuma das duas");
      console.log(`     categorias do movimento × da conta: ${mesmo(pares(m.categorias, ["cCodCateg"], ["nDistrValor", "nValor"]), pares(r.conta.categorias, ["codigo_categoria"], ["valor"]))}; ` +
        `departamentos × distribuicao: ${mesmo(pares(m.departamentos, ["cCodDepartamento", "cCodDep"], ["nDistrValor", "nValDep"]), pares(r.conta.distribuicao, ["cCodDep"], ["nValDep"]))}`);
    }
    // O mesmo título na listagem por página (sem `nCodTitulo`), que é como a
    // leitura pede: só a emissão e a natureza dele, para caber numa página.
    const emissao = texto(r.conta.data_emissao);
    if (!emissao) continue;
    const pagina1 = await chamar(cred, "financas/mf", "ListarMovimentos", {
      nPagina: 1,
      nRegPorPagina: 50,
      dDtEmisDe: emissao,
      dDtEmisAte: emissao,
      cNatureza: r.natureza,
      ...exibir,
    });
    const listados = paginaDeMovimentos(pagina1).itens.map(obj);
    const naListagem = listados.find((m) => texto(obj(m.detalhes).nCodTitulo) === r.codigo);
    console.log(`     na listagem por página (${listados.length} movimento(s) do dia): ${naListagem ? `achado; chaves ${Object.keys(naListagem).join(", ")}` : "não achado na primeira página"}` +
      `; movimentos da página com alguma lista: ${listados.filter((m) => Object.values(m).some(Array.isArray)).length}`);
  }

  // ─── 4. Os departamentos do Omie e os centros de custo da empresa ──────────
  console.log("");
  const departamentos: Obj[] = [];
  for (let n = 1; n <= MAX_PAGINAS_DE_DEPARTAMENTOS; n++) {
    const p = itensDe(await chamar(cred, "geral/departamentos", "ListarDepartamentos", { pagina: n, registros_por_pagina: 100 }), "departamentos");
    departamentos.push(...p.itens);
    if (n >= p.totalDePaginas || p.itens.length === 0) break;
  }
  console.log(`\n   → ${departamentos.length} departamento(s) no Omie; campos (com valor/presentes): ${contarCampos(departamentos)}`);
  const codigosDaLista = new Set(departamentos.map((d) => texto(d.codigo)).filter(Boolean));
  const citados = new Set<string>();
  for (const { conta } of rateados) {
    for (const v of Object.values(conta)) if (Array.isArray(v)) for (const l of v.map(obj)) for (const k of ["cCodDep", "cCodDepartamento", "codigo_departamento"]) if (preenchido(l[k])) citados.add(texto(l[k]));
  }
  console.log(`   códigos de departamento citados nas contas rateadas: ${citados.size}; na lista do ListarDepartamentos: ${[...citados].filter((c) => codigosDaLista.has(c)).length}`);
  const centros = await prisma.costCenter.findMany({ where: { tenantId: empresa.tenantId, companyId }, select: { name: true, code: true, active: true } });
  const nomes = new Set(centros.map((c) => chaveDaCategoria(c.name)));
  const codigos = new Set(centros.map((c) => texto(c.code)).filter(Boolean));
  console.log(`   centros de custo da empresa no Connect: ${centros.length} (${centros.filter((c) => c.active).length} ativos)`);
  console.log(`   departamentos com centro de mesmo nome: ${departamentos.filter((d) => nomes.has(chaveDaCategoria(texto(d.descricao)))).length} de ${departamentos.length}; ` +
    `com o codigo ou a estrutura no código do centro: ${departamentos.filter((d) => codigos.has(texto(d.codigo)) || codigos.has(texto(d.estrutura))).length}`);

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
