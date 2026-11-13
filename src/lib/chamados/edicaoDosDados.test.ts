import { describe, expect, it } from "vitest";
import { aoFecharEdicao, dadosMudaram } from "./edicaoDosDados";
import type { DadosDoChamado } from "./regras";

const base: DadosDoChamado = { title: "Impressora não imprime", description: "Desde ontem.", categoryId: "cat-1", requesterSectorCode: "bpo", priority: "ALTA", requestData: { local: "2º andar" }, tags: ["impressora"], handlingSectorCode: "" };

describe("janela Editar dados do chamado", () => {
  it("sem mudança, fecha direto; com mudança, pede confirmação", () => {
    expect(aoFecharEdicao(dadosMudaram(base, { ...base }), false)).toBe("fechar");
    expect(aoFecharEdicao(dadosMudaram(base, { ...base, priority: "URGENTE" }), false)).toBe("confirmar");
  });
  it("enquanto salva, não fecha", () => {
    expect(aoFecharEdicao(true, true)).toBe("esperar");
    expect(aoFecharEdicao(false, true)).toBe("esperar");
  });
  it("conta como mudança o que a action grava", () => {
    expect(dadosMudaram(base, { ...base, title: "Outra coisa" })).toBe(true);
    expect(dadosMudaram(base, { ...base, categoryId: "cat-2" })).toBe(true);
    expect(dadosMudaram(base, { ...base, requestData: { local: "3º andar" } })).toBe(true);
    expect(dadosMudaram(base, { ...base, tags: ["impressora", "rede"] })).toBe(true);
  });
  it("espaço nas pontas, campo vazio e tag vazia não contam", () => {
    expect(dadosMudaram(base, { ...base, title: " Impressora não imprime  " })).toBe(false);
    expect(dadosMudaram(base, { ...base, requestData: { local: "2º andar", equipamento: "" } })).toBe(false);
    expect(dadosMudaram(base, { ...base, tags: ["impressora", ""] })).toBe(false);
  });
});
