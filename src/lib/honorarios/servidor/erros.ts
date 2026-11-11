// Erro com a mensagem para a pessoa e o status HTTP (o AppError do Aditiva Pronto).
// A tela mostra `message`; a rota do robô responde com `statusCode`.

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const ehAppError = (e: unknown): e is AppError => e instanceof AppError;
