import { describe, expect, it } from "vitest";
import { tipoNoAcervo, valorDoDocumento, mapearDocumento, empresaDaLinha } from "./mapeamento";
import type { DocumentoDoSped } from "./client";

const CHAVE_NFE = "41260917122471000175550010000001231123456781";
const CHAVE_NFCE = "41260917122471000175650020000004561876543211";
const BLD = "17122471000175";
const ZAHRA = "39952818000140";

function doc(over: Partial<DocumentoDoSped> = {}): DocumentoDoSped {
  return {
    tipo: "nfe",
    identificador: "abc-123",
    chave: CHAVE_NFE,
    cnpj_raiz: "17122471",
    sentido: "entrada",
    competencia: "2026-09",
    numero: "123",
    serie: "1",
    data_emissao: "2026-09-01T10:30:00-03:00",
    cnpj_emitente: ZAHRA,
    nome_emitente: "ZAHRA PERFUMES LTDA",
    cnpj_destinatario: BLD,
    nome_destinatario: "BLD LOGISTICA LTDA",
    valor: "1234.50",
    detalhe: "completo",
    renderizavel: true,
    removido: false,
    atualizado_em: "2026-09-02T08:00:00",
    ...over,
  };
}

function mapeado(over: Partial<DocumentoDoSped> = {}) {
  const r = mapearDocumento(doc(over));
  if ("motivo" in r) throw new Error(`esperava sucesso, veio ${r.motivo}: ${r.detalhe}`);
  return r;
}

describe("tipoNoAcervo", () => {
  // O índice do SPED não tem NFC-e: modelo 65 chega como "nfe". A chave é quem
  // sabe — posições 21-22. Confiar no campo `tipo` classificaria toda NFC-e
  // como NF-e no acervo.
  it("distingue NFC-e de NF-e pela chave, não pelo campo tipo", () => {
    expect(tipoNoAcervo(doc({ tipo: "nfe", chave: CHAVE_NFE }))).toBe("NFE");
    expect(tipoNoAcervo(doc({ tipo: "nfe", chave: CHAVE_NFCE }))).toBe("NFCE");
  });

  it("CT-e e NFS-e vêm do próprio campo", () => {
    expect(tipoNoAcervo(doc({ tipo: "cte" }))).toBe("CTE");
    expect(tipoNoAcervo(doc({ tipo: "nfse", chave: null }))).toBe("NFSE");
  });

  it("NF-e sem chave continua NF-e, não vira NFC-e por descuido", () => {
    expect(tipoNoAcervo(doc({ tipo: "nfe", chave: null }))).toBe("NFE");
  });
});

describe("valorDoDocumento", () => {
  // O contrato é explícito: valor nulo anda junto com detalhe "parcial", e
  // significa linha montada só do que a chave carrega. Zero somaria no
  // fechamento um número que ninguém apurou.
  it("valor nulo continua nulo — nunca vira zero", () => {
    expect(valorDoDocumento(doc({ valor: null }))).toBeNull();
    expect(valorDoDocumento(doc({ valor: "" }))).toBeNull();
  });

  it("atravessa como string, sem passar por float", () => {
    expect(valorDoDocumento(doc({ valor: "1234.50" }))).toBe("1234.50");
    expect(typeof valorDoDocumento(doc({ valor: 99.9 }))).toBe("string");
  });
});

describe("mapearDocumento", () => {
  it("traduz os campos que o acervo guarda", () => {
    const m = mapeado();
    expect(m.tipo).toBe("NFE");
    expect(m.dedupKey).toBe(CHAVE_NFE);
    expect(m.numero).toBe("123");
    expect(m.emitenteDocumento).toBe(ZAHRA);
    expect(m.destinatarioDocumento).toBe(BLD);
    expect(m.spedTipo).toBe("nfe");
    expect(m.spedIdentificador).toBe("abc-123");
  });

  // A competência vem pronta do índice. Derivar da emissão discordaria do lado
  // de lá justamente na NFS-e, onde o mês do serviço e o da emissão diferem.
  it("usa a competência do índice, não a data de emissão", () => {
    const m = mapeado({ competencia: "2026-08", data_emissao: "2026-09-05T09:00:00" });
    expect(m.competencia).toBe("2026-08");
  });

  // A mesma chave do upload: é o que faz o documento que alguém já subiu à mão
  // ser reconhecido pela sincronização em vez de virar segunda linha.
  it("a chave de deduplicação é a mesma que a entrada manual produz", () => {
    expect(mapeado().dedupKey).toBe(CHAVE_NFE);
    const nfse = mapeado({ tipo: "nfse", chave: null, serie: "A", numero: "4321", competencia: "2026-08" });
    expect(nfse.dedupKey).toBe(`NFSE:${ZAHRA}:A:4321:2026-08`);
  });

  it("marca parcial e guarda renderizavel", () => {
    const m = mapeado({ detalhe: "parcial", valor: null, renderizavel: false });
    expect(m.completude).toBe("PARCIAL");
    expect(m.valor).toBeNull();
    expect(m.renderizavel).toBe(false);
  });

  it("recusa data inválida em vez de assumir hoje", () => {
    expect(mapearDocumento(doc({ data_emissao: "ontem" }))).toMatchObject({ motivo: "data_invalida" });
  });

  it("recusa documento sem emitente — sem ele não há identidade de NFS-e", () => {
    expect(mapearDocumento(doc({ cnpj_emitente: null }))).toMatchObject({ motivo: "sem_emitente" });
  });

  it("NF-e sem chave não tem identidade para deduplicar", () => {
    expect(mapearDocumento(doc({ tipo: "nfe", chave: null }))).toMatchObject({ motivo: "sem_identidade" });
  });
});

describe("empresaDaLinha", () => {
  const porDoc = new Map([
    [BLD, "c-bld"],
    [ZAHRA, "c-zahra"],
  ]);

  it("casa pela ponta que está no cadastro", () => {
    expect(empresaDaLinha({ emitenteDocumento: ZAHRA, destinatarioDocumento: "999" }, porDoc)).toEqual({
      companyId: "c-zahra",
    });
    expect(empresaDaLinha({ emitenteDocumento: "999", destinatarioDocumento: BLD }, porDoc)).toEqual({
      companyId: "c-bld",
    });
  });

  // O índice chama isto de `sem_atribuicao` no diagnóstico dele. É caso
  // esperado, não erro — e não deve virar linha pendurada em empresa qualquer.
  it("nenhuma ponta conhecida devolve nulo, não um palpite", () => {
    expect(empresaDaLinha({ emitenteDocumento: "111", destinatarioDocumento: "222" }, porDoc)).toBeNull();
  });

  // Mesma ambiguidade da entrada manual: transferência entre estabelecimentos.
  it("as duas pontas conhecidas e diferentes é ambígua", () => {
    expect(empresaDaLinha({ emitenteDocumento: BLD, destinatarioDocumento: ZAHRA }, porDoc)).toEqual({
      ambigua: true,
    });
  });

  it("as duas pontas na MESMA empresa não é ambíguo — é ela mesma", () => {
    expect(empresaDaLinha({ emitenteDocumento: BLD, destinatarioDocumento: BLD }, porDoc)).toEqual({
      companyId: "c-bld",
    });
  });

  it("sem destinatário, decide só pelo emitente", () => {
    expect(empresaDaLinha({ emitenteDocumento: BLD, destinatarioDocumento: null }, porDoc)).toEqual({
      companyId: "c-bld",
    });
  });
});
