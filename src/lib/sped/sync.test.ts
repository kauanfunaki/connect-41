import { beforeEach, describe, expect, it, vi } from "vitest";

// Teste de regressão do `lastError` fantasma (2026-09-09).
//
// Depois que liberaram o IP, as 26 raízes voltaram a responder 200 — e 25 delas
// continuaram exibindo "SPED 403: Forbidden", porque o `lastError` só era limpo
// dentro do `if (resposta.cursor_retomada)`, e raiz sem documento do lado do
// SPED nunca recebe cursor. O defeito é silencioso do jeito pior: nada quebra,
// a sincronização funciona, e o estado mente sobre a última execução até alguém
// olhar o painel e desligar uma integração saudável.
//
// A regra travada aqui é: rodada que termina sem exceção limpa o erro, tenha
// vindo cursor ou não.

const spedSyncStateUpsert = vi.fn();
const spedSyncStateUpdate = vi.fn();
const companyFindMany = vi.fn();
const fiscalDocumentUpsert = vi.fn();
const fiscalDocumentUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    spedSyncState: { upsert: spedSyncStateUpsert, update: spedSyncStateUpdate },
    company: { findMany: companyFindMany },
    fiscalDocument: { upsert: fiscalDocumentUpsert, updateMany: fiscalDocumentUpdateMany },
  }),
}));

const listarDocumentos = vi.fn();

vi.mock("./client", async (original) => ({
  ...(await original<typeof import("./client")>()),
  listarDocumentos,
}));

const { sincronizarRaiz } = await import("./sync");
const { ErroDoSped } = await import("./client");

const creds = { baseUrl: "https://sped.exemplo", token: "t" };

/** Só os campos que o laço lê — o mapeamento tem teste próprio. */
function pagina(extra: Partial<{ proximo_cursor: string | null; cursor_retomada: string | null }> = {}) {
  return { documentos: [], proximo_cursor: null, cursor_retomada: null, ...extra };
}

/** Os `data` de todos os updates de estado, na ordem em que foram gravados. */
function gravacoes() {
  return spedSyncStateUpdate.mock.calls.map((c) => c[0].data);
}

describe("sincronizarRaiz — estado da última execução", () => {
  beforeEach(() => {
    spedSyncStateUpsert.mockReset().mockResolvedValue({ id: "s-1", cursorRetomada: null, watermark: null });
    spedSyncStateUpdate.mockReset().mockResolvedValue({});
    companyFindMany.mockReset().mockResolvedValue([]);
    fiscalDocumentUpsert.mockReset().mockResolvedValue({});
    fiscalDocumentUpdateMany.mockReset().mockResolvedValue({ count: 0 });
    listarDocumentos.mockReset();
  });

  it("raiz sem documento nenhum limpa o erro da falha anterior", async () => {
    // O caso exato do fantasma: nenhum documento, nenhum cursor, nada a gravar
    // — e mesmo assim a rodada foi um sucesso e precisa dizer isso.
    listarDocumentos.mockResolvedValue(pagina());

    const r = await sincronizarRaiz("t-1", "12345678", creds);

    expect(r.erro).toBeUndefined();
    const ultima = gravacoes().at(-1);
    expect(ultima).toMatchObject({ lastError: null });
    expect(ultima.lastRunAt).toBeInstanceOf(Date);
  });

  it("raiz com cursor também termina com o erro limpo", async () => {
    listarDocumentos.mockResolvedValue(pagina({ cursor_retomada: "c-96-chars" }));

    await sincronizarRaiz("t-1", "12345678", creds);

    // Duas gravações: a da página (com cursor) e a do fim da rodada. Nenhuma
    // delas pode deixar `lastError` para trás.
    expect(gravacoes().length).toBeGreaterThanOrEqual(2);
    for (const g of gravacoes()) expect(g.lastError).toBeNull();
    expect(gravacoes()[0]).toMatchObject({ cursorRetomada: "c-96-chars" });
  });

  it("falha do SPED grava a mensagem em vez de limpar", async () => {
    listarDocumentos.mockRejectedValue(new ErroDoSped(403, null, "SPED 403: Forbidden"));

    const r = await sincronizarRaiz("t-1", "12345678", creds);

    expect(r.erro).toBe("SPED 403: Forbidden");
    expect(gravacoes().at(-1)).toMatchObject({ lastError: "SPED 403: Forbidden" });
  });

  it("erro de uma rodada não sobrevive à rodada seguinte que deu certo", async () => {
    listarDocumentos.mockRejectedValueOnce(new ErroDoSped(403, null, "SPED 403: Forbidden"));
    await sincronizarRaiz("t-1", "12345678", creds);

    spedSyncStateUpdate.mockClear();
    listarDocumentos.mockResolvedValue(pagina());
    await sincronizarRaiz("t-1", "12345678", creds);

    expect(gravacoes().at(-1)).toMatchObject({ lastError: null });
  });
});
