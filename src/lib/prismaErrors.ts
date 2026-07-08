// Detecção dos códigos de erro conhecidos do Prisma sem depender do tipo
// PrismaClientKnownRequestError (que muda de import entre versões do client).

function code(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? (err as { code?: string }).code
    : undefined;
}

// P2002 — violação de unique constraint (ex: CPF/e-mail duplicado).
export function isPrismaUniqueError(err: unknown): boolean {
  return code(err) === "P2002";
}

// P2003 — violação de foreign key. Numa exclusão, significa que a linha tem
// vínculos (ex: uma pessoa com candidaturas/férias/histórico) e não pode ser
// removida sem tratar os dependentes antes.
export function isPrismaForeignKeyError(err: unknown): boolean {
  return code(err) === "P2003";
}
