import { describe, expect, it } from "vitest";
import { fraseDoEvento, fraseEmTexto, type EventoParaFrase } from "./frase";

function evento(parcial: Partial<EventoParaFrase>): EventoParaFrase {
  return { acao: "company.update", entityType: "Company", metadata: null, ator: "Carla Mendes", atorExcluido: false, alvo: null, empresa: null, ...parcial };
}

describe("frase da linha do tempo", () => {
  it("documento fiscal que ainda existe: nome e empresa como link", () => {
    const p = fraseDoEvento(
      evento({
        acao: "fiscal.document.edit",
        entityType: "FiscalDocument",
        alvo: { nome: "NF-e 4.512", href: "/documentos-fiscais/d1" },
        empresa: { nome: "Padaria Pão de Mel Ltda", href: "/empresas/e1" },
      })
    );
    expect(fraseEmTexto(p)).toBe("Carla Mendes editou o documento fiscal NF-e 4.512 da Padaria Pão de Mel Ltda");
    expect(p[0]).toEqual({ tipo: "forte", texto: "Carla Mendes" });
    expect(p).toContainEqual({ tipo: "link", texto: "NF-e 4.512", href: "/documentos-fiscais/d1" });
    expect(p).toContainEqual({ tipo: "link", texto: "Padaria Pão de Mel Ltda", href: "/empresas/e1" });
  });

  it("cadastro que não existe mais: nome guardado nos detalhes, em negrito, sem link", () => {
    const p = fraseDoEvento(evento({ acao: "person.delete", entityType: "Person", metadata: { nome: "Marina Costa" } }));
    expect(fraseEmTexto(p)).toBe("Carla Mendes excluiu a pessoa Marina Costa");
    expect(p[p.length - 1]).toEqual({ tipo: "forte", texto: "Marina Costa" });
  });

  it("quem agiu e foi excluído aparece com o nome guardado e “(excluído)”", () => {
    const p = fraseDoEvento(evento({ ator: "Rafael Souza", atorExcluido: true, acao: "person.delete", entityType: "Person", metadata: { nome: "Marina" } }));
    expect(fraseEmTexto(p)).toBe("Rafael Souza (excluído) excluiu a pessoa Marina");
    expect(p[1]).toEqual({ tipo: "mudo", texto: " (excluído)" });
  });

  it("sem nome nenhum, não inventa", () => {
    const p = fraseDoEvento(evento({ ator: null, atorExcluido: true, acao: "financeiro.entry.reversed", entityType: "FinanceEntry", metadata: { fiscalDocumentId: "x" } }));
    expect(fraseEmTexto(p)).toBe("Usuário sem nome (excluído) estornou o lançamento");
  });

  it("a empresa não se repete quando o cadastro é a própria empresa ou a frase já fala dela", () => {
    expect(fraseEmTexto(fraseDoEvento(evento({ alvo: { nome: "Padaria", href: "/empresas/e1" }, empresa: { nome: "Padaria", href: "/empresas/e1" } })))).toBe(
      "Carla Mendes editou a empresa Padaria"
    );
    expect(
      fraseEmTexto(fraseDoEvento(evento({ acao: "dre.import", entityType: "Company", alvo: { nome: "Padaria", href: "/empresas/e1" } })))
    ).toBe("Carla Mendes importou de um arquivo a DRE da empresa Padaria");
  });

  it("ação na própria conta não repete o nome", () => {
    const p = fraseDoEvento(evento({ acao: "user.password_change", entityType: "User", alvo: { nome: "Carla Mendes", href: "/admin/usuarios/u1/editar" } }));
    expect(fraseEmTexto(p)).toBe("Carla Mendes trocou a própria senha");
  });

  it("o nome pode morar em outra chave (assunto, tela do portal, pasta do modelo editada)", () => {
    expect(fraseEmTexto(fraseDoEvento(evento({ acao: "portal.tela.liberada", entityType: "PortalTelaBloqueada", metadata: { tela: "DRE", endereco: "/portal/dre" } })))).toBe(
      "Carla Mendes liberou no portal a tela DRE"
    );
    expect(
      fraseEmTexto(
        fraseDoEvento(evento({ acao: "drive.template_update", entityType: "DriveTemplateFolder", metadata: { de: { nome: "Fiscal" }, para: { nome: "Fiscal 2026" } } }))
      )
    ).toBe("Carla Mendes editou no modelo de pastas a pasta Fiscal 2026");
  });

  it("código antigo sem frase diz o código e o tipo do cadastro", () => {
    expect(fraseEmTexto(fraseDoEvento(evento({ acao: "coisa.velha.sync", entityType: "FinanceEntry" })))).toBe(
      "Carla Mendes registrou “coisa.velha.sync” em lançamento"
    );
  });
});
