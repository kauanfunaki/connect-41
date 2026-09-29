// Documento recebido pelo WhatsApp — as regras puras.
//
// ─── O que o Connect faz com um arquivo ─────────────────────────────────────
//
// Só currículo em PDF é tratado. Ele entra pelo mesmo lugar do portal de
// carreiras (`storage/resumes`, `Candidatura.resumeUrl`), então aparece no funil
// da vaga e serve ao "Extrair dados" — e, quando existir, à triagem do R1. Os
// limites são os do portal (PDF, 5 MB) de propósito: um currículo não pode valer
// mais por ter chegado por outro canal.
//
// Tudo o que não é isso — foto, áudio, planilha, PDF grande — continua indo para
// uma pessoa, como antes: responder a um arquivo que o robô não leu é pior que
// não responder.
//
// A extração por IA **não** roda sozinha, pelo mesmo motivo do portal: é gasto
// por arquivo, e hoje quem decide ler um currículo é o recrutador.

import { MAX_BYTES_DO_CURRICULO } from "@/lib/curriculo";

// O limite e a conferência de PDF são os mesmos do portal de carreiras, e moram
// em `src/lib/curriculo.ts`. Reexportados aqui para o atendimento continuar
// importando de um lugar só.
export { MAX_BYTES_DO_CURRICULO, ehPdf } from "@/lib/curriculo";

export type ClasseDoDocumento = "curriculo_pdf" | "grande_demais" | "nao_pdf";

/**
 * Decide, **antes de baixar**, o que fazer com o documento. O tamanho declarado
 * evita baixar um arquivo de 80 MB para descobrir que ele não cabe.
 */
export function classificarDocumento(d: {
  mimetype: string | null;
  nomeDoArquivo: string | null;
  tamanhoBytes: number | null;
}): ClasseDoDocumento {
  const pdf =
    d.mimetype?.toLowerCase() === "application/pdf" || (!d.mimetype && /\.pdf$/i.test(d.nomeDoArquivo ?? ""));
  if (!pdf) return "nao_pdf";
  if (d.tamanhoBytes !== null && d.tamanhoBytes > MAX_BYTES_DO_CURRICULO) return "grande_demais";
  return "curriculo_pdf";
}


/** Nome para exibir e para o download: sem caminho, sem caractere de controle, com teto. */
export function nomeDoArquivoParaTela(nome: string | null): string {
  const limpo = (nome ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .trim()
    .slice(0, 180);
  return limpo || "curriculo.pdf";
}

export function mensagemDeCurriculoRecebido(vaga: string): string {
  return `Recebi seu currículo e já juntei à sua inscrição para a vaga ${vaga}. Obrigado! 📄`;
}

/**
 * Sem vínculo não dá para saber de quem é o currículo. A mensagem promete uma
 * pessoa — e a conversa **é** transferida junto, para a promessa ser verdade.
 */
export const CURRICULO_SEM_VINCULO =
  "Recebi seu currículo! 📄 Vou chamar alguém da equipe pra continuar com você por aqui.";
