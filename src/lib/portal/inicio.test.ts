import { describe, expect, it } from "vitest";
import {
  blocosDoInicio,
  comEmpresa,
  destinoDosDocumentos,
  janelaDosProximosDias,
  oQuePrecisaDeVoce,
  primeiroNome,
  saudacaoDaHora,
  type ContagensDaAtencao,
} from "./inicio";
import { telasVisiveis } from "./telas";

const moeda = (c: number) => `R$ ${(c / 100).toFixed(2)}`;

const NADA: ContagensDaAtencao = {
  aprovacoes: null,
  pendencias: null,
  solicitacoesAguardando: null,
  solicitacoesRespondidas: null,
  processosAguardando: null,
  envios: null,
  comunicados: null,
};

const telas = (modulos: string[]) => new Set(telasVisiveis(new Set(modulos)).map((t) => t.href));

describe("oQuePrecisaDeVoce — o topo do Início", () => {
  it("sem tela nenhuma, ou com tudo zerado, a lista é vazia (e o Início diz 'Nada esperando por você')", () => {
    expect(oQuePrecisaDeVoce(NADA, moeda)).toEqual([]);
    expect(
      oQuePrecisaDeVoce(
        {
          aprovacoes: { n: 0, centavos: 0 },
          pendencias: 0,
          solicitacoesAguardando: 0,
          solicitacoesRespondidas: 0,
          processosAguardando: 0,
          envios: 0,
          comunicados: 0,
        },
        moeda
      )
    ).toEqual([]);
  });

  it("primeiro o que o cliente precisa fazer, depois o que ele só precisa ler", () => {
    const itens = oQuePrecisaDeVoce(
      {
        aprovacoes: { n: 2, centavos: 150000 },
        pendencias: 1,
        solicitacoesAguardando: 3,
        solicitacoesRespondidas: 1,
        processosAguardando: 1,
        envios: 2,
        comunicados: 4,
      },
      moeda
    );
    expect(itens.map((i) => i.chave)).toEqual([
      "aprovacoes",
      "pendencias",
      "solicitacoesAguardando",
      "processosAguardando",
      "envios",
      "solicitacoesRespondidas",
      "comunicados",
    ]);
    expect(itens.map((i) => i.tom)).toEqual(["pedido", "pedido", "pedido", "pedido", "pedido", "aviso", "aviso"]);
  });

  it("concorda em número", () => {
    const um = oQuePrecisaDeVoce({ ...NADA, pendencias: 1, comunicados: 1 }, moeda);
    expect(um[0].texto).toBe("pedido da equipe esperando a sua resposta");
    expect(um[1].texto).toBe("comunicado novo");
    const varios = oQuePrecisaDeVoce({ ...NADA, pendencias: 5, comunicados: 2 }, moeda);
    expect(varios[0].texto).toBe("pedidos da equipe esperando a sua resposta");
    expect(varios[1].texto).toBe("comunicados novos");
  });

  it("a aprovação leva o valor total no detalhe", () => {
    const [aprovacao] = oQuePrecisaDeVoce({ ...NADA, aprovacoes: { n: 2, centavos: 150000 } }, moeda);
    expect(aprovacao.quantidade).toBe(2);
    expect(aprovacao.detalhe).toBe("R$ 1500.00 no total");
    expect(aprovacao.acao).toBe("Aprovar");
  });

  it("documento do escritório esperando aceite é pedido, e leva aos documentos (08/10/2026)", () => {
    const [um] = oQuePrecisaDeVoce({ ...NADA, envios: 1 }, moeda);
    expect(um).toMatchObject({ chave: "envios", tom: "pedido", href: "/portal/envios", texto: "documento esperando o seu aceite" });
    const [varios] = oQuePrecisaDeVoce({ ...NADA, envios: 3 }, moeda);
    expect(varios.texto).toBe("documentos esperando o seu aceite");
    // Sem a tela (null) ou sem nada esperando (0), não entra.
    expect(oQuePrecisaDeVoce({ ...NADA, envios: 0 }, moeda)).toEqual([]);
  });

  it("cada botão leva à tela já no recorte do que espera o cliente", () => {
    const itens = oQuePrecisaDeVoce(
      { ...NADA, pendencias: 1, solicitacoesAguardando: 1, processosAguardando: 1, aprovacoes: { n: 1, centavos: 1 } },
      moeda
    );
    const href = Object.fromEntries(itens.map((i) => [i.chave, i.href]));
    expect(href.pendencias).toBe("/portal/pendencias?recorte=aguardando");
    expect(href.solicitacoesAguardando).toBe("/portal/solicitacoes?recorte=aguardando");
    expect(href.processosAguardando).toBe("/portal/processos?recorte=aguardando");
    expect(href.aprovacoes).toBe("/portal/aprovacoes");
  });

  it("todo botão aponta para dentro do portal, e nenhum texto cita o escritório", () => {
    const itens = oQuePrecisaDeVoce(
      {
        aprovacoes: { n: 1, centavos: 1 },
        pendencias: 1,
        solicitacoesAguardando: 1,
        solicitacoesRespondidas: 1,
        processosAguardando: 1,
        envios: 1,
        comunicados: 1,
      },
      moeda
    );
    for (const i of itens) {
      expect(i.href.startsWith("/portal/")).toBe(true);
      expect(i.texto).not.toMatch(/\b41\b/);
    }
  });
});

describe("blocosDoInicio — o mesmo critério do menu", () => {
  it("sem módulo: nada de financeiro, Societário nem pedidos — só os atalhos fixos", () => {
    const b = blocosDoInicio(telas([]));
    expect(b.financeiro).toBeNull();
    expect(b.societario).toBe(false);
    expect(b.pedir).toBeNull();
    expect(Object.values(b.atencao).every((v) => v === false)).toBe(true);
  });

  it("BPO com contas a pagar e cobrança: números do a pagar e o atraso levando à cobrança", () => {
    const b = blocosDoInicio(telas(["bpo_contas_pagar", "bpo_contas_receber", "bpo_cobranca", "bpo_fluxo_caixa", "bpo_dre"]));
    expect(b.financeiro?.pagar).toBe(true);
    expect(b.financeiro?.receberEmAtraso).toBe("/portal/cobranca");
    // Três botões cabem numa linha do celular: Contas a receber fica de fora quando há Contas a pagar.
    expect(b.financeiro?.atalhos.map((a) => a.href)).toEqual(["/portal/pagar", "/portal/fluxo-de-caixa", "/portal/dre"]);
  });

  it("só contas a receber: o atraso leva à lista do a receber, e o atalho dela aparece", () => {
    const b = blocosDoInicio(telas(["bpo_contas_receber"]));
    expect(b.financeiro?.pagar).toBe(false);
    expect(b.financeiro?.receberEmAtraso).toBe("/portal/receber");
    expect(b.financeiro?.atalhos.map((a) => a.href)).toEqual(["/portal/receber"]);
  });

  it("só fluxo de caixa: o bloco existe, sem números de contas", () => {
    const b = blocosDoInicio(telas(["bpo_fluxo_caixa"]));
    expect(b.financeiro).not.toBeNull();
    expect(b.financeiro?.pagar).toBe(false);
    expect(b.financeiro?.receberEmAtraso).toBeNull();
  });

  it("aprovação só para quem tem a tela de aprovações", () => {
    expect(blocosDoInicio(telas(["bpo_contas_pagar"])).atencao.aprovacoes).toBe(false);
    expect(blocosDoInicio(telas(["bpo_aprovacoes"])).atencao.aprovacoes).toBe(true);
  });

  it("com o canal do portal: pendências, solicitações, comunicados e envios — e pedir é uma solicitação nova", () => {
    const b = blocosDoInicio(telas(["portal_solicitacoes"]));
    expect(b.atencao).toMatchObject({ pendencias: true, solicitacoes: true, comunicados: true, envios: true });
    expect(b.pedir).toEqual({ href: "/portal/solicitacoes/nova", rotulo: "Pedir algo à equipe" });
  });

  it("sem solicitações e com a conversa, pedir é mandar mensagem", () => {
    expect(blocosDoInicio(telas(["bpo_comunicacao"])).pedir?.href).toBe("/portal/comunicacao");
  });

  it("Societário: o bloco dos processos e o 'parado esperando você'", () => {
    const b = blocosDoInicio(telas(["societario_processos"]));
    expect(b.societario).toBe(true);
    expect(b.atencao.processos).toBe(true);
    expect(b.financeiro).toBeNull();
  });
});

describe("destinoDosDocumentos — links antigos de /portal", () => {
  it("sem parâmetro da lista, fica no Início", () => {
    expect(destinoDosDocumentos({})).toBeNull();
    expect(destinoDosDocumentos({ competencia: "" })).toBeNull();
  });

  it("a empresa sozinha é filtro do próprio Início", () => {
    expect(destinoDosDocumentos({ empresa: "e1" })).toBeNull();
  });

  it("competência, página ou busca vão para a rota nova com tudo o que traziam", () => {
    expect(destinoDosDocumentos({ competencia: "2026-09" })).toBe("/portal/documentos?competencia=2026-09");
    expect(destinoDosDocumentos({ pagina: "3", competencia: "2026-08", empresa: "e1" })).toBe(
      "/portal/documentos?pagina=3&competencia=2026-08&empresa=e1"
    );
    expect(destinoDosDocumentos({ busca: "nota 12" })).toBe("/portal/documentos?busca=nota+12");
  });

  it("parâmetro repetido segue repetido, e o vazio cai", () => {
    expect(destinoDosDocumentos({ competencia: ["2026-09", ""], x: undefined })).toBe("/portal/documentos?competencia=2026-09");
  });
});

describe("saudação, nome e datas", () => {
  it("bom dia, boa tarde e boa noite pela hora de Brasília", () => {
    expect(saudacaoDaHora(5)).toBe("Bom dia");
    expect(saudacaoDaHora(11)).toBe("Bom dia");
    expect(saudacaoDaHora(12)).toBe("Boa tarde");
    expect(saudacaoDaHora(17)).toBe("Boa tarde");
    expect(saudacaoDaHora(18)).toBe("Boa noite");
    expect(saudacaoDaHora(2)).toBe("Boa noite");
  });

  it("o primeiro nome, e vazio sem nome", () => {
    expect(primeiroNome("  Maria   da Silva ")).toBe("Maria");
    expect(primeiroNome(null)).toBe("");
    expect(primeiroNome("")).toBe("");
  });

  it("a janela da semana vai de hoje a hoje + 7, e atravessa o mês", () => {
    expect(janelaDosProximosDias("2026-10-05")).toEqual({ inicioKey: "2026-10-05", fimKey: "2026-10-12", depoisKey: "2026-10-13" });
    expect(janelaDosProximosDias("2026-10-28")).toEqual({ inicioKey: "2026-10-28", fimKey: "2026-11-04", depoisKey: "2026-11-05" });
  });

  it("a empresa escolhida segue só para as telas que a aceitam", () => {
    expect(comEmpresa("/portal/fluxo-de-caixa", "e 1")).toBe("/portal/fluxo-de-caixa?empresa=e%201");
    expect(comEmpresa("/portal/documentos", "e1")).toBe("/portal/documentos?empresa=e1");
    expect(comEmpresa("/portal/pagar", "e1")).toBe("/portal/pagar");
    expect(comEmpresa("/portal/dre", null)).toBe("/portal/dre");
  });
});
