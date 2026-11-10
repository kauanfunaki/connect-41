import { beforeEach, describe, expect, it, vi } from "vitest";

// O sim do cartão "Abrir processo" da Ceci (09/11/2026): as mesmas portas da
// abertura guiada — o setor que opera o módulo e o módulo ligado — e a
// gravação dividida com a tela, com as conferências da Ceci ligadas.

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1" as string | null, userId: "u1", role: "SECTOR_USER", sectors: ["societario"], subscriptionReadOnly: false },
  ligado: true,
  chamadas: [] as unknown[][],
  resultado: { ok: true, processoId: "p-novo" } as { ok: true; processoId: string } | { ok: false; erro: string },
}));

vi.mock("@/lib/auth/context", async () => {
  const papeis = await vi.importActual<typeof import("@/lib/auth/papeis")>("@/lib/auth/papeis");
  return { ...papeis, getAuthContext: async () => m.ctx };
});
vi.mock("@/lib/modules", () => ({ setoresDoModulo: async () => ["societario"], isModuleEnabled: async () => m.ligado }));
vi.mock("@/lib/societario/aberturaServidor", () => ({
  abrirProcessoNoServidor: async (...args: unknown[]) => {
    m.chamadas.push(args);
    return m.resultado;
  },
}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/societario/conclusaoServidor", () => ({ sincronizarProcesso: async () => {} }));
vi.mock("@/lib/email/sendMail", () => ({ sendTaxaAoClienteEmail: async () => ({ ok: true, recusados: [] }) }));
vi.mock("@/lib/societario/guias", () => ({ salvarGuia: async () => "", lerGuia: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { abrirProcessoPelaCeci } = await import("./actions");

const PROPOSTA = {
  tipoId: "tipo-1",
  empresaId: "empresa-1",
  responsavelId: "u-ana",
  titulo: "Sede nova",
  prioridade: "ALTA",
  prazo: "2026-11-20",
  jaTemos: ["i-contrato"],
  pedidoAoCliente: "Olá!",
  roteiroId: "roteiro-v3",
  resumo: { empresa: "o cartão não decide nada" },
};

beforeEach(() => {
  m.ctx = { tenantId: "t1", userId: "u1", role: "SECTOR_USER", sectors: ["societario"], subscriptionReadOnly: false };
  m.ligado = true;
  m.chamadas = [];
  m.resultado = { ok: true, processoId: "p-novo" };
});

describe("quem pode aprovar", () => {
  it("quem não é do setor que opera o módulo não abre", async () => {
    m.ctx = { ...m.ctx, sectors: ["fiscal"] };
    expect(await abrirProcessoPelaCeci(PROPOSTA)).toEqual({ error: "Sem permissão no Societário" });
    expect(m.chamadas).toEqual([]);
  });

  it("a diretoria (só leitura) não abre", async () => {
    m.ctx = { ...m.ctx, role: "READONLY", sectors: [] };
    expect(await abrirProcessoPelaCeci(PROPOSTA)).toEqual({ error: "Sem permissão no Societário" });
  });

  it("com o módulo desligado, não abre — como a tela, que nem aparece", async () => {
    m.ligado = false;
    expect(await abrirProcessoPelaCeci(PROPOSTA)).toEqual({ error: expect.stringMatching(/desligados/) });
    expect(m.chamadas).toEqual([]);
  });

  it("sem sessão, não abre", async () => {
    m.ctx = { ...m.ctx, tenantId: null };
    expect(await abrirProcessoPelaCeci(PROPOSTA)).toEqual({ error: "Não autenticado" });
  });
});

describe("o que vai para a gravação", () => {
  it("os campos da proposta, no tenant da sessão, com as conferências da Ceci", async () => {
    expect(await abrirProcessoPelaCeci({ ...PROPOSTA, tenantId: "OUTRO" })).toEqual({ processoId: "p-novo" });
    expect(m.chamadas).toEqual([
      [
        { tenantId: "t1", userId: "u1" },
        {
          empresaId: "empresa-1",
          tipoId: "tipo-1",
          campos: { titulo: "Sede nova", responsavelId: "u-ana", prioridade: "ALTA", prazoCombinado: "2026-11-20" },
          aceitarQuemAbre: false,
          jaTemos: ["i-contrato"],
          pedidoAoCliente: "Olá!",
          origem: { tipo: "ceci", roteiroId: "roteiro-v3" },
        },
      ],
    ]);
  });

  it("pedido vazio não manda nada ao cliente", async () => {
    await abrirProcessoPelaCeci({ ...PROPOSTA, pedidoAoCliente: "  " });
    expect((m.chamadas[0]![1] as { pedidoAoCliente: unknown }).pedidoAoCliente).toBeNull();
  });

  it("proposta torta não chega a gravar", async () => {
    expect(await abrirProcessoPelaCeci({ ...PROPOSTA, empresaId: "" })).toEqual({ error: "A proposta ficou incompleta. Peça à Ceci para montar de novo." });
    expect(await abrirProcessoPelaCeci(null)).toEqual({ error: "A proposta ficou incompleta. Peça à Ceci para montar de novo." });
    expect(m.chamadas).toEqual([]);
  });

  it("a recusa da gravação volta para o cartão", async () => {
    m.resultado = { ok: false, erro: "O roteiro mudou." };
    expect(await abrirProcessoPelaCeci(PROPOSTA)).toEqual({ error: "O roteiro mudou." });
  });
});
