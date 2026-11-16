import { describe, expect, it } from "vitest";
import { destinosDaTransferencia, linhaDaTransferencia } from "@/lib/resumoDaEmpresa";

const NOMES: Record<string, string> = { tech: "Tech", bpo: "BPO", fiscal: "Fiscal", societario: "Societário" };
const rotulo = (codigo: string) => NOMES[codigo] ?? codigo;

describe("linhas do Resumo IA da empresa", () => {
  it("mostra cada setor de destino pelo nome, com a situação escrita como na tela", () => {
    expect(
      destinosDaTransferencia(
        [
          { sectorCode: "bpo", status: "NEW" },
          { sectorCode: "fiscal", status: "IN_PROGRESS" },
          { sectorCode: "societario", status: "DONE" },
        ],
        rotulo,
      ),
    ).toBe("BPO (nova), Fiscal (resolvendo), Societário (finalizada)");
  });

  it("não deixa código do banco na linha da transferência", () => {
    const linha = linhaDaTransferencia(
      { data: "01/09/2026", de: "tech", partes: [{ sectorCode: "bpo", status: "NEW" }], prioridade: "MEDIUM", resumo: "Teste!" },
      rotulo,
    );
    expect(linha).toBe('[Transferência] 01/09/2026 — de Tech para BPO (nova) · prioridade média · "Teste!"');
    expect(linha).not.toMatch(/NEW|MEDIUM|\bbpo\b|\btech\b/);
  });

  it("escreve a parte devolvida e as outras prioridades", () => {
    const linha = linhaDaTransferencia(
      { data: "02/09/2026", de: "fiscal", partes: [{ sectorCode: "bpo", status: "RETURNED" }], prioridade: "URGENT", resumo: null },
      rotulo,
    );
    expect(linha).toBe("[Transferência] 02/09/2026 — de Fiscal para BPO (devolvida) · prioridade urgente");
  });

  it("corta o assunto longo em 160 caracteres", () => {
    const linha = linhaDaTransferencia(
      { data: "03/09/2026", de: "tech", partes: [{ sectorCode: "bpo", status: "NEW" }], prioridade: "LOW", resumo: "a".repeat(300) },
      rotulo,
    );
    expect(linha.endsWith(`"${"a".repeat(160)}"`)).toBe(true);
  });
});
