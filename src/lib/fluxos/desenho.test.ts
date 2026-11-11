import { describe, expect, it } from "vitest";
import { desenharFluxo, quebrarEmLinhas, type Desenho, type NoDoDesenho } from "./desenho";
import type { Etapa } from "./etapas";

// O desenho automático do Repositório de fluxos (10/11/2026): os exemplos do
// desenho escolhido e as garantias que valem para qualquer lista — caixa nunca
// em cima de caixa, seta sempre em ângulo reto e nunca por cima de uma caixa.

const ADMISSAO: Etapa[] = [
  { id: "e1", tipo: "inicio", titulo: "Cliente pede a admissão", executor: { tipo: "cliente" } },
  { id: "e2", tipo: "etapa", titulo: "Conferir os documentos", executor: { tipo: "pessoa", setor: "dp" } },
  { id: "e3", tipo: "decisao", titulo: "Documentos completos?", sim: "e5", nao: "e4" },
  { id: "e4", tipo: "etapa", titulo: "Pedir a pendência ao cliente", executor: { tipo: "pessoa", setor: "dp" }, proxima: "e2" },
  { id: "e5", tipo: "etapa", titulo: "Cadastrar no eSocial", executor: { tipo: "integracao" } },
  { id: "e6", tipo: "etapa", titulo: "Gerar o contrato e a ficha de registro", executor: { tipo: "robo" } },
  { id: "e7", tipo: "etapa", titulo: "Assinar o contrato pelo portal", executor: { tipo: "cliente" } },
  { id: "e8", tipo: "fim", titulo: "Admissão concluída" },
];

const LINEAR: Etapa[] = [
  { id: "e1", tipo: "inicio", titulo: "Chega o pedido" },
  { id: "e2", tipo: "etapa", titulo: "Conferir", executor: { tipo: "pessoa", setor: "fiscal" } },
  { id: "e3", tipo: "etapa", titulo: "Lançar", executor: { tipo: "robo" } },
  { id: "e4", tipo: "fim", titulo: "Pronto" },
];

/** Ramo que volta para a coluna principal mais abaixo. */
const RAMO_QUE_VOLTA: Etapa[] = [
  { id: "e1", tipo: "inicio", titulo: "Início" },
  { id: "e2", tipo: "etapa", titulo: "A" },
  { id: "e3", tipo: "decisao", titulo: "Tem nota?", sim: "e4", nao: "e5" },
  { id: "e4", tipo: "etapa", titulo: "B", proxima: "e6" },
  { id: "e5", tipo: "etapa", titulo: "C" },
  { id: "e6", tipo: "etapa", titulo: "D" },
  { id: "e7", tipo: "fim", titulo: "Fim" },
];

const DUAS_DECISOES: Etapa[] = [
  { id: "e1", tipo: "inicio", titulo: "Início" },
  { id: "e2", tipo: "etapa", titulo: "A" },
  { id: "e3", tipo: "decisao", titulo: "Primeira?", sim: "e5", nao: "e4" },
  { id: "e4", tipo: "etapa", titulo: "X", proxima: "e2" },
  { id: "e5", tipo: "etapa", titulo: "B" },
  { id: "e6", tipo: "decisao", titulo: "Segunda?", sim: "e8", nao: "e7" },
  { id: "e7", tipo: "etapa", titulo: "Y" },
  { id: "e8", tipo: "etapa", titulo: "C" },
  { id: "e9", tipo: "fim", titulo: "Fim" },
];

const COM_ETAPA_SOLTA: Etapa[] = [
  { id: "e1", tipo: "inicio", titulo: "Início" },
  { id: "e2", tipo: "etapa", titulo: "A", proxima: "e4" },
  { id: "e3", tipo: "etapa", titulo: "Ninguém chega aqui" },
  { id: "e4", tipo: "fim", titulo: "Fim" },
];

/** Decisão dentro do ramo de outra decisão: o desenho simplifica. */
const RAMO_DENTRO_DE_RAMO: Etapa[] = [
  { id: "e1", tipo: "inicio", titulo: "Início" },
  { id: "e2", tipo: "decisao", titulo: "D1?", sim: "e6", nao: "e3" },
  { id: "e3", tipo: "decisao", titulo: "D2?", sim: "e4", nao: "e5" },
  { id: "e4", tipo: "etapa", titulo: "P", proxima: "e6" },
  { id: "e5", tipo: "etapa", titulo: "Q", proxima: "e2" },
  { id: "e6", tipo: "fim", titulo: "Fim" },
];

/** Dois "Não" que terminam no mesmo Fim de cancelamento. */
const FIM_DIVIDIDO: Etapa[] = [
  { id: "e1", tipo: "inicio", titulo: "Início" },
  { id: "e2", tipo: "decisao", titulo: "Cliente aceitou?", sim: "e3", nao: "e6" },
  { id: "e3", tipo: "etapa", titulo: "Preparar" },
  { id: "e4", tipo: "decisao", titulo: "Pagou?", sim: "e5", nao: "e6" },
  { id: "e5", tipo: "fim", titulo: "Concluído" },
  { id: "e6", tipo: "fim", titulo: "Cancelado" },
];

const no = (d: Desenho, id: string) => d.nos.find((n) => n.id === id)!;
const seta = (d: Desenho, de: string, para: string) => d.setas.find((s) => s.de === de && s.para === para)!;
const celula = (d: Desenho, id: string) => [no(d, id).coluna, no(d, id).linha];

/** As garantias que valem para qualquer desenho. */
function conferirGarantias(d: Desenho) {
  const problemas: string[] = [];
  const sobrepoe = (a: NoDoDesenho, b: NoDoDesenho) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let i = 0; i < d.nos.length; i++) {
    for (let j = i + 1; j < d.nos.length; j++) if (sobrepoe(d.nos[i], d.nos[j])) problemas.push(`caixas ${d.nos[i].id} e ${d.nos[j].id} se sobrepõem`);
    const n = d.nos[i];
    if (n.x < 0 || n.y < 0 || n.x + n.w > d.largura || n.y + n.h > d.altura) problemas.push(`caixa ${n.id} fora do desenho`);
  }
  for (const s of d.setas) {
    if (s.pontos.length < 2) problemas.push(`seta ${s.de}→${s.para} sem trecho`);
    for (let k = 1; k < s.pontos.length; k++) {
      const [ax, ay] = s.pontos[k - 1];
      const [bx, by] = s.pontos[k];
      if (ax !== bx && ay !== by) problemas.push(`seta ${s.de}→${s.para} tem trecho torto`);
      for (const n of d.nos) {
        // O trecho passa pelo miolo da caixa (tocar a borda, na chegada e na saída, vale).
        const dentroX = Math.max(ax, bx) > n.x && Math.min(ax, bx) < n.x + n.w;
        const dentroY = Math.max(ay, by) > n.y && Math.min(ay, by) < n.y + n.h;
        const meioX = ax === bx ? ax > n.x && ax < n.x + n.w : dentroX;
        const meioY = ay === by ? ay > n.y && ay < n.y + n.h : dentroY;
        if (meioX && meioY) problemas.push(`seta ${s.de}→${s.para} passa por cima de ${n.id}`);
      }
    }
    for (const [px, py] of s.pontos) if (px < 0 || py < 0 || px > d.largura || py > d.altura) problemas.push(`seta ${s.de}→${s.para} sai do desenho`);
  }
  return problemas;
}

describe("desenho automático: os exemplos", () => {
  it("linear: uma coluna, setas retas, sem rótulo", () => {
    const d = desenharFluxo(LINEAR);
    expect(d.nos.map((n) => [n.coluna, n.linha])).toEqual([[0, 0], [0, 1], [0, 2], [0, 3]]);
    expect(d.setas).toHaveLength(3);
    for (const s of d.setas) {
      expect(s.pontos).toHaveLength(2);
      expect(s.pontos[0][0]).toBe(s.pontos[1][0]);
      expect(s.volta).toBe(false);
      expect(s.rotulo).toBeNull();
    }
    expect(d.simplificado).toBe(false);
    expect(conferirGarantias(d)).toEqual([]);
  });

  it("a admissão: a pendência ao lado da decisão e a volta tracejada que sobe e entra pela direita da etapa 1", () => {
    const d = desenharFluxo(ADMISSAO);
    // A coluna principal segue o Sim.
    for (const [id, linha] of [["e1", 0], ["e2", 1], ["e3", 2], ["e5", 3], ["e6", 4], ["e7", 5], ["e8", 6]] as const) expect(celula(d, id)).toEqual([0, linha]);
    expect(celula(d, "e4")).toEqual([1, 2]);
    expect(no(d, "e3").numero).toBe(2);
    expect(no(d, "e4").numero).toBe(3);
    expect(no(d, "e1").numero).toBeNull();

    const sim = seta(d, "e3", "e5");
    expect(sim.rotulo?.texto).toBe("Sim");
    expect(sim.pontos).toHaveLength(2);

    const nao = seta(d, "e3", "e4");
    expect(nao.rotulo?.texto).toBe("Não");
    expect(nao.pontos).toEqual([
      [no(d, "e3").x + no(d, "e3").w, no(d, "e3").y + no(d, "e3").h / 2],
      [no(d, "e4").x, no(d, "e4").y + no(d, "e4").h / 2],
    ]);

    const volta = seta(d, "e4", "e2");
    expect(volta.volta).toBe(true);
    expect(volta.rotulo?.texto).toBe("volta");
    const e2 = no(d, "e2");
    const e4 = no(d, "e4");
    // Sai do topo da pendência, sobe até a altura da etapa 1 e entra pela direita dela.
    expect(volta.pontos).toEqual([
      [e4.x + e4.w / 2, e4.y],
      [e4.x + e4.w / 2, e2.y + e2.h / 2],
      [e2.x + e2.w, e2.y + e2.h / 2],
    ]);
    expect(d.setas.filter((s) => s.volta)).toHaveLength(1);
    expect(d.simplificado).toBe(false);
    expect(conferirGarantias(d)).toEqual([]);
  });

  it("ramo que volta mais abaixo: desce pela coluna do ramo e entra pela direita da etapa de destino", () => {
    const d = desenharFluxo(RAMO_QUE_VOLTA);
    expect(celula(d, "e5")).toEqual([1, 2]);
    // D fica abaixo do ramo, para a seta descer e virar.
    expect(no(d, "e6").linha).toBeGreaterThan(no(d, "e5").linha);
    const rejunta = seta(d, "e5", "e6");
    const c = no(d, "e5");
    const dd = no(d, "e6");
    expect(rejunta.volta).toBe(false);
    expect(rejunta.pontos).toEqual([
      [c.x + c.w / 2, c.y + c.h],
      [c.x + c.w / 2, dd.y + dd.h / 2],
      [dd.x + dd.w, dd.y + dd.h / 2],
    ]);
    // B pula para D numa reta, pela coluna principal.
    expect(seta(d, "e4", "e6").pontos).toHaveLength(2);
    expect(d.simplificado).toBe(false);
    expect(conferirGarantias(d)).toEqual([]);
  });

  it("duas decisões: cada Não sai reto para o lado, sem dividir a coluna do ramo", () => {
    const d = desenharFluxo(DUAS_DECISOES);
    expect(no(d, "e4").coluna).toBe(1);
    expect(no(d, "e7").coluna).toBe(1);
    expect(no(d, "e4").linha).toBe(no(d, "e3").linha);
    expect(no(d, "e7").linha).toBe(no(d, "e6").linha);
    expect(seta(d, "e3", "e4").pontos).toHaveLength(2);
    expect(seta(d, "e6", "e7").pontos).toHaveLength(2);
    expect(seta(d, "e4", "e2").volta).toBe(true);
    expect(seta(d, "e7", "e8").volta).toBe(false);
    expect(d.simplificado).toBe(false);
    expect(conferirGarantias(d)).toEqual([]);
  });

  it("etapa que o Início não alcança vai no pé da coluna, marcada fora do caminho", () => {
    const d = desenharFluxo(COM_ETAPA_SOLTA);
    expect(no(d, "e3").foraDoCaminho).toBe(true);
    expect(no(d, "e3").coluna).toBe(0);
    expect(no(d, "e3").linha).toBeGreaterThan(no(d, "e4").linha);
    expect(d.nos.filter((n) => n.foraDoCaminho).map((n) => n.id)).toEqual(["e3"]);
    // A etapa solta segue para o Fim (a seguinte da lista), por fora.
    expect(seta(d, "e3", "e4")).toBeDefined();
    expect(conferirGarantias(d)).toEqual([]);
  });

  it("ramo dentro de ramo vai uma coluna mais à direita e avisa que simplificou", () => {
    const d = desenharFluxo(RAMO_DENTRO_DE_RAMO);
    expect(no(d, "e3").coluna).toBe(1);
    expect(no(d, "e5").coluna).toBe(2);
    expect(d.simplificado).toBe(true);
    expect(conferirGarantias(d)).toEqual([]);
  });

  it("dois Não no mesmo Fim: o segundo sobe até o pé do Fim já desenhado", () => {
    const d = desenharFluxo(FIM_DIVIDIDO);
    expect(celula(d, "e6")).toEqual([1, 1]);
    const segundo = seta(d, "e4", "e6");
    const fim = no(d, "e6");
    expect(segundo.pontos[segundo.pontos.length - 1]).toEqual([fim.x + fim.w / 2, fim.y + fim.h]);
    expect(segundo.pontos).toHaveLength(3);
    expect(conferirGarantias(d)).toEqual([]);
  });

  it("toda saída vira uma seta, e o desenho não muda de uma chamada para outra", () => {
    for (const lista of [LINEAR, ADMISSAO, RAMO_QUE_VOLTA, DUAS_DECISOES, COM_ETAPA_SOLTA, RAMO_DENTRO_DE_RAMO, FIM_DIVIDIDO]) {
      const d = desenharFluxo(lista);
      const saidas = lista.reduce((n, e, i) => n + (e.tipo === "fim" ? 0 : e.tipo === "decisao" ? 2 : e.proxima || lista[i + 1] ? 1 : 0), 0);
      expect(d.setas).toHaveLength(saidas);
      expect(desenharFluxo(lista)).toEqual(d);
    }
  });

  it("lista vazia e lista incompleta não quebram", () => {
    expect(desenharFluxo([])).toMatchObject({ nos: [], setas: [] });
    const incompleta: Etapa[] = [
      { id: "e1", tipo: "inicio", titulo: "" },
      { id: "e2", tipo: "decisao", titulo: "Sem destinos", nao: "e99" },
      { id: "e3", tipo: "etapa", titulo: "Aponta para si", proxima: "e3" },
    ];
    const d = desenharFluxo(incompleta);
    expect(d.nos).toHaveLength(3);
    expect(conferirGarantias(d)).toEqual([]);
  });
});

describe("desenho automático: qualquer lista", () => {
  it("a conferência acha seta por cima de caixa e caixa em cima de caixa (senão os testes passariam vazios)", () => {
    const caixa = (id: string, x: number, y: number): NoDoDesenho => ({ id, tipo: "etapa", numero: 1, titulo: id, linhas: [id], executor: null, x, y, w: 100, h: 50, coluna: 0, linha: 0, foraDoCaminho: false });
    const ruim: Desenho = {
      largura: 400,
      altura: 400,
      simplificado: false,
      nos: [caixa("a", 10, 10), caixa("b", 50, 40), caixa("c", 10, 200)],
      setas: [{ de: "a", para: "c", tipo: "proxima", volta: false, rotulo: null, pontos: [[60, 60], [60, 200]] }],
    };
    const p = conferirGarantias(ruim);
    expect(p.some((x) => x.includes("se sobrepõem"))).toBe(true);
    expect(p.some((x) => x.includes("por cima de b"))).toBe(true);
    expect(p.some((x) => x.includes("por cima de a"))).toBe(false);
  });

  // Um gerador simples e repetível: as mesmas listas a cada rodada.
  function sorteador(semente: number) {
    let s = semente;
    return (n: number) => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s % n;
    };
  }

  it("300 listas sorteadas: nenhuma caixa em cima de outra, nenhuma seta torta ou por cima de caixa", () => {
    const falhas: string[] = [];
    for (let caso = 0; caso < 300; caso++) {
      const sortear = sorteador(caso + 1);
      const total = 3 + sortear(26);
      const lista: Etapa[] = [{ id: "e1", tipo: "inicio", titulo: "Início" }];
      for (let i = 2; i <= total; i++) {
        const r = sortear(10);
        const tipo = i === total ? "fim" : r < 5 ? "etapa" : r < 8 ? "decisao" : r < 9 ? "fim" : "etapa";
        lista.push({ id: `e${i}`, tipo, titulo: `Etapa ${i} com um nome comprido para quebrar em mais de uma linha` });
      }
      for (const e of lista) {
        const alvo = () => `e${1 + sortear(total)}`;
        if (e.tipo === "decisao") {
          e.nao = alvo();
          if (sortear(2) === 0) e.sim = alvo();
        } else if (e.tipo !== "fim" && sortear(4) === 0) e.proxima = alvo();
        if (e.tipo === "etapa" && sortear(2) === 0) e.executor = { tipo: "robo" };
      }
      const d = desenharFluxo(lista);
      const p = conferirGarantias(d);
      if (p.length > 0) falhas.push(`caso ${caso}: ${p[0]}`);
    }
    expect(falhas).toEqual([]);
  });
});

describe("quebrar o título em linhas", () => {
  it("quebra por palavra e corta com reticências no limite", () => {
    expect(quebrarEmLinhas("Conferir os documentos", 25, 3)).toEqual(["Conferir os documentos"]);
    expect(quebrarEmLinhas("Gerar o contrato e a ficha de registro", 25, 3)).toEqual(["Gerar o contrato e a", "ficha de registro"]);
    const longo = quebrarEmLinhas("um dois três quatro cinco seis sete oito nove dez onze doze", 10, 2);
    expect(longo).toHaveLength(2);
    expect(longo[1].endsWith("…")).toBe(true);
    expect(quebrarEmLinhas("Supercalifragilisticexpialidocious", 10, 4)[0]).toHaveLength(10);
    expect(quebrarEmLinhas("   ", 10, 2)).toEqual([""]);
  });
});
