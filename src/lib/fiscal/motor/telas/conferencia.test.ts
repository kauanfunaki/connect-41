import { describe, expect, it, vi } from "vitest";
import * as F from "@/lib/sped/telasDoMotor.fixtures";

vi.mock("server-only", () => ({}));
const { carregarConfronto, carregarPrevia, competenciasDaConferencia, contextoDaConferencia } = await import("./conferencia");
const { telaDeTeste, json } = await import("./telaDeTeste");

const CTX = { raiz: "17122471", estabelecimentoId: null, competencia: "2026-10" };

describe("competência da Conferência (§11.4.1)", () => {
  it("sem competência na URL, a primeira do motor; com ela, a pedida", async () => {
    const { tela } = telaDeTeste({ "/conferencia/competencias": F.COMPETENCIAS_CONFERENCIA });
    const lidas = await competenciasDaConferencia(tela);
    expect(lidas.dados).toEqual(["2026-09", "2026-08"]);
    expect(contextoDaConferencia(CTX, {}, lidas.dados)).toEqual({ ...CTX, competencia: "2026-09" });
    expect(contextoDaConferencia(CTX, { competencia: "2026-10" }, lidas.dados)).toEqual(CTX);
    expect(contextoDaConferencia(CTX, {}, [])).toEqual(CTX);
    expect(contextoDaConferencia(CTX, {}, ["2026-13"])).toEqual(CTX);
  });
});

describe("Prévia financeira (§11.4.2 e 11.4.3)", () => {
  it("lê prévia e prestadores da competência; totais parciais e a pagar negativo chegam como vieram", async () => {
    const { tela, chamadas } = telaDeTeste({ "/conferencia/previa": F.PREVIA, "/conferencia/prestadores": F.PRESTADORES }, { competencia: "2026-09" });
    const d = await carregarPrevia(tela);
    expect(d?.previa.dados?.totais).toMatchObject({ parcial: true, a_pagar: "-12.34", pendentes: ["CT-e"] });
    expect(d?.previa.dados?.linhas[1]).toMatchObject({ base: null, imposto: null, aliquota: null });
    expect(d?.prestadores.dados).toEqual(F.PRESTADORES);
    expect(chamadas.every((u) => u.searchParams.get("competencia") === "2026-09")).toBe(true);
  });
  it("sem o módulo, nada é lido", async () => {
    const { tela, fetch } = telaDeTeste({}, { modulos: ["fiscal_icms_ipi"] });
    expect(await carregarPrevia(tela)).toBeNull();
    expect(await carregarConfronto(tela, {})).toBeNull();
    expect((await competenciasDaConferencia(tela)).erro).toMatch(/acesso/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Confronto (§11.4.4 e 11.4.5)", () => {
  it("padrão sem_nota; `todas` manda situacao vazia; cada lista com o seu cursor", async () => {
    const { tela, chamadas } = telaDeTeste({ "/conferencia/confronto": F.CONFRONTO, "/conferencia/documentos": F.DOCUMENTOS_CONFERENCIA });
    const d = await carregarConfronto(tela, { c_conf: "k1", c_doc: "k2", pendentes: "1", situacao_doc: "divergente" });
    expect(d?.situacao).toBe("sem_nota");
    expect(d?.confronto.dados?.itens.map((i) => i.situacao)).toEqual(["sem_nota", "possivel_duplicidade"]);
    const conf = chamadas.find((u) => u.pathname.endsWith("/confronto"))!.searchParams;
    const docs = chamadas.find((u) => u.pathname.endsWith("/documentos"))!.searchParams;
    expect([conf.get("situacao"), conf.get("cursor"), conf.get("limite")]).toEqual(["sem_nota", "k1", "50"]);
    expect([docs.get("situacao"), docs.get("pendentes"), docs.get("cursor")]).toEqual(["divergente", "true", "k2"]);

    const b = telaDeTeste({ "/conferencia/confronto": F.CONFRONTO, "/conferencia/documentos": F.DOCUMENTOS_CONFERENCIA });
    const d2 = await carregarConfronto(b.tela, { situacao: "todas" });
    expect(d2?.situacao).toBe("todas");
    const q = b.chamadas.find((u) => u.pathname.endsWith("/confronto"))!.searchParams;
    expect(q.has("situacao") && q.get("situacao")).toBe("");
  });

  it("cursor de outro filtro (400 cursor_invalido) vira o erro em português, e a outra lista segue", async () => {
    const { tela } = telaDeTeste({ "/conferencia/confronto": () => json({ codigo: "cursor_invalido" }, 400), "/conferencia/documentos": F.DOCUMENTOS_CONFERENCIA });
    const d = await carregarConfronto(tela, { c_conf: "velho" });
    expect(d?.confronto.erro).toMatch(/paginação expirou/);
    expect(d?.documentos.dados?.decisoes).toEqual(["aceito", "recusado"]);
  });

  it("situação desconhecida na URL cai no padrão", async () => {
    const { tela } = telaDeTeste({ "/conferencia/confronto": F.CONFRONTO, "/conferencia/documentos": F.DOCUMENTOS_CONFERENCIA });
    expect((await carregarConfronto(tela, { situacao: "drop table" }))?.situacao).toBe("sem_nota");
  });
});
