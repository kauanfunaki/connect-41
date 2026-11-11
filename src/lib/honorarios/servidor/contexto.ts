// O escritório da chamada, para as consultas dos Honorários.
//
// Os serviços vieram do Aditiva Pronto, que tinha um escritório só, e chamam o
// repositório sem dizer de quem é o dado (`base.listarVinculos()`). Em vez de
// reescrever cada assinatura — e arriscar mudar regra testada lá —, a entrada
// do Connect (tela, ação, rota do robô) abre o escritório com `noEscritorio`,
// e todo repositório lê o tenant daqui. Fora de `noEscritorio`, a consulta
// falha em vez de ler o dado de todos.

import { AsyncLocalStorage } from "node:async_hooks";
import { getPrisma } from "@/lib/prisma";

type Contexto = { tenantId: string };

const armazenamento = new AsyncLocalStorage<Contexto>();

/** Roda `fn` com as consultas dos Honorários presas ao escritório `tenantId`. */
export function noEscritorio<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  if (!tenantId) throw new Error("Honorários: escritório não informado.");
  return armazenamento.run({ tenantId }, fn);
}

/** O escritório da chamada. Lança fora de `noEscritorio`. */
export function tenantAtual(): string {
  const c = armazenamento.getStore();
  if (!c) throw new Error("Honorários: consulta fora de noEscritorio().");
  return c.tenantId;
}

export const db = () => getPrisma();
