// Ensaio das exportações, de "Conflitos e qualidade", do painel e da carteira (Bloco D, Fase D1, 26/11/2026)
// num banco LOCAL.
//
// Cadastra duas empresas inventadas ("Ensaio D1"), importa um OFX inventado em cada uma, roda o NEO com uma
// regra que diverge da conta da contraparte (a sombra mede verdadeiro), outra que concorda (falso) e outra sem
// contraparte (não mede), cadastra notas e um comprovante e os liga às transações, e então:
// - gera cada exportação (lançamentos em CSV e XLSX, o Domínio em TXT e XLSX, o extrato com os filtros da tela,
//   as quatro baixas de notas e a conferência), confere linhas, colunas, valores, a recusa do TXT fora do
//   Domínio, a conta bancária inativa, o lançamento cancelado e o registro em `core_exportacoes`;
// - consulta as divergências da sombra, as estatísticas da empresa e a carteira do escritório;
// - confere o isolamento: a outra empresa e outro escritório não veem nada desta.
// No fim, a exclusão da empresa apaga tudo. Nenhum dado real; o banco é compartilhado, então só se mexe no
// que o ensaio criou (as empresas "Ensaio D1").
//
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-exportacoes-painel.ts
import ExcelJS from "exceljs";
import { getPrisma } from "../../src/lib/prisma";
import { proximoNumero } from "../../src/lib/enderecoCurtoNumeracao";
import { agenciaSchema, contaSchema, contraparteSchema, exportacaoSchema, regraSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa, salvarAgencia, salvarContraparte, salvarRegra } from "../../src/lib/contabil-core/servidor/cadastros";
import { importarExtrato } from "../../src/lib/contabil-core/servidor/importacao";
import { cancelarClassificacao, processarNeo } from "../../src/lib/contabil-core/servidor/neo";
import { associarNota, criarNota } from "../../src/lib/contabil-core/servidor/notas";
import { criarComprovante } from "../../src/lib/contabil-core/servidor/comprovantes";
import { gerarExportacao } from "../../src/lib/contabil-core/servidor/exportacao";
import { carteiraDoEscritorio, consultarDivergencias, estatisticasDaEmpresa } from "../../src/lib/contabil-core/servidor/painel";
import { PLANO_DA_EMPRESA } from "../../src/lib/exclusao/empresa";
import { executarPlano } from "../../src/lib/exclusao/comum";

const prisma = getPrisma();
let falhas = 0;
function confere(nome: string, ok: boolean, detalhe?: unknown) {
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
const CNPJ = cnpj("913579240001");
const OUTRO_CNPJ = cnpj("924681350001");
const FORNECEDOR = cnpj("935792460001");
const CLIENTE = cnpj("946813570001");
const soDigitos = (s: string) => s.replace(/\D/g, "");
const OUTRO_TENANT = "00000000-0000-4000-8000-00000000d1d1";

const ofx = (linhas: string) => `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0341<BRANCHID>7531<ACCTID>13579-2</BANKACCTFROM>
<BANKTRANLIST>
${linhas}
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const OFX_DA_EMPRESA = ofx(`<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260110<TRNAMT>-1500.00<FITID>D1<MEMO>PAGAMENTO FORNECEDOR ${soDigitos(FORNECEDOR)}</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260111<TRNAMT>-250.00<FITID>D2<MEMO>PIX FORNECEDOR ${soDigitos(FORNECEDOR)}</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260112<TRNAMT>-77.00<FITID>D3<MEMO>TARIFA PACOTE MENSAL</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260120<TRNAMT>900.00<FITID>D4<MEMO>RECEBIMENTO CLIENTE DIVERSO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260121<TRNAMT>-42.00<FITID>D5<MEMO>=FORMULA PERIGOSA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260122<TRNAMT>300.00<FITID>D6<MEMO>LIQUIDAÇÃO BOLETO ÁGUA</STMTTRN>`);
const OFX_DA_OUTRA = ofx(`<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260115<TRNAMT>-10.00<FITID>O1<MEMO>TARIFA DA OUTRA EMPRESA</STMTTRN>`);

/** O pedido como a rota o monta (o schema da entrada), com o tipo e o formato. */
const pedido = (tipo: string, formato: string, extra: Record<string, unknown> = {}) =>
  exportacaoSchema.parse({ tipo, formato, mes: "2026-01", ...extra });

const texto = (c: string | Uint8Array) => (typeof c === "string" ? c : new TextDecoder().decode(c));
/** As linhas do CSV, sem o BOM e sem o cabeçalho. */
const linhasCsv = (c: string | Uint8Array) => texto(c).replace(/^﻿/, "").split("\r\n").filter(Boolean).slice(1);

async function planilha(c: string | Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((c as Uint8Array).buffer as ArrayBuffer);
  const ws = wb.worksheets[0];
  const linhas: unknown[][] = [];
  ws.eachRow((row) => linhas.push((row.values as unknown[]).slice(1)));
  return { titulo: ws.name, linhas };
}

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
  const tenantId = tenant.id;
  const company = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Empresa Ensaio D1 LTDA", cnpj: CNPJ } as never,
    select: { id: true },
  });
  const outraCompany = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Outra Empresa Ensaio D1 LTDA", cnpj: OUTRO_CNPJ } as never,
    select: { id: true },
  });
  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    const outraEmpresaId = valor(await ligarEmpresa(tenantId, outraCompany.id, "simples_nacional")).id;
    const banco = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "1.1.1.07", descricao: "Banco Itaú", tipo: "ativo", contaNumero: 17 })));
    const fornecedores = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "2.1.1.07", descricao: "Fornecedores", tipo: "passivo", contaNumero: 217 })));
    const despesas = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "4.1.9.07", descricao: "Despesas diversas", tipo: "despesa", contaNumero: 419 })));
    const tarifas = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "4.1.2.07", descricao: "Tarifas", tipo: "despesa", contaNumero: 412 })));
    const agencia = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "7531", numero: "13579", digito: "2", contaContabilId: banco.id })));
    valor(await salvarContraparte(tenantId, user.id, empresaId, null, contraparteSchema.parse({ tipo: "fornecedor", documento: FORNECEDOR, razaoSocial: "Fornecedor Ficticio D1 Ltda", contaContabilId: fornecedores.id })));
    // A regra que diverge da conta da contraparte, a que concorda e a que não tem contraparte.
    valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: despesas.id, descricao: "Pagamento a fornecedor", historico: "PAGAMENTO FORNECEDOR", dc: "D" })));
    valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: fornecedores.id, descricao: "Pix a fornecedor", historico: "PIX FORNECEDOR", dc: "D" })));
    valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: tarifas.id, descricao: "Tarifa bancária", historico: "TARIFA PACOTE", dc: "D" })));
    const imp = valor(await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan-d1.ofx", new TextEncoder().encode(OFX_DA_EMPRESA), false));
    confere("extrato inventado importado (6 de 6)", imp.importadas === 6, imp);
    const outraConta = valor(await criarConta(tenantId, outraEmpresaId, contaSchema.parse({ codigo: "1.1.1.08", descricao: "Banco da outra", tipo: "ativo", contaNumero: 18 })));
    const outraAgencia = valor(await salvarAgencia(tenantId, outraEmpresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "7531", numero: "13579", digito: "2", contaContabilId: outraConta.id })));
    valor(await importarExtrato(tenantId, user.id, outraEmpresaId, outraAgencia.id, "jan-outra-d1.ofx", new TextEncoder().encode(OFX_DA_OUTRA), false));

    const neo = valor(await processarNeo(tenantId, empresaId, { agenciaId: null, mes: null }));
    const ts = await prisma.coreTransacao.findMany({ where: { empresaId, deletedAt: null }, orderBy: { data: "asc" }, select: { id: true, historico: true, status: true } });
    const [t1, t2, t3, t4] = ts;
    const decisoes = await prisma.coreNeoDecisao.findMany({ where: { empresaId }, select: { transacaoId: true, contaDivergente: true } });
    const medida = (id: string) => decisoes.find((d) => d.transacaoId === id)?.contaDivergente;
    confere(
      "o NEO classifica as três por regra e a sombra mede: diverge, concorda, sem medição",
      t1.status === "processada" && t2.status === "processada" && t3.status === "processada" && medida(t1.id) === true && medida(t2.id) === false && (medida(t3.id) ?? null) === null,
      { neo, ts, decisoes },
    );

    // Notas e comprovante, depois do NEO (para ele não os ligar por conta própria).
    const nota = async (campos: Record<string, unknown>) => {
      const r = await criarNota(tenantId, user.id, empresaId, campos as never);
      if (!r.ok) throw new Error(r.erro);
      return r.valor.nota.id;
    };
    const n1 = await nota({ tipo: "nfe", numero: "1001", serie: "1", cnpjEmitente: FORNECEDOR, nomeEmitente: "FORNECEDOR FICTICIO D1 LTDA", cnpjDestinatario: CNPJ, valor: "1500.00", dataEmissao: "2026-01-09T10:00:00-03:00" });
    const n2 = await nota({ tipo: "nfse", numero: "77", cnpjEmitente: CNPJ, nomeEmitente: "EMPRESA ENSAIO D1 LTDA", cnpjDestinatario: CLIENTE, valor: "900.00", dataEmissao: "2026-01-20T22:30:00-03:00" });
    await nota({ tipo: "nfe", numero: "1002", serie: "1", cnpjEmitente: CNPJ, nomeEmitente: "EMPRESA ENSAIO D1 LTDA", cnpjDestinatario: CLIENTE, valor: "10.00", dataEmissao: "2026-01-31T23:30:00-03:00" });
    await nota({ tipo: "nfse", numero: "55", cnpjEmitente: FORNECEDOR, nomeEmitente: "=PRESTADOR FICTICIO", cnpjDestinatario: soDigitos(CNPJ), valor: "50.00", dataEmissao: "2026-01-05" });
    valor(await associarNota(tenantId, empresaId, n1, t1.id));
    valor(await associarNota(tenantId, empresaId, n2, t4.id));
    const comp = await criarComprovante(tenantId, empresaId, { favorecido: "FORNECEDOR FICTICIO D1", cpfCnpj: FORNECEDOR, valorPago: "200.00", dataPagamento: "2026-01-11T00:00:00Z", transacaoId: t2.id }, null);
    confere("comprovante ligado à transação do PIX", comp.ok, comp);

    // ─── Exportações ──────────────────────────────────────────────────────
    const antes = await prisma.coreExportacao.count({ where: { empresaId } });
    const gerar = (tipo: string, formato: string, extra: Record<string, unknown> = {}, empresa = empresaId, tenantDaChamada = tenantId) =>
      gerarExportacao(tenantDaChamada, user.id, empresa, pedido(tipo, formato, extra));

    const lancCsv = valor(await gerar("lancamentos", "csv"));
    const linhasLanc = linhasCsv(lancCsv.conteudo);
    confere(
      "lançamentos em CSV: as seis partidas vivas, data com o fuso, valor com ponto",
      lancCsv.linhas === 6 && linhasLanc.length === 6 && linhasLanc.every((l) => /,2026-01-1\dT00:00:00\+00:00,/.test(l)) && linhasLanc.some((l) => l.includes(",1500.00,")) && lancCsv.nome.endsWith("-2026-01.csv"),
      { lancCsv: { ...lancCsv, conteudo: texto(lancCsv.conteudo).slice(0, 400) } },
    );
    const lancXlsx = valor(await gerar("lancamentos", "xlsx"));
    const pl = await planilha(lancXlsx.conteudo);
    confere(
      "lançamentos em XLSX: a folha do original, o cabeçalho e o valor como número",
      pl.titulo === "Lançamentos Contábeis" && pl.linhas.length === 7 && (pl.linhas[0] as string[])[0] === "id" && pl.linhas.slice(1).some((l) => l[5] === 1500),
      pl,
    );
    const dominio = valor(await gerar("lancamentos_importacao", "txt"));
    confere("Domínio em TXT: três linhas, sem cabeçalho", dominio.linhas === 3 && linhasCsv(dominio.conteudo).length === 2, texto(dominio.conteudo));
    const dominioXlsx = valor(await gerar("lancamentos_importacao", "xlsx"));
    const pd = await planilha(dominioXlsx.conteudo);
    confere("Domínio em XLSX: a folha e as três linhas", pd.titulo === "Importação Lançamentos" && pd.linhas.length === 4, pd);
    const txtFora = await gerar("conferencia", "txt");
    confere("TXT fora do Domínio é recusado com a frase do original", !txtFora.ok && txtFora.erro === "O formato 'txt' só está disponível para 'lancamentos_importacao' por enquanto.", txtFora);

    const extrato = valor(await gerar("extrato", "csv"));
    const linhasExt = linhasCsv(extrato.conteudo);
    confere(
      "extrato: as seis transações na ordem, a conta pela descrição do original e a fórmula neutralizada",
      linhasExt.length === 6 && linhasExt[0].startsWith("10/01/2026,ITAU 7531 13579 2,") && linhasExt.some((l) => l.includes(",'=FORMULA PERIGOSA,")),
      linhasExt,
    );
    const busca = valor(await gerar("extrato", "csv", { busca: "agua" }));
    confere("extrato com a busca da tela: sem acento e sem maiúscula", linhasCsv(busca.conteudo).length === 1 && linhasCsv(busca.conteudo)[0].includes("LIQUIDAÇÃO BOLETO ÁGUA"), texto(busca.conteudo));
    const pendentes = valor(await gerar("extrato", "xlsx", { status: "pendente", mes: "" }));
    const pe = await planilha(pendentes.conteudo);
    confere("extrato sem competência e só as pendentes, em XLSX", pe.titulo === "Extrato Bancário" && pe.linhas.length === 4, pe);

    const nfeEntrada = valor(await gerar("nfe_entrada", "csv"));
    const nfeSaida = valor(await gerar("nfe_saida", "csv"));
    const nfseTomado = valor(await gerar("nfse_tomado", "csv"));
    const nfsePrestado = valor(await gerar("nfse_prestado", "xlsx"));
    const prestado = await planilha(nfsePrestado.conteudo);
    confere(
      "baixas de notas: entrada pela destinatária, saída e prestada pela emitente; a emissão em UTC dentro da competência",
      linhasCsv(nfeEntrada.conteudo).length === 1 &&
        linhasCsv(nfeEntrada.conteudo)[0].startsWith("2026-01-09,1001,1,") &&
        linhasCsv(nfeEntrada.conteudo)[0].endsWith(",2026-01-10,1500.00") &&
        linhasCsv(nfeSaida.conteudo).length === 0 &&
        linhasCsv(nfseTomado.conteudo).length === 1 &&
        linhasCsv(nfseTomado.conteudo)[0].includes(",'=PRESTADOR FICTICIO,") &&
        prestado.titulo === "NFS-e Prestado" &&
        prestado.linhas.length === 2 &&
        prestado.linhas[1][0] === "2026-01-21",
      { e: texto(nfeEntrada.conteudo), s: texto(nfeSaida.conteudo), t: texto(nfseTomado.conteudo), prestado },
    );

    const conf = valor(await gerar("conferencia", "csv"));
    const lc = linhasCsv(conf.conteudo);
    const daLinha = (h: string) => lc.find((l) => l.includes(h)) ?? "";
    confere(
      "conferência: a nota que fecha (Conciliado), o comprovante a menor (Divergente, residual assinado) e a sem documento (Pendente)",
      lc.length === 6 &&
        daLinha("PAGAMENTO FORNECEDOR").endsWith(",1001,nfe,1500.00,,,1500.00,0.00,Conciliado") &&
        daLinha("PIX FORNECEDOR").endsWith(",,,,FORNECEDOR FICTICIO D1,200.00,200.00,50.00,Divergente") &&
        daLinha("RECEBIMENTO CLIENTE").endsWith(",77,nfse,900.00,,,900.00,0.00,Conciliado") &&
        daLinha("TARIFA PACOTE").endsWith(",,,,,,0.00,77.00,Pendente"),
      lc,
    );

    // A conta bancária inativa fica de fora, a menos que se peça; o lançamento cancelado sai do arquivo.
    await prisma.coreAgencia.update({ where: { id: agencia.id }, data: { ativa: false } });
    const semInativa = valor(await gerar("lancamentos", "csv"));
    const comInativa = valor(await gerar("lancamentos", "csv", { incluirContasInativas: true }));
    const extratoInativa = valor(await gerar("extrato", "csv"));
    confere("conta inativa: fora dos lançamentos sem a opção, dentro com ela; o extrato a mostra", semInativa.linhas === 0 && comInativa.linhas === 6 && extratoInativa.linhas === 6, { semInativa: semInativa.linhas, comInativa: comInativa.linhas });
    await prisma.coreAgencia.update({ where: { id: agencia.id }, data: { ativa: true } });
    valor(await cancelarClassificacao(tenantId, user.id, empresaId, t3.id, "Ensaio D1: tarifa reclassificada"));
    const depoisDoCancelamento = valor(await gerar("lancamentos", "csv"));
    confere("o lançamento cancelado não sai no arquivo", depoisDoCancelamento.linhas === 4 && !texto(depoisDoCancelamento.conteudo).includes("TARIFA"), texto(depoisDoCancelamento.conteudo));
    const registradas = await prisma.coreExportacao.findMany({ where: { empresaId }, orderBy: { createdAt: "asc" }, select: { formato: true, totalRegistros: true, filtroDe: true, filtroAte: true } });
    confere(
      "cada exportação fica em core_exportacoes, com o formato, o período e o total",
      registradas.length - antes === 16 && registradas.some((r) => r.formato === "xlsx") && registradas[0].filtroDe?.toISOString() === "2026-01-01T00:00:00.000Z" && registradas[0].filtroAte?.toISOString() === "2026-01-31T23:59:59.999Z",
      { quantas: registradas.length - antes, primeira: registradas[0] },
    );

    // Isolamento nas exportações.
    const deOutroTenant = await gerar("conferencia", "csv", {}, empresaId, OUTRO_TENANT);
    const daOutra = valor(await gerar("extrato", "csv", {}, outraEmpresaId));
    confere(
      "outro escritório não exporta esta empresa; a outra empresa só vê o próprio extrato",
      !deOutroTenant.ok && deOutroTenant.erro === "Empresa não encontrada no Contábil Core." && daOutra.linhas === 1 && linhasCsv(daOutra.conteudo)[0].includes("TARIFA DA OUTRA EMPRESA"),
      { deOutroTenant, daOutra: texto(daOutra.conteudo) },
    );

    // ─── Conflitos e qualidade ────────────────────────────────────────────
    const div = valor(await consultarDivergencias(tenantId, empresaId, { mes: "2026-01", agenciaId: null }));
    confere(
      "divergências: duas medidas (verdadeiro e falso), uma divergente, o valor, o par de contas e a amostra",
      div.totalAvaliadas === 2 &&
        div.totalDivergentes === 1 &&
        div.percentualDivergentes === 50 &&
        div.valorTotalDivergente === "1500.00" &&
        div.porConta.length === 1 &&
        div.porConta[0].contaRegraId === despesas.id &&
        div.porConta[0].contaContraparteId === fornecedores.id &&
        div.amostra.length === 1 &&
        div.amostra[0].transacaoId === t1.id &&
        div.amostra[0].origemEvidencia === "historico",
      div,
    );
    const divFev = valor(await consultarDivergencias(tenantId, empresaId, { mes: "2026-02", agenciaId: null }));
    const divOutra = valor(await consultarDivergencias(tenantId, outraEmpresaId, { mes: null, agenciaId: null }));
    const divOutroTenant = await consultarDivergencias(OUTRO_TENANT, empresaId, { mes: null, agenciaId: null });
    confere("divergências recortadas pelo mês, pela empresa e pelo escritório", divFev.totalAvaliadas === 0 && divOutra.totalAvaliadas === 0 && !divOutroTenant.ok, { divFev, divOutra, divOutroTenant });

    // ─── Painel e carteira ────────────────────────────────────────────────
    const est = valor(await estatisticasDaEmpresa(tenantId, empresaId, 12, new Date("2026-01-25T12:00:00Z")));
    const jan = est.mensal[est.mensal.length - 1];
    confere(
      "painel: o resumo (com lançamento = com partida viva), a série até o mês corrente e a conta bancária",
      est.mesAtual === "2026-01" &&
        est.mensal.length === 12 &&
        est.mensal[0].mes === "2025-02" &&
        est.resumo.totalTransacoes === 6 &&
        est.resumo.totalConciliados === 2 &&
        est.resumo.totalNaoConciliados === 4 &&
        est.resumo.percentualConciliacao === 33.3 &&
        est.resumo.totalRegistros === 4 &&
        est.resumo.totalNotas === 4 &&
        est.resumo.totalComprovantes === 1 &&
        jan.mes === "2026-01" &&
        jan.transacoes === 6 &&
        jan.registros === 4 &&
        jan.notas === 3 &&
        jan.comprovantes === 1 &&
        est.porAgencia.length === 1 &&
        est.porAgencia[0].descricao === "ITAU – Ag. 7531 / 13579" &&
        est.porAgencia[0].conciliados === 2 &&
        est.porAgencia[0].naoConciliados === 4,
      est,
    );
    const virada = valor(await estatisticasDaEmpresa(tenantId, empresaId, 1, new Date("2026-02-01T01:00:00Z")));
    confere("o mês corrente do painel é o do escritório (1h UTC do dia 1º ainda é janeiro em Brasília)", virada.mesAtual === "2026-01" && virada.mensal[0].transacoes === 6, virada);
    const outroTenantEst = await estatisticasDaEmpresa(OUTRO_TENANT, empresaId);
    confere("o painel de outro escritório não abre esta empresa", !outroTenantEst.ok, outroTenantEst);

    const carteira = await carteiraDoEscritorio(tenantId, "2026-01");
    const minha = carteira.itens.find((i) => i.empresaId === empresaId);
    const daOutraEmpresa = carteira.itens.find((i) => i.empresaId === outraEmpresaId);
    confere(
      "carteira: as duas empresas do ensaio, com importadas, classificadas, pendências e o valor pendente",
      !!minha &&
        minha.transacoesImportadas === 6 &&
        minha.classificadas === 2 &&
        minha.pendentes === 4 &&
        minha.erros === 0 &&
        minha.valorTotalPendente === "1319.00" &&
        minha.haExtratoImportado &&
        !!daOutraEmpresa &&
        daOutraEmpresa.pendentes === 1 &&
        daOutraEmpresa.valorTotalPendente === "10.00" &&
        carteira.itens.indexOf(minha) < carteira.itens.indexOf(daOutraEmpresa),
      { minha, daOutraEmpresa },
    );
    const fevereiro = await carteiraDoEscritorio(tenantId, "2026-02");
    const semExtrato = fevereiro.itens.find((i) => i.empresaId === empresaId);
    const deOutro = await carteiraDoEscritorio(OUTRO_TENANT, "2026-01");
    confere(
      "carteira sem extrato no mês aparece zerada; outro escritório não vê as empresas daqui",
      !!semExtrato && !semExtrato.haExtratoImportado && semExtrato.valorTotalPendente === "0.00" && !deOutro.itens.some((i) => i.empresaId === empresaId || i.empresaId === outraEmpresaId),
      { semExtrato, deOutro: deOutro.itens.length },
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
    const sobra = await prisma.coreEmpresa.count({ where: { companyId: { in: [company.id, outraCompany.id] } } });
    confere("a exclusão das empresas do ensaio apaga tudo (exportações registradas inclusive)", sobra === 0 && (mexido.CoreExportacao ?? 0) === 16, { mexido, sobra });
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
