import { describe, expect, it } from "vitest";
import { abaixoDoMinimo, aplicarMovimento, itemSchema, movimentosDoItem, precisaConferir, type ItemParaMovimento } from "./estoque";

// O Estoque do Financeiro (05/11/2026): o que cada movimento faz com o item.

const notebook: ItemParaMovimento = { kind: "patrimonio", status: "DISPONIVEL", quantity: 1, holderUserId: null, holderName: null, location: "Sala 2" };
const papel: ItemParaMovimento = { kind: "material", status: "DISPONIVEL", quantity: 10, holderUserId: null, holderName: null, location: "Armário" };

describe("movimentosDoItem", () => {
  it("patrimônio disponível se entrega, empresta ou vai para manutenção; com alguém, só volta", () => {
    expect(movimentosDoItem(notebook)).toEqual(["ENTREGA", "EMPRESTIMO", "MANUTENCAO", "BAIXA", "CONFERENCIA"]);
    expect(movimentosDoItem({ ...notebook, status: "EMPRESTADO" })).toEqual(["DEVOLUCAO", "BAIXA", "CONFERENCIA"]);
  });

  it("material entra e sai; item baixado não se movimenta", () => {
    expect(movimentosDoItem(papel)).toEqual(["ENTRADA", "SAIDA", "BAIXA", "CONFERENCIA"]);
    expect(movimentosDoItem({ ...notebook, status: "BAIXADO" })).toEqual([]);
  });
});

describe("aplicarMovimento", () => {
  it("entregar e devolver o notebook mexem em com quem está", () => {
    const entregue = aplicarMovimento(notebook, { tipo: "ENTREGA", holderUserId: "u1", holderName: "Ana" });
    expect(entregue).toEqual({ item: { ...notebook, status: "EM_USO", holderUserId: "u1", holderName: "Ana" } });
    const devolvido = aplicarMovimento((entregue as { item: ItemParaMovimento }).item, { tipo: "DEVOLUCAO", location: "Sala 3" });
    expect(devolvido).toEqual({ item: { ...notebook, location: "Sala 3" } });
  });

  it("entregar sem dizer com quem é erro", () => {
    expect(aplicarMovimento(notebook, { tipo: "EMPRESTIMO", holderName: "  " })).toEqual({ erro: "Diga com quem o item vai ficar." });
  });

  it("material: entrada soma, saída tira, sem passar do que há", () => {
    expect(aplicarMovimento(papel, { tipo: "ENTRADA", quantidade: 5 })).toEqual({ item: { ...papel, quantity: 15 } });
    expect(aplicarMovimento(papel, { tipo: "SAIDA", quantidade: 4 })).toEqual({ item: { ...papel, quantity: 6 } });
    expect(aplicarMovimento(papel, { tipo: "SAIDA", quantidade: 11 })).toEqual({ erro: "Só há 10 em estoque." });
    expect(aplicarMovimento(papel, { tipo: "ENTRADA", quantidade: 0 })).toEqual({ erro: "Informe quantos entraram." });
    expect(aplicarMovimento(papel, { tipo: "ENTRADA", quantidade: 1.5 })).toEqual({ erro: "Informe quantos entraram." });
  });

  it("conferir o material acerta a quantidade contada; no patrimônio, só registra", () => {
    expect(aplicarMovimento(papel, { tipo: "CONFERENCIA", quantidade: 7 })).toEqual({ item: { ...papel, quantity: 7 } });
    expect(aplicarMovimento(notebook, { tipo: "CONFERENCIA" })).toEqual({ item: notebook });
  });

  it("baixa do patrimônio tira de uso; do material, descarta a quantidade", () => {
    expect(aplicarMovimento({ ...notebook, status: "EM_USO", holderName: "Ana" }, { tipo: "BAIXA" })).toEqual({ item: { ...notebook, status: "BAIXADO", quantity: 0 } });
    expect(aplicarMovimento(papel, { tipo: "BAIXA", quantidade: 2 })).toEqual({ item: { ...papel, quantity: 8 } });
  });

  it("movimento que não vale agora é recusado", () => {
    expect(aplicarMovimento(notebook, { tipo: "DEVOLUCAO" })).toEqual({ erro: "“Devolver” não vale para este item agora." });
    expect(aplicarMovimento({ ...notebook, status: "BAIXADO" }, { tipo: "CONFERENCIA" })).toEqual({ erro: "Item baixado não se movimenta." });
  });
});

describe("avisos", () => {
  it("abaixo do mínimo só para material ativo com mínimo", () => {
    expect(abaixoDoMinimo({ kind: "material", status: "DISPONIVEL", quantity: 2, minQuantity: 5 })).toBe(true);
    expect(abaixoDoMinimo({ kind: "material", status: "DISPONIVEL", quantity: 5, minQuantity: 5 })).toBe(false);
    expect(abaixoDoMinimo({ kind: "material", status: "DISPONIVEL", quantity: 0, minQuantity: null })).toBe(false);
    expect(abaixoDoMinimo({ kind: "patrimonio", status: "DISPONIVEL", quantity: 0, minQuantity: 5 })).toBe(false);
  });

  it("a conferir depois de 180 dias da última (ou do cadastro); baixado não", () => {
    const hoje = new Date("2026-11-05T12:00:00Z");
    const ha = (dias: number) => new Date(hoje.getTime() - dias * 86_400_000);
    expect(precisaConferir({ status: "DISPONIVEL", lastCheckedAt: ha(181), createdAt: ha(400) }, hoje)).toBe(true);
    expect(precisaConferir({ status: "DISPONIVEL", lastCheckedAt: ha(10), createdAt: ha(400) }, hoje)).toBe(false);
    expect(precisaConferir({ status: "DISPONIVEL", lastCheckedAt: null, createdAt: ha(200) }, hoje)).toBe(true);
    expect(precisaConferir({ status: "BAIXADO", lastCheckedAt: null, createdAt: ha(900) }, hoje)).toBe(false);
  });
});

describe("itemSchema", () => {
  it("patrimônio guarda o número e ignora o mínimo; material ao contrário", () => {
    const p = itemSchema.parse({ kind: "patrimonio", name: "Notebook", category: "Computadores", assetTag: "PAT-001", minQuantity: "3" });
    expect(p).toMatchObject({ assetTag: "PAT-001", minQuantity: null, unit: "un" });
    const m = itemSchema.parse({ kind: "material", name: "Papel A4", category: "Material de escritório", assetTag: "X", minQuantity: "3", unit: "resma" });
    expect(m).toMatchObject({ assetTag: null, minQuantity: 3, unit: "resma" });
  });

  it("nome e categoria obrigatórios; data no formato do campo", () => {
    expect(itemSchema.safeParse({ kind: "material", name: " ", category: "x" }).success).toBe(false);
    expect(itemSchema.safeParse({ kind: "material", name: "x", category: "x", purchaseDate: "05/11/2026" }).success).toBe(false);
  });
});
