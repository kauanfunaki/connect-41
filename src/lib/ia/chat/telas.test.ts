import { describe, expect, it } from "vitest";
import { MODULE_ROUTES } from "@/lib/module-catalog";
import { TELAS_GERAIS } from "@/lib/ia/ferramentas-ajuda";
import { contextoParaMostrar, ehCaminhoInterno, ehRotaDeTela, ehTelaConhecida, nomeDaTela, rotuloDaTela } from "./telas";

// Embaixo da pergunta, o nome da tela — nunca o caminho (Kauan, 13/10/2026).

describe("nome da tela pelo endereço", () => {
  it("usa o nome do menu", () => {
    expect(rotuloDaTela("/solicitacoes")).toBe("Em Solicitações");
    expect(nomeDaTela("/pendencias")).toBe("Pendências ao cliente");
    expect(nomeDaTela("/pagar")).toBe("Contas a pagar");
    expect(nomeDaTela("/home")).toBe("Início");
    expect(nomeDaTela("/tarefas")).toBe("Meu dia");
  });

  it("ignora filtro, âncora e o item aberto dentro da tela", () => {
    expect(nomeDaTela("/pendencias?recorte=aguardando")).toBe("Pendências ao cliente");
    expect(nomeDaTela("/pendencias/3f1c2a4b-1111-4222-8333-944455556666")).toBe("Pendências ao cliente");
    expect(nomeDaTela("/solicitacoes/envios")).toBe("Solicitações");
    expect(nomeDaTela("/agenda#hoje")).toBe("Agenda");
  });

  it("a rota mais longa ganha", () => {
    expect(nomeDaTela("/fiscal")).toBe("Painel fiscal");
    expect(nomeDaTela("/fiscal/classificacao")).toBe("Classificação");
    expect(nomeDaTela("/dre/orcamento")).toBe("Orçamento");
  });

  it("tira a nota do catálogo depois do travessão", () => {
    expect(nomeDaTela("/documentos-fiscais")).toBe("Documentos fiscais");
  });

  it("tela desconhecida ou endereço de fora: nada", () => {
    expect(nomeDaTela("/nao-existe")).toBeNull();
    expect(rotuloDaTela("/nao-existe")).toBeNull();
    expect(nomeDaTela("https://exemplo.com/pagar")).toBeNull();
    expect(nomeDaTela("//exemplo.com/pagar")).toBeNull();
    expect(nomeDaTela("")).toBeNull();
    expect(nomeDaTela(null)).toBeNull();
  });

  it("toda tela de módulo e toda tela geral da Ajuda tem nome", () => {
    for (const rota of Object.values(MODULE_ROUTES)) expect(nomeDaTela(rota), rota).toBeTruthy();
    for (const t of TELAS_GERAIS) {
      if (!t.caminho.startsWith("/") || t.caminho.includes("{")) continue;
      expect(nomeDaTela(t.caminho), t.caminho).toBeTruthy();
    }
  });
});

describe("o rótulo gravado com a pergunta", () => {
  it("pergunta antiga com caminho cru vira o nome, ou some", () => {
    expect(contextoParaMostrar("/solicitacoes")).toBe("Em Solicitações");
    expect(contextoParaMostrar("/nao-existe")).toBeNull();
  });

  it("os outros rótulos passam como estão", () => {
    expect(contextoParaMostrar("Empresa: Padaria Bom Grão")).toBe("Empresa: Padaria Bom Grão");
    expect(contextoParaMostrar("Em Solicitações")).toBe("Em Solicitações");
    expect(contextoParaMostrar(null)).toBeNull();
    expect(contextoParaMostrar("  ")).toBeNull();
  });
});

describe("endereço de dentro do Connect", () => {
  it("só caminho com uma barra no começo", () => {
    expect(ehCaminhoInterno("/pagar")).toBe(true);
    expect(ehCaminhoInterno("/pagar?empresa=x&recorte=vencidas")).toBe(true);
    expect(ehCaminhoInterno("//evil.com")).toBe(false);
    expect(ehCaminhoInterno("/\\evil.com")).toBe(false);
    expect(ehCaminhoInterno("https://evil.com")).toBe(false);
    expect(ehCaminhoInterno("javascript:alert(1)")).toBe(false);
    expect(ehCaminhoInterno("/pagar com espaço")).toBe(false);
    expect(ehCaminhoInterno("/")).toBe(false);
  });

  it("tela conhecida e rota exata de tela", () => {
    expect(ehTelaConhecida("/pendencias/abc")).toBe(true);
    expect(ehTelaConhecida("/nao-existe")).toBe(false);
    expect(ehRotaDeTela("/pendencias")).toBe(true);
    expect(ehRotaDeTela("/pendencias?recorte=aguardando")).toBe(false);
    expect(ehRotaDeTela("/pendencias/abc")).toBe(false);
  });
});
