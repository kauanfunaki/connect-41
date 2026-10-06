import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Hash bcrypt de um valor aleatório que foi descartado, no custo das senhas
 * (12). Sem conta com o e-mail, a entrada confere a senha contra ele, para a
 * resposta levar o mesmo tempo de quando a conta existe.
 *
 * Precisa ser um hash VÁLIDO (60 caracteres): para um texto fora do formato o
 * bcryptjs devolve `false` na hora, sem calcular nada — e o tempo de resposta
 * voltaria a dizer quais e-mails têm conta. Não é segredo: ninguém sabe o valor
 * de origem, e ele só é usado quando não há conta nenhuma.
 */
export const HASH_DESCARTAVEL = "$2b$12$54aRke9VeS3Et7OIoZyOO.jA9JvidPWHYzIDYnmlebGjikm/0UIxS";
