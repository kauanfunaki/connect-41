// Um Prisma de mentira para os testes da exclusão: qualquer `banco.<model>.<método>`
// existe, grava a chamada e devolve o que as regras mandam (zero e vazio por
// padrão). `$transaction` roda o callback com o próprio banco.
//
// Só para teste — sem vitest aqui, para o arquivo não puxar nada de teste
// para quem o importar por engano.

export type Chamada = { delegado: string; metodo: string; args: Record<string, unknown> | undefined };

export type Regras = {
  /** Resultado de `count` (padrão 0). */
  contar?: (delegado: string, where: Record<string, unknown>) => number | undefined;
  /** Resultado de `findFirst`/`findUnique`/`findMany` (padrão null / []). */
  achar?: (delegado: string, metodo: string, args: Record<string, unknown>) => unknown;
  /** Quantas linhas um `deleteMany`/`updateMany` mexeu (padrão 0). */
  mexer?: (delegado: string, metodo: string, args: Record<string, unknown>) => number | undefined;
};

export function criarBancoFalso(regras: Regras = {}) {
  const chamadas: Chamada[] = [];
  let transacoes = 0;

  const banco: Record<string, unknown> = new Proxy(
    {},
    {
      get(_, nome) {
        if (typeof nome !== "string" || nome === "then") return undefined;
        if (nome === "$transaction") {
          return async (fn: (tx: unknown) => Promise<unknown>) => {
            transacoes++;
            return fn(banco);
          };
        }
        return new Proxy(
          {},
          {
            get(__, metodo) {
              if (typeof metodo !== "string" || metodo === "then") return undefined;
              return async (args?: Record<string, unknown>) => {
                chamadas.push({ delegado: nome, metodo, args });
                const a = args ?? {};
                switch (metodo) {
                  case "count":
                    return regras.contar?.(nome, (a.where as Record<string, unknown>) ?? {}) ?? 0;
                  case "findMany":
                    return regras.achar?.(nome, metodo, a) ?? [];
                  case "findFirst":
                  case "findUnique":
                    return regras.achar?.(nome, metodo, a) ?? null;
                  case "deleteMany":
                  case "updateMany":
                    return { count: regras.mexer?.(nome, metodo, a) ?? 0 };
                  default:
                    return {};
                }
              };
            },
          }
        );
      },
    }
  );

  return {
    banco,
    chamadas,
    transacoes: () => transacoes,
    /** As chamadas que mexem no banco (apagar, atualizar, criar). */
    escritas: () => chamadas.filter((c) => ["deleteMany", "updateMany", "create", "delete", "update"].includes(c.metodo)),
  };
}
