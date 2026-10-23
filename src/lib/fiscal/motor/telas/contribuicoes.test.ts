import { describe, expect, it, vi } from "vitest";
import * as F from "@/lib/sped/telasDoMotor.fixtures";

vi.mock("server-only", () => ({}));
const { carregarDemonstrativoContrib, carregarFechamento, competenciasDoDemonstrativo, filtroDoDemonstrativo, periodoDoFechamento } = await import("./contribuicoes");
const { telaDeTeste, json } = await import("./telaDeTeste");

const ROTAS = {
  "/fechamento/competencias": { competencias: ["2026-09", "2026-08"] },
  "/fechamento": F.FECHAMENTO,
  "/fechamento/faturamento": F.FATURAMENTO,
  "/fechamento/conferencia": F.CONFERENCIA_FECHAMENTO,
  "/fechamento/duplicatas": F.DUPLICATAS,
  "/fechamento/alugueis-imoveis": F.ALUGUEIS,
};
const CTX = { raiz: "17122471", estabelecimentoId: null, competencia: "2026-09" };

describe("Fechamento (§11.3.3 a 11.3.7)", () => {
  it("lê as seis rotas leves do período; a conferência segue o período e as duplicatas paginam por c_dup", async () => {
    const { tela, chamadas } = telaDeTeste(ROTAS);
    const d = await carregarFechamento(tela, { periodo: "2026", c_dup: "eyJvIjo1MH0", tipo_dup: "rpa" });
    expect(d?.periodo).toBe("2026");
    expect(d?.blocos.dados?.fiscais[0].valor).toBeNull();
    expect(d?.duplicatas.dados?.proximo_cursor).toBe("eyJvIjo1MH0");
    const por = (p: string) => chamadas.find((u) => u.pathname === `/api/connect/v1${p}`)!.searchParams;
    expect(por("/fechamento").get("competencia")).toBe("2026");
    expect(por("/fechamento/conferencia").get("competencia")).toBe("2026");
    expect(por("/fechamento/conferencia").get("sem_credito")).toBe("false");
    expect([por("/fechamento/duplicatas").get("cursor"), por("/fechamento/duplicatas").get("tipo"), por("/fechamento/duplicatas").get("competencia")]).toEqual(["eyJvIjo1MH0", "rpa", "2026"]);
    expect(chamadas).toHaveLength(6);
  });

  it("`fila=toda` tira a competência da conferência (o padrão do painel); `sem_credito=1` vai junto", async () => {
    const { tela, chamadas } = telaDeTeste(ROTAS);
    const d = await carregarFechamento(tela, { fila: "toda", sem_credito: "1" });
    expect(d?.filaInteira).toBe(true);
    const q = chamadas.find((u) => u.pathname.endsWith("/fechamento/conferencia"))!.searchParams;
    expect(q.has("competencia")).toBe(false);
    expect(q.get("sem_credito")).toBe("true");
  });

  it("matriz não cadastrada (422) chega à tela como situação; as outras leituras seguem", async () => {
    const { tela } = telaDeTeste({ ...ROTAS, "/fechamento": () => json({ codigo: "matriz_nao_cadastrada" }, 422) });
    const d = await carregarFechamento(tela, {});
    expect(d?.blocos.erro !== null && d?.blocos.codigo).toBe("matriz_nao_cadastrada");
    expect(d?.faturamento.dados).not.toBeNull();
  });

  it("o período aceita mês ou ano e cai na competência do recorte", () => {
    expect(periodoDoFechamento({ periodo: "2025" }, CTX)).toBe("2025");
    expect(periodoDoFechamento({ periodo: "2025-13" }, CTX)).toBe("2026-09");
    expect(periodoDoFechamento({}, CTX)).toBe("2026-09");
  });

  it("sem o módulo, nada é lido", async () => {
    const { tela, fetch } = telaDeTeste(ROTAS, { modulos: ["fiscal_acervo"] });
    expect(await carregarFechamento(tela, {})).toBeNull();
    expect((await competenciasDoDemonstrativo(tela)).erro).toMatch(/acesso/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Demonstrativo (§11.3.1 e 11.3.2)", () => {
  const mapa = { visiveis: [{ id: 3 }, { id: 5 }] } as never;
  it("competência do recorte quando tem arquivo; senão o ano mais recente; `visao=ano` pede o ano", () => {
    const disp = F.COMPETENCIAS_CONTRIB;
    expect(filtroDoDemonstrativo({}, { contexto: CTX, mapa }, disp)).toEqual({ competencia: "2026-09", filial: "todas", relatorio: "entradas", ordenar: "cst" });
    expect(filtroDoDemonstrativo({}, { contexto: { ...CTX, competencia: "2024-01" }, mapa }, disp)).toEqual({ ano: "2026", filial: "todas", relatorio: "entradas", ordenar: "cst" });
    expect(filtroDoDemonstrativo({ visao: "ano", ano: "2025", relatorio: "saidas", ordenar: "valor", filial: "5" }, { contexto: CTX, mapa }, disp)).toEqual({ ano: "2025", filial: 5, relatorio: "saidas", ordenar: "valor" });
    // Filial que a pessoa não vê vira "todas"; opção desconhecida, o padrão.
    expect(filtroDoDemonstrativo({ filial: "99", ordenar: "x" }, { contexto: CTX, mapa }, disp)).toMatchObject({ filial: "todas", ordenar: "cst" });
    expect(filtroDoDemonstrativo({}, { contexto: CTX, mapa }, { competencias: [], anos: [] })).toBeNull();
  });

  it("a leitura pesada leva o filtro e não se repete em 504", async () => {
    const ok = telaDeTeste({ "/demonstrativo-contribuicoes": F.DEMONSTRATIVO_CONTRIB });
    const d = await carregarDemonstrativoContrib(ok.tela, { ano: "2026", filial: 5, relatorio: "entradas", ordenar: "cst" });
    expect(d.dados?.cadeia[0].bate).toBe(false);
    expect(ok.chamadas[0].search).toBe("?cnpj_raiz=17122471&ano=2026&filial=5&relatorio=entradas&ordenar=cst");
    const ruim = telaDeTeste({ "/demonstrativo-contribuicoes": () => json({ erro: "gateway" }, 504) });
    const e = await carregarDemonstrativoContrib(ruim.tela, { ano: "2026", filial: "todas", relatorio: "entradas", ordenar: "cst" });
    expect(e.erro !== null && e.status).toBe(504);
    expect(ruim.chamadas).toHaveLength(1);
  });
});
