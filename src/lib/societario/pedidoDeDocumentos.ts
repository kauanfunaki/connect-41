// Regra pura (04/11/2026): a abertura guiada é componente cliente e importa
// daqui — o `avisoAoCliente.ts` puxa e-mail e Prisma, e quebraria o build.

/** O texto do pedido de documentos que a abertura guiada propõe (a pessoa edita antes de mandar). */
export function textoDoPedidoDeDocumentos(tipoNome: string, faltam: string[]): string {
  if (faltam.length === 0) return "";
  return [`Olá! Para dar andamento ao processo de ${tipoNome}, precisamos de:`, "", ...faltam.map((f) => `- ${f}`), "", "Pode enviar por aqui mesmo, anexando os arquivos. Obrigado!"].join("\n");
}
