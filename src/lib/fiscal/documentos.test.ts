import { describe, expect, it } from "vitest";
import {
  competenciaDe,
  chaveDeDeduplicacao,
  direcaoDoLancamento,
  contaParaOFinanceiro,
  precisaDeEstorno,
} from "./documentos";

const CHAVE = "41260917122471000175550010000001231123456781";
const BLD = "17122471000175";
const ZAHRA = "39952818000140";

describe("competenciaDe", () => {
  it("agrupa por mês no formato AAAA-MM", () => {
    expect(competenciaDe(new Date("2026-09-01T10:30:00-03:00"))).toBe("2026-09");
    expect(competenciaDe(new Date("2026-01-15T12:00:00Z"))).toBe("2026-01");
  });

  // Virada de mês é onde o fuso aparece: às 22h de 30/09 em -03:00 já é 01/10
  // em UTC, e a nota tem de cair sempre na mesma competência, rode o Connect
  // onde rodar.
  it("usa UTC — a mesma nota não muda de competência conforme o servidor", () => {
    const naVirada = new Date("2026-09-30T22:00:00-03:00");
    expect(naVirada.toISOString()).toBe("2026-10-01T01:00:00.000Z");
    expect(competenciaDe(naVirada)).toBe("2026-10");
  });
});

describe("chaveDeDeduplicacao", () => {
  const base = { emitenteDocumento: BLD, numero: "123", serie: "1", competencia: "2026-09" };

  it("para NF-e/NFC-e/CT-e a identidade é a própria chave de acesso", () => {
    for (const tipo of ["NFE", "NFCE", "CTE"] as const) {
      expect(chaveDeDeduplicacao({ ...base, tipo, chaveAcesso: CHAVE })).toBe(CHAVE);
    }
  });

  it("limpa pontuação da chave antes de usar", () => {
    expect(chaveDeDeduplicacao({ ...base, tipo: "NFE", chaveAcesso: `${CHAVE.slice(0, 4)} ${CHAVE.slice(4)}` })).toBe(CHAVE);
  });

  // Sem identidade não entra: melhor recusar do que inventar uma chave que
  // deduplicaria errado no reenvio.
  it("NF-e sem chave de 44 dígitos não tem identidade", () => {
    expect(chaveDeDeduplicacao({ ...base, tipo: "NFE", chaveAcesso: null })).toBeNull();
    expect(chaveDeDeduplicacao({ ...base, tipo: "NFE", chaveAcesso: "123" })).toBeNull();
  });

  it("NFS-e usa prestador + série + número + competência", () => {
    expect(chaveDeDeduplicacao({ ...base, tipo: "NFSE" })).toBe(`NFSE:${BLD}:1:123:2026-09`);
  });

  // Prefeitura que reinicia numeração por ano faria a nota 1 de 2025 colidir
  // com a nota 1 de 2026 se a competência ficasse de fora.
  it("competência entra na chave da NFS-e por causa de numeração reiniciada", () => {
    const a = chaveDeDeduplicacao({ ...base, tipo: "NFSE", competencia: "2025-09" });
    const b = chaveDeDeduplicacao({ ...base, tipo: "NFSE", competencia: "2026-09" });
    expect(a).not.toBe(b);
  });

  it("prestadores diferentes com o mesmo número não colidem", () => {
    const a = chaveDeDeduplicacao({ ...base, tipo: "NFSE" });
    const b = chaveDeDeduplicacao({ ...base, tipo: "NFSE", emitenteDocumento: ZAHRA });
    expect(a).not.toBe(b);
  });

  it("série ausente é campo vazio, não campo omitido", () => {
    const semSerie = chaveDeDeduplicacao({ ...base, tipo: "NFSE", serie: null });
    expect(semSerie).toBe(`NFSE:${BLD}::123:2026-09`);
    expect(semSerie).not.toBe(chaveDeDeduplicacao({ ...base, tipo: "NFSE", serie: "." }));
  });

  it("NFS-e sem prestador ou sem número não tem identidade", () => {
    expect(chaveDeDeduplicacao({ ...base, tipo: "NFSE", emitenteDocumento: "" })).toBeNull();
    expect(chaveDeDeduplicacao({ ...base, tipo: "NFSE", numero: "  " })).toBeNull();
  });
});

describe("direcaoDoLancamento", () => {
  const doc = { emitenteDocumento: ZAHRA, destinatarioDocumento: BLD };

  it("empresa destinatária recebeu, então tem a pagar", () => {
    expect(direcaoDoLancamento(BLD, doc)).toBe("PAGAR");
  });

  it("empresa emitente vendeu, então tem a receber", () => {
    expect(direcaoDoLancamento(ZAHRA, doc)).toBe("RECEBER");
  });

  it("empresa em nenhuma das pontas fica indefinida", () => {
    expect(direcaoDoLancamento("41397500000196", doc)).toBe("INDEFINIDA");
  });

  // Transferência entre estabelecimentos da mesma empresa: nota de si para si.
  // Chutar um lado lançaria dinheiro que não existe.
  it("empresa nas duas pontas fica indefinida — quem decide é o usuário", () => {
    expect(direcaoDoLancamento(BLD, { emitenteDocumento: BLD, destinatarioDocumento: BLD })).toBe("INDEFINIDA");
  });

  it("empresa sem documento não tem como ser casada", () => {
    expect(direcaoDoLancamento(null, doc)).toBe("INDEFINIDA");
    expect(direcaoDoLancamento("", doc)).toBe("INDEFINIDA");
  });

  it("compara só dígitos, então pontuação do cadastro não atrapalha", () => {
    expect(direcaoDoLancamento("17.122.471/0001-75", doc)).toBe("PAGAR");
  });

  it("NFC-e sem destinatário identificado não vira a pagar de ninguém", () => {
    expect(direcaoDoLancamento(BLD, { emitenteDocumento: ZAHRA, destinatarioDocumento: null })).toBe("INDEFINIDA");
  });
});

describe("situação × destino", () => {
  it("nota cancelada não conta para o financeiro", () => {
    expect(contaParaOFinanceiro({ situacao: "CANCELADA", destino: "PENDENTE" })).toBe(false);
  });

  it("nota ignorada não conta, mesmo autorizada", () => {
    expect(contaParaOFinanceiro({ situacao: "AUTORIZADA", destino: "IGNORADO" })).toBe(false);
  });

  it("autorizada e não ignorada conta", () => {
    expect(contaParaOFinanceiro({ situacao: "AUTORIZADA", destino: "PENDENTE" })).toBe(true);
    expect(contaParaOFinanceiro({ situacao: "AUTORIZADA", destino: "LANCADO" })).toBe(true);
  });

  // O caso que justifica os eixos serem separados: com um status só, este
  // estado não teria como existir.
  it("cancelada depois de lançada pede estorno", () => {
    expect(precisaDeEstorno({ situacao: "CANCELADA", destino: "LANCADO" })).toBe(true);
    expect(precisaDeEstorno({ situacao: "CANCELADA", destino: "PENDENTE" })).toBe(false);
    expect(precisaDeEstorno({ situacao: "AUTORIZADA", destino: "LANCADO" })).toBe(false);
  });
});
