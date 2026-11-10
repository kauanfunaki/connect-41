import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, MODULE_ROUTES, MODULOS_DE_TODA_A_EQUIPE, MODULOS_FORA_DO_MENU, MODULO_NO_LUGAR_DOS_QUADROS } from "@/lib/module-catalog";
import { lerOrdemDoMenu, montarMenuDoSetor, telasDoBloco, type BlocoDoMenu } from "./menuDoSetor";

// A regra do menu de 05/11/2026 (opção A): grupos por tema em todo setor, grupo
// de uma tela vira tela solta, e a Tela 2 fica recuada sob a Tela 1.

const telas = (...codes: string[]) => codes.map((code) => ({ code, label: MODULE_CATALOG.find((m) => m.code === code)!.label, href: MODULE_ROUTES[code]! }));
/**
 * As telas do menu de um setor como o layout entrega: na ordem do catálogo, sem
 * as de fora do menu, sem o Controle interno, que é o Quadros do Geral, e sem
 * a Academia (10/11/2026), que é de toda a equipe e mora no topo.
 */
const doSetor = (setor: string) =>
  telas(...MODULE_CATALOG.filter((m) => m.sectorCode === setor && !MODULOS_FORA_DO_MENU.has(m.code) && !MODULOS_DE_TODA_A_EQUIPE.has(m.code) && m.code !== MODULO_NO_LUGAR_DOS_QUADROS).map((m) => m.code));
/** O menu num formato legível: "Grupo: Mãe (Filha, Filha), Outra" ou "Mãe" solta. */
const desenho = (blocos: BlocoDoMenu[]) =>
  blocos.map((b) => {
    const entrada = (e: { tela: { label: string }; filhas: { label: string }[] }) => e.tela.label + (e.filhas.length ? ` (${e.filhas.map((f) => f.label).join(", ")})` : "");
    return b.tipo === "solta" ? entrada(b.entrada) : `${b.grupo}: ${b.entradas.map(entrada).join(", ")}`;
  });

describe("montarMenuDoSetor", () => {
  // O pedido do Kauan de 09/11/2026, na ordem dele.
  it("Societário: Operação e Regularização como grupos; Exigências e prazos, Relatórios e Hub de robôs avulsas", () => {
    const esperado = [
      "Operação: Processos, Painel, Órgãos",
      "Regularização: Licenças, Certidões",
      "Exigências e prazos",
      "Relatórios",
      "Hub de robôs",
    ];
    const menu = montarMenuDoSetor(doSetor("societario"), undefined, "societario");
    expect(desenho(menu)).toEqual(esperado);
    expect(menu[0]).toMatchObject({ tipo: "grupo", telas: 3 });
    expect(menu[1]).toMatchObject({ tipo: "grupo", telas: 2 });
    // A ordem global dos grupos já dá a mesma: a do setor só a deixa escrita.
    expect(desenho(montarMenuDoSetor(doSetor("societario")))).toEqual(esperado);
  });

  it("Tech: Orquestrador, Produtividade, Entregas da Tech, Ceci, Chamados e Certificados digitais, todos avulsos", () => {
    const menu = montarMenuDoSetor(doSetor("tech"), undefined, "tech");
    expect(desenho(menu)).toEqual(["Orquestrador", "Produtividade", "Entregas da Tech", "Ceci", "Chamados", "Certificados digitais"]);
    expect(menu.every((b) => b.tipo === "solta")).toBe(true);
    // Sem o setor, valeria a ordem global dos grupos — por isso a do Tech fica escrita.
    expect(desenho(montarMenuDoSetor(doSetor("tech")))[1]).not.toBe("Produtividade");
  });

  it("Tech: o Controle interno não vem na lista do setor — é o Quadros do Geral", () => {
    expect(doSetor("tech").map((t) => t.code)).not.toContain(MODULO_NO_LUGAR_DOS_QUADROS);
    expect(MODULE_CATALOG.find((m) => m.code === MODULO_NO_LUGAR_DOS_QUADROS)?.sectorCode).toBe("tech");
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
  const soc = doSetor("societario");

  it("grupos e telas na ordem escolhida; o que não está na lista vem depois, na ordem de sempre", () => {
    const menu = montarMenuDoSetor(soc, { grupos: ["Regularização", "Automação"], telas: ["societario_certidoes", "societario_orgaos"] }, "societario");
    expect(desenho(menu)).toEqual([
      "Regularização: Certidões, Licenças",
      "Hub de robôs",
      "Operação: Órgãos, Processos, Painel",
      "Exigências e prazos",
      "Relatórios",
    ]);
  });

  it("a ordem escolhida vence a do setor, e o resto segue a do setor", () => {
    const menu = montarMenuDoSetor(doSetor("tech"), { grupos: ["Atendimento"], telas: [] }, "tech");
    expect(desenho(menu)).toEqual(["Chamados", "Orquestrador", "Produtividade", "Entregas da Tech", "Ceci", "Certificados digitais"]);
  });

  it("uma tela não sai do grupo dela nem a filha sai de baixo da mãe, mesmo pedindo", () => {
    const menu = montarMenuDoSetor(soc, { grupos: [], telas: ["societario_painel", "societario_licencas"] });
    expect(desenho(menu).slice(0, 2)).toEqual(["Operação: Painel, Processos, Órgãos", "Regularização: Licenças, Certidões"]);
    const bpo = montarMenuDoSetor(telas("bpo_contas_pagar", "bpo_dre", "dre_economica", "dre_analises"), { grupos: [], telas: ["dre_analises", "bpo_contas_pagar"] });
    expect(desenho(bpo)).toEqual(["Contas a pagar", "DRE (Análises gerenciais, DRE econômica)"]);
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
