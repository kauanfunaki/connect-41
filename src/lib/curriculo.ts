// Regras de arquivo de currículo que valem para todo canal de entrada — o
// portal de carreiras e o WhatsApp. Um só lugar, porque até 16/09 o formulário
// do portal anunciava 10 MB e a rota recusava acima de 5: o candidato só
// descobria o limite depois de esperar o envio.

/** Tamanho máximo de um currículo, em bytes. */
export const MAX_BYTES_DO_CURRICULO = 5 * 1024 * 1024;

/** O mesmo limite em MB, para a tela. */
export const MAX_MB_DO_CURRICULO = MAX_BYTES_DO_CURRICULO / (1024 * 1024);

/**
 * O arquivo é mesmo um PDF? Confere a assinatura dos bytes, e não o tipo que o
 * navegador ou o celular declarou — esse é só o que quem mandou disse que era.
 */
export function ehPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
}
