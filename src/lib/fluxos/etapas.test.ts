import { describe, expect, it } from "vitest";
import {
  alcancadasDoInicio,
  assinaturaDasEtapas,
  ehVolta,
  fluxoEmBranco,
  inserirEtapa,
  lerFluxo,
  lerListaDeEtapas,
  moverEtapa,
  nomeCurtoDaEtapa,
  numerosDasEtapas,
  podeMover,
  proximoIdDeEtapa,
  rotuloDoExecutor,
  saidasDasEtapas,
  tirarEtapa,
  validarFluxo,
  type Etapa,
} from "./etapas";

// A lista de etapas do Repositório de fluxos (10/11/2026): o formato, os
// destinos padrão, a validação que a action roda antes de gravar e as
// operações do editor.

const ADMISSAO: Etapa[] = [
  { id: "e1", tipo: "inicio", titulo: "Cliente pede a admissão", executor: { tipo: "cliente" } },
  { id: "e2", tipo: "etapa", titulo: "Conferir os documentos", executor: { tipo: "pessoa", setor: "dp" } },
  { id: "e3", tipo: "decisao", titulo: "Documentos completos?", sim: "e5", nao: "e4" },
  { id: "e4", tipo: "etapa", titulo: "Pedir a pendência ao cliente", proxima: "e2" },
  { id: "e5", tipo: "etapa", titulo: "Cadastrar no eSocial", executor: { tipo: "integracao" }, tela: "/admissoes", prazo: "Até 1 dia antes do início" },
  { id: "e6", tipo: "fim", titulo: "Admissão concluída" },
];

const mensagens = (lista: Etapa[]) => validarFluxo(lista).erros.map((e) => e.mensagem);

describe("destinos, números e alcance", () => {
  it("sem destino escrito, segue para a seguinte da lista; a decisão tem Sim e Não", () => {
    const s = saidasDasEtapas(ADMISSAO);
    expect(s.get("e1")).toEqual([{ para: "e2", tipo: "proxima" }]);
    expect(s.get("e3")).toEqual([
      { para: "e5", tipo: "sim" },
      { para: "e4", tipo: "nao" },
    ]);
    expect(s.get("e4")).toEqual([{ para: "e2", tipo: "proxima" }]);
    expect(s.get("e6")).toEqual([]);
  });

  it("destino que não existe ou que aponta para si não vira saída", () => {
    const s = saidasDasEtapas([
      { id: "e1", tipo: "inicio", titulo: "I", proxima: "e9" },
      { id: "e2", tipo: "etapa", titulo: "A", proxima: "e2" },
    ]);
    expect(s.get("e1")).toEqual([]);
    expect(s.get("e2")).toEqual([]);
  });

  it("etapas e decisões numeradas na ordem da lista; Início e Fim sem número", () => {
    const n = numerosDasEtapas(ADMISSAO);
    expect([...n.entries()]).toEqual([["e2", 1], ["e3", 2], ["e4", 3], ["e5", 4]]);
    expect(nomeCurtoDaEtapa(ADMISSAO[2], n)).toBe("Decisão 2");
    expect(nomeCurtoDaEtapa(ADMISSAO[0], n)).toBe("Início");
  });

  it("volta é o destino que fica antes na lista", () => {
    expect(ehVolta(ADMISSAO, "e4", "e2")).toBe(true);
    expect(ehVolta(ADMISSAO, "e3", "e4")).toBe(false);
  });

  it("alcance a partir do Início, por qualquer saída", () => {
    expect([...alcancadasDoInicio(ADMISSAO)].sort()).toEqual(["e1", "e2", "e3", "e4", "e5", "e6"]);
  });

  it("o chip de quem executa leva o setor da pessoa", () => {
    expect(rotuloDoExecutor({ tipo: "pessoa", setor: "dp" }, (c) => c.toUpperCase())).toBe("Pessoa · DP");
    expect(rotuloDoExecutor({ tipo: "robo", setor: "dp" })).toBe("Robô");
  });
});

describe("validação", () => {
  it("a admissão do exemplo passa", () => {
    expect(validarFluxo(ADMISSAO)).toEqual({ erros: [], avisos: [] });
  });

  it("um Início, no topo, e pelo menos um Fim", () => {
    expect(mensagens(ADMISSAO.filter((e) => e.tipo !== "inicio"))).toContain("O fluxo precisa de um Início.");
    expect(mensagens(ADMISSAO.filter((e) => e.tipo !== "fim"))[0]).toBe("O fluxo precisa de pelo menos um Fim.");
    expect(mensagens([...ADMISSAO, { id: "e9", tipo: "inicio", titulo: "Outro" }])).toContain("O fluxo tem mais de um Início. Deixe só um.");
    expect(mensagens([ADMISSAO[1], ADMISSAO[0], ...ADMISSAO.slice(2)])).toContain("O Início fica no topo da lista.");
  });

  it("todo destino existe; decisão precisa do Não, e Sim e Não diferentes", () => {
    const quebrada = ADMISSAO.map((e) => (e.id === "e4" ? { ...e, proxima: "e77" } : e));
    expect(validarFluxo(quebrada).erros[0]).toMatchObject({ etapaId: "e4", campo: "proxima" });
    const semNao = ADMISSAO.map((e) => (e.id === "e3" ? { ...e, nao: undefined } : e));
    expect(validarFluxo(semNao).erros[0]).toMatchObject({ etapaId: "e3", campo: "nao", mensagem: "Escolha para onde vai o “Não” de Decisão 2." });
    const iguais = ADMISSAO.map((e) => (e.id === "e3" ? { ...e, nao: "e5" } : e));
    expect(mensagens(iguais)).toContain("O “Sim” e o “Não” de Decisão 2 vão para a mesma etapa.");
  });

  it("a última etapa sem destino pede um Fim", () => {
    const lista: Etapa[] = [
      { id: "e1", tipo: "inicio", titulo: "I" },
      { id: "e2", tipo: "fim", titulo: "F" },
      { id: "e3", tipo: "etapa", titulo: "Sobrou" },
    ];
    expect(validarFluxo(lista).erros[0]).toMatchObject({ etapaId: "e3", campo: "proxima" });
  });

  it("nome obrigatório e tela só do Connect", () => {
    const semNome = ADMISSAO.map((e) => (e.id === "e2" ? { ...e, titulo: "  " } : e));
    expect(validarFluxo(semNome).erros[0]).toMatchObject({ etapaId: "e2", campo: "titulo", mensagem: "Dê um nome a Etapa 1." });
    const fora = ADMISSAO.map((e) => (e.id === "e5" ? { ...e, tela: "https://exemplo.com" } : e));
    expect(validarFluxo(fora).erros[0]).toMatchObject({ etapaId: "e5", campo: "tela" });
    const desconhecida = validarFluxo(ADMISSAO, { telaValida: (h) => h === "/pagar" });
    expect(desconhecida.erros[0]).toMatchObject({ etapaId: "e5", campo: "tela" });
  });

  it("setor de quem executa precisa existir no escritório", () => {
    const r = validarFluxo(ADMISSAO, { setores: new Set(["bpo"]) });
    expect(r.erros[0]).toMatchObject({ etapaId: "e2", campo: "executor" });
  });

  it("etapa que o Início não alcança é aviso, e não erro", () => {
    const lista: Etapa[] = [
      { id: "e1", tipo: "inicio", titulo: "I", proxima: "e3" },
      { id: "e2", tipo: "etapa", titulo: "Solta" },
      { id: "e3", tipo: "fim", titulo: "F" },
    ];
    const r = validarFluxo(lista);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([{ etapaId: "e2", mensagem: "Nenhum caminho a partir do Início chega a Etapa 1 (“Solta”)." }]);
  });

  it("no máximo 60 etapas", () => {
    const muitas: Etapa[] = [{ id: "e1", tipo: "inicio", titulo: "I" }, ...Array.from({ length: 60 }, (_, i) => ({ id: `e${i + 2}`, tipo: "etapa" as const, titulo: `E${i}` })), { id: "e99", tipo: "fim", titulo: "F" }];
    expect(mensagens(muitas)[0]).toBe("O fluxo passa de 60 etapas. Divida em dois fluxos.");
  });
});

describe("leitura do que chega de fora", () => {
  it("normaliza: corta espaço, tira campo vazio e o que não cabe no tipo", () => {
    const lida = lerListaDeEtapas([
      { id: "e1", tipo: "inicio", titulo: " Início ", sim: "e2", prazo: "  " },
      { id: "e2", tipo: "fim", titulo: "Fim", executor: { tipo: "robo" }, proxima: "e1", tela: "/pagar" },
      { id: "e3", tipo: "etapa", titulo: "A", executor: { tipo: "robo", setor: "dp" }, extra: "ignorado" },
    ]);
    expect(lida).toEqual([
      { id: "e1", tipo: "inicio", titulo: "Início" },
      { id: "e2", tipo: "fim", titulo: "Fim" },
      { id: "e3", tipo: "etapa", titulo: "A", executor: { tipo: "robo" } },
    ]);
  });

  it("formato quebrado não passa", () => {
    expect(lerListaDeEtapas("nada")).toBeNull();
    expect(lerListaDeEtapas([{ id: "e 1", tipo: "etapa", titulo: "A" }])).toBeNull();
    expect(lerListaDeEtapas([{ id: "e1", tipo: "subprocesso", titulo: "A" }])).toBeNull();
    expect(lerFluxo({ etapas: [] })).toMatchObject({ ok: false });
  });

  it("lerFluxo devolve a lista pronta ou o primeiro erro, com a etapa", () => {
    expect(lerFluxo(ADMISSAO)).toEqual({ ok: true, etapas: ADMISSAO, avisos: [] });
    expect(lerFluxo(ADMISSAO.slice(0, 2))).toMatchObject({ ok: false, mensagem: "O fluxo precisa de pelo menos um Fim." });
  });
});

describe("o editor", () => {
  it("fluxo em branco é válido e o próximo id não repete", () => {
    expect(validarFluxo(fluxoEmBranco()).erros).toEqual([]);
    expect(proximoIdDeEtapa(ADMISSAO)).toBe("e7");
    expect(proximoIdDeEtapa([{ id: "x", tipo: "inicio", titulo: "I" }])).toBe("e1");
  });

  it("nada entra nem sobe acima do Início", () => {
    const nova: Etapa = { id: "e9", tipo: "etapa", titulo: "Nova" };
    expect(inserirEtapa(ADMISSAO, nova, -1).at(-1)).toBe(nova);
    expect(inserirEtapa(ADMISSAO, nova, 1)[2]).toBe(nova);
    expect(inserirEtapa([ADMISSAO[0]], nova, -5)[1]).toBe(nova);
    expect(podeMover(ADMISSAO, 0, 2)).toBe(false);
    expect(podeMover(ADMISSAO, 2, 0)).toBe(false);
    expect(moverEtapa(ADMISSAO, 2, 1).map((e) => e.id)).toEqual(["e1", "e3", "e2", "e4", "e5", "e6"]);
    expect(moverEtapa(ADMISSAO, 1, 4).map((e) => e.id)).toEqual(["e1", "e3", "e4", "e5", "e2", "e6"]);
  });

  it("tirar uma etapa solta quem apontava para ela", () => {
    const sem = tirarEtapa(ADMISSAO, 1); // e2, destino da volta da e4
    expect(sem.map((e) => e.id)).toEqual(["e1", "e3", "e4", "e5", "e6"]);
    expect(sem.find((e) => e.id === "e4")?.proxima).toBeUndefined();
    expect(tirarEtapa(ADMISSAO, 3).find((e) => e.id === "e3")?.nao).toBeUndefined();
  });

  it("a assinatura ignora espaço sobrando", () => {
    const comEspaco = ADMISSAO.map((e) => ({ ...e, titulo: `${e.titulo}  ` }));
    expect(assinaturaDasEtapas(comEspaco)).toBe(assinaturaDasEtapas(ADMISSAO));
  });
});
