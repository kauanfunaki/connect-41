// Os erros da API pública do Connect (`/api/v1`) e do servidor MCP (05/11/2026).
// Toda resposta de erro tem o mesmo formato — `{ "error": { "code", "message" } }`
// —, com um código estável (para o script e a IA decidirem o que fazer) e uma
// mensagem em português que diz o que aconteceu e como resolver.

export const CODIGOS_DE_ERRO = {
  unauthenticated: 401,
  invalid_token: 401,
  expired_token: 401,
  revoked_token: 401,
  insufficient_scope: 403,
  office_unavailable: 403,
  module_disabled: 403,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  payload_too_large: 413,
  validation_error: 422,
  invalid_json: 400,
  internal_error: 500,
} as const;
export type CodigoDeErro = keyof typeof CODIGOS_DE_ERRO;

export class ErroApi extends Error {
  readonly status: number;
  constructor(public readonly code: CodigoDeErro, message: string, public readonly details?: unknown) {
    super(message);
    this.status = CODIGOS_DE_ERRO[code];
  }
}
