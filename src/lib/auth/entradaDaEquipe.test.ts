import { beforeAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  CAMINHO_DA_ESCOLHA_DA_EQUIPE,
  conferirEscolha,
  contasQueConferem,
  decidirEntrada,
  opcoesDoCookieDaEscolha,
  safeNext,
} from "./entradaDaEquipe";
import { HASH_DESCARTAVEL } from "./password";
import {
  signEquipeEscolha,
  signPortalEscolha,
  verifyAccess,
  verifyEquipeEscolha,
  verifyPortalAccess,
  verifyPortalEscolha,
} from "./jwt";

// Valor só de teste, para assinar tokens aqui dentro.
const CHAVE = "chave-de-teste";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = CHAVE;
});

describe("conferir a senha em todas as contas do e-mail", () => {
  it("sem conta, confere uma vez contra o hash descartável e não libera nada", async () => {
    const conferir = vi.fn().mockResolvedValue(true);
    expect(await contasQueConferem("senha", [], conferir)).toEqual([]);
    expect(conferir).toHaveBeenCalledTimes(1);
    expect(conferir).toHaveBeenCalledWith("senha", HASH_DESCARTAVEL);
  });

  it("confere todas, sem parar na primeira que bate", async () => {
    const conferir = vi.fn(async (_s: string, hash: string) => hash !== "h2");
    const contas = [
      { id: "a", passwordHash: "h1" },
      { id: "b", passwordHash: "h2" },
      { id: "c", passwordHash: "h3" },
    ];
    expect((await contasQueConferem("senha", contas, conferir)).map((c) => c.id)).toEqual(["a", "c"]);
    expect(conferir).toHaveBeenCalledTimes(3);
  });

  it("com o bcrypt de verdade: a senha de cada escritório abre só a conta dela", async () => {
    const contas = [
      { id: "conta-a", passwordHash: await bcrypt.hash("senha-do-a", 4) },
      { id: "conta-b", passwordHash: await bcrypt.hash("senha-do-b", 4) },
    ];
    expect((await contasQueConferem("senha-do-b", contas)).map((c) => c.id)).toEqual(["conta-b"]);
    expect((await contasQueConferem("senha-do-a", contas)).map((c) => c.id)).toEqual(["conta-a"]);
    expect(await contasQueConferem("outra", contas)).toEqual([]);
  });

  // O defeito que o portal tinha até 06/10: um "hash" fora do formato faz o
  // bcryptjs responder `false` na hora, e o tempo denuncia o e-mail sem conta.
  it("o hash descartável é um bcrypt válido, no custo das senhas", () => {
    expect(HASH_DESCARTAVEL).toHaveLength(60);
    expect(bcrypt.getRounds(HASH_DESCARTAVEL)).toBe(12);
  });
});

describe("decisão da entrada", () => {
  it("nenhuma conta confere → recusa", () => {
    expect(decidirEntrada([])).toEqual({ tipo: "recusar" });
  });

  it("uma conta → entra direto nela", () => {
    expect(decidirEntrada([{ id: "a" }])).toEqual({ tipo: "entrar", conta: { id: "a" } });
  });

  it("mais de uma → escolha, com todas as que conferiram", () => {
    expect(decidirEntrada([{ id: "a" }, { id: "b" }])).toEqual({ tipo: "escolher", contas: [{ id: "a" }, { id: "b" }] });
  });
});

describe("conferir a escolha do segundo passo", () => {
  const liberada = { contas: ["a", "b"], lembrar: true, next: "/fiscal" };

  it("um id do token entra, com o lembrar e o next do primeiro passo", () => {
    expect(conferirEscolha(liberada, "b")).toEqual({ ok: true, contaId: "b", lembrar: true, next: "/fiscal" });
  });

  it("um id fora do token é recusado", () => {
    expect(conferirEscolha(liberada, "c")).toEqual({ ok: false, motivo: "fora-da-lista" });
    expect(conferirEscolha(liberada, "")).toEqual({ ok: false, motivo: "fora-da-lista" });
  });

  it("sem token válido (vencido, adulterado, ausente) é escolha expirada", () => {
    expect(conferirEscolha(null, "a")).toEqual({ ok: false, motivo: "expirou" });
    expect(conferirEscolha({ contas: [], lembrar: false, next: null }, "a")).toEqual({ ok: false, motivo: "expirou" });
  });

  it("o next do token passa de novo pela regra do destino", () => {
    expect(conferirEscolha({ ...liberada, next: "//fora.com" }, "a")).toMatchObject({ ok: true, next: null });
  });
});

describe("destino depois da entrada (next)", () => {
  it("aceita caminho interno", () => {
    expect(safeNext("/home")).toBe("/home");
    expect(safeNext("/setor/fiscal?aba=2&x=1")).toBe("/setor/fiscal?aba=2&x=1");
  });

  it("recusa o que o navegador lê como outro endereço", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext("")).toBeNull();
    expect(safeNext("https://fora.com")).toBeNull();
    expect(safeNext("//fora.com")).toBeNull();
    expect(safeNext("/\\fora.com")).toBeNull();
    expect(safeNext("/\t/fora.com")).toBeNull();
    expect(safeNext("/\n/fora.com")).toBeNull();
  });
});

describe("token da escolha do escritório", () => {
  it("devolve as contas que a senha liberou, com o lembrar e o next", () => {
    const token = signEquipeEscolha({ contas: ["a", "b"], lembrar: true, next: "/home" });
    expect(verifyEquipeEscolha(token)).toEqual({ contas: ["a", "b"], lembrar: true, next: "/home" });
  });

  it("vencido não vale", () => {
    const vencido = jwt.sign(
      { kind: "equipe_escolha", contas: ["a"], lembrar: false, next: null, exp: Math.floor(Date.now() / 1000) - 10 },
      `${CHAVE}:equipe-escolha`
    );
    expect(verifyEquipeEscolha(vencido)).toBeNull();
  });

  it("adulterado não vale: trocar as contas do token quebra a assinatura", () => {
    const token = signEquipeEscolha({ contas: ["a"], lembrar: false, next: null });
    const [cabecalho, , assinatura] = token.split(".");
    const outroCorpo = Buffer.from(
      JSON.stringify({ kind: "equipe_escolha", contas: ["a", "conta-de-outra-pessoa"], lembrar: false, next: null })
    ).toString("base64url");
    expect(verifyEquipeEscolha(`${cabecalho}.${outroCorpo}.${assinatura}`)).toBeNull();
  });

  it("forjado com outra chave, sem assinatura ou lixo não vale", () => {
    expect(verifyEquipeEscolha(jwt.sign({ kind: "equipe_escolha", contas: ["a"] }, "outra-chave"))).toBeNull();
    // Com a chave pura de sessão, e não a derivada da escolha.
    expect(verifyEquipeEscolha(jwt.sign({ kind: "equipe_escolha", contas: ["a"] }, CHAVE))).toBeNull();
    const semAssinatura = jwt.sign({ kind: "equipe_escolha", contas: ["a"] }, "", { algorithm: "none" });
    expect(verifyEquipeEscolha(semAssinatura)).toBeNull();
    expect(verifyEquipeEscolha("lixo")).toBeNull();
  });

  it("não vale como sessão interna, sessão do portal nem escolha do portal", () => {
    const token = signEquipeEscolha({ contas: ["a"], lembrar: false, next: null });
    expect(() => verifyAccess(token)).toThrow();
    expect(() => verifyPortalAccess(token)).toThrow();
    expect(verifyPortalEscolha(token)).toBeNull();
  });

  it("a escolha do portal não vale como escolha da equipe", () => {
    expect(verifyEquipeEscolha(signPortalEscolha(["a"]))).toBeNull();
  });
});

describe("cookie da escolha", () => {
  it("httpOnly, restrito ao caminho da escolha e curto", () => {
    expect(opcoesDoCookieDaEscolha(300)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: CAMINHO_DA_ESCOLHA_DA_EQUIPE,
      maxAge: 300,
    });
    expect(CAMINHO_DA_ESCOLHA_DA_EQUIPE).toBe("/login/escritorio");
  });
});
