import { describe, expect, it } from "vitest";
import {
  LIMITES_DO_ROTEIRO,
  descerEtapa,
  devolverEtapa,
  doEditor,
  etapaComOrgaoDeFora,
  etapaEmBranco,
  inserirEtapa,
  lerRoteiro,
  marcarParalela,
  mesmoRoteiro,
  moverItem,
  nomearGrupo,
  normalizarRoteiro,
  paraOEditor,
  podeDescer,
  podeSubir,
  posicoesContinuas,
  posicoesDoEditor,
  proximaVersao,
  subirEtapa,
  tirarEtapa,
  type EtapaDoRoteiro,
  type EtapaNoEditor,
} from "./roteiroEditavel";

// O editor de roteiro do Societário (09/11/2026): as regras da gravação e as
// operações da lista que a tela faz.

const etapa = (posicao: number, rotulo: string, extra: Partial<EtapaDoRoteiro> = {}): EtapaDoRoteiro => ({
  posicao,
  rotulo,
  descricao: null,
  grupo: null,
  opcional: false,
  orgaoId: null,
  executor: "PESSOA",
  itens: [],
  ...extra,
});

/** Lista do editor a partir de um desenho: "A B+C D" — o "+" põe a etapa em paralelo com a anterior. */
function lista(desenho: string, grupo = ""): EtapaNoEditor[] {
  const partes = desenho.replace(/\+/g, " +").split(/\s+/).filter(Boolean);
  const etapas = partes.map((parte) => {
    const paralela = parte.startsWith("+");
    const nome = paralela ? parte.slice(1) : parte;
    return { ...etapaEmBranco(nome), rotulo: nome, paralelaAAnterior: paralela };
  });
  // Está num grupo quem corre junto com a de cima ou tem a de baixo correndo junto.
  return etapas.map((e, i) => ({ ...e, grupo: e.paralelaAAnterior || etapas[i + 1]?.paralelaAAnterior ? grupo : "" }));
}

/** O desenho de volta, para comparar: "A B+C D". */
function desenho(etapas: EtapaNoEditor[]): string {
  return etapas.map((e, i) => (i > 0 && e.paralelaAAnterior ? `+${e.rotulo}` : `${i > 0 ? " " : ""}${e.rotulo}`)).join("");
}

describe("posições contínuas", () => {
  it("começa em 1 e cada etapa repete ou anda uma", () => {
    expect(posicoesContinuas([1, 2, 3])).toBe(true);
    expect(posicoesContinuas([1, 2, 2, 2, 3])).toBe(true);
    expect(posicoesContinuas([1])).toBe(true);
  });

  it("buraco, volta, começo fora do 1 e lista vazia são recusados", () => {
    expect(posicoesContinuas([1, 3])).toBe(false);
    expect(posicoesContinuas([1, 2, 1])).toBe(false);
    expect(posicoesContinuas([2, 3])).toBe(false);
    expect(posicoesContinuas([])).toBe(false);
  });
});

describe("órgão do escritório", () => {
  it("acha a primeira etapa com órgão de fora; sem órgão passa", () => {
    const daqui = new Set(["junta", "receita"]);
    expect(etapaComOrgaoDeFora([{ orgaoId: null }, { orgaoId: "junta" }], daqui)).toBe(-1);
    expect(etapaComOrgaoDeFora([{ orgaoId: "junta" }, { orgaoId: "de-outro-escritorio" }], daqui)).toBe(1);
  });
});

describe("lerRoteiro", () => {
  const orgaos = new Set(["junta"]);

  it("roteiro vazio é recusado: o processo nasceria sem etapa", () => {
    expect(lerRoteiro([], orgaos)).toEqual({ ok: false, erro: "O roteiro precisa de pelo menos uma etapa." });
  });

  it("etapa sem nome é recusada e diz qual etapa", () => {
    const r = lerRoteiro([etapa(1, "Reunir documentação"), etapa(2, "   ")], orgaos);
    expect(r).toEqual({ ok: false, indice: 1, campo: "rotulo", erro: "Toda etapa precisa de um nome." });
  });

  it("os tetos das colunas valem: nome, descrição, grupo e item", () => {
    const longo = (n: number) => "x".repeat(n + 1);
    expect(lerRoteiro([etapa(1, longo(LIMITES_DO_ROTEIRO.rotulo))], orgaos)).toMatchObject({ ok: false, indice: 0, campo: "rotulo" });
    expect(lerRoteiro([etapa(1, "Viabilidade", { descricao: longo(LIMITES_DO_ROTEIRO.descricao) })], orgaos)).toMatchObject({
      ok: false,
      campo: "descricao",
      erro: "Na etapa “Viabilidade”, a descrição passa de 1000 caracteres.",
    });
    expect(lerRoteiro([etapa(1, "A", { grupo: longo(LIMITES_DO_ROTEIRO.grupo) })], orgaos)).toMatchObject({ ok: false, campo: "grupo" });
    expect(lerRoteiro([etapa(1, "A", { itens: [{ rotulo: "ok", obrigatorio: true }, { rotulo: longo(LIMITES_DO_ROTEIRO.item), obrigatorio: true }] })], orgaos)).toMatchObject({
      ok: false,
      campo: "itens",
      erro: "Na etapa “A”, o 2º item do checklist passa de 200 caracteres.",
    });
  });

  it("no limite exato passa, e o espaço sobrando no fim não conta", () => {
    const r = lerRoteiro([etapa(1, `${"x".repeat(LIMITES_DO_ROTEIRO.rotulo)}   `)], orgaos);
    expect(r.ok).toBe(true);
  });

  it("posições com buraco são recusadas", () => {
    expect(lerRoteiro([etapa(1, "A"), etapa(3, "B")], orgaos)).toMatchObject({ ok: false, erro: expect.stringMatching(/posições/) });
  });

  it("órgão de outro escritório é recusado, na etapa certa", () => {
    const r = lerRoteiro([etapa(1, "A", { orgaoId: "junta" }), etapa(2, "Sistemas da Receita", { orgaoId: "de-outro" })], orgaos);
    expect(r).toMatchObject({ ok: false, indice: 1, campo: "orgao", erro: "Na etapa “Sistemas da Receita”, o órgão escolhido não é deste escritório. Escolha outro." });
  });

  it("quem executa só aceita os três valores do banco", () => {
    expect(lerRoteiro([{ ...etapa(1, "A"), executor: "ESTAGIARIO" }], orgaos)).toMatchObject({ ok: false, indice: 0 });
  });

  it("o que passa sai normalizado: aparado, item vazio fora, grupo só onde há grupo", () => {
    const r = lerRoteiro(
      [
        etapa(1, "  Reunir  ", { descricao: "  ", grupo: "Sozinha", itens: [{ rotulo: " RG ", obrigatorio: true }, { rotulo: "  ", obrigatorio: false }] }),
        etapa(2, "Bombeiros", { grupo: "", orgaoId: "junta" }),
        etapa(2, "Vigilância", { grupo: " Licenças " }),
      ],
      orgaos
    );
    expect(r).toEqual({
      ok: true,
      etapas: [
        etapa(1, "Reunir", { itens: [{ rotulo: "RG", obrigatorio: true }] }),
        etapa(2, "Bombeiros", { grupo: "Licenças", orgaoId: "junta" }),
        etapa(2, "Vigilância", { grupo: "Licenças" }),
      ],
    });
  });

  it("entrada fora do formato não estoura: vira mensagem", () => {
    expect(lerRoteiro("lixo", orgaos)).toMatchObject({ ok: false });
    expect(lerRoteiro(Array.from({ length: LIMITES_DO_ROTEIRO.etapas + 1 }, (_, i) => etapa(i + 1, `E${i}`)), orgaos)).toEqual({
      ok: false,
      erro: "O roteiro pode ter até 60 etapas.",
    });
  });
});

describe("mesmo roteiro e próxima versão", () => {
  it("diferença só de espaço ou de item vazio não é mudança", () => {
    expect(mesmoRoteiro([etapa(1, "A")], [etapa(1, " A ", { itens: [{ rotulo: "", obrigatorio: true }] })])).toBe(true);
  });

  it("mudar a ordem, o opcional ou o obrigatório de um item é mudança", () => {
    expect(mesmoRoteiro([etapa(1, "A"), etapa(2, "B")], [etapa(1, "B"), etapa(2, "A")])).toBe(false);
    expect(mesmoRoteiro([etapa(1, "A")], [etapa(1, "A", { opcional: true })])).toBe(false);
    expect(mesmoRoteiro([etapa(1, "A", { itens: [{ rotulo: "RG", obrigatorio: true }] })], [etapa(1, "A", { itens: [{ rotulo: "RG", obrigatorio: false }] })])).toBe(false);
  });

  it("a versão nova é a seguinte à maior, publicada ou não", () => {
    expect(proximaVersao([])).toBe(1);
    expect(proximaVersao([1, 3, 2])).toBe(4);
  });

  it("normalizar fecha os buracos de posição que um script tenha deixado", () => {
    expect(normalizarRoteiro([etapa(1, "A"), etapa(4, "B"), etapa(4, "C"), etapa(9, "D")]).map((e) => e.posicao)).toEqual([1, 2, 2, 3]);
  });
});

describe("editor: ida e volta", () => {
  const chaves = { etapa: (i: number) => `e${i}`, item: (i: number, k: number) => `e${i}i${k}` };

  it("as paralelas do banco viram a marca 'corre junto com a de cima', e voltam iguais", () => {
    const gravado = [etapa(1, "A"), etapa(2, "B", { grupo: "Licenças" }), etapa(2, "C", { grupo: "Licenças" }), etapa(3, "D")];
    const noEditor = paraOEditor(gravado, chaves);
    expect(noEditor.map((e) => e.paralelaAAnterior)).toEqual([false, false, true, false]);
    expect(posicoesDoEditor(noEditor)).toEqual([1, 2, 2, 3]);
    expect(lerRoteiro(doEditor(noEditor), new Set())).toEqual({ ok: true, etapas: gravado });
  });
});

describe("editor: subir e descer", () => {
  it("sozinha troca com a posição vizinha", () => {
    expect(desenho(subirEtapa(lista("A B C"), 2))).toBe("A C B");
    expect(desenho(descerEtapa(lista("A B C"), 0))).toBe("B A C");
  });

  it("dentro do grupo troca de lugar sem sair dele", () => {
    expect(desenho(subirEtapa(lista("A B+C D"), 2))).toBe("A C+B D");
    expect(desenho(descerEtapa(lista("A B+C D"), 1))).toBe("A C+B D");
  });

  it("na ponta do grupo, sai dele e fica sozinha ao lado", () => {
    expect(desenho(subirEtapa(lista("A B+C D"), 1))).toBe("A B C D");
    expect(desenho(descerEtapa(lista("A B+C+E D"), 3))).toBe("A B+C E D");
  });

  it("sozinha passa o grupo inteiro, sem entrar nele", () => {
    expect(desenho(subirEtapa(lista("A B+C D"), 3))).toBe("A D B+C");
    expect(desenho(descerEtapa(lista("A B+C D"), 0))).toBe("B+C A D");
  });

  it("quem sai do grupo sai sem o nome dele; o grupo continua com o nome", () => {
    const r = descerEtapa(lista("A B+C+E D", "Licenças"), 3);
    expect(r.map((e) => [e.rotulo, e.grupo])).toEqual([
      ["A", ""],
      ["B", "Licenças"],
      ["C", "Licenças"],
      ["E", ""],
      ["D", ""],
    ]);
  });

  it("os botões só acendem quando o gesto muda alguma coisa", () => {
    const simples = lista("A B");
    expect([podeSubir(simples, 0), podeDescer(simples, 0), podeSubir(simples, 1), podeDescer(simples, 1)]).toEqual([false, true, true, false]);
    // A primeira de um grupo no topo pode subir (sai do grupo); a última de um grupo no fim pode descer.
    const grupos = lista("A+B");
    expect([podeSubir(grupos, 0), podeDescer(grupos, 1)]).toEqual([true, true]);
    expect(desenho(subirEtapa(grupos, 0))).toBe("A B");
    expect(desenho(subirEtapa(simples, 0))).toBe("A B");
    expect(desenho(descerEtapa(simples, 1))).toBe("A B");
  });
});

describe("editor: paralelo e grupo", () => {
  it("ligar junta a etapa (e as paralelas a ela) ao bloco de cima, com o nome de cima", () => {
    const r = marcarParalela(lista("A B C+D"), 2, true);
    expect(desenho(r)).toBe("A B+C+D");
    expect(posicoesDoEditor(r)).toEqual([1, 2, 2, 2]);
  });

  it("desligar parte o grupo, e a parte de baixo começa sem nome", () => {
    const r = marcarParalela(lista("A+B+C", "Licenças"), 1, false);
    expect(desenho(r)).toBe("A B+C");
    expect(r.map((e) => e.grupo)).toEqual(["Licenças", "", ""]);
  });

  it("a primeira etapa nunca corre em paralelo", () => {
    expect(desenho(marcarParalela(lista("A B"), 0, true))).toBe("A B");
  });

  it("o nome do grupo vale para todas as etapas da posição", () => {
    const r = nomearGrupo(lista("A B+C D"), 2, "Licenças");
    expect(r.map((e) => e.grupo)).toEqual(["", "Licenças", "Licenças", ""]);
    expect(normalizarRoteiro(doEditor(r)).map((e) => e.grupo)).toEqual([null, "Licenças", "Licenças", null]);
  });
});

describe("editor: acrescentar e tirar", () => {
  it("etapa nova entra sozinha, no fim ou logo depois da posição escolhida", () => {
    expect(desenho(inserirEtapa(lista("A B"), { ...etapaEmBranco("N"), rotulo: "N" }))).toBe("A B N");
    expect(desenho(inserirEtapa(lista("A B+C D"), { ...etapaEmBranco("N"), rotulo: "N" }, 1))).toBe("A B+C N D");
    expect(desenho(inserirEtapa([], { ...etapaEmBranco("N"), rotulo: "N" }))).toBe("N");
  });

  it("tirar a que abria o grupo deixa a seguinte abrindo, e o Desfazer devolve tudo como era", () => {
    const antes = lista("A B+C D", "Licenças");
    const { etapas, tirada } = tirarEtapa(antes, 1);
    expect(desenho(etapas)).toBe("A C D");
    expect(desenho(devolverEtapa(etapas, tirada!))).toBe("A B+C D");
    expect(devolverEtapa(etapas, tirada!).map((e) => e.grupo)).toEqual(["", "Licenças", "Licenças", ""]);
  });

  it("tirar uma do meio do grupo e desfazer", () => {
    const antes = lista("A B+C+E D");
    const { etapas, tirada } = tirarEtapa(antes, 2);
    expect(desenho(etapas)).toBe("A B+E D");
    expect(desenho(devolverEtapa(etapas, tirada!))).toBe("A B+C+E D");
  });

  it("itens do checklist trocam de lugar com o vizinho, e a ponta não sai da lista", () => {
    const itens = [
      { chave: "1", rotulo: "RG", obrigatorio: true },
      { chave: "2", rotulo: "CPF", obrigatorio: false },
    ];
    expect(moverItem(itens, 1, -1).map((i) => i.rotulo)).toEqual(["CPF", "RG"]);
    expect(moverItem(itens, 1, 1).map((i) => i.rotulo)).toEqual(["RG", "CPF"]);
  });
});
