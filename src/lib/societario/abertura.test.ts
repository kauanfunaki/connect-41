import { describe, expect, it } from "vitest";
import {
  conferirAbertura,
  dataLegivel,
  descreverAbertura,
  detalhesDaAbertura,
  lerAberturaParaAplicar,
  lerArgumentosDaAbertura,
  prazoDoTipo,
  resumoDaProposta,
  type ArgumentosDaAbertura,
  type EmpresaDaAbertura,
  type RoteiroDaAbertura,
} from "./abertura";

// Abrir processo pela Ceci (09/11/2026): os argumentos que o modelo manda, a
// conferência contra o banco e o que o cartão diz. Nada aqui chama o modelo.

const ARGS = {
  tipoId: "tipo-alteracao",
  empresaId: "empresa-1",
  responsavelId: "u-ana",
  titulo: "Mudança para a sede nova",
  prioridade: "NORMAL",
  prazo: "2026-11-20",
  jaTemos: ["i-contrato"],
  pedidoAoCliente: "Olá! Precisamos do comprovante de endereço.",
};

const ROTEIRO: RoteiroDaAbertura = {
  tipo: { id: "tipo-alteracao", nome: "Alteração contratual", ativo: true },
  vigente: {
    id: "roteiro-v3",
    versao: 3,
    etapas: [
      {
        rotulo: "Reunir documentação",
        orgao: null,
        opcional: false,
        itens: [
          { id: "i-contrato", rotulo: "Contrato social", obrigatorio: true },
          { id: "i-endereco", rotulo: "Comprovante de endereço", obrigatorio: true },
        ],
      },
      { rotulo: "Registro na Junta", orgao: "JUCEPAR", opcional: false, itens: [{ id: "i-iptu", rotulo: "Carnê do IPTU", obrigatorio: false }] },
    ],
  },
};

const EMPRESA: EmpresaDaAbertura = { id: "empresa-1", nome: "Padaria Modelo", cnpj: "11222333000181", cpf: null, situacao: "ACTIVE" };
const RESPONSAVEIS = [
  { id: "u-ana", name: "Ana Exemplo" },
  { id: "u-bia", name: "Bia Exemplo" },
];
const HOJE = "2026-11-09";

function lidos(over: Record<string, unknown> = {}): ArgumentosDaAbertura {
  const r = lerArgumentosDaAbertura({ ...ARGS, ...over });
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
}

const banco = (over: Partial<Parameters<typeof conferirAbertura>[1]> = {}) => ({
  roteiro: ROTEIRO,
  empresa: EMPRESA,
  responsaveis: RESPONSAVEIS,
  emAndamento: 0,
  ...over,
});

describe("os argumentos da proposta", () => {
  it("lê o que o modelo manda, aparado e sem item repetido", () => {
    expect(lerArgumentosDaAbertura({ ...ARGS, titulo: "  Sede nova  ", jaTemos: ["i-contrato", " i-contrato ", "i-iptu"] })).toEqual({
      ok: true,
      dados: { ...ARGS, titulo: "Sede nova", jaTemos: ["i-contrato", "i-iptu"] },
    });
  });

  it("vazio vale onde o campo é opcional na tela", () => {
    const r = lerArgumentosDaAbertura({ ...ARGS, responsavelId: "", titulo: "", prazo: "", jaTemos: [], pedidoAoCliente: "" });
    expect(r.ok).toBe(true);
  });

  // O modelo não escolhe o cliente, nem escreve o resumo do cartão.
  it("chave que o schema não conhece cai fora — tenant, resumo e roteiro não vêm do modelo", () => {
    const r = lerArgumentosDaAbertura({ ...ARGS, tenantId: "OUTRO", resumo: { empresa: "inventada" }, roteiroId: "x" });
    expect(r.ok && Object.keys(r.dados).sort()).toEqual(Object.keys(ARGS).sort());
  });

  it("recusa com a mensagem que diz de onde tirar o valor", () => {
    const erro = (over: Record<string, unknown>) => {
      const r = lerArgumentosDaAbertura({ ...ARGS, ...over });
      return r.ok ? null : r.erro;
    };
    expect(erro({ empresaId: undefined })).toMatch(/buscar_empresa/);
    expect(erro({ empresaId: "   " })).toMatch(/buscar_empresa/);
    expect(erro({ tipoId: 7 })).toMatch(/tipos_de_processo/);
    expect(erro({ prioridade: "MEDIA" })).toMatch(/BAIXA, NORMAL, ALTA ou URGENTE/);
    expect(erro({ prazo: "20/11/2026" })).toMatch(/AAAA-MM-DD/);
    expect(erro({ prazo: "2026-02-30" })).toMatch(/AAAA-MM-DD/);
    expect(erro({ titulo: "x".repeat(161) })).toMatch(/160/);
    expect(erro({ pedidoAoCliente: "x".repeat(5001) })).toMatch(/5000/);
    expect(erro({ jaTemos: "i-contrato" })).toMatch(/roteiro_do_tipo/);
    expect(erro({ jaTemos: [""] })).toMatch(/itemId/);
    expect(erro({ responsavelId: null })).toMatch(/texto/);
  });

  it("na aplicação, guarda o roteiro que o cartão mostrou", () => {
    expect(lerAberturaParaAplicar({ ...ARGS, roteiroId: "roteiro-v3", resumo: {} })).toEqual({ ok: true, dados: { ...ARGS, roteiroId: "roteiro-v3" } });
    expect(lerAberturaParaAplicar({ ...ARGS }).ok).toBe(true);
    expect(lerAberturaParaAplicar({ ...ARGS, empresaId: "" }).ok).toBe(false);
  });
});

describe("a conferência contra o banco", () => {
  it("monta o resumo do cartão com os nomes do banco, na ordem do roteiro", () => {
    const r = conferirAbertura(lidos({ jaTemos: ["i-iptu", "i-contrato"] }), banco({ emAndamento: 1 }), HOJE);
    expect(r).toEqual({
      ok: true,
      abertura: {
        ...ARGS,
        jaTemos: ["i-iptu", "i-contrato"],
        roteiroId: "roteiro-v3",
        resumo: {
          tipo: "Alteração contratual",
          versao: 3,
          etapas: 2,
          empresa: "Padaria Modelo",
          documento: "11.222.333/0001-81",
          responsavel: "Ana Exemplo",
          jaTemos: ["Contrato social", "Carnê do IPTU"],
          aPedir: ["Comprovante de endereço"],
          emAndamento: 1,
        },
      },
    });
  });

  it("sem responsável e sem prazo também vale", () => {
    const r = conferirAbertura(lidos({ responsavelId: "", prazo: "" }), banco(), HOJE);
    expect(r.ok && r.abertura.resumo.responsavel).toBeNull();
  });

  it("tipo de fora do escritório, desativado ou sem roteiro publicado não abre", () => {
    expect(conferirAbertura(lidos(), banco({ roteiro: null }), HOJE)).toEqual({ ok: false, erro: expect.stringMatching(/tipos_de_processo/) });
    expect(conferirAbertura(lidos(), banco({ roteiro: { ...ROTEIRO, tipo: { ...ROTEIRO.tipo, ativo: false } } }), HOJE)).toEqual({
      ok: false,
      erro: expect.stringMatching(/desativado/),
    });
    expect(conferirAbertura(lidos(), banco({ roteiro: { ...ROTEIRO, vigente: null } }), HOJE)).toEqual({ ok: false, erro: expect.stringMatching(/Roteiros/) });
    expect(conferirAbertura(lidos(), banco({ roteiro: { ...ROTEIRO, vigente: { ...ROTEIRO.vigente!, etapas: [] } } }), HOJE)).toEqual({
      ok: false,
      erro: expect.stringMatching(/não tem roteiro publicado/),
    });
  });

  it("empresa de fora do escritório, inativa ou cancelada não abre", () => {
    expect(conferirAbertura(lidos(), banco({ empresa: null }), HOJE)).toEqual({ ok: false, erro: expect.stringMatching(/buscar_empresa/) });
    expect(conferirAbertura(lidos(), banco({ empresa: { ...EMPRESA, situacao: "INACTIVE" } }), HOJE)).toEqual({
      ok: false,
      erro: expect.stringMatching(/"Padaria Modelo" está inativa/),
    });
    expect(conferirAbertura(lidos(), banco({ empresa: { ...EMPRESA, situacao: "CHURNED" } }), HOJE)).toEqual({ ok: false, erro: expect.stringMatching(/cancelada/) });
    expect(conferirAbertura(lidos(), banco({ empresa: { ...EMPRESA, situacao: "PROSPECT" } }), HOJE).ok).toBe(true);
  });

  it("responsável que não é do setor é recusado", () => {
    expect(conferirAbertura(lidos({ responsavelId: "u-de-outro-setor" }), banco(), HOJE)).toEqual({
      ok: false,
      erro: expect.stringMatching(/responsaveis_do_societario/),
    });
  });

  it("item que não é do roteiro vigente é recusado — o roteiro pode ter mudado", () => {
    expect(conferirAbertura(lidos({ jaTemos: ["i-contrato", "i-de-versao-velha"] }), banco(), HOJE)).toEqual({
      ok: false,
      erro: 'Um item de jaTemos não é do roteiro vigente de "Alteração contratual". Use os itemId de roteiro_do_tipo.',
    });
    expect(conferirAbertura(lidos({ jaTemos: ["a", "b"] }), banco(), HOJE)).toEqual({ ok: false, erro: expect.stringMatching(/^2 itens de jaTemos não são/) });
  });

  // "Prazo dia 20" contado errado vira data no passado: melhor perguntar.
  it("prazo que já passou volta para confirmar; hoje vale", () => {
    expect(conferirAbertura(lidos({ prazo: "2026-11-08" }), banco(), HOJE)).toEqual({
      ok: false,
      erro: expect.stringMatching(/08\/11\/2026\) já passou: hoje é 09\/11\/2026/),
    });
    expect(conferirAbertura(lidos({ prazo: HOJE }), banco(), HOJE).ok).toBe(true);
  });
});

describe("o cartão", () => {
  const preparada = () => {
    const r = conferirAbertura(lidos(), banco(), HOJE);
    if (!r.ok) throw new Error(r.erro);
    return r.abertura as unknown as Record<string, unknown>;
  };

  it("a frase diz o tipo e a empresa", () => {
    expect(descreverAbertura(preparada())).toBe("Abrir processo de Alteração contratual para Padaria Modelo");
    expect(descreverAbertura({})).toBe("Abrir um processo no Societário");
  });

  it("as linhas: empresa, tipo, título, responsável, prioridade, prazo, checklist e pedido", () => {
    expect(detalhesDaAbertura(preparada())).toEqual([
      { rotulo: "Empresa", texto: "Padaria Modelo · 11.222.333/0001-81" },
      { rotulo: "Tipo", texto: "Alteração contratual — roteiro versão 3, 2 etapas" },
      { rotulo: "Título", texto: "Mudança para a sede nova" },
      { rotulo: "Responsável", texto: "Ana Exemplo" },
      { rotulo: "Prioridade", texto: "Normal" },
      { rotulo: "Prazo combinado", texto: "20/11/2026" },
      { rotulo: "Checklist", texto: "1 de 3 já com o escritório: Contrato social." },
      { rotulo: "Pedido ao cliente", texto: "Olá! Precisamos do comprovante de endereço.", longo: true },
    ]);
  });

  it("processo do mesmo tipo em andamento vem primeiro, como atenção", () => {
    const a = { ...preparada(), resumo: { ...(preparada().resumo as object), emAndamento: 2 } };
    expect(detalhesDaAbertura(a)[0]).toEqual({
      rotulo: "Atenção",
      texto: "Já há 2 processos de Alteração contratual em andamento nesta empresa.",
      atencao: true,
    });
  });

  it("sem título, responsável, prazo nem pedido, o cartão diz isso", () => {
    const r = conferirAbertura(lidos({ titulo: "", responsavelId: "", prazo: "", jaTemos: [], pedidoAoCliente: "" }), banco(), HOJE);
    const linhas = detalhesDaAbertura(r.ok ? (r.abertura as unknown as Record<string, unknown>) : {});
    expect(linhas.map((l) => l.rotulo)).not.toContain("Título");
    expect(linhas).toEqual(
      expect.arrayContaining([
        { rotulo: "Responsável", texto: "Sem responsável" },
        { rotulo: "Prazo combinado", texto: "Sem prazo combinado" },
        { rotulo: "Checklist", texto: "Nenhum dos 3 itens está com o escritório ainda." },
        { rotulo: "Pedido ao cliente", texto: "Não mandar. 3 itens ficam sem pedido ao cliente." },
      ])
    );
  });

  it("com tudo no escritório, não há o que pedir", () => {
    const r = conferirAbertura(lidos({ jaTemos: ["i-contrato", "i-endereco", "i-iptu"], pedidoAoCliente: "" }), banco(), HOJE);
    const linhas = detalhesDaAbertura(r.ok ? (r.abertura as unknown as Record<string, unknown>) : {});
    expect(linhas.at(-1)).toEqual({ rotulo: "Pedido ao cliente", texto: "Nada a pedir — o escritório já tem tudo o que o roteiro lista." });
  });

  // A proposta que não passou pela conferência (ou veio torta do banco) não
  // mostra o texto do modelo como se fosse dado.
  it("sem resumo conferido, o cartão avisa em vez de inventar", () => {
    expect(resumoDaProposta({ resumo: { empresa: "só isso" } })).toBeNull();
    expect(detalhesDaAbertura({ ...ARGS })).toEqual([
      { rotulo: "Atenção", texto: "Esta proposta não foi conferida — peça à Ceci para montar de novo.", atencao: true },
    ]);
  });
});

describe("apoio", () => {
  it("prazo previsto do tipo, como na abertura guiada", () => {
    expect(prazoDoTipo({ variableFlow: true, expectedDaysMin: 5, expectedDaysMax: 10 })).toBe("fluxo variável");
    expect(prazoDoTipo({ variableFlow: false, expectedDaysMin: null, expectedDaysMax: null })).toBe("fluxo variável");
    expect(prazoDoTipo({ variableFlow: false, expectedDaysMin: 10, expectedDaysMax: 10 })).toBe("10 dias úteis");
    expect(prazoDoTipo({ variableFlow: false, expectedDaysMin: null, expectedDaysMax: 15 })).toBe("15 dias úteis");
    expect(prazoDoTipo({ variableFlow: false, expectedDaysMin: 10, expectedDaysMax: 15 })).toBe("10 a 15 dias úteis");
  });

  it("data legível", () => {
    expect(dataLegivel("2026-11-20")).toBe("20/11/2026");
    expect(dataLegivel("lixo")).toBe("lixo");
  });
});
