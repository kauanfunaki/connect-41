import { describe, expect, it } from "vitest";

import {
  calcularNota,
  compararParaTriagem,
  ehBloqueioDoAgente,
  humanizarTexto,
  normalizarAvaliacoes,
  normalizarPerfil,
  normalizarRequisitos,
  type Requisitos,
} from "./triagem";

const req: Requisitos = {
  itens: [
    { id: "r1", tipo: "OBRIGATORIO", texto: "Ensino médio completo", peso: 2 }, // peso efetivo 4
    { id: "r2", tipo: "DESEJAVEL", texto: "Experiência com atendimento", peso: 2 }, // 2
    { id: "r3", tipo: "DESEJAVEL", texto: "Excel intermediário", peso: 2 }, // 2
  ],
  corteCompativel: 75,
  corteParcial: 45,
};

describe("calcularNota", () => {
  it("é a média ponderada dos veredictos, com obrigatório pesando o dobro", () => {
    const n = calcularNota(req, [
      { requisitoId: "r1", veredito: "SIM", evidencia: "" },
      { requisitoId: "r2", veredito: "PARCIAL", evidencia: "" },
      { requisitoId: "r3", veredito: "NAO", evidencia: "" },
    ]);
    // (4×1 + 2×0,5 + 2×0) / 8 = 62,5 → 63
    expect(n.score).toBe(63);
    expect(n.faixa).toBe("PARCIAL");
  });

  it("obrigatório com 'não atende' segura a faixa em Parcial mesmo com média alta", () => {
    const r: Requisitos = { ...req, itens: [...req.itens, { id: "r4", tipo: "DESEJAVEL", texto: "x", peso: 3 }, { id: "r5", tipo: "DESEJAVEL", texto: "y", peso: 3 }, { id: "r6", tipo: "DESEJAVEL", texto: "z", peso: 3 }, { id: "r7", tipo: "DESEJAVEL", texto: "w", peso: 3 }, { id: "r8", tipo: "DESEJAVEL", texto: "v", peso: 3 }] };
    const avaliacoes = r.itens.map((i) => ({ requisitoId: i.id, veredito: i.id === "r1" ? ("NAO" as const) : ("SIM" as const), evidencia: "" }));
    const n = calcularNota(r, avaliacoes);
    expect(n.score).toBeGreaterThanOrEqual(75);
    expect(n.faixa).toBe("PARCIAL");
    expect(n.obrigatoriosNaoAtendidos).toEqual(["r1"]);
  });

  it("'sem evidência' não trava a faixa, e requisito sem veredito conta como sem evidência", () => {
    const n = calcularNota(req, [{ requisitoId: "r2", veredito: "SIM", evidencia: "" }]);
    expect(n.score).toBe(25);
    expect(n.faixa).toBe("INCOMPATIVEL");
    expect(n.obrigatoriosNaoAtendidos).toEqual([]);
  });
});

describe("ordem da triagem", () => {
  it("faixa primeiro, nota depois, e quem ainda não tem nota vai para o fim", () => {
    const itens = [
      { nome: "sem", nota: null },
      { nome: "parcial-70", nota: { score: 70, faixa: "PARCIAL" as const, obrigatoriosNaoAtendidos: [] } },
      { nome: "compat-80", nota: { score: 80, faixa: "COMPATIVEL" as const, obrigatoriosNaoAtendidos: [] } },
      { nome: "parcial-90-travado", nota: { score: 90, faixa: "PARCIAL" as const, obrigatoriosNaoAtendidos: ["r1"] } },
    ];
    expect(itens.sort(compararParaTriagem).map((i) => i.nome)).toEqual(["compat-80", "parcial-90-travado", "parcial-70", "sem"]);
  });
});

describe("normalizarRequisitos", () => {
  it("refaz ids, limpa espaços, peso inválido vira 2 e linha vazia some", () => {
    const r = normalizarRequisitos({
      itens: [{ tipo: "OBRIGATORIO", texto: "  CNH   B ", peso: 9 }, { texto: "" }, { tipo: "X", texto: "Inglês", peso: 3 }],
      corteCompativel: 80,
      corteParcial: 50,
    });
    expect("erro" in r).toBe(false);
    if ("erro" in r) return;
    expect(r.itens).toEqual([
      { id: "r1", tipo: "OBRIGATORIO", texto: "CNH B", peso: 2 },
      { id: "r2", tipo: "DESEJAVEL", texto: "Inglês", peso: 3 },
    ]);
  });
  it("recusa lista vazia e cortes invertidos", () => {
    expect(normalizarRequisitos({ itens: [] })).toHaveProperty("erro");
    expect(normalizarRequisitos({ itens: [{ texto: "a" }], corteCompativel: 40, corteParcial: 60 })).toHaveProperty("erro");
  });
});

describe("normalização da saída da IA", () => {
  it("o perfil descarta qualquer campo fora do formato — inclusive dado pessoal", () => {
    const p = normalizarPerfil({
      nome: "Fulana",
      idade: 34,
      cidade: "Curitiba",
      formacao: [{ nivel: "Superior", curso: "Administração", situacao: "Completo", ano: 2010 }],
      experiencias: [{ cargo: "Assistente", area: "Financeiro", meses: "18", atividades: "Contas a pagar" }],
      habilidades: ["Excel", ""],
      certificacoes: [],
      idiomas: [],
    });
    expect(JSON.stringify(p)).not.toMatch(/Fulana|34|Curitiba|2010/);
    expect(p.experiencias[0].meses).toBe(18);
    expect(p.habilidades).toEqual(["Excel"]);
  });

  it("veredictos só de requisitos que existem, um por requisito", () => {
    const a = normalizarAvaliacoes(
      [
        { requisitoId: "r1", veredito: "SIM", evidencia: "ok" },
        { requisitoId: "r1", veredito: "NAO", evidencia: "dup" },
        { requisitoId: "r9", veredito: "SIM", evidencia: "inventado" },
        { requisitoId: "r2", veredito: "TALVEZ", evidencia: "" },
      ],
      req
    );
    expect(a).toEqual([
      { requisitoId: "r1", veredito: "SIM", evidencia: "ok" },
      { requisitoId: "r2", veredito: "SEM_EVIDENCIA", evidencia: "" },
    ]);
  });
});

describe("ehBloqueioDoAgente", () => {
  it("reconhece as recusas do agente e não confunde com problema do currículo", () => {
    expect(ehBloqueioDoAgente("O teto de gasto de IA deste mês foi atingido.")).toBe(true);
    expect(ehBloqueioDoAgente("O teto de chamadas de IA deste mês foi atingido.")).toBe(true);
    expect(ehBloqueioDoAgente("Este agente está desligado para esta empresa.")).toBe(true);
    expect(ehBloqueioDoAgente("Nenhuma chave de IA configurada. Configure em Integrações › Inteligência Artificial.")).toBe(true);
    expect(ehBloqueioDoAgente("Sem currículo em PDF.")).toBe(false);
    expect(ehBloqueioDoAgente("A IA recusou processar este conteúdo.")).toBe(false);
  });
});

describe("humanizarTexto", () => {
  it("troca código de requisito e de veredito pelo que o recrutador entende, e tira campo JSON", () => {
    expect(humanizarTexto("O perfil atende r1 e r3. O r2 é PARCIAL e o r9 é SEM_EVIDENCIA.", req)).toBe(
      'O perfil atende "Ensino médio completo" e "Excel intermediário". O "Experiência com atendimento" é atende em parte e o r9 é sem evidência.'
    );
    expect(humanizarTexto('"Analise e Desenvolvimento de Sistemas"; "situacao":"Cursando"', req)).toBe('"Analise e Desenvolvimento de Sistemas"; Cursando');
    expect(humanizarTexto("Desenvolvimento de telas em React e TypeScript", req)).toBe("Desenvolvimento de telas em React e TypeScript");
    expect(humanizarTexto('Formação: "ADS", cursando', req)).toBe('Formação: "ADS", cursando');
  });
});
