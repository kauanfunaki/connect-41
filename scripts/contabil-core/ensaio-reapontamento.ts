// Ensaio do reapontamento da conta bancária sintética (Bloco D, Fase D0, 26/11/2026) num banco LOCAL.
//
// Cadastra duas empresas inventadas (CNPJs começando com 9) e percorre:
// - a conta bancária sem conta contábil: o OFX inventado importado e o NEO criando a sintética `1.1.B.<id>`
//   (vinculada à conta bancária, como o original), e o arquivo do Domínio saindo com o código dela e o aviso;
// - corrigir ANTES de vincular a conta certa: nada a corrigir (a conta bancária ainda aponta para a própria
//   sintética; o original desativaria a sintética em uso);
// - vincular a conta e corrigir: as partidas e as decisões do NEO (também a conta da contraparte) movidas, a
//   sintética desativada (`deletedAt` e `codigoAtivo` nulo) e o Domínio saindo com o código reduzido;
// - corrigir de novo: nada a corrigir;
// - a outra conta bancária com regra do NEO e gasto de cartão na sintética: as partidas vão, a sintética fica
//   e o relatório diz por quê; corrigir de novo repete a linha sem mover nada;
// - o isolamento: outro escritório não acha a empresa, e a sintética da outra empresa não é tocada;
// - (a outra mudança da D0) a consulta da distribuição da fatura não espera a trava de uma escrita em
//   andamento, e a escrita continua esperando.
// No fim, a exclusão das duas empresas apaga tudo. Nenhum dado real.
//
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-reapontamento.ts
import { getPrisma } from "../../src/lib/prisma";
import { proximoNumero } from "../../src/lib/enderecoCurtoNumeracao";
import { agenciaSchema, contaSchema, exportacaoSchema, regraSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa, reapontarContasSinteticas, salvarAgencia, salvarRegra } from "../../src/lib/contabil-core/servidor/cadastros";
import { importarExtrato } from "../../src/lib/contabil-core/servidor/importacao";
import { processarNeo } from "../../src/lib/contabil-core/servidor/neo";
import { gerarArquivoDoDominio } from "../../src/lib/contabil-core/servidor/exportacao";
import { adicionarLancamento, criarCartao, criarFatura } from "../../src/lib/contabil-core/servidor/cartoes";
import { obterDistribuicao, salvarDistribuicao } from "../../src/lib/contabil-core/servidor/faturas";
import { codigoContaSintetica } from "../../src/lib/contabil-core/motor/neo";
import { NAO_ENCONTRADA } from "../../src/lib/contabil-core/servidor/base";
import { PLANO_DA_EMPRESA } from "../../src/lib/exclusao/empresa";
import { executarPlano } from "../../src/lib/exclusao/comum";

const prisma = getPrisma();
let falhas = 0;
let conferencias = 0;
function confere(nome: string, ok: boolean, detalhe?: unknown) {
  conferencias++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok || detalhe === undefined ? "" : ` → ${JSON.stringify(detalhe).slice(0, 1500)}`}`);
  if (!ok) falhas++;
}
function valor<T>(r: { ok: true; valor: T } | { ok: false; erro: string }): T {
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}

/** CNPJ fictício (começa com 9) com os verificadores certos. */
function cnpj(base12: string): string {
  const dv = (d: string, pesos: number[]) => {
    const resto = [...d].reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  let d = base12 + dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  d += dv(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const ofx = (agencia: string, conta: string, linhas: [string, string, string, string][]) => `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0341<BRANCHID>${agencia}<ACCTID>${conta}</BANKACCTFROM>
<BANKTRANLIST>
${linhas.map(([dia, valor, fitid, memo]) => `<STMTTRN><TRNTYPE>${valor.startsWith("-") ? "DEBIT" : "CREDIT"}<DTPOSTED>${dia}<TRNAMT>${valor}<FITID>${fitid}<MEMO>${memo}</STMTTRN>`).join("\n")}
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1000.00<DTASOF>20260131</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const TARIFAS: [string, string, string, string][] = [
  ["20260105", "-15.90", "T1", "TARIFA PACOTE SERVICOS"],
  ["20260112", "-22.40", "T2", "TARIFA PACOTE SERVICOS"],
  ["20260120", "-9.90", "T3", "TARIFA PACOTE SERVICOS"],
];

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
  const tenantId = tenant.id;
  const novaEmpresa = async (nome: string, doc: string) =>
    prisma.company.create({ data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: nome, cnpj: doc } as never, select: { id: true } });
  const company = await novaEmpresa("Empresa Ensaio Reapontamento LTDA", cnpj("958147360001"));
  const outraCompany = await novaEmpresa("Outra Empresa Ensaio Reapontamento LTDA", cnpj("969258470001"));

  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    const outraEmpresaId = valor(await ligarEmpresa(tenantId, outraCompany.id, "simples_nacional")).id;
    const conta = (empresa: string, codigo: string, descricao: string, tipo: string, contaNumero: number) =>
      criarConta(tenantId, empresa, contaSchema.parse({ codigo, descricao, tipo, contaNumero })).then(valor);
    const tarifa = await conta(empresaId, "3.4.2.05", "Tarifas bancárias", "despesa", 1026);
    const bancoReal = await conta(empresaId, "1.1.1.05", "Banco Itaú", "ativo", 5);
    const bancoReal2 = await conta(empresaId, "1.1.1.06", "Banco Itaú aplicação", "ativo", 6);
    valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: tarifa.id, descricao: "Tarifa bancária", historico: "TARIFA PACOTE", dc: "D" })));
    const tarifaOutra = await conta(outraEmpresaId, "3.4.2.05", "Tarifas bancárias", "despesa", 1026);
    valor(await salvarRegra(tenantId, outraEmpresaId, null, regraSchema.parse({ contaId: tarifaOutra.id, descricao: "Tarifa bancária", historico: "TARIFA PACOTE", dc: "D" })));

    // ─── A conta bancária sem conta contábil: o NEO cria a sintética ──────
    const agencia = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "5432", numero: "77777", digito: "2" })));
    const imp = valor(await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan.ofx", new TextEncoder().encode(ofx("5432", "77777-2", TARIFAS)), false));
    confere("extrato inventado importado (3 de 3)", imp.importadas === 3, imp);
    const neo = valor(await processarNeo(tenantId, empresaId, { agenciaId: null, mes: "2026-01" }));
    confere("NEO: as 3 tarifas pela regra", neo.associadas === 3, neo);
    const codigo = codigoContaSintetica(agencia.id);
    const sintetica = await prisma.corePlanoConta.findFirstOrThrow({ where: { empresaId, codigo, deletedAt: null }, select: { id: true, contaNumero: true } });
    const ag1 = await prisma.coreAgencia.findUniqueOrThrow({ where: { id: agencia.id }, select: { contaContabilId: true } });
    confere("a sintética nasceu sem código reduzido e ficou vinculada à conta bancária", sintetica.contaNumero === null && ag1.contaContabilId === sintetica.id, { sintetica, ag1 });
    const naSintetica = () => prisma.coreRegistro.count({ where: { empresaId, contaId: sintetica.id } });
    confere("as 3 pernas do banco estão na sintética", (await naSintetica()) === 3);
    // Uma decisão com a sintética como conta da contraparte (o serviço do NEO não grava assim; direto no banco).
    const decisao = await prisma.coreNeoDecisao.findFirstOrThrow({ where: { empresaId }, select: { id: true } });
    await prisma.coreNeoDecisao.update({ where: { id: decisao.id }, data: { contaContraparteId: sintetica.id } });

    const dominio = async () => valor(await gerarArquivoDoDominio(tenantId, user.id, empresaId, exportacaoSchema.parse({ mes: "2026-01", formato: "txt" }), { registrar: false }));
    const antes = await dominio();
    const linhasAntes = antes.conteudo.replace(/^﻿/, "").trim().split("\r\n");
    confere(
      "antes: o Domínio sai com o código da sintética e o aviso",
      linhasAntes.length === 3 && linhasAntes.every((l) => l.split(";")[2] === codigo) && antes.avisos.some((a) => a.includes(codigo)),
      { linhasAntes, avisos: antes.avisos },
    );

    // ─── Corrigir antes de vincular: nada a corrigir ──────────────────────
    const cedo = valor(await reapontarContasSinteticas(tenantId, empresaId));
    confere("sem a conta certa vinculada, nada a corrigir (e a sintética continua)", cedo.relatorio.length === 0 && cedo.auditoria === null && (await naSintetica()) === 3, cedo);

    // ─── A outra empresa, com a própria sintética ─────────────────────────
    const agOutra = valor(await salvarAgencia(tenantId, outraEmpresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "5432", numero: "77777", digito: "2" })));
    valor(await importarExtrato(tenantId, user.id, outraEmpresaId, agOutra.id, "jan.ofx", new TextEncoder().encode(ofx("5432", "77777-2", TARIFAS)), false));
    valor(await processarNeo(tenantId, outraEmpresaId, { agenciaId: null, mes: "2026-01" }));
    const sinteticaOutra = await prisma.corePlanoConta.findFirstOrThrow({ where: { empresaId: outraEmpresaId, codigo: codigoContaSintetica(agOutra.id), deletedAt: null }, select: { id: true } });
    const bancoOutra = await conta(outraEmpresaId, "1.1.1.05", "Banco Itaú", "ativo", 5);
    valor(await salvarAgencia(tenantId, outraEmpresaId, agOutra.id, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "5432", numero: "77777", digito: "2", contaContabilId: bancoOutra.id })));

    // ─── Vincular e corrigir ──────────────────────────────────────────────
    const deOutro = await reapontarContasSinteticas("tenant-que-nao-existe", empresaId);
    confere("outro escritório não acha a empresa ('não encontrada')", !deOutro.ok && deOutro.erro === NAO_ENCONTRADA, deOutro);
    valor(await salvarAgencia(tenantId, empresaId, agencia.id, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "5432", numero: "77777", digito: "2", contaContabilId: bancoReal.id })));
    const r1 = valor(await reapontarContasSinteticas(tenantId, empresaId));
    confere(
      "corrigido: 3 partidas e 1 decisão movidas, sintética desativada",
      r1.relatorio.length === 1 &&
        r1.relatorio[0].agencia === "ITAU 5432 77777 2" &&
        r1.relatorio[0].contaSintetica === codigo &&
        r1.relatorio[0].registrosMovidos === 3 &&
        r1.relatorio[0].decisoesMovidas === 1 &&
        r1.relatorio[0].sinteticaDesativada &&
        Object.keys(r1.relatorio[0].referenciasRestantes).length === 0,
      r1.relatorio,
    );
    confere(
      "a auditoria leva a ação, a empresa e os ids de cada conta",
      r1.auditoria?.acao === "contabil.core.contas_sinteticas.reapontadas" &&
        JSON.stringify(r1.auditoria.dados.contas) === JSON.stringify([{ agenciaId: agencia.id, de: sintetica.id, para: bancoReal.id, ...r1.relatorio[0] }]),
      r1.auditoria,
    );
    confere("nada ficou na sintética; as 3 partidas estão na conta vinculada", (await naSintetica()) === 0 && (await prisma.coreRegistro.count({ where: { empresaId, contaId: bancoReal.id } })) === 3);
    const dec = await prisma.coreNeoDecisao.findUniqueOrThrow({ where: { id: decisao.id }, select: { contaContraparteId: true } });
    confere("a decisão aponta a conta vinculada como conta da contraparte", dec.contaContraparteId === bancoReal.id, dec);
    const desativada = await prisma.corePlanoConta.findUniqueOrThrow({ where: { id: sintetica.id }, select: { deletedAt: true, codigoAtivo: true } });
    confere("a sintética está desativada como o Connect desativa conta (deletedAt e codigoAtivo nulo)", desativada.deletedAt !== null && desativada.codigoAtivo === null, desativada);
    const depois = await dominio();
    const linhasDepois = depois.conteudo.replace(/^﻿/, "").trim().split("\r\n");
    confere(
      "depois: o Domínio sai com o código reduzido da conta vinculada, sem aviso",
      linhasDepois.length === 3 && linhasDepois.every((l) => l.split(";")[2] === "5") && depois.avisos.length === 0 &&
        linhasDepois.every((l, k) => l.split(";").filter((_, i) => i !== 2).join(";") === linhasAntes[k].split(";").filter((_, i) => i !== 2).join(";")),
      { linhasDepois, avisos: depois.avisos },
    );
    const outraIntacta = await prisma.corePlanoConta.findUniqueOrThrow({ where: { id: sinteticaOutra.id }, select: { deletedAt: true } });
    confere(
      "a outra empresa não foi tocada: a sintética dela continua viva, com as partidas",
      outraIntacta.deletedAt === null && (await prisma.coreRegistro.count({ where: { empresaId: outraEmpresaId, contaId: sinteticaOutra.id } })) === 3,
    );

    // ─── De novo: nada a corrigir ─────────────────────────────────────────
    const r2 = valor(await reapontarContasSinteticas(tenantId, empresaId));
    confere("corrigir de novo: nada a corrigir", r2.relatorio.length === 0 && r2.auditoria === null, r2);

    // ─── A sintética com regra e gasto de cartão apontando: fica ──────────
    const agencia2 = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "6543", numero: "88888", digito: "3" })));
    valor(await importarExtrato(tenantId, user.id, empresaId, agencia2.id, "jan2.ofx", new TextEncoder().encode(ofx("6543", "88888-3", TARIFAS.slice(0, 2))), false));
    valor(await processarNeo(tenantId, empresaId, { agenciaId: agencia2.id, mes: "2026-01" }));
    const sintetica2 = await prisma.corePlanoConta.findFirstOrThrow({ where: { empresaId, codigo: codigoContaSintetica(agencia2.id), deletedAt: null }, select: { id: true } });
    valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: sintetica2.id, descricao: "Transferência entre contas", historico: "TED MESMA TITULARIDADE", dc: "C" })));
    const cartao = valor(await criarCartao(tenantId, empresaId, { nome: "Cartão corporativo", bandeira: "visa", ultimosDigitos: "1234", diaFechamento: 5, diaVencimento: 12 })).valor;
    const fatura = valor(await criarFatura(tenantId, empresaId, cartao.id, { competencia: "2026-01" })).valor;
    valor(await adicionarLancamento(tenantId, empresaId, cartao.id, fatura.id, { dataCompra: "2026-01-10", descricao: "GASTO EXEMPLO", valor: "12.00", contaId: sintetica2.id }));
    valor(await salvarAgencia(tenantId, empresaId, agencia2.id, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "6543", numero: "88888", digito: "3", contaContabilId: bancoReal2.id })));
    const r3 = valor(await reapontarContasSinteticas(tenantId, empresaId));
    confere(
      "com regra e gasto de cartão: as 2 partidas vão, a sintética fica e o relatório diz por quê",
      r3.relatorio.length === 1 &&
        r3.relatorio[0].registrosMovidos === 2 &&
        !r3.relatorio[0].sinteticaDesativada &&
        JSON.stringify(r3.relatorio[0].referenciasRestantes) === JSON.stringify({ regras: 1, lancamentosCartao: 1 }),
      r3.relatorio,
    );
    const viva2 = await prisma.corePlanoConta.findUniqueOrThrow({ where: { id: sintetica2.id }, select: { deletedAt: true } });
    confere("a sintética com referência continua viva", viva2.deletedAt === null && (await prisma.coreRegistro.count({ where: { empresaId, contaId: bancoReal2.id } })) === 2);
    const r4 = valor(await reapontarContasSinteticas(tenantId, empresaId));
    confere(
      "corrigir de novo repete a linha, sem mover nada (como o original)",
      r4.relatorio.length === 1 && r4.relatorio[0].registrosMovidos === 0 && r4.relatorio[0].decisoesMovidas === 0 && !r4.relatorio[0].sinteticaDesativada,
      r4.relatorio,
    );

    // ─── A consulta da fatura não espera a trava (D0) ──────────────────────
    const ctxFatura = { tenantId, empresaId, cartaoId: cartao.id, faturaId: fatura.id, userId: user.id };
    let liberar = () => {};
    const segurando = new Promise<void>((r) => (liberar = r));
    let presa = () => {};
    const travou = new Promise<void>((r) => (presa = r));
    const trava = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM core_faturas_cartao WHERE id = ${fatura.id} FOR UPDATE`;
        presa();
        await segurando;
      },
      { timeout: 30_000 },
    );
    await travou;
    const inicio = Date.now();
    const consulta = await obterDistribuicao(ctxFatura);
    const espera = Date.now() - inicio;
    const escrita = salvarDistribuicao(ctxFatura, { versao: 0, distribuicoes: {} });
    const primeiro = await Promise.race([escrita.then(() => "escrita"), new Promise((r) => setTimeout(() => r("esperou"), 1500))]);
    liberar();
    await trava;
    const salvou = await escrita;
    confere("a consulta da distribuição responde com a fatura travada por outra transação", consulta.ok && espera < 1500, { ok: consulta.ok, espera });
    confere("a escrita continua esperando a trava e grava depois", primeiro === "esperou" && salvou.ok, { primeiro, ok: salvou.ok });

    // ─── A outra empresa corrige a dela, sem mexer na primeira ────────────
    const rOutra = valor(await reapontarContasSinteticas(tenantId, outraEmpresaId));
    confere(
      "a outra empresa corrige a própria sintética",
      rOutra.relatorio.length === 1 && rOutra.relatorio[0].registrosMovidos === 3 && rOutra.relatorio[0].sinteticaDesativada &&
        (await prisma.coreRegistro.count({ where: { empresaId, contaId: bancoReal.id } })) === 3,
      rOutra.relatorio,
    );
  } finally {
    const mexido = await prisma.$transaction(
      async (tx) => {
        const m = await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id });
        await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: outraCompany.id });
        return m;
      },
      { timeout: 60_000 },
    );
    confere("a exclusão da empresa apaga tudo, inclusive a sintética desativada", (mexido.CoreEmpresa ?? 0) === 1 && (mexido.CorePlanoConta ?? 0) >= 5, mexido);
  }
  console.log(falhas ? `\n${falhas} falha(s) em ${conferencias} conferências` : `\ntudo certo: ${conferencias} conferências`);
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
