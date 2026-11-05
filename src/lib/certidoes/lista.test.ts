import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A lista de /certidoes no servidor (opção A, 05/11/2026): busca, atalhos e a
// página de 50 lida no banco têm de bater com o quadro antigo, que lia a
// carteira inteira e cortava em JS. O banco é o falso dos testes do Serpro.

const m = await vi.hoisted(async () => {
  const { tabela } = await import("@/lib/serpro/teste.fixture");
  return {
    company: tabela({ displayName: null, cnpj: null, stateCode: null, city: null, status: "ACTIVE" }),
    certidao: tabela({ codigo: null, emitidaEm: null, validaAte: null, mensagem: null, trimestre: null, driveFileId: null, pedidaPorId: null, vistaEm: null, vistaPorId: null }),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ company: m.company, certidao: m.certidao }) }));
vi.mock("@/lib/integracoes/data", () => ({ lerConfig: () => ({}) }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true }));
vi.mock("@/lib/notifications", () => ({ notifySector: vi.fn() }));
vi.mock("@/lib/drive/servidor", () => ({ guardarArquivo: vi.fn(), garantirPastasDaEmpresa: async () => [] }));

const { listaDasCertidoes } = await import("./lista");
const { quadroDasCertidoes } = await import("./servidor");
const { POR_PAGINA } = await import("./lista-regras");

const TENANT = "tenant-1";
const AGORA = new Date("2026-11-05T12:00:00-03:00");
const TIPOS = ["FEDERAL", "FGTS", "TRABALHISTA", "ESTADUAL_PR", "CURITIBA"] as const;
const SITUACOES = ["NEGATIVA", "POSITIVA_COM_EFEITO", "POSITIVA", "NAO_SAIU"] as const;
const VALIDADES = ["2026-10-20", "2026-11-12", "2026-11-30", "2027-03-01", null];

/** CNPJ de 14 dígitos de mentira, só com o formato certo (a regra não confere o dígito). */
const cnpj = (raiz: number, filial: number) => `${String(raiz).padStart(8, "0")}${String(filial).padStart(4, "0")}00`;

/**
 * 130 empresas em 100 raízes: matrizes e filiais, metade em Curitiba, umas
 * fora do PR, uma inativa, uma sem CNPJ; e um histórico com tentativas que
 * falharam depois de uma que saiu, positivas vistas e não, e validades em volta
 * de hoje. Tudo determinístico.
 */
function semear() {
  const nomes = ["Ação", "Beta", "Café", "Delta", "Éter", "Zeta"];
  for (let i = 0; i < 130; i++) {
    // As 60 primeiras em pares matriz e filial; o resto, uma por raiz.
    const raiz = 10_000_000 + (i < 60 ? Math.floor(i / 2) : i);
    const filial = i < 60 ? (i % 2) + 1 : 1;
    m.company.linhas.push({
      id: `e-${String(i).padStart(3, "0")}`,
      tenantId: TENANT,
      name: `${nomes[i % nomes.length]} Fictícia ${String(i).padStart(3, "0")} Ltda`,
      displayName: i % 17 === 0 ? `Apelido ${i}` : null,
      cnpj: i === 5 ? null : cnpj(raiz, filial),
      stateCode: i % 9 === 0 ? "SC" : "PR",
      city: i % 2 === 0 ? "Curitiba" : "Londrina",
      status: i === 7 ? "INACTIVE" : "ACTIVE",
    });
  }
  let n = 0;
  for (let i = 0; i < 130; i++) {
    for (const [j, tipo] of TIPOS.entries()) {
      const k = i * 5 + j;
      if (k % 6 === 0) continue; // nunca consultada
      const vezes = 1 + (k % 3);
      for (let v = 0; v < vezes; v++) {
        const situacao = SITUACOES[(k + v * 3) % SITUACOES.length];
        m.certidao.linhas.push({
          id: `c-${++n}`,
          tenantId: TENANT,
          companyId: `e-${String(i).padStart(3, "0")}`,
          tipo,
          situacao,
          validaAte: situacao === "NAO_SAIU" ? null : VALIDADES[(k + v) % VALIDADES.length],
          vistaEm: situacao === "POSITIVA" && k % 4 === 0 ? new Date("2026-11-01T10:00:00Z") : null,
          // A mais nova por último: v maior = mais recente.
          createdAt: new Date(Date.UTC(2026, 9, 1 + v * 17, 12, 0, 0) + k * 1000),
        });
      }
    }
  }
}

beforeEach(() => {
  // O quadro lê o relógio para o gasto do mês; a lista recebe `agora`.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  m.company.zerar();
  m.certidao.zerar();
  semear();
});

afterEach(() => {
  vi.useRealTimers();
});

/** O quadro antigo, com os recortes e totais que a página antiga calculava em JS. */
async function doQuadro(escopo = {}) {
  const q = await quadroDasCertidoes(TENANT, escopo);
  const aVer = (c: { situacao: string; vista: boolean } | null | undefined) => c?.situacao === "POSITIVA" && !c.vista;
  const sem = (c: { situacao: string } | null | undefined) => !c || c.situacao === "NAO_SAIU";
  const celulas = q.linhas.flatMap((l) => Object.values(l.certidoes));
  return {
    ...q,
    positivas: q.linhas.filter((l) => Object.values(l.certidoes).some(aVer)).map((l) => l.companyId),
    faltando: q.linhas.filter((l) => Object.values(l.certidoes).some(sem)).map((l) => l.companyId),
    totais: {
      empresas: q.linhas.length,
      certidoes: celulas.length,
      regulares: celulas.filter((c) => c && (c.situacao === "NEGATIVA" || c.situacao === "POSITIVA_COM_EFEITO")).length,
      positivasAVer: celulas.filter(aVer).length,
      semCertidao: celulas.filter(sem).length,
    },
  };
}

/** Todas as páginas da lista, juntas. */
async function todasAsPaginas(pedido: Parameters<typeof listaDasCertidoes>[2] = {}, escopo = {}) {
  const primeira = await listaDasCertidoes(TENANT, escopo, { ...pedido, agora: AGORA, pagina: 1 });
  const linhas = [...primeira.linhas];
  for (let p = 2; p <= primeira.totalDePaginas; p++) linhas.push(...(await listaDasCertidoes(TENANT, escopo, { ...pedido, agora: AGORA, pagina: p })).linhas);
  return { primeira, linhas };
}

describe("a lista bate com o quadro", () => {
  it("as páginas juntas são o quadro, na mesma ordem, com as mesmas certidões", async () => {
    const q = await doQuadro();
    const { primeira, linhas } = await todasAsPaginas();
    expect(q.linhas.length).toBeGreaterThan(POR_PAGINA * 2);
    expect(primeira.totalDePaginas).toBe(Math.ceil(q.linhas.length / POR_PAGINA));
    expect(primeira.linhas).toHaveLength(POR_PAGINA);
    expect(linhas.map((l) => l.companyId)).toEqual(q.linhas.map((l) => l.companyId));
    expect(linhas.map((l) => l.certidoes)).toEqual(q.linhas.map((l) => l.certidoes));
    expect(linhas.map((l) => l.empresa)).toEqual(q.linhas.map((l) => l.empresa));
  });

  it("a faixa é a mesma conta do quadro, e o gasto do mês também", async () => {
    const q = await doQuadro();
    const l = await listaDasCertidoes(TENANT, {}, { agora: AGORA });
    expect(l.totais).toMatchObject(q.totais);
    expect(q.consultasNoMes).toBeGreaterThan(0);
    expect(l.consultasNoMes).toBe(q.consultasNoMes);
    expect(l.gastoNoMesCentavos).toBe(q.gastoNoMesCentavos);
  });

  it("os atalhos de positivas e sem certidão são os recortes do quadro", async () => {
    const q = await doQuadro();
    const positivas = await todasAsPaginas({ recorte: "positivas" });
    const faltando = await todasAsPaginas({ recorte: "faltando" });
    expect(q.positivas.length).toBeGreaterThan(0);
    expect(q.faltando.length).toBeGreaterThan(0);
    expect(positivas.linhas.map((x) => x.companyId)).toEqual(q.positivas);
    expect(faltando.linhas.map((x) => x.companyId)).toEqual(q.faltando);
    expect(positivas.primeira.contagens).toMatchObject({ todas: q.linhas.length, positivas: q.positivas.length, faltando: q.faltando.length });
  });

  it("vencendo: alguma certidão que saiu vence até 20/11 (as vencidas entram)", async () => {
    const q = await doQuadro();
    const esperadas = q.linhas
      .filter((l) => Object.values(l.certidoes).some((c) => c && c.situacao !== "NAO_SAIU" && c.validaAte && c.validaAte <= "2026-11-20"))
      .map((l) => l.companyId);
    const vencendo = await todasAsPaginas({ recorte: "vencendo" });
    expect(esperadas.length).toBeGreaterThan(0);
    expect(vencendo.linhas.map((l) => l.companyId)).toEqual(esperadas);
    expect(vencendo.primeira.contagens.vencendo).toBe(esperadas.length);
  });

  it("respeita o escopo da empresa como o quadro", async () => {
    const escopo = { id: { in: ["e-000", "e-001", "e-002", "e-003", "e-004"] } };
    const q = await doQuadro(escopo);
    const { linhas } = await todasAsPaginas({}, escopo);
    expect(linhas.map((l) => l.certidoes)).toEqual(q.linhas.map((l) => l.certidoes));
  });
});

describe("a busca no servidor", () => {
  it("por nome, sem acento nem maiúscula", async () => {
    const l = await listaDasCertidoes(TENANT, {}, { busca: "ACAO ficticia", agora: AGORA });
    expect(l.total).toBeGreaterThan(0);
    expect(l.linhas.every((x) => x.empresa.startsWith("Ação") || x.empresa.startsWith("Apelido"))).toBe(true);
    expect(l.contagens.todas).toBe(l.total);
  });

  it("por CNPJ com pontuação", async () => {
    const alvo = m.company.linhas.find((e) => e.id === "e-010")!;
    const d = String(alvo.cnpj);
    const formatado = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    const l = await listaDasCertidoes(TENANT, {}, { busca: formatado, agora: AGORA });
    expect(l.linhas.map((x) => x.companyId)).toEqual(["e-010"]);
    expect(l.linhas[0].cnpj).toBe(formatado);
  });

  it("os atalhos contam só o que a busca achou", async () => {
    const q = await doQuadro();
    const naCarteira = new Set(q.linhas.map((x) => x.companyId));
    const comD = new Set(m.company.linhas.filter((e) => String(e.name).startsWith("Delta") && naCarteira.has(e.id)).map((e) => e.id));
    const l = await listaDasCertidoes(TENANT, {}, { busca: "delta", recorte: "positivas", agora: AGORA });
    expect(l.contagens.todas).toBe(comD.size);
    expect(l.contagens.positivas).toBe(q.positivas.filter((id) => comD.has(id)).length);
    expect(l.linhas.every((x) => comD.has(x.companyId))).toBe(true);
    // A faixa continua a carteira inteira.
    expect(l.totais.empresas).toBe(q.linhas.length);
  });

  it("nada achado: lista vazia, página 1 de 1", async () => {
    const l = await listaDasCertidoes(TENANT, {}, { busca: "não existe", agora: AGORA });
    expect(l).toMatchObject({ linhas: [], total: 0, pagina: 1, totalDePaginas: 1 });
  });
});

describe("a paginação", () => {
  it("página além do fim vira a última", async () => {
    const l = await listaDasCertidoes(TENANT, {}, { pagina: 99, agora: AGORA });
    expect(l.pagina).toBe(l.totalDePaginas);
    expect(l.linhas.length).toBe(l.total - (l.totalDePaginas - 1) * POR_PAGINA);
  });

  it("lê o histórico completo só das empresas da página", async () => {
    const espiao = vi.spyOn(m.certidao, "findMany");
    await listaDasCertidoes(TENANT, {}, { pagina: 2, agora: AGORA });
    const detalhe = espiao.mock.calls.map((c) => c[0] as { where?: { companyId?: { in?: string[] }; situacao?: unknown } }).find((a) => a?.where?.companyId && !a.where.situacao);
    expect(detalhe?.where?.companyId?.in).toHaveLength(POR_PAGINA);
    // E a leitura da carteira inteira é só a das que saíram, sem as tentativas que falharam.
    const leve = espiao.mock.calls.map((c) => c[0] as { where?: { situacao?: unknown }; select?: Record<string, boolean> }).find((a) => a?.where?.situacao);
    expect(leve?.where?.situacao).toEqual({ not: "NAO_SAIU" });
    expect(Object.keys(leve?.select ?? {}).sort()).toEqual(["companyId", "situacao", "tipo", "validaAte", "vistaEm"]);
    espiao.mockRestore();
  });
});
