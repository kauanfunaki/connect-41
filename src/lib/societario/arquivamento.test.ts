import { describe, it, expect } from "vitest";
import {
  arquivar,
  anoDaTaxa,
  destinatarios,
  podeEnviar,
  nomeDeArquivoSeguro,
  assuntoDoEnvio,
} from "./arquivamento";

const HOJE = new Date("2026-09-11T15:00:00Z");

describe("arquivar", () => {
  // A convenção literal do fluxograma do setor: Societário › Prefeitura ›
  // Bombeiros › ano, e "EMPRESA - Taxa Bombeiros 2026".
  it("segue a convenção escrita no fluxo do setor", () => {
    const a = arquivar({
      empresaNome: "Irriga Four Ltda",
      ano: 2026,
      tipo: "Taxa Bombeiros",
      orgao: "Bombeiros",
    });
    expect(a.pasta).toEqual(["Societário", "Prefeitura", "Bombeiros", "2026"]);
    expect(a.nome).toBe("IRRIGA FOUR LTDA - Taxa Bombeiros 2026");
    expect(a.caminho).toBe("Societário › Prefeitura › Bombeiros › 2026 › IRRIGA FOUR LTDA - Taxa Bombeiros 2026");
  });

  it("o assunto do e-mail é o mesmo nome", () => {
    const a = arquivar({ empresaNome: "ACME", ano: 2026, tipo: "Taxa Bombeiros", orgao: "Bombeiros" });
    expect(assuntoDoEnvio(a)).toBe(a.nome);
  });
});

describe("nomeDeArquivoSeguro", () => {
  it("tira o que o sistema de arquivos recusa", () => {
    expect(nomeDeArquivoSeguro('AC/ME: "teste" <x>|y?')).toBe("ACME teste xy");
  });

  it("colapsa espaço repetido e apara as pontas", () => {
    expect(nomeDeArquivoSeguro("  ACME   LTDA  ")).toBe("ACME LTDA");
  });

  // Ver "SAO JOSE" na pasta faria alguém achar que é outra empresa.
  it("NÃO tira acento", () => {
    expect(nomeDeArquivoSeguro("Transportes São José")).toBe("Transportes São José");
  });
});

describe("anoDaTaxa", () => {
  it("é o ano do vencimento, não o de hoje", () => {
    expect(anoDaTaxa(new Date("2026-03-10T12:00:00Z"), HOJE)).toBe(2026);
  });

  // O caso que dá o motivo da regra: guia de 2026 emitida em dezembro de 2025.
  // Arquivá-la em 2025 é onde ela some no ano seguinte.
  it("guia do ano que vem vai para a pasta do ano que vem", () => {
    const hojeEmDezembro = new Date("2025-12-20T12:00:00Z");
    expect(anoDaTaxa(new Date("2026-01-31T12:00:00Z"), hojeEmDezembro)).toBe(2026);
  });

  it("sem vencimento, cai no ano de hoje", () => {
    expect(anoDaTaxa(null, HOJE)).toBe(2026);
  });

  // A virada é a de São Paulo: 01/01 às 02:00 UTC ainda é 31/12 aqui.
  it("a virada do ano é a de São Paulo", () => {
    expect(anoDaTaxa(new Date("2027-01-01T02:00:00Z"), HOJE)).toBe(2026);
    expect(anoDaTaxa(new Date("2027-01-01T04:00:00Z"), HOJE)).toBe(2027);
  });
});

describe("destinatarios", () => {
  it("junta os e-mails válidos", () => {
    const d = destinatarios([
      { email: "financeiro@acme.com.br", rotulo: "Financeiro" },
      { email: "socio@acme.com.br", rotulo: "Sócio" },
    ]);
    expect(d.para).toEqual(["financeiro@acme.com.br", "socio@acme.com.br"]);
    expect(d.descartados).toEqual([]);
  });

  // Contato sem e-mail e e-mail digitado errado produzem o mesmo resultado — a
  // pessoa não recebe — e só um dos dois é conserto de cadastro.
  it("separa quem está sem e-mail de quem está com e-mail errado", () => {
    const d = destinatarios([
      { email: null, rotulo: "Contador" },
      { email: "socio arroba acme", rotulo: "Sócio" },
      { email: "  ", rotulo: "Fiscal" },
    ]);
    expect(d.para).toEqual([]);
    expect(d.descartados).toEqual([
      { rotulo: "Contador", motivo: "sem e-mail cadastrado" },
      { rotulo: "Sócio", motivo: "e-mail inválido: socio arroba acme" },
      { rotulo: "Fiscal", motivo: "sem e-mail cadastrado" },
    ]);
  });

  // Mandar duas vezes para o mesmo endereço é o detalhe que faz um cliente
  // achar que o escritório não se organiza.
  it("a duplicata sai, sem virar descarte", () => {
    const d = destinatarios([
      { email: "x@acme.com", rotulo: "A" },
      { email: "X@ACME.COM", rotulo: "B" },
    ]);
    expect(d.para).toEqual(["x@acme.com"]);
    expect(d.descartados).toEqual([]);
  });

  it("lista vazia não quebra", () => {
    expect(destinatarios([])).toEqual({ para: [], descartados: [] });
  });
});

describe("podeEnviar", () => {
  const comEmail = destinatarios([{ email: "x@acme.com", rotulo: "A" }]);

  it("com anexo e destinatário, pode", () => {
    expect(podeEnviar(comEmail, true).pode).toBe(true);
  });

  it("sem anexo, recusa", () => {
    const v = podeEnviar(comEmail, false);
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toContain("Anexe");
  });

  // Alguns servidores aceitam lista vazia sem reclamar, e aí a tela diz
  // "enviado" sobre um e-mail que não foi a lugar nenhum.
  it("sem destinatário, recusa — e distingue cadastro vazio de e-mail errado", () => {
    const semNada = podeEnviar(destinatarios([]), true);
    expect(semNada.pode).toBe(false);
    if (!semNada.pode) expect(semNada.motivo).toContain("não tem contato cadastrado");

    const soInvalidos = podeEnviar(destinatarios([{ email: "errado", rotulo: "A" }]), true);
    expect(soInvalidos.pode).toBe(false);
    if (!soInvalidos.pode) expect(soInvalidos.motivo).toContain("Corrija o cadastro");
  });
});
