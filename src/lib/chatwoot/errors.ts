// Erros tipados do cliente Chatwoot — permite ao chamador decidir o que fazer
// (ex: 401 sugere token revogado, 429 sugere backoff) sem parsear mensagem.
export class ChatwootError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ChatwootError";
  }
}

export class ChatwootAuthError extends ChatwootError {
  constructor(status: number) {
    super("Token do Chatwoot inválido ou sem permissão para esta conta.", status);
    this.name = "ChatwootAuthError";
  }
}

export class ChatwootNotFoundError extends ChatwootError {
  constructor(status: number) {
    super("Recurso não encontrado no Chatwoot (conta, conversa ou contato).", status);
    this.name = "ChatwootNotFoundError";
  }
}

export class ChatwootValidationError extends ChatwootError {
  constructor(status: number, detail?: string) {
    super(`Requisição rejeitada pelo Chatwoot${detail ? `: ${detail}` : "."}`, status);
    this.name = "ChatwootValidationError";
  }
}

export class ChatwootRateLimitError extends ChatwootError {
  constructor(public readonly retryAfterSeconds: number | null) {
    super("Limite de requisições do Chatwoot atingido.", 429);
    this.name = "ChatwootRateLimitError";
  }
}

export class ChatwootServerError extends ChatwootError {
  constructor(status: number) {
    super("Chatwoot indisponível no momento (erro do servidor).", status);
    this.name = "ChatwootServerError";
  }
}

export class ChatwootConnectionError extends ChatwootError {
  constructor(cause: string) {
    super(`Falha ao conectar ao Chatwoot: ${cause}`);
    this.name = "ChatwootConnectionError";
  }
}

// Traduz um status HTTP de resposta em erro tipado — usado pelo client.ts
// depois de ler o corpo (não lança sozinho, quem chama decide se lê o body).
export function errorForStatus(status: number, detail?: string): ChatwootError {
  if (status === 401 || status === 403) return new ChatwootAuthError(status);
  if (status === 404) return new ChatwootNotFoundError(status);
  if (status === 422) return new ChatwootValidationError(status, detail);
  if (status === 429) return new ChatwootRateLimitError(null);
  if (status >= 500) return new ChatwootServerError(status);
  return new ChatwootError(detail ?? `Erro inesperado do Chatwoot (${status}).`, status);
}
