import { describe, expect, it } from "vitest";
import { linhasDoComprovante, numeroDoComprovante, pdfDoComprovante, type DadosDoComprovante } from "./comprovante";

// O comprovante de leitura do envio (22/10/2026): o que o papel diz.

const base: DadosDoComprovante = {
  envioId: "9a1b2c3d-4e5f-4a00-8b00-1234567890ab",
  escritorioNome: "41 Contábil",
  empresaNome: "Padaria São João",
  empresaDocumento: "12.345.678/0001-90",
  titulo: "Contrato de prestação de serviços",
  conteudoSha256: "a".repeat(64),
  anexo: { nome: "contrato.pdf", sha256: "b".repeat(64) },
  pedeAceite: true,
  criadoPor: "Ana",
  criadoEm: new Date("2026-10-10T12:00:00Z"),
  publicadoEm: new Date("2026-10-10T13:00:00Z"),
  agendadoPara: null,
  lembreteEnviadoEm: null,
  destinatarios: [
    {
      email: "dono@padaria.com",
      enviadoEm: new Date("2026-10-10T13:00:05Z"),
      primeiraVisualizacao: new Date("2026-10-11T14:20:30Z"),
      aceite: { nome: "João da Silva", em: new Date("2026-10-11T14:25:00Z"), ip: "200.1.2.3" },
    },
    { email: "contato@padaria.com", enviadoEm: new Date("2026-10-10T13:00:06Z"), primeiraVisualizacao: null, aceite: null },
  ],
  eventos: [
    { em: new Date("2026-10-11T14:25:00Z"), acao: "SIGNED", email: "dono@padaria.com", ip: "200.1.2.3" },
    { em: new Date("2026-10-11T14:20:30Z"), acao: "VIEWED", email: "dono@padaria.com", ip: "200.1.2.3" },
    { em: new Date("2026-10-11T14:22:00Z"), acao: "DOWNLOADED", email: "dono@padaria.com", ip: "200.1.2.3" },
  ],
  emitidoPor: "Bruno",
  emitidoEm: new Date("2026-10-22T15:00:00Z"),
};

const valorDe = (linhas: { rotulo: string; valor: string }[], rotulo: string) => linhas.find((l) => l.rotulo === rotulo)?.valor;

describe("comprovante de leitura", () => {
  it("o número é o começo do id do envio", () => {
    expect(numeroDoComprovante(base.envioId)).toBe("9A1B2C3D");
    expect(linhasDoComprovante(base).numero).toBe("9A1B2C3D");
  });

  it("escritório, empresa com CNPJ, documento, hashes, quem criou e quando publicou", () => {
    const c = linhasDoComprovante(base);
    expect(c.cabecalho[0]).toBe("41 Contábil");
    expect(valorDe(c.envio, "Empresa")).toBe("Padaria São João — 12.345.678/0001-90");
    expect(valorDe(c.envio, "Hash do conteúdo")).toBe(`SHA-256 ${"a".repeat(64)}`);
    expect(valorDe(c.envio, "Hash do anexo")).toBe(`SHA-256 ${"b".repeat(64)}`);
    expect(valorDe(c.envio, "Criado por")).toBe("Ana em 10/10/2026, 09:00:00");
    expect(valorDe(c.envio, "Publicado em")).toBe("10/10/2026, 10:00:00");
    expect(valorDe(c.envio, "Agendado para")).toBeUndefined();
  });

  it("o resumo diz quem abriu e o aceite, em horário de Brasília", () => {
    const c = linhasDoComprovante(base);
    expect(c.resumo).toContain("aberto por 1 de 2 destinatário(s)");
    expect(c.resumo).toContain("11/10/2026, 11:20:30");
    expect(c.resumo).toContain("aceite eletrônico foi dado por João da Silva em 11/10/2026, 11:25:00, do IP 200.1.2.3");
  });

  it("os destinatários: e-mail enviado, abertura e aceite de cada um", () => {
    const [dono, contato] = linhasDoComprovante(base).destinatarios;
    expect(dono!.titulo).toBe("dono@padaria.com");
    expect(dono!.linhas).toEqual([
      "E-mail enviado em 10/10/2026, 10:00:05",
      "Primeira abertura em 11/10/2026, 11:20:30",
      "Aceite de João da Silva em 11/10/2026, 11:25:00 (IP 200.1.2.3)",
    ]);
    expect(contato!.linhas).toEqual(["E-mail enviado em 10/10/2026, 10:00:06", "Não abriu", "Sem aceite"]);
  });

  it("o log vai do mais antigo ao mais novo, com a ação e o IP", () => {
    expect(linhasDoComprovante(base).log).toEqual([
      ["11/10/2026, 11:20:30", "Abriu", "dono@padaria.com", "200.1.2.3"],
      ["11/10/2026, 11:22:00", "Baixou o anexo", "dono@padaria.com", "200.1.2.3"],
      ["11/10/2026, 11:25:00", "Deu o aceite", "dono@padaria.com", "200.1.2.3"],
    ]);
  });

  it("sem aceite pedido, sem linhas de aceite; ninguém abriu, o resumo diz", () => {
    const c = linhasDoComprovante({
      ...base,
      pedeAceite: false,
      anexo: { nome: "x.pdf", sha256: null },
      agendadoPara: new Date("2026-10-10T11:00:00Z"),
      lembreteEnviadoEm: new Date("2026-10-15T13:00:00Z"),
      destinatarios: [base.destinatarios[1]!],
      eventos: [],
    });
    expect(c.resumo).toBe('Até a emissão, ninguém do cliente abriu o documento "Contrato de prestação de serviços".');
    expect(c.destinatarios[0]!.linhas).toEqual(["E-mail enviado em 10/10/2026, 10:00:06", "Não abriu"]);
    expect(valorDe(c.envio, "Hash do anexo")).toBe("arquivo não encontrado no armazenamento");
    expect(valorDe(c.envio, "Agendado para")).toBe("10/10/2026, 08:00:00");
    expect(valorDe(c.envio, "Lembrete enviado em")).toBe("15/10/2026, 10:00:00");
  });

  it("gera um PDF, mesmo com caractere fora da fonte e log longo (várias páginas)", async () => {
    const eventos = Array.from({ length: 150 }, (_, i) => ({
      em: new Date(Date.UTC(2026, 9, 11, 12, i)),
      acao: "VIEWED" as const,
      email: `pessoa-com-um-email-bem-comprido-${i}@empresa-de-nome-longo.com.br`,
      ip: "2804:14c:5b80:8000:1234:5678:9abc:def0",
    }));
    const bytes = await pdfDoComprovante({ ...base, titulo: "Contrato ✅ 😀", eventos });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });
});
