// Ensaio dos comprovantes de pagamento e do NEO com notas e comprovantes (Bloco C, Fase C2, 19/11/2026)
// num banco LOCAL.
//
// Cadastra uma empresa inventada, importa um OFX inventado e percorre:
// - os comprovantes: o PDF com texto lido pelos rótulos, a imagem e o PDF escaneado sem a leitura por IA
//   (recusados com a frase), o PDF sem rótulo, a nota fiscal recusada com o código próprio, o formato não
//   suportado, o cadastro com o arquivo em disco (e o download igual ao enviado), o arquivo repetido (na
//   leitura e no cadastro), o mesmo pagamento sem e com a confirmação, a lista com o filtro, associar,
//   desassociar e excluir com cada recusa, o isolamento entre escritórios e empresas e os CHECKs;
// - o NEO: a contraparte pelo comprovante único, pela nota única (com o número no histórico), dois
//   comprovantes candidatos (nenhum ligado), a regra com o comprovante (a sombra pelo comprovante), a
//   gravação condicionada (documento já ligado não é ligado de novo), desfazer a classificação e desfazer
//   a importação soltando os dois.
// No fim, a exclusão da empresa apaga as linhas e os arquivos em disco. Nenhum dado real.
//
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-comprovantes.ts
import { existsSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getPrisma } from "../../src/lib/prisma";
import { proximoNumero } from "../../src/lib/enderecoCurtoNumeracao";
import { agenciaSchema, classificacaoManualSchema, contaSchema, contraparteSchema, regraSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa, salvarAgencia, salvarContraparte, salvarRegra } from "../../src/lib/contabil-core/servidor/cadastros";
import { desfazerImportacao, importarExtrato } from "../../src/lib/contabil-core/servidor/importacao";
import { cancelarClassificacao, classificarManual, liberarParaAutomatico, processarNeo, vincularDocumentos } from "../../src/lib/contabil-core/servidor/neo";
import {
  arquivoDoComprovante,
  associarComprovante,
  criarComprovante,
  desassociarComprovante,
  excluirComprovante,
  extrairDoArquivo,
  listarComprovantes,
  obterComprovante,
} from "../../src/lib/contabil-core/servidor/comprovantes";
import { criarNota, definirIaParaDocumentos, iaLiberadaParaDocumentos, obterNota } from "../../src/lib/contabil-core/servidor/notas";
import { LEITURA_DESLIGADA } from "../../src/lib/contabil-core/ia/leituraPorIa";
import { PLANO_DA_EMPRESA, arquivosDaEmpresa } from "../../src/lib/exclusao/empresa";
import { apagarArquivos } from "../../src/lib/exclusao/arquivos";
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
const CNPJ = cnpj("975318640001");
const OUTRO_CNPJ = cnpj("987654320007");
const FORNECEDOR = cnpj("912345670001");

async function pdf(linhas: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const pagina = doc.addPage([595, 842]);
  linhas.forEach((l, k) => pagina.drawText(l, { x: 50, y: 780 - k * 18, size: 11, font: fonte }));
  return doc.save();
}
async function pdfEmBranco(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return doc.save();
}

const OFX = `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0341<BRANCHID>4321<ACCTID>66666-1</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260113<TRNAMT>-1234.56<FITID>C1<MEMO>PIX ENVIADO DIVERSOS 01</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260114<TRNAMT>-500.00<FITID>C2<MEMO>PAGAMENTO SERVICOS PRESTADOS</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260115<TRNAMT>-300.00<FITID>C3<MEMO>PAGAMENTO SEM CANDIDATO UNICO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260116<TRNAMT>-77.00<FITID>C4<MEMO>TARIFA PACOTE MENSAL</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260120<TRNAMT>-42.00<FITID>C5<MEMO>PAGAMENTO AVULSO</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1000.00<DTASOF>20260131</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
  const tenantId = tenant.id;
  const iaAntes = await iaLiberadaParaDocumentos(tenantId);
  await definirIaParaDocumentos(tenantId, false);
  const company = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Empresa Ensaio Comprovantes LTDA", cnpj: CNPJ } as never,
    select: { id: true },
  });
  const outraCompany = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Outra Empresa Ensaio Comprovantes LTDA", cnpj: OUTRO_CNPJ } as never,
    select: { id: true },
  });
  const empresasDoCore: string[] = [];
  const arquivosGravados: string[] = [];
  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    const outraEmpresaId = valor(await ligarEmpresa(tenantId, outraCompany.id, "simples_nacional")).id;
    empresasDoCore.push(empresaId, outraEmpresaId);
    const banco = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "1.1.1.04", descricao: "Banco Itaú", tipo: "ativo", contaNumero: 9 })));
    const fornecedores = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "2.1.1.01", descricao: "Fornecedores", tipo: "passivo", contaNumero: 211 })));
    const tarifas = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "4.1.2.01", descricao: "Tarifas", tipo: "despesa", contaNumero: 412 })));
    const agencia = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "4321", numero: "66666", digito: "1", contaContabilId: banco.id })));
    const fornecedor = valor(
      await salvarContraparte(tenantId, user.id, empresaId, null, contraparteSchema.parse({ tipo: "fornecedor", documento: FORNECEDOR, razaoSocial: "Fornecedor Exemplo Ltda", contaContabilId: fornecedores.id })),
    );
    valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: tarifas.id, descricao: "Tarifa bancária", historico: "TARIFA PACOTE", dc: "D" })));
    const imp = valor(await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan.ofx", new TextEncoder().encode(OFX), false));
    confere("extrato inventado importado (5 de 5)", imp.importadas === 5, imp);
    const ts = await prisma.coreTransacao.findMany({ where: { empresaId, deletedAt: null }, orderBy: { data: "asc" }, select: { id: true, historico: true } });
    const [t1, t2, t3, t4, t5] = ts;

    // ─── Ler o arquivo para pré-preencher ─────────────────────────────────
    const extrair = (nome: string, tipo: string, conteudo: Uint8Array, empresa = empresaId, tenantDaChamada = tenantId) =>
      extrairDoArquivo(tenantDaChamada, user.id, empresa, { nome, tipo, conteudo });
    const pix = await pdf([
      "Comprovante de Pagamento Pix",
      "Valor: R$ 1.234,56",
      "Realizado em: 13/01/2026 - 09:33:52",
      "Nome do destinatário: FORNECEDOR EXEMPLO LTDA",
      `CNPJ do destinatário: ${FORNECEDOR}`,
      "Nome do pagador: EMPRESA ENSAIO COMPROVANTES LTDA",
    ]);
    const lido = await extrair("pix.pdf", "application/pdf", pix);
    confere(
      "PDF com texto lido pelos rótulos (sem IA)",
      lido.ok && lido.valor.confianca === "regex" && lido.valor.valorPago === "1234.56" && lido.valor.dataPagamento === "2026-01-13T00:00:00+00:00" &&
        lido.valor.favorecido === "FORNECEDOR EXEMPLO LTDA" && lido.valor.cpfCnpj === FORNECEDOR,
      lido,
    );
    const imagem = await extrair("foto.jpg", "image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2]));
    confere("imagem sem a leitura por IA: recusada com a frase de onde ligar", !imagem.ok && imagem.erro === LEITURA_DESLIGADA, imagem);
    const escaneado = await extrair("escaneado.pdf", "application/pdf", await pdfEmBranco());
    confere("PDF sem texto sem a leitura por IA: recusado com a mesma frase", !escaneado.ok && escaneado.erro === LEITURA_DESLIGADA, escaneado);
    const semRotulo = await extrair("sem-rotulo.pdf", "", await pdf(["Comprovante", "Quantia transferida R$ 10,00", "Operação concluída"]));
    confere(
      "PDF com texto sem rótulo (detectado pela assinatura): pede o preenchimento e diz por que a IA não leu",
      !semRotulo.ok && semRotulo.erro.startsWith("Não foi possível identificar o valor pago neste comprovante. Preencha os campos manualmente. (a leitura assistida por IA está desligada neste escritório"),
      semRotulo,
    );
    const nota = await extrair("nfse.pdf", "application/pdf", await pdf(["DANFSe v1.0", "Documento Auxiliar da NFS-e", "Valor do Serviço R$ 1.245,00"]));
    confere("nota fiscal recusada com o código próprio", !nota.ok && nota.codigo === "DOCUMENTO_NAO_E_COMPROVANTE" && nota.erro.startsWith("Este arquivo é uma nota fiscal"), nota);
    const texto = await extrair("planilha.csv", "text/csv", new TextEncoder().encode("a;b"));
    confere("formato não suportado", !texto.ok && texto.erro === "Formato não suportado. Envie um PDF, PNG ou JPG do comprovante.", texto);

    // ─── Cadastrar ────────────────────────────────────────────────────────
    const criar = (campos: Record<string, unknown>, arquivo: { nome: string; tipo: string; conteudo: Uint8Array } | null = null, empresa = empresaId) =>
      criarComprovante(tenantId, empresa, campos, arquivo);
    const doPix = await criar(
      { favorecido: "FORNECEDOR EXEMPLO LTDA", cpfCnpj: FORNECEDOR, valorPago: "1234.56", dataPagamento: "2026-01-13T00:00:00.000Z" },
      { nome: "pix.pdf", tipo: "application/pdf", conteudo: pix },
    );
    confere("cadastro com o arquivo, com a auditoria", doPix.ok && doPix.valor.comprovante!.temArquivo && doPix.valor.comprovante!.arquivoNome === "pix.pdf" && doPix.valor.auditoria.acao === "contabil.core.comprovante.criado", doPix);
    const comprovantePix = doPix.ok ? doPix.valor.comprovante! : null;
    const linha = await prisma.coreComprovante.findUniqueOrThrow({ where: { id: comprovantePix!.id } });
    arquivosGravados.push(linha.storageKey!);
    const noDisco = path.join(process.cwd(), "storage", "contabil-core", "comprovantes", linha.storageKey!);
    confere(
      "o arquivo fica em disco (não no banco), com o SHA-256 dos bytes, o tipo e o tamanho",
      existsSync(noDisco) && linha.storageKey === `${tenantId}/${linha.id}.pdf` && /^[0-9a-f]{64}$/.test(linha.arquivoSha256!) && linha.arquivoTipo === "application/pdf" && linha.arquivoTamanho === pix.length,
      linha,
    );
    const baixado = valor(await arquivoDoComprovante(tenantId, empresaId, linha.id));
    confere("o download devolve os mesmos bytes, como PDF", Buffer.compare(baixado.bytes, Buffer.from(pix)) === 0 && baixado.tipo === "application/pdf" && baixado.nome === "pix.pdf");
    const deNovoNaLeitura = await extrair("pix-copia.pdf", "application/pdf", pix);
    confere(
      "o mesmo arquivo de novo é recusado ANTES de ler, com os detalhes do que já existe",
      !deNovoNaLeitura.ok && deNovoNaLeitura.codigo === "COMPROVANTE_JA_IMPORTADO" && deNovoNaLeitura.erro === "Este arquivo já foi importado: comprovante de R$ 1.234,56 para FORNECEDOR EXEMPLO LTDA pago em 13/01/2026 (arquivo pix.pdf)." && deNovoNaLeitura.detalhes?.comprovante_id === linha.id,
      deNovoNaLeitura,
    );
    const deNovoNoCadastro = await criar({ valorPago: "9.99", permitirDuplicado: true }, { nome: "outro-nome.pdf", tipo: "", conteudo: pix });
    confere("o mesmo arquivo no cadastro é recusado mesmo com a confirmação", !deNovoNoCadastro.ok && deNovoNoCadastro.codigo === "COMPROVANTE_JA_IMPORTADO", deNovoNoCadastro);
    const mesmoPagamento = await criar({ favorecido: "outro nome", cpfCnpj: FORNECEDOR.replace(/\D/g, ""), valorPago: "1234.56", dataPagamento: "2026-01-13T15:00:00-03:00" });
    confere(
      "o mesmo pagamento (valor, dia e documento) com outro arquivo pede confirmação",
      !mesmoPagamento.ok && mesmoPagamento.codigo === "COMPROVANTE_POSSIVEL_DUPLICADO" && mesmoPagamento.erro.startsWith("Já existe um comprovante de R$ 1.234,56 para FORNECEDOR EXEMPLO LTDA") && mesmoPagamento.erro.endsWith("confirme para salvar mesmo assim."),
      mesmoPagamento,
    );
    const confirmado = await criar({ favorecido: "outro nome", valorPago: "1234.56", dataPagamento: "2026-03-13T15:00:00-03:00", permitirDuplicado: true });
    confere("com a confirmação, o cadastro à mão entra", confirmado.ok && confirmado.valor.auditoria.dados.permitir_duplicado === true, confirmado);
    const invalido = await criar({ valorPago: "0" });
    confere("valor pago zero é recusado com frase", !invalido.ok && invalido.codigo === "INVALIDA" && invalido.erro === "O valor pago deve ser maior que zero.", invalido);
    const formato = await criar({ valorPago: "1" }, { nome: "a.txt", tipo: "text/plain", conteudo: new TextEncoder().encode("oi") });
    confere("arquivo que não é PDF nem imagem é recusado no cadastro", !formato.ok && formato.erro.startsWith("Formato não suportado"), formato);
    // Os documentos do NEO.
    const c300a = valor(await criar({ favorecido: "PRIMEIRO", valorPago: "300.00", dataPagamento: "2026-01-15T00:00:00.000Z" })).comprovante!;
    const c300b = valor(await criar({ favorecido: "SEGUNDO", valorPago: "300.00", dataPagamento: "2026-01-16T00:00:00.000Z" })).comprovante!;
    const c77 = valor(await criar({ cpfCnpj: FORNECEDOR, valorPago: "77", dataPagamento: "2026-01-16T00:00:00.000Z", juros: "0.5" })).comprovante!;
    confere("o valor volta com as 2 casas, e os acréscimos também", c77.valorPago === "77.00" && c77.juros === "0.50" && c77.multa === "0.00", c77);
    const nota500 = valor(
      await criarNota(tenantId, user.id, empresaId, { tipo: "nfse", numero: "4321", cnpjEmitente: FORNECEDOR, cnpjDestinatario: CNPJ, valor: "500.00", dataEmissao: "2026-01-12T00:00:00.000Z" }),
    ).nota;

    // ─── Lista ────────────────────────────────────────────────────────────
    const semData = valor(await criar({ favorecido: "SEM DATA", valorPago: "5.00" })).comprovante!;
    const lista = (f: Parameters<typeof listarComprovantes>[2] = {}, pagina = 1, porPagina = 50) => listarComprovantes(tenantId, empresaId, f, pagina, porPagina).then(valor);
    const todos = await lista();
    confere(
      "a lista: o sem data primeiro (como o PostgreSQL), depois do mais recente para o mais antigo",
      todos.total === 6 && todos.itens[0].id === semData.id && confirmado.ok && todos.itens[1].id === confirmado.valor.comprovante!.id && todos.itens[5].id === comprovantePix!.id,
      todos.itens.map((c) => [c.favorecido, c.dataPagamento]),
    );

    // ─── Isolamento ───────────────────────────────────────────────────────
    const deOutroTenant = await obterComprovante("tenant-que-nao-existe", empresaId, linha.id);
    const deOutraEmpresa = await obterComprovante(tenantId, outraEmpresaId, linha.id);
    confere("o comprovante não é lido por outro escritório nem pela outra empresa", !deOutroTenant.ok && !deOutraEmpresa.ok && deOutraEmpresa.erro === "Comprovante não encontrado.", { deOutroTenant, deOutraEmpresa });
    confere("a outra empresa não vê os comprovantes, nem baixa o arquivo", (await listarComprovantes(tenantId, outraEmpresaId, {}, 1, 50).then(valor)).total === 0 && !(await arquivoDoComprovante(tenantId, outraEmpresaId, linha.id)).ok);
    const naOutra = await criar({ valorPago: "1" }, { nome: "pix.pdf", tipo: "application/pdf", conteudo: pix }, outraEmpresaId);
    confere("o mesmo arquivo entra na outra empresa (a duplicidade é por empresa)", naOutra.ok, naOutra);
    if (naOutra.ok) arquivosGravados.push((await prisma.coreComprovante.findUniqueOrThrow({ where: { id: naOutra.valor.comprovante!.id } })).storageKey!);
    const outraAgencia = valor(await salvarAgencia(tenantId, outraEmpresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "1111", numero: "33333" })));
    const outraImp = valor(await importarExtrato(tenantId, user.id, outraEmpresaId, outraAgencia.id, "o.ofx", new TextEncoder().encode(OFX.replace("4321", "1111").replace("66666-1", "33333")), true));
    const transacaoDeOutra = await prisma.coreTransacao.findFirstOrThrow({ where: { empresaId: outraEmpresaId, importacaoId: outraImp.importacaoId }, select: { id: true } });
    const comOutra = await associarComprovante(tenantId, empresaId, semData.id, transacaoDeOutra.id);
    confere("associar a transação de outra empresa é recusado", !comOutra.ok && comOutra.codigo === "NAO_ENCONTRADA" && comOutra.erro === "Transação não encontrada nesta empresa.", comOutra);
    const agenciaDeOutra = await criar({ valorPago: "1", agenciaId: outraAgencia.id });
    confere("a conta bancária de outra empresa é recusada", !agenciaDeOutra.ok && agenciaDeOutra.erro === "Agência bancária não encontrada nesta empresa.", agenciaDeOutra);

    // ─── Associar, desassociar e excluir ──────────────────────────────────
    const associado = await associarComprovante(tenantId, empresaId, semData.id, t5.id);
    confere("associado, com o resumo da transação e a auditoria", associado.ok && associado.valor.comprovante!.transacao?.historico === t5.historico && associado.valor.auditoria.acao === "contabil.core.comprovante.associado", associado);
    const deNovo = await associarComprovante(tenantId, empresaId, semData.id, t3.id);
    confere("associar o já associado é recusado", !deNovo.ok && deNovo.codigo === "CONFLITO" && deNovo.erro === "Este comprovante já está associado a uma transação. Desassocie primeiro.", deNovo);
    confere("a lista filtra por status", (await lista({ status: "associado" })).total === 1 && (await lista({ status: "nao_associado" })).total === 5 && (await lista({ status: "xyz" })).total === 6);
    const desassociado = await desassociarComprovante(tenantId, empresaId, semData.id);
    confere("desassociado, com a transação na auditoria", desassociado.ok && desassociado.valor.comprovante!.transacaoId === null && desassociado.valor.auditoria.dados.transacao_id === t5.id, desassociado);
    const desassociarDeNovo = await desassociarComprovante(tenantId, empresaId, semData.id);
    confere("desassociar o livre é recusado", !desassociarDeNovo.ok && desassociarDeNovo.erro === "Comprovante não está associado a nenhuma transação.", desassociarDeNovo);
    const excluido = await excluirComprovante(tenantId, empresaId, linha.id);
    confere("excluído (lógico), com a auditoria", excluido.ok && excluido.valor.auditoria.acao === "contabil.core.comprovante.excluido", excluido);
    confere("o excluído some da leitura e do download, mas o arquivo fica no disco", !(await obterComprovante(tenantId, empresaId, linha.id)).ok && !(await arquivoDoComprovante(tenantId, empresaId, linha.id)).ok && existsSync(noDisco));
    const reenviado = await criar({ cpfCnpj: FORNECEDOR, favorecido: "FORNECEDOR EXEMPLO LTDA", valorPago: "1234.56", dataPagamento: "2026-01-13T00:00:00.000Z" }, { nome: "pix.pdf", tipo: "application/pdf", conteudo: pix });
    confere("depois de excluir, o mesmo arquivo pode entrar de novo", reenviado.ok, reenviado);
    const cPix = reenviado.ok ? reenviado.valor.comprovante! : comprovantePix!;
    if (reenviado.ok) arquivosGravados.push((await prisma.coreComprovante.findUniqueOrThrow({ where: { id: cPix.id } })).storageKey!);
    const inexistente = await excluirComprovante(tenantId, empresaId, "00000000-0000-4000-8000-000000000000");
    confere("comprovante inexistente", !inexistente.ok && inexistente.codigo === "NAO_ENCONTRADA");

    // ─── O NEO ────────────────────────────────────────────────────────────
    const neo = valor(await processarNeo(tenantId, empresaId, { agenciaId: null, mes: "2026-01" }));
    confere(
      "o NEO classifica 3 (2 pela contraparte) e liga 2 comprovantes e 1 nota",
      neo.totalPendentes === 5 && neo.associadas === 3 && neo.classificadasPorContraparte === 2 && neo.comprovantesAssociados === 2 && neo.notasAssociadas === 1 && neo.semRegra === 2,
      neo,
    );
    const docsDe = async (id: string) => ({
      comp: await prisma.coreComprovante.findUniqueOrThrow({ where: { id }, select: { transacaoId: true } }),
    });
    const decisao = (transacaoId: string) => prisma.coreNeoDecisao.findFirst({ where: { transacaoId }, orderBy: { processadoEm: "desc" } });
    const registro = (transacaoId: string) => prisma.coreRegistro.findFirst({ where: { transacaoId, deletedAt: null, contaId: { not: banco.id } } });
    const d1 = await decisao(t1.id);
    confere("a transação do PIX: contraparte pelo comprovante único, que fica ligado", d1?.estrategia === "contraparte" && d1.motivo === `Contraparte 'Fornecedor Exemplo Ltda' identificada via comprovante (documento ${FORNECEDOR.replace(/\D/g, "")})` && (await docsDe(cPix.id)).comp.transacaoId === t1.id, d1);
    const r2 = await registro(t2.id);
    const n2 = valor(await obterNota(tenantId, empresaId, nota500.id));
    confere("a transação da nota: contraparte pela nota, o número no histórico, a nota associada", r2?.historico === "PGTO REF NF 4321 - FORNECEDOR EXEMPLO LTDA" && r2.contaId === fornecedores.id && n2.status === "associada" && n2.transacaoId === t2.id, { r2, n2 });
    confere("dois comprovantes candidatos: nenhum ligado, a transação fica pendente", (await docsDe(c300a.id)).comp.transacaoId === null && (await docsDe(c300b.id)).comp.transacaoId === null && (await prisma.coreTransacao.findUniqueOrThrow({ where: { id: t3.id } })).status === "pendente");
    const d4 = await decisao(t4.id);
    confere("com regra, o comprovante é ligado e a contraparte dele só medida (sombra)", d4?.estrategia !== "contraparte" && d4?.regraId !== null && d4?.origemEvidencia === "comprovante" && d4.contraparteId === fornecedor.id && d4.contaDivergente === true && (await docsDe(c77.id)).comp.transacaoId === t4.id, d4);
    const jaLigado = await prisma.$transaction((tx) => vincularDocumentos(tx, { tenantId, empresaId }, t5.id, { comprovante: { id: c77.id, cpfCnpj: null, valorPago: { negativo: false, coeficiente: BigInt(77), expoente: 0 }, dataPagamento: null }, nota: null }));
    confere("a gravação condicionada não liga o documento que outra execução já ligou", !jaLigado.comprovante && (await docsDe(c77.id)).comp.transacaoId === t4.id, jaLigado);

    // ─── Desfazer a classificação e a importação ──────────────────────────
    const canc1 = valor(await cancelarClassificacao(tenantId, user.id, empresaId, t1.id, "Conta errada"));
    const canc2 = valor(await cancelarClassificacao(tenantId, user.id, empresaId, t2.id, "Conta errada"));
    confere(
      "desfazer a classificação solta o comprovante e a nota (que volta para pendente), e conta",
      canc1.comprovantesDesvinculados === 1 && canc2.notasDesvinculadas === 1 && (await docsDe(cPix.id)).comp.transacaoId === null && valor(await obterNota(tenantId, empresaId, nota500.id)).status === "pendente",
      { canc1, canc2 },
    );
    valor(await liberarParaAutomatico(tenantId, empresaId, t1.id));
    valor(await liberarParaAutomatico(tenantId, empresaId, t2.id));
    const neo2 = valor(await processarNeo(tenantId, empresaId, { agenciaId: null, mes: null }));
    confere("devolvidas ao automático, o NEO as liga de novo", neo2.associadas === 2 && neo2.comprovantesAssociados === 1 && neo2.notasAssociadas === 1, neo2);
    valor(await associarComprovante(tenantId, empresaId, semData.id, t5.id));
    valor(await classificarManual(tenantId, empresaId, classificacaoManualSchema.parse({ transacaoIds: [t3.id], contaId: tarifas.id, descricao: "Pagamento diverso" })));
    const desfeita = valor(await desfazerImportacao(tenantId, user.id, empresaId, imp.importacaoId, "Arquivo errado"));
    confere("importação desfeita (4 lançamentos cancelados)", desfeita.transacoes === 5 && desfeita.lancamentos === 4, desfeita);
    confere(
      "os documentos das transações classificadas são soltos",
      (await docsDe(cPix.id)).comp.transacaoId === null && (await docsDe(c77.id)).comp.transacaoId === null && valor(await obterNota(tenantId, empresaId, nota500.id)).transacaoId === null,
    );
    const daPendente = valor(await obterComprovante(tenantId, empresaId, semData.id));
    confere("o comprovante da transação sem lançamento fica ligado à transação que saiu (como no original), e a tela sabe", daPendente.transacaoId === t5.id && daPendente.transacao?.desfeita === true, daPendente);
    const comDesfeita = await associarComprovante(tenantId, empresaId, c300a.id, t5.id);
    confere("associar a uma transação desfeita é recusado", !comDesfeita.ok && comDesfeita.codigo === "NAO_ENCONTRADA", comDesfeita);
    const reimportado = valor(await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan.ofx", new TextEncoder().encode(OFX), false));
    confere("o mesmo extrato volta a entrar (o comprovante não trava a transação)", reimportado.importadas === 5, reimportado);

    // ─── Checagens do MySQL ───────────────────────────────────────────────
    const base = { tenantId, empresaId, valorPago: "1.00" };
    for (const [nome, dados] of [
      ["valor pago zero", { ...base, valorPago: "0" }],
      ["juros negativos", { ...base, juros: "-1" }],
      ["desconto negativo", { ...base, desconto: "-0.01" }],
    ] as const) {
      const r = await prisma.coreComprovante.create({ data: dados }).then(() => null, (e: unknown) => e);
      confere(`o CHECK recusa ${nome}`, r !== null && String((r as Error).message).includes("ck_core_comprovante"), String((r as Error | null)?.message).slice(0, 200));
    }
    const mesmoSha = await prisma.coreComprovante.createMany({ data: [{ ...base, arquivoSha256: linha.arquivoSha256 }, { ...base, arquivoSha256: linha.arquivoSha256 }] });
    confere("o índice do SHA-256 não é único (como no original)", mesmoSha.count === 2);
  } finally {
    const contar = () => prisma.coreComprovante.count({ where: { empresaId: { in: empresasDoCore } } });
    const antes = await contar();
    let arquivos;
    const mexido = await prisma.$transaction(
      async (tx) => {
        arquivos = await arquivosDaEmpresa(tx as never, { tenantId, id: company.id }, null);
        const outros = await arquivosDaEmpresa(tx as never, { tenantId, id: outraCompany.id }, null);
        arquivos.storage["contabil-core/comprovantes"] = [...(arquivos.storage["contabil-core/comprovantes"] ?? []), ...(outros.storage["contabil-core/comprovantes"] ?? [])];
        const m = await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id });
        await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: outraCompany.id });
        return m;
      },
      { timeout: 60_000 },
    );
    const listados = arquivos!.storage["contabil-core/comprovantes"] ?? [];
    const naoApagados = await apagarArquivos(arquivos!);
    confere("a exclusão da empresa apaga os comprovantes antes das transações, sem esbarrar em chave", antes > 0 && (mexido.CoreComprovante ?? 0) >= 6 && (mexido.CoreEmpresa ?? 0) === 1, { mexido, antes });
    confere("nada dos comprovantes ficou para trás", (await contar()) === 0);
    confere(
      "os arquivos em disco saem depois do commit (inclusive o do excluído)",
      naoApagados === 0 && arquivosGravados.every((k) => listados.includes(k)) && arquivosGravados.every((k) => !existsSync(path.join(process.cwd(), "storage", "contabil-core", "comprovantes", k))),
      { listados, arquivosGravados, naoApagados },
    );
    await definirIaParaDocumentos(tenantId, iaAntes);
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
