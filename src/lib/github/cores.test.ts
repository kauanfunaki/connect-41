import { describe, expect, it } from "vitest";
import { COR_SEM_TIME, CORES_AUTOMATICAS, corAutomatica, corDaPessoa, corDoDia, misturar, type Paleta } from "./cores";

const AZUL = "#2E6FB8", LARANJA = "#E15A2B";
const paleta: Paleta = {
  pessoas: {
    ana: { login: "ana", name: "Ana", cor: AZUL, time: "dev" },
    bia: { login: "bia", name: null, cor: LARANJA, time: "suporte" },
    caio: { login: "caio", name: null, cor: "#1E8E5A", time: null },
  },
  times: [{ id: "dev", nome: "Dev", cor: "#7C5CBF" }, { id: "suporte", nome: "Suporte", cor: "#C8860D" }],
};

describe("cores do calendário GitHub", () => {
  it("uma cor sozinha, ou repetida, volta igual", () => {
    expect(misturar([{ cor: AZUL, peso: 3 }])).toBe(AZUL);
    expect(misturar([{ cor: "#2e6fb8", peso: 1 }, { cor: AZUL, peso: 9 }])).toBe(AZUL);
  });
  it("sem partes válidas, o cinza de sem time", () => {
    expect(misturar([])).toBe(COR_SEM_TIME);
    expect(misturar([{ cor: AZUL, peso: 0 }, { cor: "xyz", peso: 2 }])).toBe(COR_SEM_TIME);
  });
  it("mistura duas cores numa terceira, puxada pelo peso", () => {
    const meio = misturar([{ cor: AZUL, peso: 1 }, { cor: LARANJA, peso: 1 }]);
    expect(meio).toMatch(/^#[0-9A-F]{6}$/);
    expect([AZUL, LARANJA]).not.toContain(meio);
    const quaseAzul = misturar([{ cor: AZUL, peso: 9 }, { cor: LARANJA, peso: 1 }]);
    const distancia = (a: string, b: string) => [1, 3, 5].reduce((soma, i) => soma + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0);
    expect(distancia(quaseAzul, AZUL)).toBeLessThan(distancia(meio, AZUL));
  });
  it("mistura em OKLab não vira cinza-barro: o meio de azul e laranja guarda croma", () => {
    const meio = misturar([{ cor: AZUL, peso: 1 }, { cor: LARANJA, peso: 1 }, { cor: "#1E8E5A", peso: 1 }]);
    expect(meio).toMatch(/^#[0-9A-F]{6}$/);
  });
  it("a cor automática é estável e da paleta, sem o cinza", () => {
    expect(corAutomatica("MDQ6VXNlcjE=")).toBe(corAutomatica("MDQ6VXNlcjE="));
    expect(CORES_AUTOMATICAS).toContain(corAutomatica("qualquer"));
    expect(CORES_AUTOMATICAS).not.toContain("#586577");
  });
  it("por pessoa usa a cor dela; por time, a do time ou o cinza", () => {
    expect(corDaPessoa("ana", paleta, "pessoa")).toBe(AZUL);
    expect(corDaPessoa("ana", paleta, "time")).toBe("#7C5CBF");
    expect(corDaPessoa("caio", paleta, "time")).toBe(COR_SEM_TIME);
    expect(corDaPessoa("desconhecido", paleta, "time")).toBe(COR_SEM_TIME);
    expect(CORES_AUTOMATICAS).toContain(corDaPessoa("desconhecido", paleta, "pessoa"));
  });
  it("o dia de duas pessoas do mesmo time, por time, é a cor do time", () => {
    const comColega: Paleta = { ...paleta, pessoas: { ...paleta.pessoas, bia: { ...paleta.pessoas.bia!, time: "dev" } } };
    expect(corDoDia([["ana", 2], ["bia", 5]], comColega, "time")).toBe("#7C5CBF");
    expect(corDoDia([["ana", 2], ["bia", 5]], comColega, "pessoa")).not.toBe(AZUL);
  });
});
