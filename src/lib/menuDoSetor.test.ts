import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, MODULE_ROUTES } from "@/lib/module-catalog";
import { lerOrdemDoMenu, montarMenuDoSetor, telasDoBloco, type BlocoDoMenu } from "./menuDoSetor";

// A regra do menu de 05/11/2026 (opção A): grupos por tema em todo setor, grupo
// de uma tela vira tela solta, e a Tela 2 fica recuada sob a Tela 1.

const telas = (...codes: string[]) => codes.map((code) => ({ code, label: MODULE_CATALOG.find((m) => m.code === code)!.label, href: MODULE_ROUTES[code]! }));
/** O menu num formato legível: "Grupo: Mãe (Filha, Filha), Outra" ou "Mãe" solta. */
const desenho = (blocos: BlocoDoMenu[]) =>
  blocos.map((b) => {
    const entrada = (e: { tela: { label: string }; filhas: { label: string }[] }) => e.tela.label + (e.filhas.length ? ` (${e.filhas.map((f) => f.label).join(", ")})` : "");
    return b.tipo === "solta" ? entrada(b.entrada) : `${b.grupo}: ${b.entradas.map(entrada).join(", ")}`;
  });

describe("montarMenuDoSetor", () => {
  it("Societário: Processos com Painel, Órgãos e Relatórios embaixo; licenças num grupo", () => {
    const menu = montarMenuDoSetor(telas("societario_licencas", "societario_certidoes", "societario_robo", "societario_painel", "societario_orgaos", "societario_processos", "societario_prazos", "societario_relatorios"));
    expect(desenho(menu)).toEqual([
      "Operação: Processos (Painel, Órgãos, Relatórios), Exigências e prazos",
      "Licenças: Licenças, Certidões, Robô",
    ]);
    expect(menu[0]).toMatchObject({ tipo: "grupo", telas: 5 });
  });

  it("Tech: Entregas sob o Controle interno; grupo de uma tela vira tela solta", () => {
    const menu = montarMenuDoSetor(telas("tech_controle_interno", "tech_ceci", "tech_github_contributions", "tech_entregas", "tech_ops_center", "helpdesk", "tech_certificados"));
    expect(desenho(menu)).toEqual([
      "Operação: Produtividade, Ops Center",
      "Chamados",
      "Certificados digitais",
      "Desenvolvimento: Controle interno (Entregas da Tech), Ceci",
    ]);
  });

  it("BPO: as DREs sob a DRE; o grupo Resultado com uma tela vira a DRE solta, com as filhas", () => {
    const menu = montarMenuDoSetor(telas("bpo_dre", "bpo_contas_pagar", "bpo_contas_receber", "bpo_lancamentos", "bpo_fluxo_caixa", "bpo_conciliacao", "bpo_cobranca", "dre_economica", "dre_analises", "dre_orcamento"));
    expect(desenho(menu)).toEqual([
      "Contas: Contas a pagar, Contas a receber, Lançamentos, Cobrança",
      "Banco e caixa: Fluxo de caixa, Conciliação bancária",
      "DRE (DRE econômica, Análises gerenciais, Orçamento)",
    ]);
  });

  it("filha sem a mãe no menu (desligada ou em outro setor) aparece como tela comum", () => {
    expect(desenho(montarMenuDoSetor(telas("tech_ceci", "tech_entregas")))).toEqual(["Desenvolvimento: Ceci, Entregas da Tech"]);
    expect(desenho(montarMenuDoSetor(telas("dre_economica")))).toEqual(["DRE econômica"]);
  });

  it("toda tela entra uma vez só", () => {
    const todas = telas(...MODULE_CATALOG.map((m) => m.code).filter((c) => MODULE_ROUTES[c]));
    const menu = montarMenuDoSetor(todas);
    expect(menu.flatMap(telasDoBloco).map((t) => t.code).sort()).toEqual(todas.map((t) => t.code).sort());
  });
});

// Organizar menu (05/11/2026): o super admin escolhe a ordem dos grupos e das telas.
describe("a ordem escolhida", () => {
  const soc = telas("societario_licencas", "societario_certidoes", "societario_robo", "societario_painel", "societario_orgaos", "societario_processos", "societario_prazos", "societario_relatorios");

  it("grupos e telas na ordem escolhida; o que não está na lista vem depois, na ordem de sempre", () => {
    const menu = montarMenuDoSetor(soc, { grupos: ["Licenças"], telas: ["societario_robo", "societario_prazos", "societario_relatorios"] });
    expect(desenho(menu)).toEqual([
      "Licenças: Robô, Licenças, Certidões",
      "Operação: Exigências e prazos, Processos (Relatórios, Painel, Órgãos)",
    ]);
  });

  it("uma tela não sai do grupo dela nem a filha sai de baixo da mãe, mesmo pedindo", () => {
    const menu = montarMenuDoSetor(soc, { grupos: [], telas: ["societario_painel", "societario_licencas"] });
    expect(desenho(menu)[0]).toBe("Operação: Processos (Painel, Órgãos, Relatórios), Exigências e prazos");
  });

  it("sem ordem, o menu de antes", () => {
    expect(montarMenuDoSetor(soc, { grupos: [], telas: [] })).toEqual(montarMenuDoSetor(soc));
  });

  it("a ordem gravada estranha vira a ordem padrão; repetidos e não-texto saem", () => {
    expect(lerOrdemDoMenu(null)).toEqual({ grupos: [], telas: [] });
    expect(lerOrdemDoMenu("não é json")).toEqual({ grupos: [], telas: [] });
    expect(lerOrdemDoMenu('{"grupos":["Contas","Contas",3],"telas":"x"}')).toEqual({ grupos: ["Contas"], telas: [] });
  });
});
