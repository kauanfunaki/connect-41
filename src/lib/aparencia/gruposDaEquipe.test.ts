import { describe, expect, it } from "vitest";
import { MODULE_ROUTES } from "@/lib/module-catalog";
import { GRUPO_DO_MODULO, agruparPorCor, areaDoGrupoDeTelas, grupoDaTelaDaEquipe } from "./gruposDaEquipe";

// O que se testa (21/10/2026): no Connect da equipe a tela leva a cor do grupo
// dela, e não a do setor — no BPO, o financeiro em azul e a nota em laranja.
describe("grupoDaTelaDaEquipe", () => {
  it("as telas do BPO se dividem entre financeiro, notas e solicitações", () => {
    expect(grupoDaTelaDaEquipe("/pagar")).toBe("financeiro");
    expect(grupoDaTelaDaEquipe("/pagar/123")).toBe("financeiro");
    expect(grupoDaTelaDaEquipe("/conciliacao/regras")).toBe("financeiro");
    expect(grupoDaTelaDaEquipe("/dre/orcamento")).toBe("financeiro");
    expect(grupoDaTelaDaEquipe("/fornecedores-e-sacados")).toBe("financeiro");
    expect(grupoDaTelaDaEquipe("/emitir-nfse")).toBe("fiscal");
    expect(grupoDaTelaDaEquipe("/pendencias")).toBe("atendimento");
  });

  it("Fiscal, Societário e o atendimento ao cliente têm o grupo deles", () => {
    expect(grupoDaTelaDaEquipe("/fiscal/operacao")).toBe("fiscal");
    expect(grupoDaTelaDaEquipe("/documentos-fiscais/entrada")).toBe("fiscal");
    expect(grupoDaTelaDaEquipe("/processos/abc")).toBe("processos");
    expect(grupoDaTelaDaEquipe("/societario/exigencias")).toBe("processos");
    expect(grupoDaTelaDaEquipe("/solicitacoes")).toBe("atendimento");
  });

  it("as áreas novas de 28/10: Pessoas, Recrutamento e Escritório", () => {
    expect(grupoDaTelaDaEquipe("/admissoes")).toBe("pessoas");
    expect(grupoDaTelaDaEquipe("/desligamentos")).toBe("pessoas");
    expect(grupoDaTelaDaEquipe("/ferias")).toBe("pessoas");
    expect(grupoDaTelaDaEquipe("/indicadores-rh")).toBe("pessoas");
    expect(grupoDaTelaDaEquipe("/vagas")).toBe("recrutamento");
    expect(grupoDaTelaDaEquipe("/colaboradores-clientes")).toBe("recrutamento");
    expect(grupoDaTelaDaEquipe("/chamados/configuracoes")).toBe("escritorio");
    expect(grupoDaTelaDaEquipe("/certidoes")).toBe("processos");
    expect(grupoDaTelaDaEquipe("/area/pessoas")).toBe("pessoas");
    expect(grupoDaTelaDaEquipe("/area/inventada")).toBeNull();
  });

  it("o grupo do menu fica com a área da maioria das telas dele", () => {
    expect(areaDoGrupoDeTelas(["bpo_pendencias", "bpo_comunicacao", "bpo_aprovacoes"])).toBe("atendimento");
    expect(areaDoGrupoDeTelas(["bpo_senhas", "bpo_manual"])).toBe("escritorio");
    expect(areaDoGrupoDeTelas(["tela_sem_area"])).toBeNull();
    expect(areaDoGrupoDeTelas(["dp_colaboradores"])).toBe("pessoas");
  });

  it("o resto fica na cor principal, sem confundir prefixo de palavra", () => {
    expect(grupoDaTelaDaEquipe("/home")).toBeNull();
    expect(grupoDaTelaDaEquipe("/agenda")).toBeNull();
    expect(grupoDaTelaDaEquipe("/admin/tenant")).toBeNull();
    expect(grupoDaTelaDaEquipe("/pagamentos")).toBeNull();
  });

  it("todo módulo do mapa existe no catálogo, com endereço", () => {
    for (const modulo of Object.keys(GRUPO_DO_MODULO)) expect(MODULE_ROUTES[modulo], modulo).toBeTruthy();
  });
});

// 28/10/2026: "azul, azul, verde", e não "azul, verde, azul".
describe("agruparPorCor", () => {
  const area = (i: [string, string | null]) => i[1];

  it("junta as cores do Geral: os azuis (sem área e Escritório) e depois o atendimento", () => {
    const geral: [string, string | null][] = [
      ["Quadros", "marca"], ["Cadastros", "marca"], ["Solicitações", "atendimento"],
      ["Chamados", "escritorio"], ["Arquivos", "atendimento"], ["Agenda", null],
    ];
    expect(agruparPorCor(geral, area).map((i) => i[0])).toEqual(["Quadros", "Cadastros", "Chamados", "Agenda", "Solicitações", "Arquivos"]);
  });

  it("não mexe em quem já está junto", () => {
    const bpo: [string, string | null][] = [["Contas", "financeiro"], ["Banco", "financeiro"], ["Apoio", "escritorio"]];
    expect(agruparPorCor(bpo, area)).toEqual(bpo);
  });
});
