import { createHash, randomBytes } from "crypto";
import { describe, expect, it, vi } from "vitest";
import {
  apiDoConnect, bytesRecebidos, depoisDaConclusao, enviarEmPartes, faixaDaParte, LIMITE_DO_ENVIO_DIRETO, modoDoEnvio, partesEsperadas, partesQueFaltam, problemaDoNome,
  TAMANHO_DA_PARTE, TETO_DO_UPLOAD, type ApiDoUpload, type Resposta, type SessaoDoEnvio, type UploadNoConnect,
} from "./envioEmPartes";
import { Sha256 } from "./sha256";

const MiB = 1024 * 1024;

describe("qual rota o lote usa (§14.6)", () => {
  it("até 25 MB (menos o envelope) vai num corpo só; acima, em partes; acima de 500 MB, recusa", () => {
    expect(modoDoEnvio([{ name: "a.zip", size: LIMITE_DO_ENVIO_DIRETO }])).toEqual({ modo: "direto" });
    expect(modoDoEnvio([{ name: "a.zip", size: LIMITE_DO_ENVIO_DIRETO + 1 }])).toEqual({ modo: "partes" });
    expect(modoDoEnvio([{ name: "a.zip", size: 20 * MiB }, { name: "b.xml", size: 10 * MiB }])).toEqual({ modo: "partes" });
    expect(modoDoEnvio([{ name: "a.zip", size: TETO_DO_UPLOAD }])).toEqual({ modo: "partes" });
    expect(modoDoEnvio([{ name: "a.zip", size: TETO_DO_UPLOAD + 1 }])).toMatchObject({ modo: "recusado", motivo: expect.stringMatching(/500 MB/) });
    expect(modoDoEnvio([{ name: "a.rar", size: 30 * MiB }])).toMatchObject({ modo: "recusado", motivo: expect.stringMatching(/\.zip/) });
  });
  it("o nome que o motor aceita numa sessão", () => {
    expect(problemaDoNome("lote-setembro.zip")).toBeNull();
    expect(problemaDoNome("NOTA.XML")).toBeNull();
    expect(problemaDoNome("")).not.toBeNull();
    expect(problemaDoNome("a/b.zip")).not.toBeNull();
    expect(problemaDoNome(`${"x".repeat(252)}.zip`)).not.toBeNull();
    expect(problemaDoNome("leia-me.txt")).not.toBeNull();
  });
});

describe("as partes (§14.4)", () => {
  it("8 MiB cada, a última com o resto; as fixtures do motor", () => {
    // upload_criar_duas_partes: 8388618 bytes → 2 partes, a 2ª com 10 bytes (erro_parte_invalida).
    expect(partesEsperadas(8_388_618)).toBe(2);
    expect(faixaDaParte(2, 8_388_618)).toEqual({ inicio: TAMANHO_DA_PARTE, fim: 8_388_618, tamanho: 10 });
    expect(partesEsperadas(9701)).toBe(1);
    expect(partesEsperadas(TETO_DO_UPLOAD)).toBe(63);
    expect(faixaDaParte(1, 9701)).toEqual({ inicio: 0, fim: 9701, tamanho: 9701 });
    expect(() => faixaDaParte(3, 8_388_618)).toThrow(RangeError);
    expect(() => faixaDaParte(0, 10)).toThrow(RangeError);
  });
  it("as que faltam e os bytes que o motor já tem", () => {
    expect(partesQueFaltam({ partes_esperadas: 4, partes_recebidas: [3, 1] })).toEqual([2, 4]);
    expect(bytesRecebidos([1, 2, 2], 8_388_618)).toBe(8_388_618);
    expect(bytesRecebidos([9], 10)).toBe(0);
  });
  it("o que fazer depois do concluir", () => {
    const f = (codigo: string | null, renovarChave = true): Resposta<unknown> => ({ ok: false, mensagem: "x", codigo, renovarChave });
    expect(depoisDaConclusao({ ok: true, mensagem: "" })).toBe("pronto");
    expect(depoisDaConclusao(f("tempo_esgotado", false))).toBe("consultar");
    expect(depoisDaConclusao(f("falha_de_rede", false))).toBe("consultar");
    expect(depoisDaConclusao(f("erro_interno", false))).toBe("consultar");
    expect(depoisDaConclusao(f("upload_em_andamento"))).toBe("consultar");
    expect(depoisDaConclusao(f("upload_incompleto"))).toBe("reenviar_faltantes");
    expect(depoisDaConclusao(f("sha256_divergente"))).toBe("reenviar_todas");
    // Pesada: motor ocupado não se repete sozinho.
    expect(depoisDaConclusao(f("motor_ocupado", false))).toBe("parar");
    expect(depoisDaConclusao(f("upload_encerrado"))).toBe("parar");
  });
});

// ─── A orquestração, contra um motor de mentira ─────────────────────────────

type Relatorio = { importacao_id: number; sha256: string };

/** Um motor em memória com o comportamento de §14.4, e falhas sob encomenda. */
function motorFalso(opcoes: { tamanhoParte?: number } = {}) {
  const tp = opcoes.tamanhoParte ?? 16;
  const partes = new Map<number, Uint8Array>();
  let upload: UploadNoConnect | null = null;
  let tamanho = 0;
  let concluido: Relatorio | null = null;
  const falhas = { parte: [] as (string | null)[], concluir: [] as (string | null)[], ver: [] as (string | null)[], corromper: new Set<number>() };
  const chamadas = { criar: 0, partes: [] as number[], concluir: 0, ver: 0 };
  const erro = (codigo: string, renovarChave = codigo !== "falha_de_rede" && codigo !== "tempo_esgotado"): Resposta<never> => ({ ok: false, mensagem: codigo, codigo, renovarChave });
  const api: ApiDoUpload<Relatorio> = {
    async criar(_nome, t) {
      chamadas.criar++;
      tamanho = t;
      upload = { id: "a".repeat(32), tamanho_parte: tp, partes_esperadas: Math.max(1, Math.ceil(t / tp)), partes_recebidas: [], estado: "aberta", importacao_id: null, expira_em: null };
      return { ok: true, mensagem: "", dados: { upload: { ...upload }, token: "tok" } };
    },
    async ver() {
      chamadas.ver++;
      const f = falhas.ver.shift();
      if (f) return erro(f);
      if (!upload) return erro("nao_encontrado");
      return { ok: true, mensagem: "", dados: { ...upload, partes_recebidas: [...partes.keys()].sort((a, b) => a - b) } };
    },
    async parte(s, n, bytes, sha) {
      chamadas.partes.push(n);
      const f = falhas.parte.shift();
      if (f) return erro(f);
      if (createHash("sha256").update(bytes).digest("hex") !== sha) return erro("parte_corrompida");
      partes.set(n, falhas.corromper.has(n) ? new Uint8Array(bytes.length) : bytes.slice());
      falhas.corromper.delete(n);
      return { ok: true, mensagem: "", dados: { partes_recebidas: [...partes.keys()] } };
    },
    async concluir(_s, sha) {
      chamadas.concluir++;
      const f = falhas.concluir.shift();
      if (concluido) return concluido.sha256 === sha ? { ok: true, mensagem: "replay", dados: concluido } : erro("upload_encerrado");
      const faltam = Array.from({ length: upload!.partes_esperadas }, (_, i) => i + 1).filter((n) => !partes.has(n));
      if (faltam.length) return { ok: false, mensagem: "faltam", codigo: "upload_incompleto", detalhe: { faltam }, renovarChave: true };
      const junto = Buffer.concat([...partes.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b));
      if (createHash("sha256").update(junto).digest("hex") !== sha) return erro("sha256_divergente");
      if (f === "motor_ocupado") return erro("motor_ocupado", false);
      concluido = { importacao_id: 206, sha256: sha };
      upload = { ...upload!, estado: "concluida", importacao_id: 206 };
      // Resposta perdida depois de concluir no motor.
      if (f) return erro(f);
      return { ok: true, mensagem: "ok", dados: concluido };
    },
  };
  return { api, falhas, chamadas, get tamanho() { return tamanho; } };
}

// `randomBytes` devolve Buffer, cujo `slice` é uma vista do pool: copia para Uint8Array antes.
const arquivo = (bytes: Uint8Array, name = "lote.zip") => { const b = Uint8Array.from(bytes); return { name, size: b.length, slice: (x: number, y: number) => ({ arrayBuffer: async () => b.slice(x, y).buffer }) }; };
const deps = (api: ApiDoUpload<Relatorio>, extra: Partial<Parameters<typeof enviarEmPartes<Relatorio>>[1]> = {}) => ({
  api,
  sha256DaParte: async (b: Uint8Array) => createHash("sha256").update(b).digest("hex"),
  novoHash: () => new Sha256(),
  esperar: vi.fn(async () => {}),
  ...extra,
});
const shaDe = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("enviar em partes", () => {
  it("cria, manda todas as partes com o SHA-256 de cada e conclui com o do arquivo inteiro", async () => {
    const m = motorFalso();
    const bytes = randomBytes(100);
    const progresso: number[] = [];
    const fim = await enviarEmPartes(arquivo(bytes), deps(m.api, { aoProgresso: (p) => progresso.push(p.enviados) }));
    expect(fim).toMatchObject({ ok: true, dados: { importacao_id: 206, sha256: shaDe(bytes) } });
    expect(m.chamadas.partes.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(Math.max(...progresso)).toBe(100);
    expect(m.chamadas.concluir).toBe(1);
  });

  it("nunca mais de `paralelas` partes em voo", async () => {
    const m = motorFalso();
    let emVoo = 0, pico = 0;
    const parte = m.api.parte;
    m.api.parte = async (...a) => { emVoo++; pico = Math.max(pico, emVoo); await new Promise((r) => setTimeout(r, 2)); try { return await parte(...a); } finally { emVoo--; } };
    await enviarEmPartes(arquivo(randomBytes(160)), deps(m.api, { paralelas: 2 }));
    expect(pico).toBe(2);
  });

  it("repete a parte em falha de rede e em parte corrompida, até o limite", async () => {
    const m = motorFalso();
    m.falhas.parte.push("falha_de_rede", "parte_corrompida");
    const d = deps(m.api, { paralelas: 1 });
    const fim = await enviarEmPartes(arquivo(randomBytes(40)), d);
    expect(fim.ok).toBe(true);
    expect(m.chamadas.partes).toEqual([1, 1, 1, 2, 3]);
    expect(d.esperar).toHaveBeenCalledTimes(2);
  });

  it("parte que não passa depois das tentativas: para, e a sessão volta para retomar", async () => {
    const m = motorFalso();
    m.falhas.parte.push("falha_de_rede", "falha_de_rede", "falha_de_rede");
    const bytes = randomBytes(40);
    const fim = await enviarEmPartes(arquivo(bytes), deps(m.api, { paralelas: 1 }));
    expect(fim).toMatchObject({ ok: false, retomavel: true, codigo: "falha_de_rede" });
    expect(m.chamadas.concluir).toBe(0);
    // Retomar: o motor diz o que tem, e só o que falta sobe.
    m.chamadas.partes = [];
    const fim2 = await enviarEmPartes(arquivo(bytes), deps(m.api), (fim as { sessao: SessaoDoEnvio }).sessao);
    expect(fim2).toMatchObject({ ok: true, dados: { sha256: shaDe(bytes) } });
    expect(m.chamadas.criar).toBe(1);
    expect(m.chamadas.partes.sort()).toEqual([1, 2, 3]);
  });

  it("retomar depois de a aba cair no meio: só as partes que faltam saem", async () => {
    const m = motorFalso();
    const bytes = randomBytes(64);
    const d = deps(m.api, { paralelas: 1 });
    let sessao: SessaoDoEnvio | null = null;
    // A "aba cai" depois da parte 2: o resto falha de vez (4xx).
    m.falhas.parte.push(null, null, "upload_desconhecido");
    const fim = await enviarEmPartes(arquivo(bytes), { ...d, aoAbrir: (s) => { sessao = s; } });
    expect(fim.ok).toBe(false);
    expect(sessao).not.toBeNull();
    m.chamadas.partes = [];
    const fim2 = await enviarEmPartes(arquivo(bytes), d, sessao);
    expect(fim2.ok).toBe(true);
    expect(m.chamadas.partes).toEqual([3, 4]);
  });

  it("resposta perdida no concluir: consulta, vê `concluida` e conclui de novo (replay), sem ingerir duas vezes", async () => {
    const m = motorFalso();
    m.falhas.concluir.push("tempo_esgotado");
    const bytes = randomBytes(30);
    const fim = await enviarEmPartes(arquivo(bytes), deps(m.api));
    expect(fim).toMatchObject({ ok: true, mensagem: "replay", dados: { importacao_id: 206 } });
    expect([m.chamadas.concluir, m.chamadas.ver]).toEqual([2, 1]);
  });

  it("a consulta também falha: segue consultando", async () => {
    const m = motorFalso();
    m.falhas.concluir.push("falha_de_rede");
    m.falhas.ver.push("falha_de_rede");
    const fim = await enviarEmPartes(arquivo(randomBytes(30)), deps(m.api));
    expect(fim.ok).toBe(true);
    expect(m.chamadas.ver).toBe(2);
  });

  it("motor ocupado no concluir: não repete sozinho; a sessão fica, e concluir de novo nem relê o arquivo", async () => {
    const m = motorFalso();
    m.falhas.concluir.push("motor_ocupado");
    const bytes = randomBytes(30);
    const fim = await enviarEmPartes(arquivo(bytes), deps(m.api));
    expect(fim).toMatchObject({ ok: false, codigo: "motor_ocupado", retomavel: true });
    expect(m.chamadas.concluir).toBe(1);
    const sessao = (fim as { sessao: SessaoDoEnvio }).sessao;
    expect(sessao.sha256).toBe(shaDe(bytes));
    const lidas: number[] = [];
    const a = arquivo(bytes);
    const fatia = a.slice;
    a.slice = (x, y) => { lidas.push(x); return fatia(x, y); };
    const fim2 = await enviarEmPartes(a, deps(m.api), sessao);
    expect(fim2.ok).toBe(true);
    expect(lidas).toEqual([]);
  });

  it("SHA-256 divergente (parte gravada errada): reenvia todas e conclui", async () => {
    const m = motorFalso();
    m.falhas.corromper.add(2);
    const bytes = randomBytes(40);
    const fim = await enviarEmPartes(arquivo(bytes), deps(m.api, { paralelas: 1 }));
    expect(fim).toMatchObject({ ok: true, dados: { sha256: shaDe(bytes) } });
    expect(m.chamadas.partes).toEqual([1, 2, 3, 1, 2, 3]);
    expect(m.chamadas.concluir).toBe(2);
  });

  it("cancelar para entre as partes e não conclui", async () => {
    const m = motorFalso();
    const ctl = new AbortController();
    const parte = m.api.parte;
    m.api.parte = async (...a) => { const r = await parte(...a); if (a[1] === 2) ctl.abort(); return r; };
    const fim = await enviarEmPartes(arquivo(randomBytes(100)), deps(m.api, { sinal: ctl.signal, paralelas: 1 }));
    expect(fim).toMatchObject({ ok: false, codigo: "cancelado", retomavel: false });
    expect(m.chamadas.partes).toEqual([1, 2]);
    expect(m.chamadas.concluir).toBe(0);
  });

  it("sessão vencida ao retomar: recomeçar", async () => {
    const m = motorFalso();
    const fim = await enviarEmPartes(arquivo(randomBytes(10)), deps(m.api), { id: "b".repeat(32), token: "t", tamanhoParte: 16, partesEsperadas: 1 });
    expect(fim).toMatchObject({ ok: false, sessao: null, retomavel: false, mensagem: expect.stringMatching(/venceu/) });
  });

  it("outro arquivo na sessão lembrada (tamanho mudou): não manda nada", async () => {
    const m = motorFalso();
    const bytes = randomBytes(40);
    const primeiro = await enviarEmPartes(arquivo(bytes), { ...deps(m.api), api: { ...m.api, concluir: async () => ({ ok: false, mensagem: "x", codigo: "motor_ocupado", renovarChave: false }) } });
    m.chamadas.partes = [];
    const fim = await enviarEmPartes(arquivo(randomBytes(80)), deps(m.api), (primeiro as { sessao: SessaoDoEnvio }).sessao);
    expect(fim).toMatchObject({ ok: false, retomavel: false });
    expect(m.chamadas.partes).toEqual([]);
  });
});

describe("a API do Connect no navegador", () => {
  it("cada chamada vai à rota do Connect com o token do dono; nada vai ao motor", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, mensagem: "", dados: {} }), { status: 200 }));
    const api = apiDoConnect("17122471", "c41:gesto-gesto-gesto", { fetch: f as never });
    const s: SessaoDoEnvio = { id: "a".repeat(32), token: "tok.assinado", tamanhoParte: 8, partesEsperadas: 1 };
    await api.criar("lote.zip", 10);
    await api.ver(s);
    await api.parte(s, 1, new Uint8Array([1, 2]), "ab".repeat(32));
    await api.concluir(s, "cd".repeat(32));
    await api.apagar(s);
    const urls = f.mock.calls.map((c) => [(c as unknown as [string, RequestInit])[1].method, (c as unknown as [string])[0]]);
    expect(urls).toEqual([
      ["POST", "/api/fiscal/sped/uploads?raiz=17122471"],
      ["GET", `/api/fiscal/sped/uploads/${s.id}?raiz=17122471`],
      ["PUT", `/api/fiscal/sped/uploads/${s.id}/partes/1?raiz=17122471`],
      ["POST", `/api/fiscal/sped/uploads/${s.id}/concluir?raiz=17122471`],
      ["DELETE", `/api/fiscal/sped/uploads/${s.id}?raiz=17122471`],
    ]);
    const [, criar] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(criar.body as string)).toEqual({ nome: "lote.zip", tamanho: 10, gesto: "c41:gesto-gesto-gesto" });
    const [, parte] = f.mock.calls[2] as unknown as [string, RequestInit];
    expect(parte.headers).toMatchObject({ "X-Upload-Token": "tok.assinado", "Content-Type": "application/octet-stream", "X-Parte-SHA256": "ab".repeat(32) });
  });
  it("falha de rede vira resposta transitória (vale repetir)", async () => {
    const api = apiDoConnect("17122471", "g", { fetch: (async () => { throw new TypeError("rede"); }) as never });
    expect(await api.criar("a.zip", 1)).toMatchObject({ ok: false, codigo: "falha_de_rede", renovarChave: false });
  });
});
