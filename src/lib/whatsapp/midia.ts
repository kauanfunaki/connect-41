// Mensagem que não é texto (áudio, imagem, figurinha…), como aparece na
// conversa (02/10/2026).
//
// Até aqui ela sumia: transferia para uma pessoa sem registrar a entrada, e a
// legenda da imagem se perdia — quem abria a conversa não via o que o candidato
// mandou, só o motivo em `handoffReason`. Agora entra na conversa como
// "[imagem] legenda", e o candidato recebe o aviso de que alguém vai continuar.

/** Nome do tipo na Evolution (`imageMessage`) e na Meta (`image`) → rótulo em português. */
const ROTULOS: Record<string, string> = {
  audio: "áudio",
  audioMessage: "áudio",
  ptt: "áudio",
  image: "imagem",
  imageMessage: "imagem",
  video: "vídeo",
  videoMessage: "vídeo",
  ptvMessage: "vídeo",
  sticker: "figurinha",
  stickerMessage: "figurinha",
  location: "localização",
  locationMessage: "localização",
  liveLocationMessage: "localização",
  contacts: "contato",
  contactMessage: "contato",
  contactsArrayMessage: "contato",
  document: "arquivo",
  documentMessage: "arquivo",
  documentWithCaptionMessage: "arquivo",
  "texto vazio": "mensagem vazia",
};

export function rotuloDaMidia(tipo: string): string {
  return ROTULOS[tipo] ?? tipo;
}

/** O corpo gravado na conversa: "[imagem] legenda", ou só "[áudio]". */
export function textoDaMidia(tipo: string, legenda?: string | null): string {
  const l = legenda?.trim();
  return l ? `[${rotuloDaMidia(tipo)}] ${l}` : `[${rotuloDaMidia(tipo)}]`;
}

/**
 * Dá para responder a quem mandou? Não quando o WhatsApp escondeu o número
 * (`@lid`, não há para onde mandar) nem quando a "mensagem" veio vazia — um
 * aviso de transferência em resposta a nada seria esquisito.
 */
export function respondeAMidia(tipo: string): boolean {
  return !tipo.includes("@lid") && tipo !== "texto vazio";
}
