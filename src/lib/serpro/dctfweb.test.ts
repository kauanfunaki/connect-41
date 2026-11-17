import { describe, expect, it } from "vitest";
import { lerResposta } from "./regras";
import { corpoDoSerpro } from "./teste.fixture";
import { PDF_FICTICIO } from "./servicos.fixture";
import {
  competenciaDaRotina,
  custoDaLinha,
  deveTentar,
  lerCompetencia,
  lerDiaSemEvento,
  lerReciboDaDctfweb,
  nomeDoRecibo,
  pedidoDoRecibo,
  recusaDaDctfweb,
  TENTATIVAS_MAXIMAS,
  type LinhaDaDctfweb,
  type Momento,
} from "./dctfweb";

// A DCTFWeb do mês (17/11/2026): o pedido do recibo, a leitura das recusas da
// DCTFWeb e quando a rotina tenta — sem repetir o que já foi cobrado.

const AGORA = new Date("2026-11-17T12:00:00Z");
const momento = (m: Partial<Momento> = {}): Momento => ({
  agora: AGORA,
  hoje: "2026-11-17",
  competencia: "2026-10",
  ligada: true,
  diaSemEvento: 16,
  ultimoEvento: null,
  ...m,
});
const linha = (l: Partial<LinhaDaDctfweb> = {}): LinhaDaDctfweb => ({ situacao: "PENDENTE", tentativas: 0, ultimaTentativa: null, proximaTentativa: null, ...l });

describe("o pedido e a resposta", () => {
  it("recibo: categoria geral mensal, ano e mês da competência, sem número de recibo", () => {
    const p = pedidoDoRecibo("2026-10", "11444777000161");
    expect(p).toMatchObject({ caminho: "Consultar", idSistema: "DCTFWEB", idServico: "CONSRECIBO32", contribuinte: "11444777000161" });
    expect(p.dados).toEqual({ categoria: "GERAL_MENSAL", anoPA: "2026", mesPA: "10" });
  });

  it("lê o PDF do recibo e diz quando faltou", () => {
    expect(lerReciboDaDctfweb(lerResposta(200, corpoDoSerpro({ PDFByteArrayBase64: PDF_FICTICIO })))).toEqual({ ok: true, dados: { pdf: PDF_FICTICIO } });
    expect(lerReciboDaDctfweb(lerResposta(200, corpoDoSerpro({})))).toEqual({ ok: false, erro: "O Serpro não devolveu o PDF do recibo da DCTFWeb." });
  });

  it("as recusas da DCTFWeb pelos códigos da documentação", () => {
    const r = (codigo: string, texto = "") => recusaDaDctfweb([{ codigo, texto }]);
    expect(r("[Erro-DCTFWEB-MG08]", "Não foi encontrada Declaração com os dados informados.")).toBe("sem_declaracao");
    expect(r("Erro-DCTFWEB-MG10")).toBe("sem_declaracao");
    expect(r("[Erro-DCTFWEB-GUIA01]")).toBe("sem_declaracao");
    expect(r("[Erro-DCTFWEB-GUIA03]")).toBe("sem_debito");
    expect(r("[Erro-DCTFWEB-GUIA16]")).toBe("sem_debito");
    expect(r("[Erro-DCTFWEB-GUIA02]")).toBe("sem_debito");
    expect(r("[Erro-DCTFWEB-GUIA00]")).toBe("esperar");
    expect(r("[Erro-DCTFWEB-GUIA08]", "A declaração possui débitos com impedimento.")).toBe("erro");
    // O código pode vir diferente; o texto segura.
    expect(r("[Erro-X]", "Não há débitos com saldo a pagar para emissão da guia de pagamento.")).toBe("sem_debito");
  });
});

describe("as datas", () => {
  it("a rotina busca o mês passado, e a tela só aceita mês que já acabou", () => {
    expect(competenciaDaRotina("2026-11-17")).toBe("2026-10");
    expect(competenciaDaRotina("2027-01-05")).toBe("2026-12");
    expect(lerCompetencia("2026-10", "2026-11-17")).toBe("2026-10");
    expect(lerCompetencia("2026-11", "2026-11-17")).toBeNull();
    expect(lerCompetencia("2026-13", "2026-11-17")).toBeNull();
    expect(lerDiaSemEvento("16")).toBe(16);
    expect(lerDiaSemEvento("31")).toBeNull();
  });

  it("o nome do recibo e o custo da linha", () => {
    expect(nomeDoRecibo("Empresa: A/B", "2026-10")).toBe("Recibo DCTFWeb - Empresa A B - 10-2026.pdf");
    expect(custoDaLinha({ consultasCobradas: 1, emissoesCobradas: 1 }, { consulta: 24, emissao: 32 })).toBe(56);
  });
});

describe("quando a rotina tenta", () => {
  it("nunca no que já foi baixado ou não tem débito", () => {
    const fila = { proximaTentativa: new Date(AGORA.getTime() - 1) };
    expect(deveTentar(linha({ situacao: "BAIXADO", ...fila }), momento())).toBe(false);
    expect(deveTentar(linha({ situacao: "SEM_DEBITO", ...fila }), momento())).toBe(false);
  });

  it("empresa nova: com o evento da DCTFWeb depois da competência, ou a partir do dia sem evento", () => {
    expect(deveTentar(null, momento({ hoje: "2026-11-05", ultimoEvento: "2026-11-04" }))).toBe(true);
    // O evento de outubro é a apuração, não a transmissão da competência.
    expect(deveTentar(null, momento({ hoje: "2026-11-05", ultimoEvento: "2026-10-28" }))).toBe(false);
    expect(deveTentar(null, momento({ hoje: "2026-11-15" }))).toBe(false);
    expect(deveTentar(null, momento({ hoje: "2026-11-16" }))).toBe(true);
    // Antes de a competência acabar, nunca.
    expect(deveTentar(null, momento({ hoje: "2026-10-30", competencia: "2026-10" }))).toBe(false);
  });

  it("desligada, só a fila de quem clicou", () => {
    expect(deveTentar(null, momento({ ligada: false }))).toBe(false);
    expect(deveTentar(linha({ proximaTentativa: AGORA }), momento({ ligada: false }))).toBe(true);
    expect(deveTentar(linha({ situacao: "SEM_DECLARACAO", proximaTentativa: AGORA }), momento({ ligada: false }))).toBe(true);
  });

  it("sem declaração: só com evento novo, nunca duas vezes no mesmo dia", () => {
    const sem = linha({ situacao: "SEM_DECLARACAO", ultimaTentativa: "2026-11-05" });
    expect(deveTentar(sem, momento({ hoje: "2026-11-06", ultimoEvento: "2026-11-03" }))).toBe(false);
    expect(deveTentar(sem, momento({ hoje: "2026-11-06", ultimoEvento: "2026-11-05" }))).toBe(true);
    expect(deveTentar(sem, momento({ hoje: "2026-11-05", ultimoEvento: "2026-11-05" }))).toBe(false);
    // Sem eventos (eles podem não chegar): uma vez no dia sem evento, e só.
    expect(deveTentar(sem, momento({ hoje: "2026-11-16" }))).toBe(true);
    expect(deveTentar(linha({ situacao: "SEM_DECLARACAO", ultimaTentativa: "2026-11-16" }), momento({ hoje: "2026-11-20" }))).toBe(false);
  });

  it("erro: volta na hora marcada, até o limite de tentativas", () => {
    const vencida = new Date(AGORA.getTime() - 1);
    expect(deveTentar(linha({ situacao: "ERRO", tentativas: 1, proximaTentativa: vencida }), momento())).toBe(true);
    expect(deveTentar(linha({ situacao: "ERRO", tentativas: 1, proximaTentativa: new Date(AGORA.getTime() + 1) }), momento())).toBe(false);
    expect(deveTentar(linha({ situacao: "ERRO", tentativas: TENTATIVAS_MAXIMAS, proximaTentativa: vencida }), momento())).toBe(false);
    expect(deveTentar(linha({ situacao: "ERRO", tentativas: 1, proximaTentativa: null }), momento())).toBe(false);
  });
});
