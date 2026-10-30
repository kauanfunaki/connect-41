import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { criarClienteDoMotor } = await import("@/lib/sped/motor");
const ator = { id: "fiscal-ficticia", nome: "Fiscal Fictícia", email: "fiscal@example.invalid", tenant: "escritorio-ficticio" };
const sha256 = "a".repeat(64), uploadId = "11111111222243338444555555555555";
describe("contrato HTTP do pacote remoto", () => {
  it("envia a finalidade versionada, partes binárias e pacote_id sem depender de importação legada", async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const respostas = [
      { id: uploadId, nome: "connect.json", tamanho: 2, tamanho_parte: 8388608, partes_esperadas: 1, recebido: 0, estado: "aberta", criado_por: "Fiscal Fictícia", criado_em: null, expira_em: null },
      { numero: 1, tamanho: 2, sha256, recebido: 2, partes_recebidas: [1], partes_esperadas: 1 },
      { pacote_id: "pacote-ficticio", sha256 },
      { id: 1, acao: "sped", rotulo: "Gerar arquivo fictício", empresa_id: 3, data_ini: "2026-09-01", data_fim: "2026-09-30", estado: "pendente", solicitado_em: null, agente_host: null, iniciado_em: null, concluido_em: null, batida_em: null, travada: false, pode_cancelar: true, pode_destravar: false, pacote_id: "pacote-ficticio", revisao_connect: 1, sha256_connect: sha256 },
    ];
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { chamadas.push({ url: String(url), init: init! }); return new Response(JSON.stringify(respostas.shift()), { status: 200, headers: { "Content-Type": "application/json" } }); });
    const cliente = criarClienteDoMotor({ baseUrl: "https://motor.example.invalid", token: "ficticio-leitura", tokenEscrita: "ficticio-escrita" }, { fetch: fetch as typeof globalThis.fetch, esperar: async () => undefined });
    const escrita = { ator, chave: "c41:11111111-2222-4333-8444-555555555555" };
    const upload = await cliente.criarUploadDePacote("12345678", { nome: "connect.json", tamanho: 2, sha256 }, escrita);
    expect(JSON.parse(chamadas[0].init.body as string)).toMatchObject({ finalidade: "geracao_connect_v1", sha256 });
    await cliente.enviarParteDoUpload("12345678", upload.id, 1, new Uint8Array([123, 125]), { tamanho: 2 }, escrita);
    expect(chamadas[1].init.body).toEqual(new Uint8Array([123, 125]));
    const pacote = await cliente.concluirPacote("12345678", upload.id, sha256, escrita);
    const execucao = await cliente.criarExecucao("12345678", { acao: "sped", empresa_id: 3, competencia: "2026-09", tipo_sped: "0", parametros: {}, confirmar_duplicado: false, pacote_id: pacote.pacote_id }, escrita);
    expect(execucao).toMatchObject({ pacote_id: "pacote-ficticio", revisao_connect: 1, sha256_connect: sha256 });
    expect(chamadas.every(c => c.url.includes("cnpj_raiz=12345678"))).toBe(true);
    expect((chamadas[0].init.headers as Record<string, string>).Authorization).toBe("Bearer ficticio-escrita");
    expect((chamadas[0].init.headers as Record<string, string>)["X-Connect-Ator"]).toBeTruthy();
  });
});
