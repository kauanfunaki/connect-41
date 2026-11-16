import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AutorizacaoNoCartao, ReceitaNoCartao } from "./ReceitaFederalNaFicha";

// O cartão "Receita Federal" da ficha (16/11/2026, melhoria-715). Sem navegador,
// o HTML do servidor: um cartão só, uma linha por assunto, cada parte com o
// próprio portão; a frase de ajuda vai para a dica e o que tem consequência (o
// custo da emissão, a ciência da intimação) continua à vista.

// Os botões abrem janelas e chamam ações do servidor: aqui basta o lugar deles.
vi.mock("@/components/autorizacoes/BotoesDaReceita", () => {
  const botao = (rotulo: string) =>
    function Botao() {
      return React.createElement("button", { type: "button" }, rotulo);
    };
  return {
    AbrirMensagem: botao("Abrir"),
    VerMensagem: botao("Ver"),
    PedirSituacaoFiscal: botao("Pedir situação fiscal"),
    EmitirGuia: botao("Emitir guia"),
    EmitirCertificadoDoMei: botao("Emitir certificado de MEI"),
  };
});
vi.mock("@/components/autorizacoes/DialogosDaAutorizacao", () => ({
  BotaoDaAutorizacao: function BotaoDaAutorizacao() {
    return React.createElement("button", { type: "button" }, "Atualizar");
  },
}));

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const autorizacao: AutorizacaoNoCartao = {
  dados: { semDocumento: false, chave: "00000000", documento: "00.000.000", mesmaRaiz: 2, situacao: "falta_pedir", registro: null },
  nome: "Empresa de exemplo",
  hoje: "2026-11-16",
  podeEditar: true,
  serpro: false,
};

const lidoEm = "2026-11-16T10:00:00.000Z"; // 07:00 em São Paulo

const receita: ReceitaNoCartao = {
  dados: {
    chave: "00000000",
    eventos: [
      { evento: "E0301", rotulo: "DCTFWeb recebeu apuração ou declaração", ultimoEm: "2026-11-13", semAcesso: false, lidoEm },
      { evento: "E0601", rotulo: "Mensagem nova na Caixa Postal", ultimoEm: null, semAcesso: true, lidoEm },
      { evento: "E0701", rotulo: "Pagamento novo, alterado ou cancelado", ultimoEm: null, semAcesso: false, lidoEm },
    ],
    semAcesso: false,
    mensagens: [],
    sitfis: null,
  },
  companyId: "empresa-1",
  podePedir: true,
  podeAbrir: false,
  motivo: null,
  guiaSugerida: "DAS",
};

const mensagem = {
  id: "m1",
  assunto: "Termo de intimação",
  enviadaEm: "2026-11-10T15:00:00.000Z",
  relevante: true,
  origem: null,
  validaAte: null,
  cienciaEm: null,
  abertaEm: null,
  abertaPor: null,
};

async function html(props: { autorizacao: AutorizacaoNoCartao | null; receita: ReceitaNoCartao | null }): Promise<string> {
  const { ReceitaFederalNaFicha } = await import("./ReceitaFederalNaFicha");
  return renderToStaticMarkup(React.createElement(ReceitaFederalNaFicha, props));
}

describe("o cartão Receita Federal — o que aparece", () => {
  it("sem autorização e sem Serpro, não há cartão", async () => {
    expect(await html({ autorizacao: null, receita: null })).toBe("");
  });

  it("só com a autorização, o cartão tem só a linha dela", async () => {
    const h = await html({ autorizacao, receita: null });
    expect(h).toContain("Receita Federal");
    expect(h).toContain("Autorização de acesso");
    expect(h).toContain("Falta pedir");
    expect(h).not.toContain("Movimento");
    expect(h).not.toContain("conferido em");
  });

  it("com as duas partes é um cartão só, sem os títulos antigos", async () => {
    const h = await html({ autorizacao, receita });
    expect(h.match(/<h2/g)).toHaveLength(1);
    expect(h).not.toContain("Autorização de acesso na Receita");
    expect(h).not.toContain("Receita Federal pelo Serpro");
    for (const assunto of ["Autorização de acesso", "Movimento", "Caixa Postal", "Situação fiscal", "Guias federais"]) {
      expect(h).toContain(`>${assunto}</h3>`);
    }
  });

  it("o Certificado de MEI é linha só de MEI", async () => {
    expect(await html({ autorizacao, receita })).not.toContain("Certificado de MEI");
    expect(await html({ autorizacao, receita: { ...receita, guiaSugerida: "DAS_MEI" } })).toContain(">Certificado de MEI</h3>");
  });
});

describe("o cartão Receita Federal — as linhas", () => {
  it("quando foi conferido fica no cabeçalho, curto", async () => {
    const h = await html({ autorizacao, receita });
    expect(h).toContain("conferido em 16/11, 07:00");
    expect(h).not.toContain("Eventos de Atualização");
  });

  it("cada evento é uma etiqueta, e os três estados se leem no texto", async () => {
    const h = await html({ autorizacao, receita });
    expect(h).toContain("DCTFWeb 13/11");
    expect(h).toContain("Caixa Postal · sem acesso");
    expect(h).toContain("Pagamento · nada em 60 dias");
  });

  it("a frase da raiz vai para a dica, num botão que o teclado alcança", async () => {
    const h = await html({ autorizacao, receita });
    expect(h).toMatch(/<button type="button" data-dica="Vale para a raiz 00\.000\.000: mais 2 empresas cadastradas\."/);
    expect(h).not.toContain(">Vale para a raiz");
  });

  it("os links de todos os clientes continuam, cada um com o seu nome", async () => {
    const h = await html({ autorizacao, receita });
    expect(h).toMatch(/<a aria-label="Autorizações de todos os clientes"[^>]*href="\/autorizacoes">Todos os clientes<\/a>/);
    expect(h).toMatch(/<a aria-label="Caixa Postal de todos os clientes"[^>]*href="\/autorizacoes\/caixa-postal">Todos os clientes<\/a>/);
  });

  it("o custo fica à vista ao lado de cada botão de emissão, e o destino do PDF na dica", async () => {
    const h = await html({ autorizacao, receita: { ...receita, guiaSugerida: "DAS_MEI" } });
    expect(h.match(/emissão cobrada/g)).toHaveLength(3);
    expect(h).toContain('data-dica="Uma emissão, cobrada pelo Serpro. O PDF vai para Arquivos › Fiscal."');
    expect(h).not.toContain(">Uma emissão, cobrada pelo Serpro");
  });

  it("quem não pede não vê botão nem a marca do custo", async () => {
    const h = await html({ autorizacao: { ...autorizacao, podeEditar: false }, receita: { ...receita, podePedir: false } });
    expect(h).not.toContain("emissão cobrada");
    expect(h).not.toContain("Pedir situação fiscal");
    expect(h).not.toContain("Atualizar");
  });
});

describe("o cartão Receita Federal — a Caixa Postal", () => {
  it("sem mensagem, um texto curto", async () => {
    const h = await html({ autorizacao, receita });
    expect(h).toContain("Nenhuma mensagem nova");
    expect(h).not.toContain("última em");
  });

  it("com mensagem, a lista continua e o aviso da ciência fica à vista para quem não abre", async () => {
    const h = await html({ autorizacao, receita: { ...receita, dados: { ...receita.dados, mensagens: [mensagem] } } });
    expect(h).toContain("1 mensagem nova");
    expect(h).toContain("última em 10/11/2026");
    expect(h).toContain("Termo de intimação");
    expect(h).toContain("Abrir uma mensagem dá ciência da intimação: só a coordenação do Fiscal abre.");
    expect(h).not.toContain(">Abrir</button>");
  });

  it("a coordenação abre pelo botão, que confirma a ciência antes", async () => {
    const h = await html({ autorizacao, receita: { ...receita, podeAbrir: true, dados: { ...receita.dados, mensagens: [mensagem] } } });
    expect(h).toContain(">Abrir</button>");
    expect(h).not.toContain("só a coordenação do Fiscal abre");
  });
});
