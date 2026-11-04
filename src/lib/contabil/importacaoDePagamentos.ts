// O envio dos documentos dos pagamentos sem nota (03/11/2026): o PDF ou a
// planilha do BPO entra pela etapa, fica guardado no Connect e é lido aqui —
// a mesma importação do motor (`importacao_apoio.py`), sem a pasta de rede e
// sem OCR. Página sem texto vira uma linha para conferir: quem enviou
// preenche os valores à mão em Documentos lidos.
//
// - Todo arquivo vira pelo menos uma linha, inclusive o que não deu para ler:
//   arquivo descartado em silêncio é igual a documento que ninguém enviou.
// - O mesmo conteúdo não entra duas vezes (sha256 por empresa).
// - A planilha do BPO enviada de novo com o mesmo nome substitui a anterior,
//   só quando quem envia pede: a identidade das faturas é a posição na planilha.

import "server-only";
import { createHash } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { criarArmazenamento, type ValidadorDeArquivo } from "@/lib/financeiro/pendencias/armazenamento";
import { sanearNomeDoArquivo, tipoPelosBytes } from "@/lib/financeiro/pendencias/anexo";
import { chaveDoNome } from "./lancamentos";
import { lerDocumento, type RegistroLido } from "./leituraDoPdf";
import { indexarNomes, lerPlanilhaDoBpo, numerosDaNota, PlanilhaInvalida } from "./planilhaDoBpo";
import { paginasDoPdf } from "./textoDoPdf";
import { TIPOS_DE_ENVIO, type TipoDeEnvio } from "./envioDePagamentos";

export { TIPOS_DE_ENVIO, type TipoDeEnvio };
import type { EmpresaDoContabil } from "./servidor";

export const TAMANHO_MAXIMO_DO_DOCUMENTO = 25 * 1024 * 1024;


const XLSX = { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" } as const;

const validar: ValidadorDeArquivo = (nome, bytes) => {
  const rotulo = nome.split(/[\\/]/).pop()?.trim().slice(0, 120) || "arquivo";
  if (!bytes.length) return { ok: false, erro: `${rotulo}: arquivo vazio.` };
  if (bytes.length > TAMANHO_MAXIMO_DO_DOCUMENTO) return { ok: false, erro: `${rotulo}: acima do limite de 25 MB. Divida o PDF em partes.` };
  if (tipoPelosBytes(bytes)?.ext === "pdf") return { ok: true, nome: sanearNomeDoArquivo(nome, "pdf"), tipo: { mime: "application/pdf", ext: "pdf" } };
  // O .xlsx é um ZIP: a assinatura e a extensão juntas.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && /\.xlsx$/i.test(nome)) return { ok: true, nome: sanearNomeDoArquivo(nome, "xlsx"), tipo: XLSX };
  return { ok: false, erro: `${rotulo}: envie PDF (documentos) ou .xlsx (planilha do BPO).` };
};
export const armazenamentoDosPagamentos = criarArmazenamento("contabil-pagamentos", { validar, maximoPorEnvio: 1 });

export type ResultadoDoEnvio =
  | { ok: true; arquivoId: string; nome: string; linhas: number; lidas: number; conferir: number; semTexto: number; paginas: number; ligadas: number; mensagem: string }
  | { ok: false; erro: string; existentes?: number };

type LinhaNova = Omit<RegistroLido, "brutoCentavos" | "liquidoCentavos" | "retencoes"> & {
  bruto: string | null; liquido: string | null; retencoes: RegistroLido["retencoes"]; centroCusto?: string; comprovanteId?: string | null;
};
const reais = (c: number | null) => (c === null ? null : (c / 100).toFixed(2));

/** Guarda e lê um arquivo. `substituir` só vale para a planilha do BPO que já foi enviada com o mesmo nome. */
export async function importarDocumento(input: {
  tenantId: string; userId: string; empresa: EmpresaDoContabil; arquivo: File; envio: TipoDeEnvio; pasta: string; substituir: boolean;
}): Promise<ResultadoDoEnvio> {
  const { tenantId, empresa, envio } = input;
  const definicao = TIPOS_DE_ENVIO[envio];
  const prisma = getPrisma();
  const bytes = new Uint8Array(await input.arquivo.arrayBuffer());
  const v = validar(input.arquivo.name, bytes);
  if (!v.ok) return v;
  const ehPlanilha = envio === "planilha_bpo";
  if (ehPlanilha !== (v.tipo.ext === "xlsx")) return { ok: false, erro: ehPlanilha ? "A planilha do BPO é um arquivo .xlsx." : "Os documentos de pagamento são PDF." };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const repetido = await prisma.contabilDocumentoPagamento.findUnique({ where: { companyId_sha256: { companyId: empresa.baseId, sha256 } }, select: { nome: true, tipo: true } });
  if (repetido) return { ok: false, erro: `Este arquivo já foi enviado (${repetido.nome}). Para ler de novo, remova o envio anterior.` };

  let anterior: { id: string; fileUrl: string; linhas: number } | null = null;
  if (ehPlanilha) {
    const outra = await prisma.contabilDocumentoPagamento.findFirst({ where: { tenantId, companyId: empresa.baseId, tipo: "planilha_bpo", nome: v.nome }, select: { id: true, fileUrl: true, _count: { select: { pagamentos: true } } } });
    if (outra && !input.substituir) return { ok: false, erro: `Já há ${outra._count.pagamentos} faturas da planilha ${v.nome}. Marque "substituir" para trocar pela nova.`, existentes: outra._count.pagamentos };
    if (outra) anterior = { id: outra.id, fileUrl: outra.fileUrl, linhas: outra._count.pagamentos };
  }

  // Lê antes de gravar: arquivo que nem abre não deixa nada no disco nem no banco.
  let paginas = 0;
  let semTexto = 0;
  let linhas: LinhaNova[] = [];
  let ligadas = 0;
  try {
    if (ehPlanilha) {
      const comprovantes = await prisma.contabilDocumentoPagamento.findMany({ where: { tenantId, companyId: empresa.baseId, tipo: "fatura" }, select: { id: true, nome: true } });
      const porNome = new Map(comprovantes.map((c) => [c.nome, c.id]));
      const lidas = await lerPlanilhaDoBpo(bytes, comprovantes.map((c) => c.nome));
      linhas = lidas.map((l) => ({
        pagina: l.posicao, ordem: 1, tipo: "fatura", competencia: l.competencia, nome: l.nome, documento: "", numero: l.numero,
        dataPagamento: l.dataPagamento, dataServico: "", bruto: reais(l.centavos), liquido: reais(l.centavos), retencoes: null,
        centroCusto: l.centroCusto, categoria: l.categoria, situacao: l.situacao, observacao: l.observacao, chaveNegocio: l.chaveNegocio,
        comprovanteId: l.comprovante ? porNome.get(l.comprovante) ?? null : null,
      }));
      ligadas = linhas.filter((l) => l.comprovanteId).length;
    } else {
      const textos = await paginasDoPdf(bytes);
      paginas = textos.length;
      semTexto = textos.filter((t) => !t.trim()).length;
      if (envio !== "fatura_pdf") {
        linhas = lerDocumento({ tipo: definicao.tipo as RegistroLido["tipo"], arquivo: v.nome, pasta: input.pasta, paginas: textos, raizDoCliente: empresa.cnpj.slice(0, 8), nomesDoCliente: await nomesDoCliente(tenantId, empresa.baseId) })
          .map(({ brutoCentavos, liquidoCentavos, ...r }) => ({ ...r, bruto: reais(brutoCentavos), liquido: reais(liquidoCentavos), categoria: r.categoria || definicao.categoria }));
      }
    }
  } catch (err) {
    if (err instanceof PlanilhaInvalida) return { ok: false, erro: err.message };
    console.error("[contabil/pagamentos] leitura", err);
    return { ok: false, erro: ehPlanilha ? "Não foi possível ler a planilha." : "Não foi possível abrir o PDF: confira se o arquivo não está protegido ou corrompido." };
  }

  const gravado = await armazenamentoDosPagamentos.gravarAnexos(tenantId, [new File([bytes], v.nome, { type: v.tipo.mime })]);
  if (!gravado.ok) return { ok: false, erro: gravado.erro };
  const anexo = gravado.anexos[0];
  let documentoId = "";
  try {
    documentoId = await prisma.$transaction(async (tx) => {
      if (anterior) await tx.contabilDocumentoPagamento.delete({ where: { id: anterior.id } });
      const doc = await tx.contabilDocumentoPagamento.create({
        data: { tenantId, companyId: empresa.baseId, tipo: definicao.tipo, categoria: definicao.categoria, nome: v.nome, pasta: input.pasta.slice(0, 255), fileUrl: anexo.fileUrl, mimeType: anexo.mimeType, sizeBytes: anexo.sizeBytes, sha256, paginas, semTexto, enviadoPorId: input.userId },
      });
      if (linhas.length) {
        await tx.contabilPagamento.createMany({
          data: linhas.map((l) => ({
            tenantId, companyId: empresa.baseId, arquivoId: doc.id, pagina: l.pagina, ordem: l.ordem, tipo: l.tipo, categoria: l.categoria.slice(0, 40),
            competencia: l.competencia, nome: l.nome.slice(0, 200), documento: l.documento.slice(0, 14), numero: l.numero.slice(0, 30),
            dataPagamento: l.dataPagamento, dataServico: l.dataServico, bruto: l.bruto, liquido: l.liquido,
            retencoes: l.retencoes ?? undefined, centroCusto: (l.centroCusto ?? "").slice(0, 20), comprovanteId: l.comprovanteId ?? null,
            situacao: l.situacao, observacao: l.observacao.slice(0, 300), chaveNegocio: l.chaveNegocio,
          })),
        });
      }
      // O PDF da fatura enviado depois da planilha liga às faturas pelo número da nota no nome.
      if (envio === "fatura_pdf") ligadas = await ligarComprovante(tx, tenantId, empresa.baseId, doc.id, v.nome);
      return doc.id;
    });
  } catch (err) {
    await armazenamentoDosPagamentos.apagarAnexosGravados([anexo]);
    throw err;
  }
  if (anterior) await armazenamentoDosPagamentos.apagarArquivos([anterior.fileUrl]);

  const conferir = linhas.filter((l) => l.situacao !== "ok").length;
  const lidas = linhas.length - linhas.filter((l) => l.situacao === "invalido").length;
  const partes = envio === "fatura_pdf"
    ? [`${ligadas} fatura(s) da planilha ligadas a este PDF`]
    : [`${lidas} pagamento(s) lido(s)`, conferir ? `${conferir} para conferir` : "", semTexto ? `${semTexto} página(s) sem texto: preencha à mão em Documentos lidos` : "", ehPlanilha && ligadas ? `${ligadas} com o PDF ligado` : ""];
  return { ok: true, arquivoId: documentoId, nome: v.nome, linhas: linhas.length, lidas, conferir, semTexto, paginas, ligadas, mensagem: `${v.nome}: ${partes.filter(Boolean).join(", ")}.` };
}

/**
 * Os nomes que nunca são o fornecedor no recibo: a primeira palavra da razão
 * social da matriz e das filiais. O motor tinha "BLD" e "BATEL" no código.
 */
async function nomesDoCliente(tenantId: string, baseId: string): Promise<string[]> {
  const empresas = await getPrisma().company.findMany({ where: { tenantId, OR: [{ id: baseId }, { parentCompanyId: baseId }] }, select: { name: true, tradeName: true } });
  const palavras = empresas.flatMap((e) => [e.name, e.tradeName ?? ""]).map((n) => chaveDoNome(n).split(" ")[0] ?? "");
  return [...new Set(palavras.filter((p) => p.length >= 3))];
}

type Tx = Parameters<Parameters<ReturnType<typeof getPrisma>["$transaction"]>[0]>[0];

async function ligarComprovante(tx: Tx, tenantId: string, companyId: string, documentoId: string, nome: string): Promise<number> {
  const numeros = new Set(indexarNomes([nome]).keys());
  if (!numeros.size) return 0;
  const faturas = await tx.contabilPagamento.findMany({ where: { tenantId, companyId, tipo: "fatura", comprovanteId: null, numero: { not: "" } }, select: { id: true, numero: true } });
  const ids = faturas.filter((f) => numerosDaNota(f.numero).some((n) => numeros.has(n))).map((f) => f.id);
  if (!ids.length) return 0;
  return (await tx.contabilPagamento.updateMany({ where: { id: { in: ids } }, data: { comprovanteId: documentoId } })).count;
}
