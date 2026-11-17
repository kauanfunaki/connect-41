import { describe, expect, it } from "vitest";
import { categoriaDoConnect, ehSituacaoDoCaso, lerHistoricoDoHub, limparSegredos, situacaoDepoisDaLeitura, textoDoCaso } from "./historico";

// O histórico de chamados do Hub como casos para a triagem (17/11/2026).

describe("lerHistoricoDoHub", () => {
  const chamado = {
    id: "h-1",
    titulo: "Erro no sistema",
    descricao: "Não abre",
    situacao: "RESOLVIDO",
    prioridade: "MEDIA",
    categoria: "SUPORTE › Sistema Travando | Erro",
    setorQuePediu: "Fiscal",
    abertoEm: "2026-03-16T10:00:00.000Z",
    fechadoEm: null,
    respostasDaEquipe: [{ texto: "Reinstalado.", interno: false, em: "2026-03-16T11:00:00.000Z" }],
  };

  it("lê a lista e deixa de fora o chamado sem a forma certa", () => {
    const lidos = lerHistoricoDoHub({ chamados: [chamado, { id: "h-2" }, { ...chamado, id: "h-3", abertoEm: "ontem" }] });
    expect(lidos.map((c) => c.id)).toEqual(["h-1"]);
    expect(lidos[0].respostasDaEquipe).toHaveLength(1);
  });

  it("resposta sem lista é erro", () => {
    expect(() => lerHistoricoDoHub({ error: "x" })).toThrow();
    expect(() => lerHistoricoDoHub(null)).toThrow();
  });
});

describe("limparSegredos", () => {
  it("tira senha com dois-pontos, e-mail, documento e telefone", () => {
    expect(limparSegredos("senha: Abc@123 do sistema")).toBe("senha: [omitida] do sistema");
    expect(limparSegredos("mande para ana.souza@exemplo.com.br")).toBe("mande para [e-mail]");
    expect(limparSegredos("CPF 123.456.789-09 e CNPJ 12.345.678/0001-90")).toBe("CPF [documento] e CNPJ [documento]");
    expect(limparSegredos("ligar (41) 99999-1234")).toBe("ligar [telefone]");
  });

  it("deixa o pedido comum como está", () => {
    expect(limparSegredos("Esqueci a senha do sistema fiscal")).toBe("Esqueci a senha do sistema fiscal");
    expect(limparSegredos("Relatório de 2026 com 15 empresas")).toBe("Relatório de 2026 com 15 empresas");
  });
});

describe("textoDoCaso", () => {
  it("vai sem segredos e sem as respostas internas a mais de oito", () => {
    const t = JSON.parse(
      textoDoCaso({
        title: "Acesso",
        description: "token=XYZ123",
        originalCategory: "INFRAESTRUTURA › Acesso | Senhas",
        requesterSector: "BPO",
        sourceStatus: "RESOLVIDO",
        teamReplies: Array.from({ length: 10 }, (_, i) => ({ texto: `resposta ${i}`, interno: false, em: "x" })),
      })
    );
    expect(t.descricao).toBe("token: [omitida]");
    expect(t.respostasDaEquipe).toHaveLength(8);
    expect(t.categoriaEscolhidaPorQuemPediu).toBe("INFRAESTRUTURA › Acesso | Senhas");
  });
});

describe("situacaoDepoisDaLeitura", () => {
  it("sem aproveitamento, descartado", () => {
    expect(situacaoDepoisDaLeitura({ aproveitavel: false, categoryId: "c1" }, "c1")).toEqual({ situacao: "DESCARTADO", finalId: null });
  });
  it("a IA concorda com quem pediu: confirmado sozinho", () => {
    expect(situacaoDepoisDaLeitura({ aproveitavel: true, categoryId: "c1" }, "c1")).toEqual({ situacao: "CONFIRMADO", finalId: "c1" });
  });
  it("discorda, ou não soube, ou o Hub não tem par: a revisar", () => {
    expect(situacaoDepoisDaLeitura({ aproveitavel: true, categoryId: "c2" }, "c1").situacao).toBe("A_REVISAR");
    expect(situacaoDepoisDaLeitura({ aproveitavel: true, categoryId: null }, "c1").situacao).toBe("A_REVISAR");
    expect(situacaoDepoisDaLeitura({ aproveitavel: true, categoryId: "c1" }, null).situacao).toBe("A_REVISAR");
  });
  it("só as quatro situações existem", () => {
    expect(ehSituacaoDoCaso("A_REVISAR")).toBe(true);
    expect(ehSituacaoDoCaso("lixo")).toBe(false);
  });
});

describe("categoriaDoConnect", () => {
  const opcoes = [
    { id: "a", nome: "Sistema Travando | Erro", caminho: "Suporte › Sistema Travando | Erro" },
    { id: "b", nome: "Acesso | Senhas", caminho: "Infraestrutura › Acesso | Senhas" },
    { id: "c", nome: "Relatórios", caminho: "Suporte › Relatórios" },
    { id: "d", nome: "Relatórios", caminho: "Desenvolvimento › Relatórios" },
  ];
  it("casa pelo caminho, sem diferença de maiúscula e acento", () => {
    expect(categoriaDoConnect("SUPORTE › Sistema Travando | Erro", opcoes)).toBe("a");
    expect(categoriaDoConnect("INFRAESTRUTURA › ACESSO | SENHAS", opcoes)).toBe("b");
  });
  it("sem o caminho, vale a folha quando só uma tem o nome", () => {
    expect(categoriaDoConnect("TI › Acesso | Senhas", opcoes)).toBe("b");
    expect(categoriaDoConnect("Outro › Relatorios", opcoes)).toBeNull();
    expect(categoriaDoConnect("Feedback", opcoes)).toBeNull();
  });
});
