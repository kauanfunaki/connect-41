import { describe, expect, it } from "vitest";
import { lerCriterioDeAceite, marcasQueValem, mesmoTexto, planejarMigracao, pontosDoPreparo, separarCriterioDaDescricao, type CriterioLido } from "./criterioDeAceite";

// Textos fictícios, no formato que a equipe escreve desde 09/11/2026.
const BLOCO = [
  "CRITÉRIO DE ACEITE (10/11/2026)",
  "Mudança: PR #10, na main desde 10/11. Sem migration.",
  "Termos: o painel é a tela de acompanhamento.",
  "Antes de testar: ligar o módulo em Configurações.",
  "Onde testar: produção › Controle interno.",
  "Passos:",
  "1. Abra um item.",
  "2. Clique em Editar.",
  "Aprovado quando:",
  "- O item abre em visualização.",
  "- O Editar leva ao formulário.",
  "Observação: vale também no celular.",
].join("\r\n");

const estruturado = (lido: CriterioLido | null) => {
  if (!lido?.estruturado) throw new Error("esperava o critério estruturado");
  return lido;
};

describe("lerCriterioDeAceite", () => {
  it("lê o bloco inteiro, com CRLF: a data, os rótulos na ordem, os passos e os pontos de conferência", () => {
    const lido = estruturado(lerCriterioDeAceite(BLOCO));
    expect(lido.data).toBe("10/11/2026");
    expect(lido.blocos).toEqual([
      { tipo: "campo", rotulo: "Mudança", texto: "PR #10, na main desde 10/11. Sem migration." },
      { tipo: "campo", rotulo: "Termos", texto: "o painel é a tela de acompanhamento." },
      { tipo: "preparo", pontos: [{ posicao: 1, texto: "ligar o módulo em Configurações." }] },
      { tipo: "campo", rotulo: "Onde testar", texto: "produção › Controle interno." },
      { tipo: "passos", itens: ["Abra um item.", "Clique em Editar."] },
      { tipo: "conferencia", pontos: [{ posicao: 1, texto: "O item abre em visualização." }, { posicao: 2, texto: "O Editar leva ao formulário." }] },
      { tipo: "campo", rotulo: "Observação", texto: "vale também no celular." },
    ]);
    expect(lido.pontos.map(p => p.posicao)).toEqual([1, 2]);
    expect(lido.preparo).toEqual([{ posicao: 1, texto: "ligar o módulo em Configurações." }]);
  });

  it("sem o cabeçalho também vale; rótulo sem acento e em outra caixa é reconhecido", () => {
    const lido = estruturado(lerCriterioDeAceite("MUDANCA: algo\nonde testar: na lista\nObs.: cuidado\nAPROVADO QUANDO:\n- funciona"));
    expect(lido.data).toBeNull();
    expect(lido.blocos.map(b => b.tipo === "campo" ? b.rotulo : b.tipo)).toEqual(["Mudança", "Onde testar", "Observação", "conferencia"]);
  });

  it("linha sem rótulo continua o campo de cima; o comando recuado mantém o recuo", () => {
    const lido = estruturado(lerCriterioDeAceite([
      "Mudança: PR #20.",
      "Ajuste de 10/11: o rodapé também mudou.",
      "Antes de testar: rodar a migration antes do deploy:",
      "  npx prisma generate",
      "  npx prisma migrate deploy",
      "Rótulo desconhecido: fica no campo de cima.",
    ].join("\n")));
    expect(lido.blocos).toEqual([
      { tipo: "campo", rotulo: "Mudança", texto: "PR #20.\nAjuste de 10/11: o rodapé também mudou." },
      { tipo: "preparo", pontos: [{ posicao: 1, texto: "rodar a migration antes do deploy:\n  npx prisma generate\n  npx prisma migrate deploy\nRótulo desconhecido: fica no campo de cima." }] },
    ]);
  });

  it("listas: item na mesma linha do rótulo, linha que continua o item, marcador recuado como detalhe e parágrafo solto depois", () => {
    const lido = estruturado(lerCriterioDeAceite([
      "Passos: 1. Abra a tela.",
      "2) Filtre por situação",
      "e role até o fim.",
      "Aprovado quando:",
      "1. A lista não pisca.",
      "  - nem o menu.",
      "* O filtro fica marcado.",
      "",
      "Um parágrafo depois da lista.",
    ].join("\n")));
    expect(lido.blocos).toEqual([
      { tipo: "passos", itens: ["Abra a tela.", "Filtre por situação\ne role até o fim."] },
      { tipo: "conferencia", pontos: [{ posicao: 1, texto: "A lista não pisca.\n- nem o menu." }, { posicao: 2, texto: "O filtro fica marcado." }] },
      { tipo: "texto", texto: "Um parágrafo depois da lista." },
    ]);
  });

  it("passos numa linha só (\"1) … 2) … 3) …\") viram um item cada; número solto no meio da frase não quebra", () => {
    const lido = estruturado(lerCriterioDeAceite([
      "Passos: 1) Abra um chamado. 2) Confira a tela, sem F5. 3) Espere o aviso.",
      "Aprovado quando:",
      "1. O chamado nasce. 2. A tela muda sozinha.",
      "- O aviso chega em 2) minutos, uma vez só.",
    ].join("\n")));
    expect(lido.blocos).toEqual([
      { tipo: "passos", itens: ["Abra um chamado.", "Confira a tela, sem F5.", "Espere o aviso."] },
      { tipo: "conferencia", pontos: [{ posicao: 1, texto: "O chamado nasce." }, { posicao: 2, texto: "A tela muda sozinha." }, { posicao: 3, texto: "O aviso chega em 2) minutos, uma vez só." }] },
    ]);
  });

  it("os pontos contam de 1 em diante mesmo com dois blocos de Aprovado quando", () => {
    const lido = estruturado(lerCriterioDeAceite("Aprovado quando:\n- a\nObservação: x\nAprovado quando:\n- b\n- c"));
    expect(lido.pontos).toEqual([{ posicao: 1, texto: "a" }, { posicao: 2, texto: "b" }, { posicao: 3, texto: "c" }]);
  });

  it("texto antes do primeiro rótulo aparece como texto; rótulo vazio não vira seção", () => {
    const lido = estruturado(lerCriterioDeAceite("CRITÉRIO DE ACEITE (09/11/2026)\nEste item é o mesmo teste de outro.\nTermos:\nOnde testar: na tela."));
    expect(lido.blocos).toEqual([
      { tipo: "texto", texto: "Este item é o mesmo teste de outro." },
      { tipo: "campo", rotulo: "Onde testar", texto: "na tela." },
    ]);
  });

  it("o bloco inteiro colado no campo: o que vem depois do separador fica como contexto", () => {
    const lido = estruturado(lerCriterioDeAceite(`${BLOCO}\r\n\r\n— Contexto anterior —\r\nTexto antigo.`));
    expect(lido.blocos.at(-1)).toEqual({ tipo: "contexto", texto: "Texto antigo." });
    expect(lido.pontos).toHaveLength(2);
  });

  it("texto fora do formato aparece como texto simples, sem quebrar", () => {
    expect(lerCriterioDeAceite("Testar a tela e ver se salva.\nSem rótulo nenhum.")).toEqual({ estruturado: false, data: null, texto: "Testar a tela e ver se salva.\nSem rótulo nenhum.", pontos: [], preparo: [] });
    expect(lerCriterioDeAceite("CRITÉRIO DE ACEITE (01/02/2026)\r\nSó um texto.")).toEqual({ estruturado: false, data: "01/02/2026", texto: "Só um texto.", pontos: [], preparo: [] });
    expect(lerCriterioDeAceite("Passos para ver: clique.\n1. não é lista")).toMatchObject({ estruturado: false });
  });

  // funcionalidade-579 (11/11/2026): o "Antes de testar" vira lista para marcar.
  it("Antes de testar: cada \"- \" na margem é um ponto, com o comando recuado junto; \"nada\" não tem o que marcar", () => {
    const lido = estruturado(lerCriterioDeAceite([
      "Antes de testar:",
      "- rodar a migration:",
      "    npx prisma migrate deploy",
      "- ligar o módulo em Configurações.",
      "Aprovado quando:",
      "- a",
    ].join("\n")));
    expect(lido.preparo).toEqual([
      { posicao: 1, texto: "rodar a migration:\n    npx prisma migrate deploy" },
      { posicao: 2, texto: "ligar o módulo em Configurações." },
    ]);
    expect(lido.pontos).toEqual([{ posicao: 1, texto: "a" }]);
    const nada = estruturado(lerCriterioDeAceite("Antes de testar: nada.\nAprovado quando:\n- a"));
    expect(nada.preparo).toEqual([]);
    expect(nada.blocos[0]).toEqual({ tipo: "campo", rotulo: "Antes de testar", texto: "nada." });
  });

  it("pontosDoPreparo: texto sem marcador é um ponto só", () => {
    expect(pontosDoPreparo("entrar com a conta do Fiscal.\nE abrir a tela.")).toEqual(["entrar com a conta do Fiscal.\nE abrir a tela."]);
    expect(pontosDoPreparo("")).toEqual([]);
  });

  it("sem texto, não há critério", () => {
    expect(lerCriterioDeAceite(null)).toBeNull();
    expect(lerCriterioDeAceite(undefined)).toBeNull();
    expect(lerCriterioDeAceite(" \r\n \n")).toBeNull();
  });
});

describe("marcasQueValem", () => {
  const pontos = estruturado(lerCriterioDeAceite(BLOCO)).pontos;
  it("vale a marca do ponto com o mesmo texto, sem contar espaço e quebra de linha", () => {
    const marcas = [{ position: 1, text: "O item abre  em\nvisualização. ", quem: "Pessoa A" }, { position: 2, text: "Texto de antes da reescrita.", quem: "Pessoa B" }, { position: 9, text: "x", quem: "Pessoa C" }];
    const valem = marcasQueValem(pontos, marcas);
    expect([...valem.keys()]).toEqual([1]);
    expect(valem.get(1)?.quem).toBe("Pessoa A");
  });
  it("mesmoTexto compara sem espaço sobrando", () => {
    expect(mesmoTexto(" a  b\nc ", "a b c")).toBe(true);
    expect(mesmoTexto("a b", "a c")).toBe(false);
  });
});

describe("separarCriterioDaDescricao (migração dos itens antigos)", () => {
  it("do CRITÉRIO DE ACEITE até antes de “— Contexto anterior —”; a descrição fica com o que vinha depois", () => {
    const r = separarCriterioDaDescricao(`${BLOCO}\r\n\r\n— Contexto anterior —\r\nO pedido original.\r\n\r\nVeio do Quadro.`);
    expect(r).toEqual({ criterio: BLOCO.replace(/\r\n/g, "\n"), descricao: "O pedido original.\n\nVeio do Quadro.", comSeparador: true });
  });
  it("aceita a variante curta “— Contexto —” e linhas vazias antes do cabeçalho", () => {
    const r = separarCriterioDaDescricao("\n\nCRITÉRIO DE ACEITE (09/11/2026)\nMudança: x\n\n— Contexto —\nCausa: y");
    expect(r).toEqual({ criterio: "CRITÉRIO DE ACEITE (09/11/2026)\nMudança: x", descricao: "Causa: y", comSeparador: true });
  });
  it("sem o separador, o bloco é tudo e a descrição fica vazia", () => {
    expect(separarCriterioDaDescricao("CRITÉRIO DE ACEITE (09/11/2026)\nMudança: x\nPassos:\n1. y")).toEqual({ criterio: "CRITÉRIO DE ACEITE (09/11/2026)\nMudança: x\nPassos:\n1. y", descricao: null, comSeparador: false });
  });
  it("separador sem nada depois também deixa a descrição vazia", () => {
    expect(separarCriterioDaDescricao("CRITÉRIO DE ACEITE\nMudança: x\n— Contexto anterior —\n  \n")).toMatchObject({ descricao: null, comSeparador: true });
  });
  it("descrição que não começa pelo bloco não muda", () => {
    expect(separarCriterioDaDescricao("Pedido de 10/11: mostrar o \"CRITÉRIO DE ACEITE (data)\" numa seção.\nCRITÉRIO DE ACEITE (10/11/2026)\nMudança: x")).toBeNull();
    expect(separarCriterioDaDescricao("Sem critério.")).toBeNull();
    expect(separarCriterioDaDescricao(null)).toBeNull();
  });
});

describe("planejarMigracao", () => {
  const item = (sobre: Partial<Parameters<typeof planejarMigracao>[0][number]>) => ({ id: "i", title: "Item fictício", version: 2, description: null, acceptanceCriteria: null, ...sobre });
  it("move o bloco, pula quem já tem o campo e quem só cita o critério, e ignora o resto", () => {
    const { mover, pular } = planejarMigracao([
      item({ id: "a", description: "CRITÉRIO DE ACEITE (09/11/2026)\r\nMudança: x\r\n\r\n— Contexto anterior —\r\nAntigo." }),
      item({ id: "b", description: "CRITÉRIO DE ACEITE (09/11/2026)\nMudança: x", acceptanceCriteria: "Mudança: já migrado" }),
      item({ id: "c", description: "Ver o critério de aceite no item vizinho." }),
      item({ id: "d", description: "Nada a ver." }),
      item({ id: "e", description: "Contexto: CRITÉRIO DE ACEITE no meio do texto." }),
    ]);
    expect(mover).toEqual([{ id: "a", title: "Item fictício", version: 2, criterio: "CRITÉRIO DE ACEITE (09/11/2026)\nMudança: x", descricaoAntes: "CRITÉRIO DE ACEITE (09/11/2026)\r\nMudança: x\r\n\r\n— Contexto anterior —\r\nAntigo.", descricaoDepois: "Antigo.", comSeparador: true }]);
    expect(pular.map(p => p.id)).toEqual(["b", "c", "e"]);
  });
  it("rodar de novo, depois de gravar, não muda nada", () => {
    expect(planejarMigracao([item({ description: "Antigo.", acceptanceCriteria: "CRITÉRIO DE ACEITE (09/11/2026)\nMudança: x" })])).toEqual({ mover: [], pular: [] });
  });
});
