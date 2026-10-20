import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  AREAS,
  localDaRota,
  menuDasConfiguracoes,
  podeAbrirInicio,
  trilhaDasConfiguracoes,
  type QuemConfigura,
} from "./areas";

const SUPER: QuemConfigura = { role: "SUPER_ADMIN", setores: 0, autoatendimento: false };
const ADMIN: QuemConfigura = { role: "ADMIN", setores: 0, autoatendimento: false };
const ADMIN_AUTO: QuemConfigura = { role: "ADMIN", setores: 0, autoatendimento: true };
const GESTOR: QuemConfigura = { role: "SECTOR_ADMIN", setores: 2, autoatendimento: false };
const GESTOR_SEM_SETOR: QuemConfigura = { role: "SECTOR_ADMIN", setores: 0, autoatendimento: false };
const COLABORADOR: QuemConfigura = { role: "SECTOR_USER", setores: 1, autoatendimento: false };
const LEITURA: QuemConfigura = { role: "READONLY", setores: 0, autoatendimento: false };

/** O menu como uma lista "área: tela, tela" — fácil de ler quando o teste falha. */
function telasDoMenu(quem: QuemConfigura): Record<string, string[]> {
  const menu = menuDasConfiguracoes(quem);
  if (!menu) return {};
  return Object.fromEntries(menu.areas.map((a) => [a.rotulo, a.telas.map((t) => t.rotulo)]));
}

describe("menu das configurações por papel", () => {
  it("Super Admin vê as seis áreas e Clientes e planos, sem Minha assinatura", () => {
    const menu = telasDoMenu(SUPER);
    expect(Object.keys(menu)).toEqual([
      "Escritório e assinatura",
      "Pessoas e acessos",
      "Setores e módulos",
      "Portal do cliente",
      "Rotinas e cálculos",
      "Integrações e IA",
      "Clientes e planos",
    ]);
    expect(menu["Escritório e assinatura"]).toEqual(["Dados e e-mail de envio", "Horário da Agenda"]);
    expect(menu["Clientes e planos"]).toEqual(["Workspaces", "Assinaturas", "Planos", "Auditoria"]);
    expect(menuDasConfiguracoes(SUPER)?.inicio).toBe(true);
  });

  it("Administrador vê as seis áreas, sem Clientes e planos; Minha assinatura só em autoatendimento", () => {
    expect(Object.keys(telasDoMenu(ADMIN))).not.toContain("Clientes e planos");
    expect(Object.keys(telasDoMenu(ADMIN))).toHaveLength(6);
    expect(telasDoMenu(ADMIN)["Escritório e assinatura"]).not.toContain("Minha assinatura");
    expect(telasDoMenu(ADMIN_AUTO)["Escritório e assinatura"]).toContain("Minha assinatura");
    expect(telasDoMenu(ADMIN)["Rotinas e cálculos"]).toEqual([
      "Obrigações recorrentes",
      "Feriados",
      "Plano de contas",
      "Cálculo de rescisão",
      "Chamados internos",
    ]);
    // Competências saiu daqui em 20/10/2026: é uma aba de Avaliações de
    // desempenho, de quem gere o módulo (escolha 8A).
    // Os 19 cartões do administrador em autoatendimento (levantamento de 14/10),
    // mais o Portal em duas telas (Acessos e Telas liberadas) e o atalho do
    // Horário da Agenda, que é um trecho da tela Empresa — menos Competências,
    // que foi para Avaliações de desempenho; Módulos, que virou parte de
    // Setores e módulos; e Atendentes e vínculos, que foi para o painel do
    // usuário e para o Chatwoot em Integrações (8A, 4A e 3A, 20/10). Inclui
    // também o catálogo de Chamados internos.
    const total = Object.values(telasDoMenu(ADMIN_AUTO)).flat().length;
    expect(total).toBe(19 + 1 + 1 - 3 + 1);
    expect(telasDoMenu(ADMIN)["Setores e módulos"]).toEqual(["Setores e módulos", "Campos customizados", "Tags"]);
  });

  it("gestor de setor vê só o que abre hoje: campos, tags e integrações — sem Plano de contas (dava 404)", () => {
    expect(telasDoMenu(GESTOR)).toEqual({
      "Setores e módulos": ["Campos customizados", "Tags"],
      "Integrações e IA": ["Integrações"],
    });
    expect(menuDasConfiguracoes(GESTOR)?.inicio).toBe(true);
  });

  it("o cartão de Integrações do gestor fala só das reuniões; o do administrador, de tudo que a tela tem", () => {
    const doGestor = menuDasConfiguracoes(GESTOR)!.areas.flatMap((a) => a.telas).find((t) => t.chave === "integracoes")!;
    const doAdmin = menuDasConfiguracoes(ADMIN)!.areas.flatMap((a) => a.telas).find((t) => t.chave === "integracoes")!;
    expect(doGestor.descricao).toMatch(/reuni/);
    expect(doGestor.descricao).not.toMatch(/Serpro/);
    for (const nome of ["Serpro", "Omie", "Chatwoot", "IA", "reuniões"]) expect(doAdmin.descricao).toContain(nome);
  });

  it("gestor sem setor só tem Integrações e não abre o início", () => {
    expect(telasDoMenu(GESTOR_SEM_SETOR)).toEqual({ "Integrações e IA": ["Integrações"] });
    expect(menuDasConfiguracoes(GESTOR_SEM_SETOR)?.inicio).toBe(false);
    expect(podeAbrirInicio(GESTOR_SEM_SETOR)).toBe(false);
  });

  it("colaborador e Somente leitura ficam sem menu — só a própria conta", () => {
    expect(menuDasConfiguracoes(COLABORADOR)).toBeNull();
    expect(menuDasConfiguracoes(LEITURA)).toBeNull();
    expect(podeAbrirInicio(COLABORADOR)).toBe(false);
  });
});

// ─── Toda tela de /admin tem área ────────────────────────────────────────────

const APP = path.join(process.cwd(), "src", "app", "(app)");

/** As rotas de página debaixo de um diretório, com `[id]` trocado por um valor. */
function rotasDasPaginas(dir: string, base: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) {
      // Grupo de rota "(x)" não entra no endereço; "[id]" vira um valor qualquer.
      const segmento = nome.startsWith("(") ? "" : nome.startsWith("[") ? "x1" : nome;
      rotasDasPaginas(p, segmento ? `${base}/${segmento}` : base, out);
    } else if (nome === "page.tsx") out.push(base);
  }
  return out;
}

describe("toda tela de configuração cai numa área", () => {
  const rotas = rotasDasPaginas(path.join(APP, "admin"), "/admin");

  it("a varredura acha as telas de /admin", () => {
    expect(rotas).toContain("/admin");
    expect(rotas).toContain("/admin/usuarios/x1/editar");
    expect(rotas.length).toBeGreaterThan(30);
  });

  it("cada página de /admin (fora o início) tem área — tela nova sem área quebra este teste", () => {
    const semArea = rotas.filter((r) => r !== "/admin" && !localDaRota(r));
    expect(semArea).toEqual([]);
  });

  it("cada tela do catálogo existe de verdade", () => {
    const rotasDoCatalogo = AREAS.flatMap((a) => a.telas).flatMap((t) => (t.rota ? [t.rota] : []));
    const faltando = rotasDoCatalogo.filter((r) => !existsSync(path.join(APP, ...r.split("/").filter(Boolean), "page.tsx")));
    expect(faltando).toEqual([]);
    expect(existsSync(path.join(APP, "configuracoes", "page.tsx"))).toBe(true);
  });

  it("as telas de dentro herdam a área e a tela da lista", () => {
    expect(localDaRota("/admin/usuarios/novo")).toMatchObject({ area: { chave: "pessoas" }, tela: { chave: "usuarios" }, dentro: true });
    expect(localDaRota("/admin/workspaces/abc")).toMatchObject({ area: { chave: "plataforma" }, tela: { chave: "workspaces" } });
    expect(localDaRota("/admin/usuarios")).toMatchObject({ dentro: false });
    expect(localDaRota("/admin")).toBeNull();
    expect(localDaRota("/empresas")).toBeNull();
  });

  it("no Portal, a aba decide a tela", () => {
    expect(localDaRota("/admin/portal")?.tela.chave).toBe("portal-acessos");
    expect(localDaRota("/admin/portal", "acessos")?.tela.chave).toBe("portal-acessos");
    expect(localDaRota("/admin/portal", "telas")?.tela.chave).toBe("portal-telas");
  });

  it("Minha assinatura fica em Escritório e assinatura", () => {
    expect(localDaRota("/assinatura")?.area.chave).toBe("escritorio");
  });
});

describe("trilha das configurações", () => {
  it("tela de uma área: Configurações › área, com links para o início", () => {
    expect(trilhaDasConfiguracoes("/admin/usuarios", null, ADMIN)).toEqual([
      { rotulo: "Configurações", href: "/admin" },
      { rotulo: "Pessoas e acessos", href: "/admin#area-pessoas" },
    ]);
  });

  it("tela de dentro ganha o nome da tela, com link para a lista", () => {
    expect(trilhaDasConfiguracoes("/admin/tags/x1/editar", null, GESTOR)).toEqual([
      { rotulo: "Configurações", href: "/admin" },
      { rotulo: "Setores e módulos", href: "/admin#area-setores" },
      { rotulo: "Tags", href: "/admin/tags" },
    ]);
  });

  it("a auditoria fica em Clientes e planos", () => {
    expect(trilhaDasConfiguracoes("/admin/auditoria", null, SUPER).map((i) => i.rotulo)).toEqual(["Configurações", "Clientes e planos"]);
  });

  it("Telas liberadas do Portal", () => {
    expect(trilhaDasConfiguracoes("/admin/portal", "telas", ADMIN).map((i) => i.rotulo)).toEqual(["Configurações", "Portal do cliente"]);
  });

  it("o início não tem trilha; a conta tem", () => {
    expect(trilhaDasConfiguracoes("/admin", null, ADMIN)).toEqual([]);
    expect(trilhaDasConfiguracoes("/configuracoes", null, ADMIN)).toEqual([
      { rotulo: "Configurações", href: "/admin" },
      { rotulo: "Sua conta" },
    ]);
  });

  it("quem não abre o início vê a trilha sem link", () => {
    expect(trilhaDasConfiguracoes("/admin/integracoes", null, GESTOR_SEM_SETOR)).toEqual([
      { rotulo: "Configurações", href: undefined },
      { rotulo: "Integrações e IA", href: undefined },
    ]);
  });
});
