import { describe, expect, it } from "vitest";
import {
  LIMITES_PADRAO,
  cargaPorPessoa,
  classificar,
  limitesDoSetor,
  ordemDeAtencao,
  recorteDaGestao,
  type ItemDeTrabalho,
} from "./regras";

const AGORA = new Date("2026-09-29T12:00:00Z");
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000);
const item = (p: Partial<ItemDeTrabalho>): ItemDeTrabalho => ({
  origem: "CARD",
  id: "i1",
  titulo: "Card",
  setor: "bpo",
  responsaveis: ["u1"],
  estado: "ANDAMENTO",
  ultimaMovimentacao: dias(-1),
  prazo: null,
  concluidoEm: null,
  href: "/x",
  ...p,
});

describe("coluna e alertas de cada item", () => {
  it("não iniciado fica em Iniciados; andando, em Em andamento", () => {
    expect(classificar(item({ estado: "NAO_INICIADO" }), LIMITES_PADRAO, AGORA).coluna).toBe("INICIADO");
    expect(classificar(item({}), LIMITES_PADRAO, AGORA).coluna).toBe("ANDAMENTO");
  });

  it("sem movimentação a partir do limite do setor vira parado, com os dias", () => {
    const c = classificar(item({ ultimaMovimentacao: dias(-10) }), LIMITES_PADRAO, AGORA);
    expect(c).toMatchObject({ coluna: "PARADO", parado: 10 });
    expect(classificar(item({ ultimaMovimentacao: dias(-9) }), LIMITES_PADRAO, AGORA).parado).toBeNull();
  });

  it("não iniciado há muito tempo continua em Iniciados: é fila, não parado", () => {
    expect(classificar(item({ estado: "NAO_INICIADO", ultimaMovimentacao: dias(-90) }), LIMITES_PADRAO, AGORA)).toMatchObject({ coluna: "INICIADO", parado: null });
  });

  it("esperando o órgão só conta como parado depois de 30 dias", () => {
    expect(classificar(item({ estado: "ESPERANDO_ORGAO", ultimaMovimentacao: dias(-20) }), LIMITES_PADRAO, AGORA).coluna).toBe("ANDAMENTO");
    expect(classificar(item({ estado: "ESPERANDO_ORGAO", ultimaMovimentacao: dias(-30) }), LIMITES_PADRAO, AGORA).parado).toBe(30);
  });

  it("esperando o cliente é parado de propósito: coluna Paralisados, sem alerta de parado", () => {
    const c = classificar(item({ estado: "ESPERANDO_CLIENTE", ultimaMovimentacao: dias(-60) }), LIMITES_PADRAO, AGORA);
    expect(c).toMatchObject({ coluna: "PARADO", parado: null, paradoDeProposito: true });
  });

  it("prazo vencido e vencendo dentro do aviso do setor", () => {
    expect(classificar(item({ prazo: dias(-2) }), LIMITES_PADRAO, AGORA).prazo).toEqual({ situacao: "VENCIDO", dias: 2 });
    expect(classificar(item({ prazo: dias(3) }), LIMITES_PADRAO, AGORA).prazo).toEqual({ situacao: "VENCENDO", dias: 3 });
    expect(classificar(item({ prazo: dias(4) }), LIMITES_PADRAO, AGORA).prazo).toBeNull();
  });

  it("concluído não alerta, nem com prazo vencido", () => {
    expect(classificar(item({ estado: "CONCLUIDO", prazo: dias(-5), ultimaMovimentacao: dias(-50) }), LIMITES_PADRAO, AGORA)).toEqual({
      coluna: "CONCLUIDO",
      parado: null,
      paradoDeProposito: false,
      prazo: null,
    });
  });
});

describe("limites por setor", () => {
  it("usa o do setor e cai no padrão quando vazio ou absurdo", () => {
    expect(limitesDoSetor({ alertStalledDays: 5, alertDueSoonDays: 1 })).toEqual({ diasParado: 5, diasAvisoPrazo: 1 });
    expect(limitesDoSetor({ alertStalledDays: null, alertDueSoonDays: 0 })).toEqual(LIMITES_PADRAO);
    expect(limitesDoSetor(undefined)).toEqual(LIMITES_PADRAO);
  });
});

describe("quem vê a Gestão", () => {
  it("diretoria e administrador veem tudo; coordenador vê os setores dele; os demais, nada", () => {
    expect(recorteDaGestao({ role: "SUPER_ADMIN", sectors: [] })).toBe("todos");
    expect(recorteDaGestao({ role: "SECTOR_USER", sectors: ["gestao"] })).toBe("todos");
    expect(recorteDaGestao({ role: "SECTOR_ADMIN", sectors: ["bpo", "fiscal"] })).toEqual(["bpo", "fiscal"]);
    expect(recorteDaGestao({ role: "SECTOR_USER", sectors: ["bpo"] })).toBeNull();
  });
});

describe("carga por pessoa", () => {
  it("conta abertos por origem, parados e prazos; item de dois responsáveis conta para os dois", () => {
    const xs = [
      item({ id: "a", responsaveis: ["u1", "u2"], prazo: dias(-1) }),
      item({ id: "b", origem: "PROCESSO", ultimaMovimentacao: dias(-15) }),
      item({ id: "c", estado: "CONCLUIDO" }),
      item({ id: "d", responsaveis: [] }),
    ].map((i) => ({ item: i, c: classificar(i, LIMITES_PADRAO, AGORA) }));
    const m = cargaPorPessoa(xs);
    expect(m.get("u1")).toMatchObject({ abertos: 2, parados: 1, vencidos: 1, porOrigem: { CARD: 1, PROCESSO: 1 } });
    expect(m.get("u2")?.abertos).toBe(1);
    expect(m.size).toBe(2);
  });

  it("atenção: vencido antes de parado, e o mais atrasado primeiro", () => {
    const xs = [item({ id: "parado", ultimaMovimentacao: dias(-12) }), item({ id: "venc1", prazo: dias(-1) }), item({ id: "venc5", prazo: dias(-5) })]
      .map((i) => ({ item: i, c: classificar(i, LIMITES_PADRAO, AGORA) }))
      .sort(ordemDeAtencao);
    expect(xs.map((x) => x.item.id)).toEqual(["venc5", "venc1", "parado"]);
  });
});
