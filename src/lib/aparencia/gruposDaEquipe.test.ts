import { describe, expect, it } from "vitest";
import { MODULE_ROUTES } from "@/lib/module-catalog";
import { GRUPO_DO_MODULO, grupoDaTelaDaEquipe } from "./gruposDaEquipe";

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

  it("o resto fica na cor principal, sem confundir prefixo de palavra", () => {
    expect(grupoDaTelaDaEquipe("/home")).toBeNull();
    expect(grupoDaTelaDaEquipe("/vagas")).toBeNull();
    expect(grupoDaTelaDaEquipe("/admin/tenant")).toBeNull();
    expect(grupoDaTelaDaEquipe("/pagamentos")).toBeNull();
  });

  it("todo módulo do mapa existe no catálogo, com endereço", () => {
    for (const modulo of Object.keys(GRUPO_DO_MODULO)) expect(MODULE_ROUTES[modulo], modulo).toBeTruthy();
  });
});
