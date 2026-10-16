import { describe, expect, it } from "vitest";
import { hrefDaAuditoria, hrefDoPeriodo, lerFiltros, temFiltro } from "./filtros";

const HOJE = "2026-10-14";

describe("filtros da auditoria na URL", () => {
  it("sem nada: últimos 7 dias, dez ações por dia, sete dias", () => {
    const f = lerFiltros({}, HOJE);
    expect(f).toMatchObject({ tipo: null, pessoa: null, area: null, busca: "", dia: null, dias: 7 });
    expect(f.periodo.chave).toBe("7d");
    expect(temFiltro(f)).toBe(false);
    expect(hrefDaAuditoria(f)).toBe("/admin/auditoria");
  });

  it("valor inválido é ignorado", () => {
    const f = lerFiltros({ tipo: "apagou", area: "nada", dia: "ontem", dias: "-3", ver: "999999" }, HOJE);
    expect(f).toMatchObject({ tipo: null, area: null, dia: null, dias: 1, ver: 1000 });
  });

  it("trocar um filtro mantém os outros e volta ao começo da lista", () => {
    const f = lerFiltros({ tipo: "excluiu", area: "fiscal", q: "nota", dia: HOJE, ver: "60", dias: "14" }, HOJE);
    expect(temFiltro(f)).toBe(true);
    const href = hrefDaAuditoria(f, { pessoa: "u1" });
    const q = new URLSearchParams(href.split("?")[1]);
    expect(Object.fromEntries(q)).toEqual({ tipo: "excluiu", pessoa: "u1", area: "fiscal", q: "nota" });
    expect(hrefDaAuditoria(f, { tipo: null })).not.toContain("tipo=");
  });

  it("mostrar mais guarda o dia aberto e os dias à vista", () => {
    const f = lerFiltros({ area: "bpo" }, HOJE);
    expect(hrefDaAuditoria(f, { dia: HOJE, ver: 60 })).toBe(`/admin/auditoria?area=bpo&dia=${HOJE}&ver=60`);
    expect(hrefDaAuditoria(f, { dias: 14 })).toBe("/admin/auditoria?area=bpo&dias=14");
  });

  it("período escolhido vai na URL; trocar de atalho tira as datas", () => {
    const f = lerFiltros({ periodo: "datas", de: "2026-10-01", ate: "2026-10-05", tipo: "criou" }, HOJE);
    expect(hrefDaAuditoria(f)).toBe("/admin/auditoria?tipo=criou&periodo=datas&de=2026-10-01&ate=2026-10-05");
    expect(hrefDoPeriodo(f, "30d")).toBe("/admin/auditoria?tipo=criou&periodo=30d");
    expect(hrefDoPeriodo(f, "7d")).toBe("/admin/auditoria?tipo=criou");
  });
});
