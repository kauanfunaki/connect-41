// Formatação de tamanho de arquivo para a interface de upload.

const UNIDADES = ["B", "KB", "MB", "GB"] as const;

/**
 * "54 KB", "1,2 MB". Vírgula decimal porque a interface é em português.
 *
 * Usa base 1024 (o que o sistema operacional mostra ao olhar o arquivo), não
 * 1000 — divergir do que o usuário vê no Explorer gera dúvida boba do tipo
 * "por que aqui diz 19 MB e lá 20 MB?".
 */
export function formatarBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";

  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < UNIDADES.length - 1) {
    valor /= 1024;
    i++;
  }

  // Byte não tem casa decimal; o resto tem uma, e só quando acrescenta.
  const casas = i === 0 ? 0 : valor < 10 ? 1 : 0;
  return `${valor.toFixed(casas).replace(".", ",")} ${UNIDADES[i]}`;
}

/**
 * Extensão em maiúsculas, sem o ponto. Vazio quando o nome não tem extensão —
 * a tela usa isso para decidir entre o selo de tipo e o ícone genérico.
 */
export function extensaoDe(nomeArquivo: string): string {
  const partes = nomeArquivo.split(".");
  return partes.length > 1 ? (partes.pop() ?? "").toUpperCase() : "";
}

/**
 * Diz se o arquivo passa no `accept` do campo, comparando por extensão.
 *
 * Compara extensão em vez de MIME de propósito: o navegador reporta MIME
 * inconsistente para os formatos que este app aceita (`.csv` vira
 * `application/vnd.ms-excel` no Windows com Excel instalado), e a mensagem de
 * erro ficaria incompreensível para quem escolheu um arquivo válido.
 */
export function aceitaArquivo(nomeArquivo: string, accept: string): boolean {
  const permitidas = accept
    .split(",")
    .map((a) => a.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
  if (permitidas.length === 0) return true;
  const ext = extensaoDe(nomeArquivo).toLowerCase();
  return permitidas.includes(ext);
}
