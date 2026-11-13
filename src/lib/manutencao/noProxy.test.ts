import { beforeEach, describe, expect, it, vi } from "vitest";
import { VALIDADE_MS, enderecoInternoDaRota, esquecerTelasEmManutencaoDoProxy, telasEmManutencaoNoProxy } from "./noProxy";

// O que se testa: a lista que o proxy guarda por escritório. Ninguém espera
// a busca, a não ser na primeira vez; falha nunca bloqueia tela; e a mesma
// busca serve a quem chega junto.

let relogio = 1_000_000;
const agora = () => relogio;
const lista = (...codigos: string[]) => new Map(codigos.map((c) => [c, "id-" + c]));

beforeEach(() => {
  esquecerTelasEmManutencaoDoProxy();
  relogio = 1_000_000;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("telasEmManutencaoNoProxy", () => {
  it("a primeira vez espera a busca; depois, dentro da validade, não busca de novo", async () => {
    const buscar = vi.fn(async () => lista("bpo_contas_pagar"));
    expect(await telasEmManutencaoNoProxy("a", buscar, agora)).toEqual(lista("bpo_contas_pagar"));
    relogio += VALIDADE_MS - 1;
    expect(await telasEmManutencaoNoProxy("a", buscar, agora)).toEqual(lista("bpo_contas_pagar"));
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("vencida: devolve a guardada na hora e busca a nova por trás", async () => {
    const buscar = vi.fn(async () => lista("bpo_contas_pagar"));
    await telasEmManutencaoNoProxy("a", buscar, agora);
    relogio += VALIDADE_MS;
    buscar.mockResolvedValueOnce(lista());
    expect(await telasEmManutencaoNoProxy("a", buscar, agora)).toEqual(lista("bpo_contas_pagar"));
    expect(buscar).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    // A nova já chegou: a liberação vale na abertura seguinte.
    expect(await telasEmManutencaoNoProxy("a", buscar, agora)).toEqual(lista());
  });

  it("quem chega junto na primeira vez espera a mesma busca", async () => {
    let soltar!: (s: Map<string, string>) => void;
    const buscar = vi.fn(() => new Promise<Map<string, string>>((r) => (soltar = r)));
    const um = telasEmManutencaoNoProxy("a", buscar, agora);
    const dois = telasEmManutencaoNoProxy("a", buscar, agora);
    soltar(lista("fiscal_documentos"));
    expect(await um).toEqual(lista("fiscal_documentos"));
    expect(await dois).toEqual(lista("fiscal_documentos"));
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("falha na primeira vez: nenhuma tela bloqueada, e tenta de novo depois de alguns segundos", async () => {
    const buscar = vi.fn(async (): Promise<Map<string, string>> => {
      throw new Error("a rota respondeu 500");
    });
    expect(await telasEmManutencaoNoProxy("a", buscar, agora)).toEqual(lista());
    expect(await telasEmManutencaoNoProxy("a", buscar, agora)).toEqual(lista());
    expect(buscar).toHaveBeenCalledTimes(1);
    relogio += 5_000;
    buscar.mockResolvedValueOnce(lista("bpo_dre"));
    await telasEmManutencaoNoProxy("a", buscar, agora);
    await Promise.resolve();
    expect(await telasEmManutencaoNoProxy("a", buscar, agora)).toEqual(lista("bpo_dre"));
  });

  it("falha depois de uma resposta: segue com a última lista boa", async () => {
    const buscar = vi.fn(async () => lista("bpo_dre"));
    await telasEmManutencaoNoProxy("a", buscar, agora);
    relogio += VALIDADE_MS;
    buscar.mockRejectedValueOnce(new Error("tempo esgotado"));
    expect(await telasEmManutencaoNoProxy("a", buscar, agora)).toEqual(lista("bpo_dre"));
    await Promise.resolve();
    await Promise.resolve();
    expect(await telasEmManutencaoNoProxy("a", buscar, agora)).toEqual(lista("bpo_dre"));
  });

  it("cada escritório tem a sua lista", async () => {
    await telasEmManutencaoNoProxy("a", async () => lista("bpo_dre"), agora);
    expect(await telasEmManutencaoNoProxy("b", async () => lista(), agora)).toEqual(lista());
    expect(await telasEmManutencaoNoProxy("a", async () => lista(), agora)).toEqual(lista("bpo_dre"));
  });
});

describe("enderecoInternoDaRota", () => {
  const rota = "/api/manutencao/telas";

  it("na produção: o https do x-forwarded-proto vira http, e o 0.0.0.0 vira 127.0.0.1", () => {
    expect(String(enderecoInternoDaRota(rota, "https://0.0.0.0:3000/pagar?x=1"))).toBe("http://127.0.0.1:3000/api/manutencao/telas");
    expect(String(enderecoInternoDaRota(rota, "https://[::]:3000/pagar"))).toBe("http://127.0.0.1:3000/api/manutencao/telas");
  });

  it("local e nos testes: fica como está", () => {
    expect(String(enderecoInternoDaRota(rota, "http://localhost:3216/pagar"))).toBe("http://localhost:3216/api/manutencao/telas");
    expect(String(enderecoInternoDaRota(rota, "http://localhost/pagar"))).toBe("http://localhost/api/manutencao/telas");
  });
});
