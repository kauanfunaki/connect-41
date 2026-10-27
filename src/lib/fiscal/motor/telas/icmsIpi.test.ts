import { beforeEach, describe, expect, it, vi } from "vitest";
import * as F from "@/lib/sped/telasDoMotor.fixtures";

vi.mock("server-only", () => ({}));
const { arquivoDaCompetencia, carregarApuracao, carregarDcipDime, carregarDemonstrativo, carregarSaldos, cfopDaUrl, limparCacheDasTabelas, tabelasDeIcms } = await import("./icmsIpi");
const { telaDeTeste, json, ESTAB_SC } = await import("./telaDeTeste");

const ARQUIVO = (id: number, over: Record<string, unknown> = {}) => ({
  id, obrigacao: "icms_ipi", cnpj: "17122471001147", empresa_id: 3, competencia: "2026-09", data_ini: "2026-09-01", data_fim: "2026-09-30",
  versao: id - 300, considerado: false, superado_por: null, gerado_em: "2026-10-01T00:00:00+00:00", qtd_linhas: 10, tamanho_bytes: 100, retificadora: false,
  qtd_cte: 1, qtd_nfe: 1, qtd_erros_cte: 0, nome_arquivo: `icms_v${id - 300}.txt`, execucao_id: null,
  validacao: { estado: "nao_validado" }, entrega: { estado: "nao_registrada" }, decisao_ate: null, defasado: false, defasado_fonte: null, decisoes_posteriores: null, ...over,
});

beforeEach(() => limparCacheDasTabelas());

describe("escolha do arquivo (§11.2)", () => {
  it("pede a lista do estabelecimento e da competência e escolhe o considerado; aceita outra versão da mesma lista", async () => {
    const lista = { itens: [ARQUIVO(305), ARQUIVO(304, { considerado: true }), ARQUIVO(399, { cnpj: "17122471000500" })], proximo_cursor: null };
    const { tela, chamadas } = telaDeTeste({ "/arquivos": lista });
    const r = await arquivoDaCompetencia(tela, {});
    expect(r.dados?.escolhido?.id).toBe(304);
    expect(r.dados?.versoes.map((v) => v.id)).toEqual([305, 304]);
    const q = chamadas[0].searchParams;
    expect([q.get("obrigacao"), q.get("cnpj"), q.get("competencia")]).toEqual(["icms_ipi", "17122471001147", "2026-09"]);
    expect((await arquivoDaCompetencia(telaDeTeste({ "/arquivos": lista }).tela, { arquivo: "305" })).dados?.escolhido?.id).toBe(305);
    // Id de outro estabelecimento na URL não vale: volta ao considerado.
    expect((await arquivoDaCompetencia(telaDeTeste({ "/arquivos": lista }).tela, { arquivo: "399" })).dados?.escolhido?.id).toBe(304);
  });

  it("sem arquivo, escolhido é null; sem estabelecimento ou sem módulo, não chama", async () => {
    expect((await arquivoDaCompetencia(telaDeTeste({ "/arquivos": { itens: [], proximo_cursor: null } }).tela, {})).dados?.escolhido).toBeNull();
    const a = telaDeTeste({}, { estabelecimento: null });
    expect((await arquivoDaCompetencia(a.tela, {})).erro).toMatch(/estabelecimento/);
    const b = telaDeTeste({}, { modulos: ["fiscal_acervo"] });
    expect((await arquivoDaCompetencia(b.tela, {})).erro).toMatch(/acesso/);
    expect(await carregarApuracao(b.tela, ARQUIVO(304) as never, {})).toBeNull();
    expect((await carregarDemonstrativo(b.tela, ARQUIVO(304) as never)).erro).toMatch(/acesso/);
    expect(a.fetch).not.toHaveBeenCalled();
    expect(b.fetch).not.toHaveBeenCalled();
  });
});

describe("apuração e documentos do CFOP", () => {
  it("sem clique, só a apuração; com clique, os documentos depois dela, com limite 2000", async () => {
    const a = telaDeTeste({ "/arquivos/304/apuracao": F.APURACAO });
    const r = await carregarApuracao(a.tela, ARQUIVO(304) as never, {});
    expect(r?.apuracao.dados?.cfop.saidas_cte).toHaveLength(1);
    expect(r?.documentos).toBeNull();
    expect(a.chamadas).toHaveLength(1);

    const b = telaDeTeste({ "/arquivos/304/apuracao": F.APURACAO, "/arquivos/304/apuracao/documentos": F.DOCUMENTOS_DO_CFOP });
    const r2 = await carregarApuracao(b.tela, ARQUIVO(304) as never, { grupo: "saidas_cte", cfop: "6352", cst: "000", aliquota: "12.0000" });
    expect(r2?.documentos?.dados?.total).toBe(1);
    expect(b.chamadas.map((u) => u.pathname)).toEqual(["/api/connect/v1/arquivos/304/apuracao", "/api/connect/v1/arquivos/304/apuracao/documentos"]);
    expect(b.chamadas[1].searchParams.get("limite")).toBe("2000");
  });

  it("motor ocupado na apuração: estado de erro com o código e o Retry-After, sem os documentos e sem repetir", async () => {
    const { tela, chamadas } = telaDeTeste({ "/arquivos/304/apuracao": () => json({ codigo: "motor_ocupado", erro: "x" }, 503, { "Retry-After": "5" }) });
    const r = await carregarApuracao(tela, ARQUIVO(304) as never, { grupo: "saidas_cte", cfop: "6352" });
    expect(r?.apuracao.erro).toMatch(/ocupado/);
    expect(r?.apuracao.erro !== null && [r?.apuracao.codigo, r?.apuracao.retryAfter, r?.apuracao.status]).toEqual(["motor_ocupado", 5, 503]);
    expect(r?.documentos).toBeNull();
    expect(chamadas).toHaveLength(1);
  });

  it("422 obrigacao_incompativel chega como situação, com status", async () => {
    const { tela } = telaDeTeste({ "/arquivos/304/demonstrativo": () => json({ codigo: "obrigacao_incompativel" }, 422) });
    const r = await carregarDemonstrativo(tela, ARQUIVO(304) as never);
    expect(r.erro !== null && [r.codigo, r.status]).toEqual(["obrigacao_incompativel", 422]);
  });

  it("o CFOP da URL é conferido", () => {
    expect(cfopDaUrl({ grupo: "entradas", cfop: "1102", cst: "000", aliquota: "12.0000" })).toEqual({ grupo: "entradas", cfop: "1102", cst: "000", aliquota: "12.0000" });
    expect(cfopDaUrl({ grupo: "outro", cfop: "1102" })).toBeNull();
    expect(cfopDaUrl({ grupo: "entradas", cfop: "11;02" })).toBeNull();
    expect(cfopDaUrl({ grupo: "entradas", cfop: "1102", aliquota: "x" })?.aliquota).toBeNull();
  });
});

describe("saldos, DCIP/DIME e tabelas", () => {
  it("saldos por empresa_id do estabelecimento", async () => {
    const { tela, chamadas } = telaDeTeste({ "/saldos-icms": F.SALDOS });
    expect((await carregarSaldos(tela)).dados).toHaveLength(1);
    expect(chamadas[0].searchParams.get("empresa_id")).toBe("3");
  });

  it("DCIP/DIME: fora de SC nem chama a rota e mostra uf_nao_suportada; em SC, lê", async () => {
    const sp = telaDeTeste({ "/tabelas/icms": F.TABELAS_ICMS });
    const r = await carregarDcipDime(sp.tela);
    expect(r?.dcip.erro !== null && r?.dcip.codigo).toBe("uf_nao_suportada");
    expect(sp.chamadas.map((u) => u.pathname)).toEqual(["/api/connect/v1/tabelas/icms"]);
    const sc = telaDeTeste({ "/tabelas/icms": F.TABELAS_ICMS, "/dcip-dime": F.DCIP_DIME }, { estabelecimento: ESTAB_SC });
    const r2 = await carregarDcipDime(sc.tela);
    expect(r2?.dcip.dados?.resumo.quadro_46_ids).toEqual([55]);
    expect(sc.chamadas.find((u) => u.pathname.endsWith("/dcip-dime"))!.searchParams.get("empresa_id")).toBe("5");
  });

  it("as tabelas ficam em cache por 1 hora", async () => {
    const { tela, chamadas } = telaDeTeste({ "/tabelas/icms": F.TABELAS_ICMS });
    await tabelasDeIcms(tela, 0);
    await tabelasDeIcms(tela, 59 * 60 * 1000);
    expect(chamadas).toHaveLength(1);
    await tabelasDeIcms(tela, 61 * 60 * 1000);
    expect(chamadas).toHaveLength(2);
  });
});
