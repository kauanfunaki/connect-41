import { describe, expect, it } from "vitest";
import { ordemDaLista, ORDEM_DE_ATENDIMENTO } from "./ordem";

type Linha = { id: string; createdAt: Date; queueOrder: number | null };

/** Ordena em memória como o banco ordenaria, para conferir o efeito da ordem e não só a forma. */
function ordenar(linhas: Linha[], ordem: ReturnType<typeof ordemDaLista>): string[] {
  const valor = (l: Linha, campo: string) => { const v = l[campo as keyof Linha]; return v instanceof Date ? v.getTime() : v; };
  return [...linhas].sort((a, b) => {
    for (const criterio of ordem) {
      const [campo, sentido] = Object.entries(criterio)[0] as [string, "asc" | "desc"];
      const va = valor(a, campo), vb = valor(b, campo);
      if (va === vb) continue;
      const menor = va === null ? -1 : vb === null ? 1 : va! < vb! ? -1 : 1;
      return sentido === "asc" ? menor : -menor;
    }
    return 0;
  }).map(l => l.id);
}

const dia = (d: number) => new Date(Date.UTC(2026, 10, d, 12));
// Na fila, o mais antigo foi passado para o fim pela equipe (posição 3).
const chamados: Linha[] = [
  { id: "a", createdAt: dia(10), queueOrder: 3 },
  { id: "b", createdAt: dia(12), queueOrder: 1 },
  { id: "c", createdAt: dia(15), queueOrder: 2 },
  { id: "d", createdAt: dia(15), queueOrder: null },
];

describe("ordem da lista de chamados (melhoria-784)", () => {
  it("vai do aberto mais recente para o mais antigo, com o id desempatando o mesmo instante", () => {
    expect(ordemDaLista()).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(ordenar(chamados, ordemDaLista())).toEqual(["d", "c", "b", "a"]);
  });

  it("não segue a posição na fila nem a última alteração", () => {
    const ordem = ordemDaLista().flatMap(Object.keys);
    expect(ordem).not.toContain("queueOrder");
    expect(ordem).not.toContain("updatedAt");
  });

  it("devolve uma lista nova a cada chamada", () => {
    expect(ordemDaLista()).not.toBe(ordemDaLista());
  });

  it("a posição de atendimento continua pela ordem gravada da fila", () => {
    expect(ORDEM_DE_ATENDIMENTO).toEqual([{ queueOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }]);
    const naFila = chamados.filter(c => c.queueOrder !== null);
    expect(ordenar(naFila, ORDEM_DE_ATENDIMENTO)).toEqual(["b", "c", "a"]);
  });
});
