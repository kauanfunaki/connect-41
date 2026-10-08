import { describe, it, expect, vi } from "vitest";

// `fila.ts` importa o cliente do Prisma para as consultas. O que se testa aqui
// é a ordem, que é pura — o mock existe só para o import não subir o driver.
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({}) }));

const { ordenarFila, contarPorSituacao, chaveDoFeriado, filtrarPelaBusca } = await import("./fila");
const { diasUteisEntre } = await import("./processo");
type LinhaDaFila = Awaited<ReturnType<typeof import("./fila").listarFila>>[number];

function linha(over: Partial<LinhaDaFila> & { id: string }): LinhaDaFila {
  return {
    tipoNome: "Constituição",
    empresaId: "e1",
    empresaNome: "Alfa",
    responsavelNome: null,
    situacao: "EM_ANDAMENTO",
    prazo: { dias: 1, situacao: "dentro", previstoMin: 4, previstoMax: 7 },
    voltas: 0,
    etapasAgora: [],
    iniciadoEm: new Date("2026-09-01T12:00:00Z"),
    ...over,
  } as LinhaDaFila;
}

describe("ordenarFila", () => {
  // A regra que dá valor à tela: quem abre precisa achar primeiro o que depende
  // dele. Exigência é trabalho parado esperando gente; espera de órgão ninguém
  // aqui consegue apressar.
  it("exigência vem antes de espera de órgão, que vem antes de andamento", () => {
    const fila = ordenarFila([
      linha({ id: "andamento", situacao: "EM_ANDAMENTO" }),
      linha({ id: "orgao", situacao: "AGUARDANDO_ORGAO" }),
      linha({ id: "exigencia", situacao: "EM_EXIGENCIA" }),
    ]);
    expect(fila.map((l) => l.id)).toEqual(["exigencia", "orgao", "andamento"]);
  });

  it("dentro do mesmo grupo, o mais estourado no topo", () => {
    const fila = ordenarFila([
      linha({
        id: "no-prazo",
        situacao: "EM_EXIGENCIA",
        prazo: { dias: 3, situacao: "dentro", previstoMin: 4, previstoMax: 7 },
      }),
      linha({
        id: "muito-atrasado",
        situacao: "EM_EXIGENCIA",
        prazo: { dias: 20, situacao: "estourado", previstoMin: 4, previstoMax: 7 },
      }),
      linha({
        id: "pouco-atrasado",
        situacao: "EM_EXIGENCIA",
        prazo: { dias: 9, situacao: "estourado", previstoMin: 4, previstoMax: 7 },
      }),
    ]);
    expect(fila.map((l) => l.id)).toEqual(["muito-atrasado", "pouco-atrasado", "no-prazo"]);
  });

  // O alvará não tem prazo declarado. Ele não pode disputar posição com uma
  // régua que não se aplica a ele — nem aparecer como o mais atrasado de todos
  // só porque está aberto há muito tempo.
  it("sem previsão cai para o fim do grupo, não para o topo", () => {
    const fila = ordenarFila([
      linha({
        id: "alvara",
        situacao: "EM_ANDAMENTO",
        prazo: { dias: 90, situacao: "sem_previsao", previstoMin: null, previstoMax: null },
      }),
      linha({
        id: "constituicao",
        situacao: "EM_ANDAMENTO",
        prazo: { dias: 8, situacao: "estourado", previstoMin: 4, previstoMax: 7 },
      }),
    ]);
    expect(fila.map((l) => l.id)).toEqual(["constituicao", "alvara"]);
  });

  it("empate desempata pelo mais antigo — quem espera há mais tempo primeiro", () => {
    const fila = ordenarFila([
      linha({ id: "novo", iniciadoEm: new Date("2026-09-10T12:00:00Z") }),
      linha({ id: "velho", iniciadoEm: new Date("2026-08-01T12:00:00Z") }),
    ]);
    expect(fila.map((l) => l.id)).toEqual(["velho", "novo"]);
  });

  it("não altera a lista recebida", () => {
    const original = [
      linha({ id: "a", situacao: "EM_ANDAMENTO" }),
      linha({ id: "b", situacao: "EM_EXIGENCIA" }),
    ];
    ordenarFila(original);
    expect(original.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("contarPorSituacao", () => {
  it("conta cada situação, inclusive as zeradas", () => {
    const c = contarPorSituacao([
      linha({ id: "1", situacao: "EM_EXIGENCIA" }),
      linha({ id: "2", situacao: "EM_EXIGENCIA" }),
      linha({ id: "3", situacao: "AGUARDANDO_ORGAO" }),
    ]);
    expect(c.EM_EXIGENCIA).toBe(2);
    expect(c.AGUARDANDO_ORGAO).toBe(1);
    // Zerada precisa existir: o contador do filtro mostra "0", não some.
    expect(c.EM_ANDAMENTO).toBe(0);
  });
});

describe("chaveDoFeriado", () => {
  // O feriado é gravado como em admin/feriados/actions.ts: `new Date("AAAA-MM-DD")`,
  // meia-noite UTC — que em São Paulo ainda é 21h do dia anterior.
  const gravado = (dia: string) => new Date(dia);

  it("é o dia cadastrado, e não o anterior", () => {
    expect(chaveDoFeriado(gravado("2026-10-12"))).toBe("2026-10-12");
    expect(chaveDoFeriado(gravado("2026-01-01"))).toBe("2026-01-01");
    expect(chaveDoFeriado(gravado("2026-12-25"))).toBe("2026-12-25");
  });

  it("o feriado numa segunda tira a segunda da contagem de dias úteis", () => {
    // Sexta 09/10 até terça 13/10, com 12/10 (segunda) feriado: só a terça conta.
    // Lido em São Paulo, o feriado virava 11/10 — domingo, que já não contava —
    // e a segunda entrava como dia útil.
    const feriados = new Set([chaveDoFeriado(gravado("2026-10-12"))]);
    expect(diasUteisEntre("2026-10-09", "2026-10-13", feriados)).toBe(1);
  });
});

describe("filtrarPelaBusca", () => {
  const fila = [
    linha({ id: "otica", empresaNome: "Ótica Alvorada Ltda", tipoNome: "Baixa" }),
    linha({ id: "filial", empresaNome: "Mercado Bom Preço", tipoNome: "Alteração contratual", titulo: "Filial de Pinhais" }),
    linha({ id: "camila", empresaNome: "Padaria Sol", responsavelNome: "Camila Duarte" }),
  ];

  it("acha sem acento e sem caixa", () => {
    expect(filtrarPelaBusca(fila, "otica").map((l) => l.id)).toEqual(["otica"]);
    expect(filtrarPelaBusca(fila, "PREÇO").map((l) => l.id)).toEqual(["filial"]);
  });

  it("procura também no tipo, no título e no responsável", () => {
    expect(filtrarPelaBusca(fila, "pinhais").map((l) => l.id)).toEqual(["filial"]);
    expect(filtrarPelaBusca(fila, "camila").map((l) => l.id)).toEqual(["camila"]);
  });

  it("cada palavra precisa casar em algum campo", () => {
    expect(filtrarPelaBusca(fila, "alvorada baixa").map((l) => l.id)).toEqual(["otica"]);
    expect(filtrarPelaBusca(fila, "alvorada constituicao")).toEqual([]);
  });

  it("busca vazia devolve a fila inteira", () => {
    expect(filtrarPelaBusca(fila, "   ")).toHaveLength(3);
  });
});
