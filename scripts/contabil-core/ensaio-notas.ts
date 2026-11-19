// Ensaio das notas fiscais (Bloco C, Fase C1, 18/11/2026) num banco LOCAL.
//
// Cadastra uma empresa inventada, importa um OFX inventado e percorre as notas com os XMLs inventados de
// `scripts/contabil-core/ensaio-notas/` (gerados e conferidos com o leitor do original por
// `ensaio_notas_xml.py`): NF-e assinada, NF-e alterada depois de assinada (entra como "assinatura não
// conferida", com o motivo), NFS-e assinada, a repetida (duplicada), a de outra empresa (recusada pelo
// CNPJ), o ZIP, o PDF sem a leitura por IA, o cadastro à mão, a lista com filtros, o isolamento por
// tenant e por empresa, associar, desassociar e cancelar com cada recusa, a classificação desfeita (a
// nota é desvinculada) e a importação do extrato desfeita (a nota de transação sem lançamento fica
// ligada à transação que saiu, como no original). Confere as checagens do MySQL e, no fim, apaga tudo
// pela exclusão da empresa. Nenhum dado real.
//
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-notas.ts
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import path from "node:path";
import { getPrisma } from "../../src/lib/prisma";
import { proximoNumero } from "../../src/lib/enderecoCurtoNumeracao";
import { agenciaSchema, classificacaoManualSchema, contaSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa, salvarAgencia } from "../../src/lib/contabil-core/servidor/cadastros";
import { desfazerImportacao, importarExtrato } from "../../src/lib/contabil-core/servidor/importacao";
import { cancelarClassificacao, classificarManual } from "../../src/lib/contabil-core/servidor/neo";
import {
  associarNota,
  cancelarNota,
  criarNota,
  desassociarNota,
  importarArquivo,
  listarNotas,
  obterNota,
  transacoesParaAssociar,
} from "../../src/lib/contabil-core/servidor/notas";
import type { NotaDaTela } from "../../src/lib/contabil-core/notas/telaDasNotas";
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

const PASTA = path.join(process.cwd(), "scripts", "contabil-core", "ensaio-notas");
const arquivo = (nome: string) => new Uint8Array(readFileSync(path.join(PASTA, nome)));
type Esperado = { tipo: string; numero: string; cnpj_emitente: string; cnpj_destinatario: string; valor: string; chave_acesso: string | null; assinatura_nao_verificada: string | null };
const ESPERADO = JSON.parse(readFileSync(path.join(PASTA, "esperado.json"), "utf8")) as { empresa: string; arquivos: Record<string, Esperado> };
const CNPJ = ESPERADO.empresa.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

const OFX = `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0341<BRANCHID>4321<ACCTID>55555-1</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260106<TRNAMT>-800.00<FITID>N1<MEMO>PAGTO FORNECEDORA FICTICIA NF 84086</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260107<TRNAMT>-1500.50<FITID>N2<MEMO>PAGTO FORNECEDORA FICTICIA NF 84087</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260108<TRNAMT>350,00<FITID>N3<MEMO>PIX RECEBIDO CLIENTE NFSE 2026</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1000.00<DTASOF>20260131</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
  const tenantId = tenant.id;
  const company = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Empresa Ensaio Notas LTDA", cnpj: CNPJ } as never,
    select: { id: true },
  });
  const outraCompany = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Outra Empresa Ensaio Notas LTDA", cnpj: "98.765.432/0007-61" } as never,
    select: { id: true },
  });

  const empresasDoCore: string[] = [];
  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    const outraEmpresaId = valor(await ligarEmpresa(tenantId, outraCompany.id, "simples_nacional")).id;
    empresasDoCore.push(empresaId, outraEmpresaId);
    const banco = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "1.1.1.03", descricao: "Banco Itaú", tipo: "ativo", contaNumero: 8 })));
    const despesa = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "4.1.1.01", descricao: "Fornecedores", tipo: "despesa", contaNumero: 401 })));
    const agencia = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "4321", numero: "55555", digito: "1", contaContabilId: banco.id })));
    const imp = valor(await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan.ofx", new TextEncoder().encode(OFX), false));
    confere("extrato inventado importado (3 de 3)", imp.importadas === 3, imp);
    const transacoes = await prisma.coreTransacao.findMany({ where: { empresaId, deletedAt: null }, orderBy: { data: "asc" }, select: { id: true, historico: true } });
    const [t800, t1500] = transacoes;

    // ─── Importar ─────────────────────────────────────────────────────────
    const importar = (nome: string, conteudo = arquivo(nome), empresa = empresaId, tenantDaChamada = tenantId) =>
      importarArquivo(tenantDaChamada, user.id, empresa, { nome, conteudo });
    const lida = async (nome: string) => {
      const r = valor(await importar(nome));
      const nota = r.resultado.notas[0] ? valor(await obterNota(tenantId, empresaId, r.resultado.notas[0])) : null;
      return { r, nota };
    };
    const igualAoOriginal = (n: NotaDaTela | null, e: Esperado) =>
      !!n && n.tipo === e.tipo && n.numero === e.numero && n.cnpjEmitente === e.cnpj_emitente && n.cnpjDestinatario === e.cnpj_destinatario &&
      n.valor === e.valor && n.chaveAcesso === e.chave_acesso && n.assinaturaMotivo === e.assinatura_nao_verificada;

    const assinada = await lida("nfe-assinada.xml");
    confere("NF-e assinada importada como xml_assinado, com os campos do original", assinada.r.resultado.importadas === 1 && assinada.nota?.origem === "xml_assinado" && igualAoOriginal(assinada.nota, ESPERADO.arquivos["nfe-assinada.xml"]), { r: assinada.r, nota: assinada.nota });
    confere("auditoria da importação", assinada.r.auditoria?.acao === "contabil.core.notas.importadas" && (assinada.r.auditoria.dados.notas as string[])[0] === assinada.nota?.id, assinada.r.auditoria);
    const linha = await prisma.coreNotaFiscal.findUniqueOrThrow({ where: { id: assinada.nota!.id } });
    confere("no banco: emissão em UTC, CNPJs formatados, a identidade de 64 hexadecimais", linha.dataEmissao.toISOString() === "2026-01-06T13:00:00.000Z" && /^[0-9a-f]{64}$/.test(linha.dedupKey) && linha.status === "pendente", linha);

    const alterada = await lida("nfe-alterada.xml");
    confere("NF-e alterada depois de assinada entra como xml_nao_verificado, com o motivo do original", alterada.r.resultado.importadas === 1 && alterada.nota?.origem === "xml_nao_verificado" && igualAoOriginal(alterada.nota, ESPERADO.arquivos["nfe-alterada.xml"]), { nota: alterada.nota, esperado: ESPERADO.arquivos["nfe-alterada.xml"] });
    const nfse = await lida("nfse-assinada.xml");
    confere("NFS-e assinada importada (a empresa como prestadora)", nfse.r.resultado.importadas === 1 && nfse.nota?.tipo === "nfse" && nfse.nota.origem === "xml_assinado" && igualAoOriginal(nfse.nota, ESPERADO.arquivos["nfse-assinada.xml"]), nfse.nota);
    const repetida = valor(await importar("nfe-assinada.xml"));
    confere("a mesma NF-e de novo é duplicada, sem auditoria", repetida.resultado.importadas === 0 && repetida.resultado.duplicadas === 1 && repetida.auditoria === null && repetida.mensagem === "0 nota(s) importada(s), 1 duplicada(s) ignorada(s).", repetida);
    const deOutra = valor(await importar("nfe-de-outra-empresa.xml"));
    confere(
      "NF-e entre outras empresas é recusada dizendo os CNPJs",
      deOutra.resultado.importadas === 0 && deOutra.resultado.erros.length === 1 && deOutra.resultado.erros[0].startsWith("nfe-de-outra-empresa.xml: CNPJ da empresa não consta como emitente nem destinatário: a empresa selecionada é " + CNPJ),
      deOutra.resultado,
    );
    const zip = valor(await importar("notas.zip"));
    confere("ZIP: as duas NF-e duplicadas e o XML quebrado como erro", zip.resultado.importadas === 0 && zip.resultado.duplicadas === 2 && zip.resultado.erros.length === 1 && zip.resultado.erros[0].startsWith("lote/quebrado.xml: "), zip.resultado);
    const danfe = await PDFDocument.create();
    danfe.addPage().drawText("DANFE FICTICIO 84099 VALOR 10,00");
    const pdf = valor(await importar("danfe.pdf", new Uint8Array(await danfe.save())));
    confere("PDF sem a leitura por IA ligada: recusado com a frase do leitor", pdf.resultado.importadas === 0 && pdf.resultado.erros.length === 1 && pdf.resultado.erros[0].startsWith("danfe.pdf: "), pdf.resultado);
    const imagem = valor(await importar("danfe.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])));
    confere("imagem sem a leitura por IA ligada: recusada com a frase do leitor", imagem.resultado.importadas === 0 && imagem.resultado.erros[0]?.startsWith("danfe.jpg: "), imagem.resultado);

    // ─── Cadastro à mão ───────────────────────────────────────────────────
    const manual = { tipo: "nfse", numero: "77", cnpjEmitente: "99999999000191", valor: "120.5", dataEmissao: "2026-01-09T00:00:00.000Z", observacao: "Cadastrada à mão" };
    const criada = await criarNota(tenantId, user.id, empresaId, manual);
    confere("cadastro à mão: CNPJ formatado e auditoria", criada.ok && criada.valor.nota.cnpjEmitente === "99.999.999/0001-91" && criada.valor.nota.valor === "120.50" && criada.valor.auditoria.acao === "contabil.core.nota.criada", criada);
    const repetidaManual = await criarNota(tenantId, user.id, empresaId, manual);
    confere("a mesma NFS-e à mão de novo é recusada", !repetidaManual.ok && repetidaManual.codigo === "CONFLITO" && repetidaManual.erro === "Esta nota fiscal já foi cadastrada nesta empresa.", repetidaManual);
    const invalida = await criarNota(tenantId, user.id, empresaId, { ...manual, numero: "78", chaveAcesso: "123" });
    confere("chave de acesso curta é recusada com a frase do original", !invalida.ok && invalida.erro === "Chave de acesso deve ter 44 dígitos.", invalida);

    // ─── Lista ────────────────────────────────────────────────────────────
    const lista = (f: Parameters<typeof listarNotas>[2], pagina = 1, porPagina = 50) => listarNotas(tenantId, empresaId, f, pagina, porPagina).then(valor);
    const todas = await lista({});
    // 84086 e 84087 têm a mesma emissão: entre elas a ordem é a do id (sorteado), então só o conjunto é fixo.
    const numeros = todas.itens.map((n) => n.numero);
    confere("a lista tem as 4 notas, da emissão mais recente para a mais antiga", todas.total === 4 && numeros.slice(0, 2).join() === "77,2026" && [...numeros.slice(2)].sort().join() === "84086,84087", todas.itens.map((n) => [n.numero, n.dataEmissao]));
    confere("filtro por tipo", (await lista({ tipo: "nfe" })).total === 2);
    confere("filtro por CNPJ completo (emitente ou destinatário) e parcial", (await lista({ cnpj: "99999999000191" })).total === 3 && (await lista({ cnpj: "11.111" })).total === 1);
    confere("filtro por emitente sem diferenciar maiúscula", (await lista({ emitente: "fornecedora ficticia" })).total === 2);
    confere("filtro por trecho da chave", (await lista({ chaveAcesso: ESPERADO.arquivos["nfe-assinada.xml"].chave_acesso!.slice(34, 44) })).total === 1);
    confere("filtro por período de emissão", (await lista({ dataDe: new Date("2026-01-07T00:00:00Z"), dataAte: new Date("2026-01-08T00:00:00Z") })).total === 1);
    const pagina2 = await lista({}, 2, 3);
    confere("paginação: a 2ª página de 3 traz a última da lista", pagina2.total === 4 && pagina2.itens.length === 1 && pagina2.itens[0].id === todas.itens[3].id, pagina2.itens.map((n) => n.numero));

    // ─── Isolamento ───────────────────────────────────────────────────────
    const deOutroTenant = await obterNota("tenant-que-nao-existe", empresaId, assinada.nota!.id);
    const deOutraEmpresa = await obterNota(tenantId, outraEmpresaId, assinada.nota!.id);
    confere("a nota não é lida por outro escritório nem pela outra empresa", !deOutroTenant.ok && !deOutraEmpresa.ok && deOutraEmpresa.erro === "Nota fiscal não encontrada.", { deOutroTenant, deOutraEmpresa });
    const listaOutra = valor(await listarNotas(tenantId, outraEmpresaId, {}, 1, 50));
    confere("a outra empresa não vê as notas", listaOutra.total === 0);
    const importarOutroTenant = await importar("nfe-assinada.xml", arquivo("nfe-assinada.xml"), empresaId, "tenant-que-nao-existe");
    confere("importar pela empresa de outro escritório é recusado", !importarOutroTenant.ok && importarOutroTenant.codigo === "NAO_ENCONTRADA", importarOutroTenant);
    const outraImp = valor(await importarExtrato(tenantId, user.id, outraEmpresaId, valor(await salvarAgencia(tenantId, outraEmpresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "1111", numero: "22222" }))).id, "o.ofx", new TextEncoder().encode(OFX.replace("4321", "1111").replace("55555-1", "22222")), true));
    const transacaoDeOutra = await prisma.coreTransacao.findFirstOrThrow({ where: { empresaId: outraEmpresaId, importacaoId: outraImp.importacaoId }, select: { id: true } });
    const comOutra = await associarNota(tenantId, empresaId, assinada.nota!.id, transacaoDeOutra.id);
    confere("associar a transação de outra empresa é recusado", !comOutra.ok && comOutra.codigo === "NAO_ENCONTRADA" && comOutra.erro === "Transação não encontrada nesta empresa.", comOutra);

    // ─── Associar, desassociar e cancelar ─────────────────────────────────
    const pendentes = valor(await transacoesParaAssociar(tenantId, empresaId, "84086"));
    confere("as pendentes para associar, com a busca pelo histórico", pendentes.length === 1 && pendentes[0].id === t800.id && pendentes[0].valor === "800.00", pendentes);
    const associada = await associarNota(tenantId, empresaId, assinada.nota!.id, t800.id);
    confere("associada, com o resumo da transação e a auditoria", associada.ok && associada.valor.nota.status === "associada" && associada.valor.nota.transacao?.historico === t800.historico && associada.valor.nota.transacao.valor === "800.00" && associada.valor.auditoria.acao === "contabil.core.nota.associada", associada);
    const deNovo = await associarNota(tenantId, empresaId, assinada.nota!.id, t1500.id);
    confere("associar a nota já associada é recusado", !deNovo.ok && deNovo.codigo === "CONFLITO" && deNovo.erro === "Esta nota já está associada a uma transação. Desassocie primeiro.", deNovo);
    const desassociada = await desassociarNota(tenantId, empresaId, assinada.nota!.id);
    confere("desassociada volta para pendente", desassociada.ok && desassociada.valor.nota.status === "pendente" && desassociada.valor.nota.transacaoId === null && desassociada.valor.auditoria.dados.transacao_id === t800.id, desassociada);
    const desassociarDeNovo = await desassociarNota(tenantId, empresaId, assinada.nota!.id);
    confere("desassociar a pendente é recusado", !desassociarDeNovo.ok && desassociarDeNovo.codigo === "INVALIDA" && desassociarDeNovo.erro === "Nota não está associada a nenhuma transação.", desassociarDeNovo);
    const cancelada = await cancelarNota(tenantId, empresaId, nfse.nota!.id);
    confere("cancelada, com auditoria", cancelada.ok && cancelada.valor.nota.status === "cancelada" && cancelada.valor.auditoria.acao === "contabil.core.nota.cancelada", cancelada);
    const associarCancelada = await associarNota(tenantId, empresaId, nfse.nota!.id, t800.id);
    confere("associar a cancelada é recusado", !associarCancelada.ok && associarCancelada.codigo === "INVALIDA" && associarCancelada.erro === "Nota cancelada não pode ser associada.", associarCancelada);
    const associadaAntesDeCancelar = valor(await associarNota(tenantId, empresaId, alterada.nota!.id, t1500.id));
    const canceladaAssociada = valor(await cancelarNota(tenantId, empresaId, alterada.nota!.id));
    confere("cancelar solta a transação (como o serviço do original)", associadaAntesDeCancelar.nota.status === "associada" && canceladaAssociada.nota.status === "cancelada" && canceladaAssociada.nota.transacaoId === null, canceladaAssociada.nota);
    const naoExiste = await cancelarNota(tenantId, empresaId, "00000000-0000-4000-8000-000000000000");
    confere("nota inexistente", !naoExiste.ok && naoExiste.codigo === "NAO_ENCONTRADA");

    // ─── A classificação desfeita desvincula ──────────────────────────────
    valor(await associarNota(tenantId, empresaId, assinada.nota!.id, t800.id));
    const manualNota = criada.ok ? criada.valor.nota : null;
    valor(await associarNota(tenantId, empresaId, manualNota!.id, t1500.id));
    valor(await classificarManual(tenantId, empresaId, classificacaoManualSchema.parse({ transacaoIds: [t800.id], contaId: despesa.id, descricao: "Pagamento de fornecedor" })));
    valor(await cancelarClassificacao(tenantId, user.id, empresaId, t800.id, "Conta errada"));
    const depoisDoCancelamento = valor(await obterNota(tenantId, empresaId, assinada.nota!.id));
    confere("desfazer a classificação desvincula a nota (pendente, sem transação)", depoisDoCancelamento.status === "pendente" && depoisDoCancelamento.transacaoId === null, depoisDoCancelamento);

    // ─── A importação desfeita ────────────────────────────────────────────
    valor(await associarNota(tenantId, empresaId, assinada.nota!.id, t800.id));
    valor(await classificarManual(tenantId, empresaId, classificacaoManualSchema.parse({ transacaoIds: [t800.id], contaId: despesa.id, descricao: "Pagamento de fornecedor" })));
    const desfeita = valor(await desfazerImportacao(tenantId, user.id, empresaId, imp.importacaoId, "Arquivo errado"));
    confere("importação desfeita (1 lançamento cancelado)", desfeita.transacoes === 3 && desfeita.lancamentos === 1, desfeita);
    const daClassificada = valor(await obterNota(tenantId, empresaId, assinada.nota!.id));
    confere("a nota da transação classificada é desvinculada", daClassificada.status === "pendente" && daClassificada.transacaoId === null, daClassificada);
    const daPendente = valor(await obterNota(tenantId, empresaId, manualNota!.id));
    confere(
      "a nota da transação sem lançamento fica ligada à transação que saiu (como no original), e a tela sabe",
      daPendente.status === "associada" && daPendente.transacaoId === t1500.id && daPendente.transacao?.desfeita === true,
      daPendente,
    );
    const desligar = await desassociarNota(tenantId, empresaId, manualNota!.id);
    confere("dá para desassociar essa nota", desligar.ok && desligar.valor.nota.status === "pendente", desligar);
    const comDesfeita = await associarNota(tenantId, empresaId, manualNota!.id, t1500.id);
    confere("associar a uma transação desfeita é recusado", !comDesfeita.ok && comDesfeita.codigo === "NAO_ENCONTRADA", comDesfeita);
    const reimportado = valor(await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan.ofx", new TextEncoder().encode(OFX), false));
    confere("o mesmo extrato volta a entrar (a nota não trava a transação)", reimportado.importadas === 3, reimportado);

    // ─── Checagens do MySQL ───────────────────────────────────────────────
    const base = { tenantId, empresaId, numero: "x", cnpjEmitente: "x", valor: "1.00", dataEmissao: new Date(), dedupKey: "f".repeat(64) };
    for (const [coluna, valorRuim] of [["tipo", "nfs"], ["status", "perdida"], ["origem", "manual"]] as const) {
      const r = await prisma.coreNotaFiscal.create({ data: { tipo: "nfe", ...base, [coluna]: valorRuim } }).then(() => null, (e: unknown) => e);
      confere(`o CHECK recusa ${coluna} = ${valorRuim}`, r !== null && String((r as Error).message).includes("ck_core_nota"), String((r as Error | null)?.message).slice(0, 200));
    }
    const dup = await prisma.coreNotaFiscal
      .create({ data: { ...base, tipo: "nfe", dedupKey: linha.dedupKey } })
      .then(() => null, (e: unknown) => e as { code?: string });
    confere("a identidade é única na empresa (P2002)", dup?.code === "P2002", dup);
    const outraComMesma = await prisma.coreNotaFiscal.create({ data: { ...base, tipo: "nfe", empresaId: outraEmpresaId, dedupKey: linha.dedupKey, chaveAcesso: linha.chaveAcesso } });
    confere("a mesma nota em outra empresa entra (a unicidade é por empresa)", !!outraComMesma.id);
  } finally {
    const contar = () => prisma.coreNotaFiscal.count({ where: { empresaId: { in: empresasDoCore } } });
    const antes = await contar();
    const mexido = await prisma.$transaction(
      async (tx) => {
        const m = await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id });
        await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: outraCompany.id });
        return m;
      },
      { timeout: 60_000 },
    );
    confere("a exclusão da empresa apaga as notas antes das transações, sem esbarrar em chave", antes > 0 && (mexido.CoreNotaFiscal ?? 0) >= 4 && (mexido.CoreEmpresa ?? 0) === 1, { mexido, antes });
    confere("nada das notas ficou para trás", (await contar()) === 0);
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
