import { beforeEach, describe, expect, it, vi } from "vitest";

// A marca do escritório nos e-mails ao cliente (22/10/2026).
const m = vi.hoisted(() => ({ tenant: vi.fn(), aparencia: vi.fn(), smtp: vi.fn(), enviar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ tenant: { findUnique: m.tenant }, tenantAparencia: { findUnique: m.aparencia }, tenantSmtpConfig: { findUnique: m.smtp } }),
}));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "senha-ficticia" }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: m.enviar }) } }));

import { contrastRatio, relativeLuminance } from "@/lib/color";
import { cabecalhoDoEmail, corDoBotao, logoAbsoluto, marcaDoEmailDe, rodapeDoEmail, COR_DO_CONNECT_NO_EMAIL } from "./marcaDoEmail";
import { emailShell, sendPendenciaAoClienteEmail } from "./sendMail";

const BASE = "https://connect.exemplo.com.br";
const contraste = (a: string, b: string) => contrastRatio(relativeLuminance(a)!, relativeLuminance(b)!);

describe("marcaDoEmailDe", () => {
  it("sem marca do escritório fica a do Connect", () => {
    expect(marcaDoEmailDe(null, BASE)).toBeNull();
    expect(corDoBotao(null)).toBe(COR_DO_CONNECT_NO_EMAIL);
  });
  it("logo absoluto só pela rota pública dos logos e com APP_PUBLIC_URL", () => {
    expect(logoAbsoluto("/api/workspace-logos/t1.png?v=1", `${BASE}/`)).toBe(`${BASE}/api/workspace-logos/t1.png?v=1`);
    expect(logoAbsoluto("/api/workspace-logos/t1.png", "")).toBeNull();
    expect(logoAbsoluto("/uploads/privado.png", BASE)).toBeNull();
    expect(logoAbsoluto("javascript:alert(1)", BASE)).toBeNull();
  });
  it("a cor do botão tem 4,5:1 com a letra branca, mesmo com cor clara", () => {
    const marca = marcaDoEmailDe({ nome: "Escritório Fictício", logoUrl: null, corPrincipal: "#FFE066" }, BASE)!;
    expect(marca.cor).not.toBe("#FFE066");
    expect(contraste(marca.cor!, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(corDoBotao(marca)).toBe(marca.cor);
  });
});

describe("cabeçalho do e-mail", () => {
  it("sem marca: o logo do Connect", () => {
    const html = cabecalhoDoEmail(null, BASE, "Portal do cliente");
    expect(html).toContain(`${BASE}/brand/logo-horizontal-email.png`);
    expect(html).toContain('alt="Connect"');
  });
  it("com marca: logo e nome do escritório, nome escapado", () => {
    const marca = marcaDoEmailDe({ nome: "Fulano & <Cia>", logoUrl: "/api/workspace-logos/t1.png?v=2", corPrincipal: null }, BASE)!;
    const html = cabecalhoDoEmail(marca, BASE, "Portal do cliente");
    expect(html).toContain(`src="${BASE}/api/workspace-logos/t1.png?v=2"`);
    expect(html).toContain("Fulano &amp; &lt;Cia&gt;");
    expect(html).not.toContain("logo-horizontal-email.png");
    expect(rodapeDoEmail(marca, 2026)).toContain("por Fulano &amp; &lt;Cia&gt; pelo Connect");
  });
  it("logo ligado sem endereço público: só o nome", () => {
    const marca = marcaDoEmailDe({ nome: "Escritório Fictício", logoUrl: "/api/workspace-logos/t1.png", corPrincipal: null }, "")!;
    expect(marca.logo).toBeNull();
    const html = cabecalhoDoEmail(marca, "", "Portal do cliente");
    expect(html).toContain("Escritório Fictício");
    expect(html).not.toContain("<img");
  });
  it("o casco leva filete e cor só quando há cor", () => {
    const comCor = emailShell("<p>corpo</p>", "Portal do cliente", { nome: "X", logo: null, cor: "#7A3E00" });
    expect(comCor).toContain('bgcolor="#7A3E00"');
    const semMarca = emailShell("<p>corpo</p>", "Portal do cliente");
    expect(semMarca).toContain("© ");
    expect(semMarca).not.toContain('height="4"');
  });
});

describe("aviso de pendência ao cliente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_PUBLIC_URL", BASE);
    m.smtp.mockResolvedValue({ host: "smtp", port: 587, secure: false, username: "u", passwordEnc: "x", fromName: "Escritório", fromEmail: "no@exemplo.com" });
    m.enviar.mockResolvedValue({ messageId: "1", accepted: ["a@b.c"], rejected: [] });
    m.tenant.mockImplementation(({ select }: { select: Record<string, boolean> }) =>
      Promise.resolve(select.active ? { active: true } : { name: "Contábil Fictícia", logoUrl: "/api/workspace-logos/t1.png?v=3" })
    );
  });
  const entrada = { tenantId: "t1", destinatarios: [{ email: "a@b.c", nome: "Ana" }], requestId: "r1", titulo: "Extrato", motivo: "nova" as const };

  it("usa logo, nome e cor do escritório quando a aparência está ligada", async () => {
    m.aparencia.mockResolvedValue({ corPrincipal: "#0E7C66", coresDosGrupos: null, coresPorGrupo: true, logoNoPortal: true, noConnect: false });
    await sendPendenciaAoClienteEmail(entrada);
    const html: string = m.enviar.mock.calls[0][0].html;
    expect(html).toContain(`${BASE}/api/workspace-logos/t1.png?v=3`);
    expect(html).toContain("Contábil Fictícia");
    expect(html).not.toContain("logo-horizontal-email.png");
    expect(html).not.toContain(COR_DO_CONNECT_NO_EMAIL);
  });
  it("volta à marca do Connect sem aparência", async () => {
    m.aparencia.mockResolvedValue(null);
    await sendPendenciaAoClienteEmail(entrada);
    const html: string = m.enviar.mock.calls[0][0].html;
    expect(html).toContain("logo-horizontal-email.png");
    expect(html).toContain(COR_DO_CONNECT_NO_EMAIL);
    expect(html).not.toContain("workspace-logos");
  });
  it("logo desligado: só a cor, sem o logo", async () => {
    m.aparencia.mockResolvedValue({ corPrincipal: "#0E7C66", coresDosGrupos: null, coresPorGrupo: true, logoNoPortal: false, noConnect: false });
    await sendPendenciaAoClienteEmail(entrada);
    const html: string = m.enviar.mock.calls[0][0].html;
    expect(html).not.toContain("workspace-logos");
    expect(html).not.toContain(COR_DO_CONNECT_NO_EMAIL);
  });
  it("falha na leitura da aparência não impede o e-mail", async () => {
    m.tenant.mockRejectedValue(new Error("banco fora"));
    const r = await sendPendenciaAoClienteEmail(entrada);
    expect(r.enviados).toBe(1);
    expect(m.enviar.mock.calls[0][0].html).toContain("logo-horizontal-email.png");
  });
});
