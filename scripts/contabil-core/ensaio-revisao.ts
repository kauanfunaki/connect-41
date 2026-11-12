// Ensaio da revisão manual da conciliação (Bloco B, Fase B3, 12/11/2026) num banco LOCAL.
//
// Cadastra uma empresa inventada com a conta bancária ligada à conta contábil, importa um OFX
// inventado e percorre a revisão: criar (e a mesma de novo), o Razão sem CNPJ, o Razão de apoio, os
// vínculos e cada recusa, a versão otimista, desfazer, renomear, excluir (e criar de novo), o extrato
// desfeito e o isolamento por tenant e por empresa. No fim apaga tudo pela exclusão da empresa e
// confere que as tabelas novas saíram junto. Nenhum dado real.
//
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-revisao.ts
import { randomUUID } from "node:crypto";
import { getPrisma } from "../../src/lib/prisma";
import { proximoNumero } from "../../src/lib/enderecoCurtoNumeracao";
import { agenciaSchema, contaSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa, salvarAgencia } from "../../src/lib/contabil-core/servidor/cadastros";
import { desfazerImportacao, importarExtrato } from "../../src/lib/contabil-core/servidor/importacao";
import {
  adicionarApoio,
  criarRevisao,
  criarVinculo,
  desfazerVinculo,
  excluirRevisao,
  listarRevisoes,
  obterRevisao,
  renomearRevisao,
} from "../../src/lib/contabil-core/servidor/revisao";
import { AVISO_FONTE_ALTERADA, AVISO_SEM_CNPJ } from "../../src/lib/contabil-core/conciliacao/revisao";
import type { RazaoApoio, RazaoConta } from "../../src/lib/contabil-core/conciliacao/razaoTipos";
import type { Revisao } from "../../src/lib/contabil-core/conciliacao/revisaoTipos";
import { dec } from "../../src/lib/contabil-core/motor/decimal";
import { PLANO_DA_EMPRESA } from "../../src/lib/exclusao/empresa";
import { executarPlano } from "../../src/lib/exclusao/comum";

const prisma = getPrisma();
let falhas = 0;
function confere(nome: string, ok: boolean, detalhe?: unknown) {
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok || detalhe === undefined ? "" : ` → ${JSON.stringify(detalhe)}`}`);
  if (!ok) falhas++;
}
function valor<T>(r: { ok: true; valor: T } | { ok: false; erro: string }): T {
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}

const OFX = `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0756<BRANCHID>4321<ACCTID>56789-0</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260107<TRNAMT>350,00<FITID>R1<MEMO>CRED PIX CLIENTE NOVO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105<TRNAMT>-15.90<FITID>R2<MEMO>TARIFA PACOTE SERVICOS</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260106<TRNAMT>-1200.00<FITID>R3<MEMO>SISPAG FGTS</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1000.00<DTASOF>20260131</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const lanc = (data: string, valorTexto: string, historico: string) => ({ data, lote: "1", historico, contrapartida: "1026", valor: dec(valorTexto) });
const RAZAO: RazaoConta = {
  empresa: "EMPRESA ENSAIO REVISAO LTDA",
  cnpj: "12345678000276",
  periodoInicio: "2026-01-01",
  periodoFim: "2026-01-08",
  contaCodigo: "5",
  contaClassificacao: "1.1.1.01",
  contaDescricao: "BANCO SICOOB",
  lancamentos: [
    lanc("2026-01-05", "-15.90", "TARIFA PACOTE"),
    lanc("2026-01-06", "-1200.00", "FGTS DO MES"),
    lanc("2026-01-07", "350.00", "RECEBIMENTO CLIENTE"),
  ],
  totalDebito: dec("350.00"),
  totalCredito: dec("1215.90"),
};

const linhaApoio = (data: string, historico: string, debito: string, credito: string, classificacao = "2.1.2.01") => ({
  data, contaCodigo: "354", contaClassificacao: classificacao, contaDescricao: "FGTS A RECOLHER", lote: "9", contrapartida: "504",
  historico, valorDebito: dec(debito), valorCredito: dec(credito), documento: null, favorecido: null,
});
const APOIO: RazaoApoio = {
  empresa: "EMPRESA ENSAIO REVISAO LTDA",
  cnpj: "12345678000276",
  periodoInicio: "2026-01-01",
  periodoFim: "2026-01-31",
  contas: [],
  linhas: [
    linhaApoio("2026-01-06", "PROVISAO FGTS 001", "0", "1000.00"),
    linhaApoio("2026-01-06", "PROVISAO FGTS 002", "0", "200.00"),
    linhaApoio("2026-01-20", "BAIXA PARCIAL FGTS", "50.00", "0"),
  ],
};

const linhaR = (r: Revisao, historico: string) => r.linhasRazao.find((l) => l.historico === historico)!;
const extrato = (r: Revisao, v: string) => r.extrato.find((l) => l.valor === v)!.transacaoId;

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true, name: true } });
  const tenantId = tenant.id;
  const company = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Empresa Ensaio Revisão LTDA", cnpj: "12.345.678/0002-76" } as never,
    select: { id: true },
  });
  const outraCompany = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Outra Empresa Ensaio LTDA", cnpj: "98.765.432/0003-19" } as never,
    select: { id: true },
  });

  const empresasDoCore: string[] = [];
  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    const outraEmpresaId = valor(await ligarEmpresa(tenantId, outraCompany.id, "simples_nacional")).id;
    empresasDoCore.push(empresaId, outraEmpresaId);
    const banco = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "1.1.1.01", descricao: "Banco Sicoob", tipo: "ativo", contaNumero: 5 })));
    const agencia = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "756", agencia: "4321", numero: "56789", digito: "0", contaContabilId: banco.id })));
    const imp = valor(await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan.ofx", new TextEncoder().encode(OFX), false));
    confere("extrato inventado importado (3 de 3)", imp.importadas === 3, imp);

    const base = { agenciaId: agencia.id, razao: RAZAO, nomeArquivo: "razao-jan.xlsx", hashArquivo: "a".repeat(64), sispag: null, hashSispag: null, confirmarEmpresa: false };

    // Criar, e a mesma de novo
    const criada = valor(await criarRevisao(tenantId, user.id, empresaId, base));
    let r = criada.revisao;
    confere("revisão criada na versão 1, com as fontes válidas", r.versao === 1 && r.fontesValidas && r.vinculos.length === 0, r);
    confere("auditoria da criação", criada.auditoria?.acao === "contabil.core.conciliacao.revisao.criada" && criada.auditoria.dados.arquivo === "razao-jan.xlsx", criada.auditoria);
    confere("extrato na ordem do papel e com sinal", r.extrato.map((l) => `${l.data} ${l.valor}`).join() === "2026-01-05 -15.90,2026-01-06 -1200.00,2026-01-07 350.00", r.extrato);
    confere("linhas do razão com referência r0…", r.linhasRazao.map((l) => `${l.referenciaId}:${l.valorDebito}/${l.valorCredito}`).join() === "r0:0/15.90,r1:0/1200.00,r2:350.00/0", r.linhasRazao);
    confere("relatório da conciliação guardado", r.relatorio.resumo.conciliados === 3 && r.relatorio.resumo.contaBancaria.includes("4321"), r.relatorio.resumo);
    const linhaNoBanco = await prisma.coreConciliacaoRevisao.findUniqueOrThrow({ where: { id: r.id }, select: { snapshot: true, relatorio: true, chaveAtiva: true, revisaoHash: true } });
    const snap = linhaNoBanco.snapshot as Record<string, unknown>;
    confere("snapshot no banco em snake_case, como o original", Array.isArray(snap.linhas_razao) && Array.isArray(snap.hashes_apoio) && "resumo" in (linhaNoBanco.relatorio as object), Object.keys(snap));
    confere("chave ativa = revisaoHash", linhaNoBanco.chaveAtiva === linhaNoBanco.revisaoHash);
    const deNovo = valor(await criarRevisao(tenantId, user.id, empresaId, base));
    confere("o mesmo envio devolve a mesma revisão, sem auditoria", deNovo.revisao.id === r.id && deNovo.auditoria === null, deNovo.auditoria);
    const lista = valor(await listarRevisoes(tenantId, empresaId, null, 1, 50));
    confere("a lista tem uma revisão", lista.total === 1 && lista.itens[0].id === r.id && !("snapshot" in lista.itens[0]), lista);

    // Razão sem CNPJ
    const semCnpj = { ...base, razao: { ...RAZAO, cnpj: "" }, hashArquivo: "b".repeat(64) };
    const precisa = await criarRevisao(tenantId, user.id, empresaId, semCnpj);
    confere("Razão sem CNPJ exige confirmação", !precisa.ok && precisa.codigo === "CONFIRMAR_EMPRESA" && precisa.erro.includes("Empresa Ensaio"), precisa);
    const confirmada = valor(await criarRevisao(tenantId, user.id, empresaId, { ...semCnpj, confirmarEmpresa: true }));
    confere("confirmado, entra com o aviso", confirmada.revisao.id !== r.id && confirmada.revisao.avisos.includes(AVISO_SEM_CNPJ), confirmada.revisao.avisos);
    const outraEmpresa = await criarRevisao(tenantId, user.id, empresaId, { ...base, razao: { ...RAZAO, cnpj: "98765432000319" } });
    confere("Razão de outra empresa é recusado", !outraEmpresa.ok && outraEmpresa.erro === "O razão enviado pertence a outra empresa.", outraEmpresa);

    // Razão de apoio
    const comApoio = valor(await adicionarApoio(tenantId, user.id, empresaId, r.id, { razao: APOIO, nomeArquivo: "FGTS.xlsx", versao: 1, confirmarEmpresa: false }));
    r = comApoio.revisao;
    confere("apoio aceito: versão 2, duas fontes, 3 linhas a mais", r.versao === 2 && r.fontes.length === 2 && r.linhasRazao.length === 6, { versao: r.versao, fontes: r.fontes.length });
    confere("auditoria do apoio", comApoio.auditoria?.acao === "contabil.core.conciliacao.apoio.adicionado" && comApoio.auditoria.dados.linhas === 3, comApoio.auditoria);
    const repetido = await adicionarApoio(tenantId, user.id, empresaId, r.id, { razao: APOIO, nomeArquivo: "FGTS2.xlsx", versao: 2, confirmarEmpresa: false });
    confere("o mesmo apoio de novo é recusado", !repetido.ok && repetido.codigo === "CONFLITO" && repetido.erro === "Este razão de apoio já está disponível nesta revisão.", repetido);
    const contaDoBanco = await adicionarApoio(tenantId, user.id, empresaId, r.id, {
      razao: { ...APOIO, linhas: [linhaApoio("2026-01-06", "OUTRA", "0", "10.00", "1.1.1.01")] }, nomeArquivo: "banco.xlsx", versao: 2, confirmarEmpresa: false,
    });
    confere("apoio com a conta do banco é recusado", !contaDoBanco.ok && contaDoBanco.erro.startsWith("O razão do banco já está nesta revisão."), contaDoBanco);
    const apoioVelho = await adicionarApoio(tenantId, user.id, empresaId, r.id, {
      razao: { ...APOIO, linhas: [linhaApoio("2026-01-09", "OUTRA PROVISAO", "0", "10.00")] }, nomeArquivo: "outro.xlsx", versao: 1, confirmarEmpresa: false,
    });
    confere("apoio com a versão antiga é recusado", !apoioVelho.ok && apoioVelho.codigo === "VERSAO_DESATUALIZADA", apoioVelho);

    // Vínculos
    const fgts = [linhaR(r, "PROVISAO FGTS 001"), linhaR(r, "PROVISAO FGTS 002")].map((l) => ({ linhaId: l.id, dc: "C" as const }));
    const vinculado = valor(await criarVinculo(tenantId, user.id, empresaId, r.id, { versao: 2, extratoIds: [extrato(r, "-1200.00")], razaoItens: fgts, observacao: "  Conferido com as guias.  " }));
    r = vinculado.revisao;
    const [v1] = r.vinculos;
    confere(
      "vínculo aceito: totais iguais, observação aparada, responsável",
      r.versao === 3 && v1.estado === "ATIVO" && v1.totalExtrato === "1200.00" && v1.totalRazao === "1200.00" && v1.diferenca === "0.00" && v1.observacao === "Conferido com as guias." && v1.responsavel === user.name,
      v1,
    );
    confere("auditoria do vínculo", vinculado.auditoria?.acao === "contabil.core.conciliacao.vinculo.confirmado" && vinculado.auditoria.dados.vinculo_id === v1.id && vinculado.auditoria.dados.diferenca === "0.00", vinculado.auditoria);
    const reuso = await criarVinculo(tenantId, user.id, empresaId, r.id, { versao: 3, extratoIds: [extrato(r, "-1200.00")], razaoItens: [{ linhaId: linhaR(r, "FGTS DO MES").id, dc: "C" }], observacao: "" });
    confere("reuso de lançamento já vinculado é recusado", !reuso.ok && reuso.codigo === "CONFLITO" && reuso.erro.startsWith("Um lançamento selecionado já participa"), reuso);
    const misturado = await criarVinculo(tenantId, user.id, empresaId, r.id, {
      versao: 3, extratoIds: [extrato(r, "-15.90"), extrato(r, "350.00")], razaoItens: [{ linhaId: linhaR(r, "TARIFA PACOTE").id, dc: "C" }], observacao: "",
    });
    confere("entrada e saída misturadas são recusadas", !misturado.ok && misturado.erro === "Selecione entradas ou saídas bancárias, sem misturá-las.", misturado);
    const semObs = await criarVinculo(tenantId, user.id, empresaId, r.id, {
      versao: 3, extratoIds: [extrato(r, "-15.90")], razaoItens: [{ linhaId: linhaR(r, "BAIXA PARCIAL FGTS").id, dc: "D" }], observacao: "   ",
    });
    confere("diferença sem observação é recusada", !semObs.ok && semObs.erro.startsWith("Os valores têm diferença."), semObs);
    const velha = await criarVinculo(tenantId, user.id, empresaId, r.id, { versao: 2, extratoIds: [extrato(r, "350.00")], razaoItens: [{ linhaId: linhaR(r, "RECEBIMENTO CLIENTE").id, dc: "D" }], observacao: "" });
    confere("vínculo com versão desatualizada é recusado", !velha.ok && velha.codigo === "CONFLITO" && velha.erro === "A revisão foi alterada. Atualize a tela.", velha);
    const invalido = await criarVinculo(tenantId, user.id, empresaId, r.id, { versao: 3, extratoIds: ["não é id"], razaoItens: fgts, observacao: "" });
    confere("id inválido é recusado na validação", !invalido.ok && invalido.erro === "Selecione um lançamento válido.", invalido);
    const recebimento = valor(await criarVinculo(tenantId, user.id, empresaId, r.id, {
      versao: 3, extratoIds: [extrato(r, "350.00").toUpperCase()], razaoItens: [{ linhaId: linhaR(r, "RECEBIMENTO CLIENTE").id, dc: "D" }], observacao: "",
    }));
    r = recebimento.revisao;
    confere("entrada com o débito do razão do banco (id em maiúsculas aceito)", r.versao === 4 && r.vinculos.length === 2 && r.vinculos[1].extratoIds[0] === extrato(r, "350.00"), r.vinculos);

    // Desfazer
    const desfeito = valor(await desfazerVinculo(tenantId, user.id, empresaId, r.id, v1.id, { versao: 4, motivo: "  Guia trocada.  " }));
    r = desfeito.revisao;
    const v1b = r.vinculos.find((v) => v.id === v1.id)!;
    confere("vínculo desfeito, com quem, quando e por quê", r.versao === 5 && v1b.estado === "DESFEITO" && v1b.desfeitoPor === user.name && !!v1b.desfeitoEm && v1b.motivoDesfazer === "Guia trocada.", v1b);
    confere("auditoria do desfazer", desfeito.auditoria?.acao === "contabil.core.conciliacao.vinculo.desfeito" && desfeito.auditoria.dados.motivo === "Guia trocada.", desfeito.auditoria);
    const deNovoDesfeito = await desfazerVinculo(tenantId, user.id, empresaId, r.id, v1.id, { versao: 5, motivo: "x" });
    confere("desfazer de novo é recusado", !deNovoDesfeito.ok && deNovoDesfeito.erro === "Esta conferência já foi desfeita.", deNovoDesfeito);
    const semMotivo = await desfazerVinculo(tenantId, user.id, empresaId, r.id, v1.id, { versao: 5, motivo: "   " });
    confere("desfazer sem motivo é recusado", !semMotivo.ok && semMotivo.erro === "Informe o motivo para desfazer a conferência.", semMotivo);
    const liberado = valor(await criarVinculo(tenantId, user.id, empresaId, r.id, { versao: 5, extratoIds: [extrato(r, "-1200.00")], razaoItens: fgts, observacao: "" }));
    r = liberado.revisao;
    confere("depois de desfeito, os lançamentos podem ser vinculados de novo", r.versao === 6 && r.vinculos.filter((v) => v.estado === "ATIVO").length === 2, r.vinculos.map((v) => v.estado));

    // Renomear (e versão desatualizada)
    const renomeada = valor(await renomearRevisao(tenantId, user.id, empresaId, r.id, { versao: 6, titulo: " Janeiro conferido " }));
    r = renomeada.revisao;
    confere("renomeada, versão 7", r.titulo === "Janeiro conferido" && r.versao === 7 && renomeada.auditoria?.dados.anterior === "razao-jan.xlsx", renomeada);
    const renomeVelho = await renomearRevisao(tenantId, user.id, empresaId, r.id, { versao: 6, titulo: "Outro" });
    confere("renomear com a versão antiga é recusado", !renomeVelho.ok && renomeVelho.codigo === "VERSAO_DESATUALIZADA", renomeVelho);
    const nomeVazio = await renomearRevisao(tenantId, user.id, empresaId, r.id, { versao: 7, titulo: "   " });
    confere("nome vazio é recusado", !nomeVazio.ok && nomeVazio.erro === "Informe um nome para a análise.", nomeVazio);

    // CHECK do MySQL (versão > 0)
    let recusouCheck = false;
    try {
      await prisma.coreConciliacaoRevisao.update({ where: { id: r.id }, data: { versao: 0 } });
    } catch {
      recusouCheck = true;
    }
    confere("o banco recusa versão 0 (CHECK)", recusouCheck);

    // Duas abas criando a mesma revisão ao mesmo tempo: uma cria, a outra recebe a mesma (P2002)
    const abas = { ...base, hashArquivo: "c".repeat(64) };
    const [aba1, aba2] = await Promise.all([criarRevisao(tenantId, user.id, empresaId, abas), criarRevisao(tenantId, user.id, empresaId, abas)]);
    confere(
      "criação simultânea: a mesma revisão nas duas abas, uma auditoria só",
      aba1.ok && aba2.ok && aba1.valor.revisao.id === aba2.valor.revisao.id && [aba1.valor.auditoria, aba2.valor.auditoria].filter(Boolean).length === 1,
      [aba1, aba2].map((x) => (x.ok ? { id: x.valor.revisao.id, auditoria: !!x.valor.auditoria } : x)),
    );

    // Isolamento
    const deOutroTenant = await obterRevisao(randomUUID(), empresaId, r.id);
    confere("outro tenant não lê a revisão", !deOutroTenant.ok && deOutroTenant.codigo === "NAO_ENCONTRADA", deOutroTenant);
    const deOutraEmpresa = await obterRevisao(tenantId, outraEmpresaId, r.id);
    confere("outra empresa não lê a revisão", !deOutraEmpresa.ok && deOutraEmpresa.codigo === "NAO_ENCONTRADA", deOutraEmpresa);
    const listaDeOutra = valor(await listarRevisoes(tenantId, outraEmpresaId, null, 1, 50));
    confere("a lista da outra empresa está vazia", listaDeOutra.total === 0, listaDeOutra);
    const vinculoDeOutra = await criarVinculo(tenantId, user.id, outraEmpresaId, r.id, { versao: 7, extratoIds: [extrato(r, "-15.90")], razaoItens: [{ linhaId: linhaR(r, "TARIFA PACOTE").id, dc: "C" }], observacao: "" });
    confere("outra empresa não grava na revisão", !vinculoDeOutra.ok && vinculoDeOutra.codigo === "NAO_ENCONTRADA", vinculoDeOutra);
    const doTenantErrado = await excluirRevisao(randomUUID(), user.id, empresaId, r.id, 7);
    confere("outro tenant não exclui", !doTenantErrado.ok && doTenantErrado.codigo === "NAO_ENCONTRADA", doTenantErrado);
    const lista2 = valor(await listarRevisoes(tenantId, empresaId, agencia.id, 1, 1));
    confere("lista por conta e paginada (3 revisões, 1 por página, a alterada por último primeiro)", lista2.total === 3 && lista2.itens.length === 1, lista2);

    // Excluir, e a mesma revisão pode ser criada de novo
    const velhaExclusao = await excluirRevisao(tenantId, user.id, empresaId, r.id, 6);
    confere("excluir com a versão antiga é recusado", !velhaExclusao.ok && velhaExclusao.codigo === "VERSAO_DESATUALIZADA", velhaExclusao);
    const excluida = valor(await excluirRevisao(tenantId, user.id, empresaId, r.id, 7));
    confere("excluída, com auditoria", excluida.revisao === null && excluida.auditoria.acao === "contabil.core.conciliacao.revisao.excluida" && excluida.auditoria.dados.exclusao_logica === true, excluida);
    const depoisDeExcluir = await obterRevisao(tenantId, empresaId, r.id);
    confere("a excluída não é mais lida", !depoisDeExcluir.ok && depoisDeExcluir.codigo === "NAO_ENCONTRADA", depoisDeExcluir);
    const noBanco = await prisma.coreConciliacaoRevisao.findUniqueOrThrow({ where: { id: r.id }, select: { deletedAt: true, chaveAtiva: true, versao: true } });
    confere("exclusão lógica: a linha fica, sem a chave ativa, versão 8", !!noBanco.deletedAt && noBanco.chaveAtiva === null && noBanco.versao === 8, noBanco);
    const recriada = valor(await criarRevisao(tenantId, user.id, empresaId, base));
    confere("o mesmo Razão abre uma revisão nova depois da exclusão", recriada.revisao.id !== r.id && recriada.auditoria !== null && recriada.revisao.versao === 1, recriada.revisao.id);
    r = recriada.revisao;
    const paraDesfazer = valor(await criarVinculo(tenantId, user.id, empresaId, r.id, { versao: 1, extratoIds: [extrato(r, "-15.90")], razaoItens: [{ linhaId: linhaR(r, "TARIFA PACOTE").id, dc: "C" }], observacao: "" }));
    r = paraDesfazer.revisao;

    // Extrato desfeito: a revisão vira histórico
    valor(await desfazerImportacao(tenantId, user.id, empresaId, imp.importacaoId, "ensaio da revisão"));
    const historico = valor(await obterRevisao(tenantId, empresaId, r.id));
    confere("extrato desfeito: fontes inválidas, com o aviso, e o snapshot fica", !historico.fontesValidas && historico.avisos.includes(AVISO_FONTE_ALTERADA) && historico.extrato.length === 3, historico.avisos);
    const naoConfirma = await criarVinculo(tenantId, user.id, empresaId, r.id, { versao: 2, extratoIds: [extrato(r, "350.00")], razaoItens: [{ linhaId: linhaR(r, "RECEBIMENTO CLIENTE").id, dc: "D" }], observacao: "" });
    confere("novo vínculo recusado com FONTE_ALTERADA", !naoConfirma.ok && naoConfirma.codigo === "FONTE_ALTERADA", naoConfirma);
    const apoioNaoEntra = await adicionarApoio(tenantId, user.id, empresaId, r.id, { razao: APOIO, nomeArquivo: "FGTS.xlsx", versao: 2, confirmarEmpresa: false });
    confere("apoio recusado com FONTE_ALTERADA", !apoioNaoEntra.ok && apoioNaoEntra.codigo === "FONTE_ALTERADA", apoioNaoEntra);
    const desfazDepois = await desfazerVinculo(tenantId, user.id, empresaId, r.id, r.vinculos[0].id, { versao: 2, motivo: "Extrato reimportado." });
    confere("desfazer continua permitido com a fonte alterada", desfazDepois.ok && desfazDepois.valor.revisao.vinculos[0].estado === "DESFEITO" && !desfazDepois.valor.revisao.fontesValidas, desfazDepois);
  } finally {
    const antes = await prisma.coreConciliacaoVinculo.count({ where: { tenantId, empresaId: { in: empresasDoCore } } });
    const mexido = await prisma.$transaction(
      async (tx) => {
        const daEmpresa = await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id });
        await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: outraCompany.id });
        return daEmpresa;
      },
      { timeout: 60_000 },
    );
    confere(
      "a exclusão da empresa apaga revisões e vínculos sem esbarrar em chave",
      (mexido.CoreConciliacaoRevisao ?? 0) >= 2 && (mexido.CoreConciliacaoVinculo ?? 0) === antes && antes > 0 && (mexido.CoreEmpresa ?? 0) === 1,
      { mexido, antes },
    );
    const sobra =
      (await prisma.coreConciliacaoRevisao.count({ where: { empresaId: { in: empresasDoCore } } })) +
      (await prisma.coreConciliacaoVinculo.count({ where: { empresaId: { in: empresasDoCore } } }));
    confere("nada da revisão ficou para trás", sobra === 0, sobra);
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
