import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
vi.mock("server-only", () => ({}));
const { MAXIMO_DE_PARTES, TAMANHO_DA_PARTE, abrirGerado, apagarPartes, caminhoDoGerado, gravarParte, juntarPartes, pastaDasPartes } = await import("./gerados");

// O TXT que o agente do motor devolve em partes (06/11/2026): a junção confere
// tamanho e SHA-256 e nunca troca o destino com um arquivo que não confere.

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
// "AÇÃO|é" em ISO-8859-1: bytes que não são UTF-8 válido. Decodificar no caminho os mudaria.
const BYTES = new Uint8Array([0x7c, 0x41, 0xc7, 0xc3, 0x4f, 0x7c, 0xe9, 0x0d, 0x0a]);
const T = "tenant-1", TAREFA = "0b6f3c1e-8d2a-4c6b-9f1e-2a3b4c5d6e7f", REVISAO = "11111111-2222-4333-8444-555555555555";
let raiz = "";

beforeEach(async () => { raiz = await mkdtemp(path.join(tmpdir(), "sped-gerados-")); });
afterEach(async () => { await rm(raiz, { recursive: true, force: true }); });

const parte = (numero: number, bytes: Uint8Array, tentativa = 1) => gravarParte({ tenantId: T, tarefaId: TAREFA, tentativa, numero, bytes, sha256: sha(bytes) }, raiz);
const juntar = (partes: number, tamanho: number, hash: string, tentativa = 1) => juntarPartes({ tenantId: T, tarefaId: TAREFA, tentativa, partes, tamanho, sha256: hash, destino: caminhoDoGerado(T, REVISAO) }, raiz);

describe("gravarParte", () => {
  it("repetir os mesmos bytes é seguro; outros bytes na mesma parte são conflito", async () => {
    expect(await parte(1, BYTES)).toMatchObject({ numero: 1, tamanho: BYTES.length, repetida: false });
    expect(await parte(1, BYTES)).toMatchObject({ repetida: true });
    await expect(parte(1, new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ status: 409 });
  });

  it("recusa hash que não confere, parte vazia, grande demais ou fora da numeração", async () => {
    await expect(gravarParte({ tenantId: T, tarefaId: TAREFA, tentativa: 1, numero: 1, bytes: BYTES, sha256: "0".repeat(64) }, raiz)).rejects.toMatchObject({ status: 422 });
    await expect(parte(1, new Uint8Array())).rejects.toMatchObject({ status: 413 });
    await expect(parte(1, new Uint8Array(TAMANHO_DA_PARTE + 1))).rejects.toMatchObject({ status: 413 });
    await expect(parte(0, BYTES)).rejects.toMatchObject({ status: 400 });
    await expect(parte(MAXIMO_DE_PARTES + 1, BYTES)).rejects.toMatchObject({ status: 400 });
  });

  it("não deixa escapar da pasta do escritório", () => {
    expect(() => pastaDasPartes("../outro", TAREFA, 1)).toThrow();
    expect(() => caminhoDoGerado(T, "../../segredo")).toThrow();
  });
});

describe("juntarPartes", () => {
  it("junta em ordem, confere e preserva os bytes exatos", async () => {
    const a = BYTES.subarray(0, 4), b = BYTES.subarray(4);
    await parte(2, b); await parte(1, a);
    expect(await juntar(2, BYTES.length, sha(BYTES))).toEqual({ tamanho: BYTES.length });
    expect(new Uint8Array(await readFile(path.join(raiz, caminhoDoGerado(T, REVISAO))))).toEqual(BYTES);
    const aberto = await abrirGerado(caminhoDoGerado(T, REVISAO), raiz);
    expect(aberto?.tamanho).toBe(BYTES.length);
    expect(new Uint8Array(await new Response(aberto!.corpo).arrayBuffer())).toEqual(BYTES);
  });

  it("parte faltando ou sobrando: recusa sem criar o arquivo", async () => {
    await parte(1, BYTES.subarray(0, 4));
    await expect(juntar(2, BYTES.length, sha(BYTES))).rejects.toMatchObject({ status: 409 });
    await parte(2, BYTES.subarray(4)); await parte(3, BYTES.subarray(0, 1));
    await expect(juntar(2, BYTES.length, sha(BYTES))).rejects.toMatchObject({ status: 409 });
    expect(await abrirGerado(caminhoDoGerado(T, REVISAO), raiz)).toBeNull();
  });

  it("tamanho ou hash que não conferem: recusa e não deixa arquivo pela metade", async () => {
    await parte(1, BYTES);
    await expect(juntar(1, BYTES.length + 1, sha(BYTES))).rejects.toMatchObject({ status: 422 });
    await expect(juntar(1, BYTES.length, "a".repeat(64))).rejects.toMatchObject({ status: 422 });
    expect(await abrirGerado(caminhoDoGerado(T, REVISAO), raiz)).toBeNull();
    expect((await readdir(path.join(raiz, T, "gerados"))).filter((n) => n.endsWith(".montando"))).toEqual([]);
  });

  it("cada tentativa tem as próprias partes, e apagar a tarefa leva todas", async () => {
    await parte(1, BYTES, 1);
    await parte(1, new Uint8Array([9, 9]), 2);
    await expect(juntar(1, BYTES.length, sha(BYTES), 2)).rejects.toMatchObject({ status: 422 });
    expect(await juntar(1, BYTES.length, sha(BYTES), 1)).toEqual({ tamanho: BYTES.length });
    await apagarPartes(T, TAREFA, undefined, raiz);
    await expect(stat(path.join(raiz, pastaDasPartes(T, TAREFA)))).rejects.toMatchObject({ code: "ENOENT" });
    await apagarPartes(T, TAREFA, 1, raiz);
  });
});
