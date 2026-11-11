// A escolha de vários anexos num campo só (polimento do portal, 11/11/2026,
// P24): cada nova escolha soma às de antes, sem repetir o mesmo arquivo, e o
// que não serve fica de fora com o motivo. Puro — o `CampoDeAnexos` usa com
// `File`, e o teste com objetos simples.
//
// A conferência que vale é a do servidor (assinatura dos bytes, tamanho e
// quantidade, `armazenamento.ts`); isto só poupa a viagem e diz cedo o motivo.

import { aceitaArquivo, formatarBytes } from "@/lib/fileSize";

export type ArquivoEscolhido = { name: string; size: number; lastModified: number };

export type RegrasDosAnexos = { accept: string; maxBytes: number; maximo: number };

function mesmoArquivo(a: ArquivoEscolhido, b: ArquivoEscolhido): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/**
 * Soma `novos` aos `atuais`. Volta a lista que fica e uma frase por arquivo
 * recusado ("nota.docx: formato não aceito."). O mesmo arquivo escolhido de
 * novo é ignorado em silêncio — não é erro, só repetição.
 */
export function juntarAnexos<T extends ArquivoEscolhido>(
  atuais: readonly T[],
  novos: readonly T[],
  regras: RegrasDosAnexos
): { arquivos: T[]; recusados: string[] } {
  const arquivos = [...atuais];
  const recusados: string[] = [];
  const limiteEmMb = Math.round(regras.maxBytes / (1024 * 1024));
  for (const f of novos) {
    if (arquivos.some((a) => mesmoArquivo(a, f))) continue;
    if (!aceitaArquivo(f.name, regras.accept)) {
      recusados.push(`${f.name}: formato não aceito.`);
    } else if (f.size > regras.maxBytes) {
      recusados.push(`${f.name}: ${formatarBytes(f.size)}, acima do limite de ${limiteEmMb} MB.`);
    } else if (arquivos.length >= regras.maximo) {
      recusados.push(`${f.name}: ficou de fora, o limite é de ${regras.maximo} arquivos por envio.`);
    } else {
      arquivos.push(f);
    }
  }
  return { arquivos, recusados };
}
