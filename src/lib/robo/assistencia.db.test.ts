import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import type { CredencialAutenticadaOps } from "@/lib/ops/servidor";

// A sessão assistida do robô (06/11/2026) no MySQL descartável do laboratório
// (porta 33381), com dados fictícios. Roda pelo lançador:
//   node scripts/local/sped-fiscal-qa.mjs npx vitest run src/lib/robo/assistencia.db.test.ts
vi.mock("server-only", () => ({}));
// O push do celular não sai do laboratório.
vi.mock("@/lib/webPush", () => ({ sendWebPushToUser: vi.fn(async () => {}) }));

const url = process.env.SPED_FISCAL_TEST_DATABASE_URL;
const habilitado = !!url;
if (url) {
  const u = new URL(url);
  if (u.hostname !== "127.0.0.1" || u.port !== "33381" || u.pathname !== "/connect41") throw new Error("Este teste exige o banco descartável na porta 33381.");
  process.env.DATABASE_URL = url;
}
const { getPrisma } = await import("@/lib/prisma");
const { abrirAssistencia, receberQuadro, encerrarAssistencia, lerAssistencia, cliqueDaPessoa, TIPO_DO_AVISO } = await import("./assistenciaServidor");

const SLUG = "robo-assistencia-qa";
const d = { tenantId: "", quemPediu: "", colega: "", companyId: "" };
let w: CredencialAutenticadaOps;
let ctx: AuthContext;
// Sexta 06/11/2026, 11h de Brasília: dentro do horário comercial.
const T0 = new Date("2026-11-06T14:00:00Z");
const mais = (ms: number) => new Date(T0.getTime() + ms);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

async function novaTarefa(): Promise<string> {
  const t = await getPrisma().robotTask.create({
    data: { tenantId: d.tenantId, kind: "imprimir_alvara", companyId: d.companyId, payload: "{}", status: "EM_EXECUCAO", attempts: 1, machineSlug: SLUG, claimedAt: T0, requestedById: d.quemPediu },
  });
  return t.id;
}

describe.skipIf(!habilitado)("sessão assistida do robô, com MySQL descartável real", () => {
  beforeAll(async () => {
    const db = getPrisma();
    const tenant = await db.tenant.upsert({ where: { slug: "robo-assistencia-qa" }, create: { name: "Robô assistido QA", slug: "robo-assistencia-qa" }, update: {} });
    const pessoa = async (email: string, name: string) =>
      db.user.upsert({ where: { tenantId_email: { tenantId: tenant.id, email } }, create: { tenantId: tenant.id, email, name, passwordHash: "x", role: "SECTOR_USER" }, update: {} });
    const quemPediu = await pessoa("pediu.qa@example.invalid", "Quem Pediu Fictícia");
    const colega = await pessoa("colega.qa@example.invalid", "Colega Fictícia");
    await db.sector.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "societario" } }, create: { tenantId: tenant.id, code: "societario", label: "Societário" }, update: {} });
    for (const u of [quemPediu, colega]) await db.userSector.upsert({ where: { userId_sectorCode: { userId: u.id, sectorCode: "societario" } }, create: { userId: u.id, sectorCode: "societario" }, update: {} });
    const empresa = (await db.company.findFirst({ where: { tenantId: tenant.id, cnpj: "11222333000181" } })) ?? (await db.company.create({ data: { tenantId: tenant.id, cnpj: "11222333000181", name: "EMPRESA FICTÍCIA DO ALVARÁ" } }));
    await db.opsWatcher.upsert({ where: { tenantId_slug: { tenantId: tenant.id, slug: SLUG } }, create: { tenantId: tenant.id, slug: SLUG, name: "Robô fictício" }, update: { lastHeartbeatAt: null } });
    Object.assign(d, { tenantId: tenant.id, quemPediu: quemPediu.id, colega: colega.id, companyId: empresa.id });
    w = { tenantId: tenant.id, slug: SLUG, tokenHash: "x".repeat(64), compartilhado: false };
    ctx = { tenantId: tenant.id, userId: colega.id, homeTenantId: tenant.id, role: "SECTOR_USER", sectors: ["societario"], subscriptionReadOnly: false, canSelfRegularizeSubscription: false, activeSector: null } as unknown as AuthContext;
  }, 30000);

  afterAll(async () => {
    if (!habilitado) return;
    const db = getPrisma();
    await db.robotAssist.deleteMany({ where: { tenantId: d.tenantId } });
    await db.notification.deleteMany({ where: { tenantId: d.tenantId } });
    await db.robotTask.deleteMany({ where: { tenantId: d.tenantId } });
    await db.$disconnect();
  });

  it("fora do horário comercial: não espera, e nada é aberto", async () => {
    const id = await novaTarefa();
    const sabado = new Date("2026-11-07T15:00:00Z");
    expect(await abrirAssistencia(w, id, "captcha", sabado)).toEqual({ aguardar: false, motivo: "fora_do_horario" });
    expect(await getPrisma().robotAssist.count({ where: { taskId: id } })).toBe(0);
  });

  it("do pedido de ajuda ao resolvido: aviso, tela, escalada, clique e quem resolveu", async () => {
    const db = getPrisma();
    const id = await novaTarefa();

    // Abre: prazo de 10 min, aviso para quem pediu, sinal de vida da máquina.
    const aberta = await abrirAssistencia(w, id, "captcha", T0);
    expect(aberta).toEqual({ aguardar: true, prazoMs: 600_000, ate: mais(600_000).toISOString() });
    expect(await abrirAssistencia(w, id, "captcha", mais(5_000))).toMatchObject({ aguardar: true, ate: mais(600_000).toISOString() });
    expect(await db.robotAssist.count({ where: { taskId: id } })).toBe(1);
    const avisos = await db.notification.findMany({ where: { tenantId: d.tenantId, type: TIPO_DO_AVISO, entityId: id } });
    expect(avisos.map((a) => a.userId)).toEqual([d.quemPediu]);
    expect(avisos[0].message).toContain("EMPRESA FICTÍCIA DO ALVARÁ");
    expect((await db.opsWatcher.findUnique({ where: { tenantId_slug: { tenantId: d.tenantId, slug: SLUG } } }))?.lastHeartbeatAt).toEqual(T0);

    // Antes da primeira tela: esperando, e o clique é recusado.
    expect((await lerAssistencia(ctx, id, 0, mais(10_000)))?.estado).toBe("aguardando_tela");
    expect(await cliqueDaPessoa(ctx, id, { x: 0.5, y: 0.5 }, mais(10_000))).toEqual({ ok: false, erro: "A tela do robô ainda não chegou." });

    // A tela chega: ao vivo, com o quadro.
    expect(await receberQuadro(w, id, JPEG, "image/jpeg", mais(30_000))).toEqual({ encerrar: false, cliques: [] });
    const aoVivo = await lerAssistencia(ctx, id, 0, mais(31_000));
    expect(aoVivo?.estado).toBe("ao_vivo");
    expect(aoVivo?.quadro?.dataUrl).toBe(`data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`);
    expect((await lerAssistencia(ctx, id, aoVivo!.quadro!.em, mais(31_000)))?.quadro).toBeNull();

    // 2 min sem clique: o setor é chamado, uma vez só.
    await receberQuadro(w, id, JPEG, "image/jpeg", mais(121_000));
    await receberQuadro(w, id, JPEG, "image/jpeg", mais(122_000));
    const doSetor = await db.notification.findMany({ where: { tenantId: d.tenantId, type: TIPO_DO_AVISO, entityId: id, message: { startsWith: "Ninguém respondeu" } } });
    expect(doSetor.map((n) => n.userId).sort()).toEqual([d.quemPediu, d.colega].sort());
    expect((await db.robotAssist.findFirst({ where: { taskId: id } }))?.escalatedAt).toEqual(mais(121_000));

    // A colega clica; o robô leva o clique com o próximo quadro, uma vez.
    expect(await cliqueDaPessoa(ctx, id, { x: 0.25, y: 0.75 }, mais(130_000))).toEqual({ ok: true });
    expect(await receberQuadro(w, id, JPEG, "image/jpeg", mais(131_000))).toEqual({ encerrar: false, cliques: [{ x: 0.25, y: 0.75 }] });
    expect((await receberQuadro(w, id, JPEG, "image/jpeg", mais(132_000))).cliques).toEqual([]);

    // Resolvido: a sessão fecha, a auditoria diz quem resolveu, e a máquina para de mandar.
    expect(await encerrarAssistencia(w, id, "resolvido", mais(140_000))).toEqual({ ok: true });
    const fechada = await db.robotAssist.findFirst({ where: { taskId: id } });
    expect(fechada).toMatchObject({ outcome: "resolvido", clicks: 1, lastClickById: d.colega });
    const auditoria = await db.auditLog.findFirst({ where: { tenantId: d.tenantId, entityId: id, action: "societario.robo.assistencia_resolvida" } });
    expect(auditoria?.userId).toBe(d.colega);
    expect((await lerAssistencia(ctx, id, 0, mais(141_000)))).toMatchObject({ estado: "resolvida", quadro: null });
    expect(await receberQuadro(w, id, JPEG, "image/jpeg", mais(142_000))).toEqual({ encerrar: true, cliques: [] });
    expect(await cliqueDaPessoa(ctx, id, { x: 0.5, y: 0.5 }, mais(143_000))).toEqual({ ok: false, erro: "A sessão já terminou." });
  });

  it("passado o prazo, a resposta manda o robô parar", async () => {
    const id = await novaTarefa();
    await abrirAssistencia(w, id, "captcha", T0);
    expect(await receberQuadro(w, id, JPEG, "image/jpeg", mais(11 * 60_000))).toEqual({ encerrar: true, cliques: [] });
    expect((await lerAssistencia(ctx, id, 0, mais(11 * 60_000)))?.estado).toBe("expirada");
  });

  it("só a máquina que está com a tarefa; outro escritório não enxerga", async () => {
    const id = await novaTarefa();
    await expect(abrirAssistencia({ ...w, slug: "outra-maquina" }, id, "captcha", T0)).rejects.toMatchObject({ status: 409 });
    await expect(receberQuadro({ ...w, tenantId: "outro-escritorio" }, id, JPEG, "image/jpeg", T0)).rejects.toMatchObject({ status: 409 });
    expect(await lerAssistencia({ ...ctx, tenantId: "outro-escritorio" } as AuthContext, id, 0, T0)).toBeNull();
  });
});
