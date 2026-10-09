// Gravação e leitura dos anexos em disco — das pendências e da conversa livre
// com o cliente.
//
// Fora de `public/`, como os currículos e os documentos para cliente: o arquivo
// só sai pelas rotas autenticadas (a interna e a do portal), cada uma conferindo
// o próprio escopo antes de ler o disco.
//
// A pasta é parâmetro (`criarArmazenamento`) porque a conversa livre guarda em
// outro lugar, com as mesmas regras de entrada: as duas conferem o tipo pelos
// bytes, gravam com nome sorteado e nunca aceitam caminho de quem pediu. Uma
// segunda cópia deste arquivo é como uma das duas perde uma checagem.

import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { MAXIMO_DE_ANEXOS, validarAnexo } from "./anexo";

export type AnexoGravado = { fileName: string; fileUrl: string; mimeType: string; sizeBytes: number };

/** Os arquivos de um campo múltiplo, sem as entradas vazias que o navegador manda quando nada foi escolhido. */
export function arquivosDoFormulario(formData: FormData, campo: string): File[] {
  return formData.getAll(campo).filter((v): v is File => v instanceof File && v.size > 0);
}

export type Armazenamento = {
  gravarAnexos: (
    tenantId: string,
    arquivos: File[]
  ) => Promise<{ ok: true; anexos: AnexoGravado[] } | { ok: false; erro: string }>;
  apagarAnexosGravados: (anexos: AnexoGravado[]) => Promise<void>;
  /** Apaga do disco de vez, pelo `fileUrl` gravado. Best-effort: arquivo que já não existe não é erro. */
  apagarArquivos: (fileUrls: string[]) => Promise<void>;
  lerAnexo: (fileUrl: string) => Promise<Buffer | null>;
};

/** Quem confere cada arquivo antes de gravar: tamanho, tipo pelos bytes e nome saneado. */
export type ValidadorDeArquivo = (
  nome: string,
  bytes: Uint8Array
) => { ok: true; nome: string; tipo: { mime: string; ext: string } } | { ok: false; erro: string };

export type OpcoesDoArmazenamento = {
  /** Padrão: `validarAnexo` (PDF, imagem e XML). O Drive passa o dele, com Word, Excel e texto. */
  validar?: ValidadorDeArquivo;
  /** Padrão: `MAXIMO_DE_ANEXOS`. */
  maximoPorEnvio?: number;
};

/** O armazenamento de uma pasta sob `storage/`. */
export function criarArmazenamento(pasta: string, opcoes: OpcoesDoArmazenamento = {}): Armazenamento {
  const raiz = path.join(process.cwd(), "storage", pasta);
  const validar = opcoes.validar ?? validarAnexo;
  const maximo = opcoes.maximoPorEnvio ?? MAXIMO_DE_ANEXOS;

  /**
   * Caminho em disco. `fileUrl` é sempre "<tenantId>/<uuid>.<ext>", gravado por
   * `gravarAnexos` e nunca vindo de quem pede; mesmo assim a checagem de prefixo
   * fica, para um valor adulterado no banco não virar leitura fora da pasta.
   */
  function caminhoDoAnexo(fileUrl: string): string {
    const alvo = path.resolve(raiz, fileUrl);
    if (!alvo.startsWith(path.resolve(raiz) + path.sep)) throw new Error("Caminho de anexo inválido.");
    return alvo;
  }

  return {
    /**
     * Confere **todos** os arquivos antes de gravar o primeiro: um lote com um
     * arquivo recusado não deixa os outros órfãos no disco.
     */
    async gravarAnexos(tenantId, arquivos) {
      if (arquivos.length > maximo) {
        return { ok: false, erro: maximo === 1 ? "Um arquivo por vez." : `No máximo ${maximo} anexos por mensagem.` };
      }

      const conferidos: { bytes: Uint8Array; nome: string; mime: string; ext: string }[] = [];
      for (const arquivo of arquivos) {
        const bytes = new Uint8Array(await arquivo.arrayBuffer());
        const v = validar(arquivo.name, bytes);
        if (!v.ok) return { ok: false, erro: v.erro };
        conferidos.push({ bytes, nome: v.nome, mime: v.tipo.mime, ext: v.tipo.ext });
      }

      const dir = path.join(raiz, tenantId);
      if (conferidos.length > 0) await mkdir(dir, { recursive: true });
      const anexos: AnexoGravado[] = [];
      for (const c of conferidos) {
        const guardado = `${randomUUID()}.${c.ext}`;
        await writeFile(path.join(dir, guardado), c.bytes);
        anexos.push({ fileName: c.nome, fileUrl: `${tenantId}/${guardado}`, mimeType: c.mime, sizeBytes: c.bytes.length });
      }
      return { ok: true, anexos };
    },

    /** Desfaz a gravação quando a transação do banco não vingou. Best-effort. */
    async apagarAnexosGravados(anexos) {
      await Promise.all(anexos.map((a) => unlink(caminhoDoAnexo(a.fileUrl)).catch(() => undefined)));
    },

    async apagarArquivos(fileUrls) {
      await Promise.all(fileUrls.map((u) => unlink(caminhoDoAnexo(u)).catch(() => undefined)));
    },

    async lerAnexo(fileUrl) {
      try {
        return await readFile(caminhoDoAnexo(fileUrl));
      } catch {
        return null;
      }
    },
  };
}

// As pendências — o primeiro dono desta pasta, e o nome que já está gravado em
// `ClientRequestAttachment.fileUrl`.
const daPendencia = criarArmazenamento("client-requests");

export const gravarAnexos = daPendencia.gravarAnexos;
export const apagarAnexosGravados = daPendencia.apagarAnexosGravados;
export const lerAnexo = daPendencia.lerAnexo;

/** A resposta de download, igual em todas as rotas. Sempre anexo e sem sniffing: o tipo é o conferido na entrada. */
export function respostaDoAnexo(conteudo: Buffer, anexo: { fileName: string; mimeType: string }): Response {
  return new Response(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": anexo.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(anexo.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
