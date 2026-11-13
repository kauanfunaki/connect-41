import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, MODULE_ROUTES } from "@/lib/module-catalog";
import { comManutencaoEmTeste, manutencoesEmTeste, passaPelaManutencao, quandoNoAviso, telaDoCaminho, telaParaConferir } from "./regras";

// O que se testa: de que tela é cada endereço (o proxy e o selo do menu leem
// isso), quem passa pela manutenção e quando o proxy confere.

describe("telaDoCaminho", () => {
  it("a tela pelo endereço dela e pelos de dentro", () => {
    expect(telaDoCaminho("/pagar")).toBe("bpo_contas_pagar");
    expect(telaDoCaminho("/pagar/abc-123")).toBe("bpo_contas_pagar");
    expect(telaDoCaminho("/pagar/")).toBe("bpo_contas_pagar");
  });

  it("a tela que mora debaixo de outra é ela, e não a de cima", () => {
    expect(telaDoCaminho("/processos/painel")).toBe("societario_painel");
    expect(telaDoCaminho("/processos/abc-123")).toBe("societario_processos");
    expect(telaDoCaminho("/dre/economica")).toBe("dre_economica");
    expect(telaDoCaminho("/dre")).toBe("bpo_dre");
    expect(telaDoCaminho("/controle-interno/entregas")).toBe("tech_entregas");
    expect(telaDoCaminho("/sped-fiscal/motor/classificacao")).toBe("fiscal_classificacao");
  });

  it("as abas que acendem o item de outra tela entram com ela (Desligamentos e Férias, nas Admissões)", () => {
    expect(telaDoCaminho("/desligamentos")).toBe("dp_colaboradores");
    expect(telaDoCaminho("/ferias/abc")).toBe("dp_colaboradores");
  });

  it("prefixo sem barra não conta: /pagarx não é /pagar", () => {
    expect(telaDoCaminho("/pagarx")).toBeNull();
  });

  it("o que não é tela de setor fica de fora", () => {
    for (const caminho of ["/", "/home", "/empresas", "/empresas/abc", "/admin/setores", "/agenda", "/manutencao"]) {
      expect(telaDoCaminho(caminho), caminho).toBeNull();
    }
  });

  it("tela sem endereço próprio, pelo /setor/{setor}/{código}", () => {
    const semRota = MODULE_CATALOG.find((m) => !MODULE_ROUTES[m.code]);
    if (!semRota) return;
    expect(telaDoCaminho(`/setor/${semRota.sectorCode}/${semRota.code}`)).toBe(semRota.code);
    expect(telaDoCaminho(`/setor/outro/${semRota.code}/detalhe`)).toBe(semRota.code);
  });

  it("os grupos e os Quadros do setor não são tela", () => {
    expect(telaDoCaminho("/setor/bpo")).toBeNull();
    expect(telaDoCaminho("/setor/bpo/grupo/banco-e-caixa")).toBeNull();
  });

  it("todo endereço do catálogo leva a uma tela que tem esse endereço", () => {
    for (const [codigo, rota] of Object.entries(MODULE_ROUTES)) {
      const tela = telaDoCaminho(rota.split("?")[0]);
      expect(tela, `${codigo} (${rota})`).not.toBeNull();
      expect(MODULE_ROUTES[tela!]?.split("?")[0], `${codigo} (${rota})`).toBe(rota.split("?")[0]);
    }
  });
});

describe("passaPelaManutencao", () => {
  it("administrador, super admin e a Tech passam", () => {
    expect(passaPelaManutencao({ role: "SUPER_ADMIN", sectors: [] })).toBe(true);
    expect(passaPelaManutencao({ role: "ADMIN", sectors: [] })).toBe(true);
    expect(passaPelaManutencao({ role: "SECTOR_USER", sectors: ["tech"] })).toBe(true);
    expect(passaPelaManutencao({ role: "SECTOR_ADMIN", sectors: ["fiscal", "tech"] })).toBe(true);
  });

  it("os setores veem o aviso — inclusive o gestor do setor e a Diretoria", () => {
    expect(passaPelaManutencao({ role: "SECTOR_USER", sectors: ["fiscal"] })).toBe(false);
    expect(passaPelaManutencao({ role: "SECTOR_ADMIN", sectors: ["bpo", "contabil"] })).toBe(false);
    expect(passaPelaManutencao({ role: "READONLY", sectors: [] })).toBe(false);
  });
});

describe("telaParaConferir", () => {
  it("só a abertura de página: GET e HEAD", () => {
    expect(telaParaConferir("GET", "/pagar")).toBe("bpo_contas_pagar");
    expect(telaParaConferir("HEAD", "/pagar")).toBe("bpo_contas_pagar");
    expect(telaParaConferir("POST", "/pagar")).toBeNull();
  });

  it("API, arquivos do Next e a própria página do aviso ficam de fora", () => {
    expect(telaParaConferir("GET", "/api/financeiro/contas")).toBeNull();
    expect(telaParaConferir("GET", "/_next/data/x.json")).toBeNull();
    expect(telaParaConferir("GET", "/manutencao")).toBeNull();
  });
});

describe("quandoNoAviso", () => {
  // 13/11/2026 às 10:00 em São Paulo (13:00 UTC).
  const agora = new Date("2026-11-13T13:00:00Z");

  it("hoje, amanhã e ontem, no fuso de São Paulo", () => {
    expect(quandoNoAviso(new Date("2026-11-13T18:30:00Z"), agora)).toBe("hoje às 15:30");
    expect(quandoNoAviso(new Date("2026-11-14T12:00:00Z"), agora)).toBe("amanhã às 09:00");
    expect(quandoNoAviso(new Date("2026-11-12T21:10:00Z"), agora)).toBe("ontem às 18:10");
  });

  it("a virada do dia é a de São Paulo, não a do servidor", () => {
    // 02:30 UTC do dia 14 ainda é 23:30 do dia 13 em São Paulo.
    expect(quandoNoAviso(new Date("2026-11-14T02:30:00Z"), agora)).toBe("hoje às 23:30");
  });

  it("outro dia leva a data; outro ano, também o ano", () => {
    expect(quandoNoAviso(new Date("2026-11-20T17:00:00Z"), agora)).toBe("20/11 às 14:00");
    expect(quandoNoAviso(new Date("2027-01-05T12:00:00Z"), agora)).toBe("05/01/2027 às 09:00");
  });
});

describe("o cookie do Abrir para testar", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  it("lê só ids de manutenção, e nada sem cookie", () => {
    expect(manutencoesEmTeste(undefined)).toEqual([]);
    expect(manutencoesEmTeste("")).toEqual([]);
    expect(manutencoesEmTeste(`${A},qualquer-coisa,${B}`)).toEqual([A, B]);
  });

  it("acrescenta a manutenção aberta agora, sem repetir", () => {
    expect(comManutencaoEmTeste(undefined, A)).toBe(A);
    expect(comManutencaoEmTeste(A, B)).toBe(`${A},${B}`);
    expect(comManutencaoEmTeste(`${A},${B}`, A)).toBe(`${B},${A}`);
  });

  it("guarda só as 20 mais recentes", () => {
    const ids = Array.from({ length: 25 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const valor = ids.reduce<string | undefined>((v, id) => comManutencaoEmTeste(v, id), undefined);
    expect(manutencoesEmTeste(valor)).toEqual(ids.slice(-20));
  });
});
