import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import ExcelJS from "exceljs";
import type { AuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { lerCsv, lerDocumentoXml, lerDocumentosTxt, lerLinhasApoio } from "./importacao";
import { ErroFiscal, escreverNaRaiz, gravarDocumento, json } from "./servidor";

const LIMITE = 25 * 1024 * 1024, EXPANDIDO = 128 * 1024 * 1024;
const raizDoDisco = () => path.resolve(process.cwd(), "storage", "sped-fiscal");
export function caminhoPrivado(nome: string) {
  const raiz = raizDoDisco(), alvo = path.resolve(raiz, nome);
  if (!alvo.startsWith(raiz + path.sep)) throw new ErroFiscal("Caminho de arquivo inválido.");
  return alvo;
}
export async function enfileirarArquivo(ctx: AuthContext, empresa: { id: string }, arquivo: File) {
  if (arquivo.size < 1 || arquivo.size > LIMITE) throw new ErroFiscal("Cada arquivo deve ter até 25 MiB.");
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const ext = path.extname(arquivo.name).toLowerCase();
  const entradas: { nome: string; bytes: Uint8Array }[] = [];
  if (ext === ".zip") {
    let tamanho = 0, quantidade = 0;
    const extraidos = unzipSync(bytes, { filter: f => {
      if (f.name.endsWith("/")) return false;
      quantidade++; tamanho += f.originalSize;
      if (quantidade > 2000 || tamanho > EXPANDIDO || f.originalSize > LIMITE) throw new ErroFiscal("ZIP excede 2000 arquivos, 25 MiB por arquivo ou 128 MiB descompactados.");
      if (!/\.(xml|txt|csv|xlsx|pdf)$/i.test(f.name)) throw new ErroFiscal("O ZIP deve conter apenas XML, TXT, CSV, XLSX e PDF.");
      return true;
    } });
    for (const [nome, conteudo] of Object.entries(extraidos)) entradas.push({ nome: path.basename(nome.replace(/\\/g, "/")), bytes: conteudo });
  } else entradas.push({ nome: path.basename(arquivo.name), bytes });
  if (!entradas.length) throw new ErroFiscal("Arquivo ZIP vazio.");
  const ids: string[] = [];
  for (const entrada of entradas) {
    if (!/\.(xml|txt|csv|xlsx|pdf)$/i.test(entrada.nome)) throw new ErroFiscal("Formato não suportado.");
    const sha256 = createHash("sha256").update(entrada.bytes).digest("hex");
    const anterior = await getPrisma().spedFiscalImport.findUnique({ where: { tenantId_companyId_sha256: { tenantId: ctx.tenantId, companyId: empresa.id, sha256 } } });
    if (anterior) { ids.push(anterior.id); continue; }
    if (/\.pdf$/i.test(entrada.nome) && Buffer.from(entrada.bytes.subarray(0, 5)).toString() !== "%PDF-") throw new ErroFiscal("PDF com assinatura inválida.");
    const id = randomUUID(), relativa = `${ctx.tenantId}/${id}${path.extname(entrada.nome).toLowerCase()}`;
    const alvo = caminhoPrivado(relativa);
    await mkdir(path.dirname(alvo), { recursive: true });
    await writeFile(alvo, entrada.bytes, { flag: "wx" });
    const registro = await getPrisma().spedFiscalImport.upsert({ where: { tenantId_companyId_sha256: { tenantId: ctx.tenantId, companyId: empresa.id, sha256 } }, create: { id, tenantId: ctx.tenantId, companyId: empresa.id, sha256, name: entrada.nome.slice(0, 255), path: relativa, results: [], createdBy: ctx.userId, state: /\.pdf$/i.test(entrada.nome) ? "anexo" : "pendente" }, update: {} });
    ids.push(registro.id);
  }
  return ids;
}
export async function processarImportacao(ctx: AuthContext, empresa: { id: string; cnpj: string }, id: string) {
  const db = getPrisma(), owner = randomUUID(), agora = new Date();
  const job = await db.spedFiscalImport.findFirst({ where: { id, tenantId: ctx.tenantId, companyId: empresa.id } });
  if (!job) throw new ErroFiscal("Importação não encontrada.", 404);
  if (["concluido", "cancelado", "anexo"].includes(job.state)) return { estado: job.state };
  const adquirido = await db.spedFiscalImport.updateMany({ where: { id, tenantId: ctx.tenantId, state: { in: ["pendente", "processando", "erro"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: agora } }] }, data: { state: "processando", leaseOwner: owner, leaseUntil: new Date(Date.now() + 90000) } });
  if (!adquirido.count) return { estado: "processando" };
  try {
    const bytes = await readFile(caminhoPrivado(job.path));
    const ext = path.extname(job.name).toLowerCase();
    const texto = () => new TextDecoder(ext === ".txt" && !bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])) ? "windows-1252" : "utf-8").decode(bytes).replace(/^\uFEFF/, "");
    const documentos = ext === ".xml" ? [lerDocumentoXml(texto())] : ext === ".txt" ? lerDocumentosTxt(texto(), empresa.cnpj) : [];
    let apoios: ReturnType<typeof lerLinhasApoio> = [];
    if (ext === ".csv") apoios = lerLinhasApoio(lerCsv(texto()));
    if (ext === ".xlsx") {
      let expandido = 0;
      unzipSync(bytes, { filter: f => { expandido += f.originalSize; if (expandido > EXPANDIDO) throw new ErroFiscal("Planilha excede o limite descompactado de 128 MiB."); return false; } });
      const livro = new ExcelJS.Workbook(); await livro.xlsx.load(bytes as unknown as Parameters<typeof livro.xlsx.load>[0]);
      const linhas: string[][] = [];
      livro.worksheets[0]?.eachRow(r => linhas.push(Array.from({ length: 8 }, (_, i) => {
        const cell = r.getCell(i + 1); if (cell.type === ExcelJS.ValueType.Formula) throw new ErroFiscal("A planilha de importação não pode conter fórmulas.");
        return cell.text;
      })));
      apoios = lerLinhasApoio(linhas);
    }
    const total = documentos.length || apoios.length;
    if (!total) throw new ErroFiscal("Arquivo sem registros importáveis.");
    const resultados: unknown[] = Array.isArray(job.results) ? [...job.results] : [];
    const fim = Math.min(job.cursor + 50, total);
    await escreverNaRaiz(ctx, empresa.cnpj.slice(0, 8), null, async tx => {
      const lease = await tx.spedFiscalImport.findFirst({ where: { id, tenantId: ctx.tenantId, leaseOwner: owner, state: "processando", leaseUntil: { gt: new Date() } } });
      if (!lease) throw new ErroFiscal("Importação pausada ou assumida por outro executor.", 409);
      for (let i = job.cursor; i < fim; i++) {
        if (documentos.length) {
          const d = documentos[i];
          // Hash por documento do TXT; um arquivo pode conter milhares de documentos.
          const hash = ext === ".xml" ? job.sha256 : createHash("sha256").update(JSON.stringify(d)).digest("hex");
          try { resultados.push(json({ registro: d.numero, estado: await gravarDocumento(tx, ctx, d, hash, job.name, job.path, empresa.id) })); }
          catch (e) { if (!(e instanceof ErroFiscal)) throw e; resultados.push(json({ registro: d.numero, estado: "recusado", motivo: e.message })); }
        } else {
          const a = apoios[i];
          const existente = await tx.spedFiscalSupport.findUnique({ where: { tenantId_companyId_identity: { tenantId: ctx.tenantId, companyId: empresa.id, identity: a.identidade } } });
          if (!existente) await tx.spedFiscalSupport.create({ data: { tenantId: ctx.tenantId, companyId: empresa.id, identity: a.identidade, competence: a.competencia, data: json(a), updatedBy: ctx.userId } });
          resultados.push(json({ registro: a.identidade, estado: existente ? "duplicado" : "importado" }));
        }
      }
      const gravado = await tx.spedFiscalImport.updateMany({ where: { id, tenantId: ctx.tenantId, leaseOwner: owner, state: "processando", leaseUntil: { gt: new Date() } }, data: { cursor: fim, total, results: json(resultados), state: fim === total ? "concluido" : "pendente", leaseOwner: null, leaseUntil: null } });
      if (!gravado.count) throw new ErroFiscal("A importação foi cancelada ou assumida por outro executor. O lote atual não foi gravado.", 409);
    });
    return { estado: fim === total ? "concluido" : "pendente", cursor: fim, total };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Falha na leitura do arquivo.";
    await db.spedFiscalImport.updateMany({ where: { id, tenantId: ctx.tenantId, leaseOwner: owner, state: "processando" }, data: { state: "erro", results: json([...(Array.isArray(job.results) ? job.results : []), { estado: "erro", motivo: mensagem }]), leaseOwner: null, leaseUntil: null } });
    throw new ErroFiscal(mensagem);
  }
}

