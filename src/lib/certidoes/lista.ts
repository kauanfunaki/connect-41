// A lista de /certidoes no servidor (opção A de 05/11/2026). Substitui o
// quadro na tela: antes a página lia todas as empresas e até 20.000 consultas,
// com todos os campos, e cortava a página em JS.
//
// Agora são quatro leituras:
// 1. as empresas ativas do escopo, só com o que a regra da raiz precisa (id,
//    CNPJ, UF, cidade e nome) — a federal de uma filial depende da matriz
//    existir, então a regra (`certidoesDaCarteira`) precisa da carteira, não
//    só da página;
// 2. a certidão que vale de cada empresa e tipo, em cinco colunas e só entre
//    as que saíram (as tentativas que falharam ficam de fora) — é o que conta
//    os atalhos e a faixa;
// 3. o histórico completo só das empresas da página (50), para o painel;
// 4. as consultas do mês, para o gasto contra o teto.
// A busca e os atalhos andam sobre a lista leve, no servidor; a regra do
// quadro não mudou: a última que saiu vale, empresa ativa, e só a certidão que
// a empresa precisa.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { hojeIso } from "@/lib/datas/calendario";
import { nomeExibicao } from "@/lib/companyName";
import { formatCnpj } from "@/lib/format";
import { certidoesDaCarteira, consultasCobradas, ehRegular, gastoDoMesEmCentavos, servicosRecusados, TIPOS_DE_CERTIDAO, type SituacaoDaCertidao, type TipoDeCertidao } from "./regras";
import { casaComABusca, estadoDaCertidao, POR_PAGINA, RECORTES, recortesDaEmpresa, type CertidaoQueVale, type Recorte } from "./lista-regras";
import type { CertidaoNaTela } from "./servidor";

export type LinhaDaLista = {
  companyId: string;
  empresa: string;
  cnpj: string;
  /** "Curitiba/PR", para o cabeçalho do painel. */
  local: string | null;
  /** Só as certidões que a empresa precisa; `null` = ainda não consultada. */
  certidoes: Partial<Record<TipoDeCertidao, CertidaoNaTela | null>>;
};

export type TotaisDaCarteira = {
  empresas: number;
  certidoes: number;
  regulares: number;
  positivasAVer: number;
  /** Empresas com alguma positiva a ver — o detalhe do cartão. */
  empresasComPositiva: number;
  semCertidao: number;
};

export type ListaDasCertidoes = {
  linhas: LinhaDaLista[];
  /** Empresas no atalho escolhido, depois da busca. */
  total: number;
  pagina: number;
  totalDePaginas: number;
  /** Empresas em cada atalho, depois da busca. */
  contagens: Record<Recorte, number>;
  /** A carteira inteira do escopo, sem a busca: a faixa do topo. */
  totais: TotaisDaCarteira;
  /** As consultas do mês que a InfoSimples cobra — as do extrato dela. */
  consultasNoMes: number;
  gastoNoMesCentavos: number;
  /** Serviços em que a última consulta do mês foi recusa do token (601/603), com a hora dela. */
  servicosRecusados: { tipo: TipoDeCertidao; em: Date }[];
};

const ATIVAS: Prisma.CompanyWhereInput = { status: "ACTIVE" };
const inicioDoMes = (hoje: string) => new Date(`${hoje.slice(0, 7)}-01T00:00:00-03:00`);
const chave = (companyId: string, tipo: string) => `${companyId}:${tipo}`;

export async function listaDasCertidoes(
  tenantId: string,
  escopoDaEmpresa: Prisma.CompanyWhereInput = {},
  pedido: { busca?: string; recorte?: Recorte; pagina?: number; agora?: Date } = {}
): Promise<ListaDasCertidoes> {
  const prisma = getPrisma();
  const hoje = hojeIso(pedido.agora ?? new Date());
  const recorte = pedido.recorte ?? "todas";

  // 1. A carteira, leve.
  const empresas = await prisma.company.findMany({
    where: { tenantId, ...ATIVAS, ...escopoDaEmpresa },
    select: { id: true, cnpj: true, stateCode: true, city: true, name: true, displayName: true },
    orderBy: { name: "asc" },
  });
  const precisa = new Map<string, TipoDeCertidao[]>();
  for (const c of certidoesDaCarteira(empresas)) precisa.set(c.companyId, [...(precisa.get(c.companyId) ?? []), c.tipo]);
  const carteira = empresas.filter((e) => precisa.has(e.id));
  const ids = carteira.map((e) => e.id);

  // 2 e 4. A certidão que vale de cada chave e as consultas do mês.
  const [queSairam, doMes] = await Promise.all([
    ids.length
      ? prisma.certidao.findMany({
          where: { tenantId, companyId: { in: ids }, situacao: { not: "NAO_SAIU" } },
          select: { companyId: true, tipo: true, situacao: true, validaAte: true, vistaEm: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.certidao.findMany({ where: { tenantId, createdAt: { gte: inicioDoMes(hoje) } }, select: { tipo: true, situacao: true, mensagem: true, createdAt: true } }),
  ]);
  // Do mais novo para o mais velho: a primeira de cada chave é a que vale.
  const vale = new Map<string, NonNullable<CertidaoQueVale>>();
  for (const r of queSairam) {
    const k = chave(r.companyId, r.tipo);
    if (!vale.has(k)) vale.set(k, { situacao: r.situacao as SituacaoDaCertidao, validaAte: r.validaAte, vista: !!r.vistaEm });
  }
  const queVale = (companyId: string, tipo: TipoDeCertidao): CertidaoQueVale => vale.get(chave(companyId, tipo)) ?? null;

  // A faixa: a carteira inteira, sem a busca.
  const totais: TotaisDaCarteira = { empresas: carteira.length, certidoes: 0, regulares: 0, positivasAVer: 0, empresasComPositiva: 0, semCertidao: 0 };
  for (const e of carteira) {
    let comPositiva = false;
    for (const t of precisa.get(e.id)!) {
      const c = queVale(e.id, t);
      const estado = estadoDaCertidao(c, hoje);
      totais.certidoes++;
      if (c && ehRegular(c.situacao)) totais.regulares++;
      if (estado.tipo === "sem") totais.semCertidao++;
      if (estado.tipo === "positiva" && estado.aVer) {
        totais.positivasAVer++;
        comPositiva = true;
      }
    }
    if (comPositiva) totais.empresasComPositiva++;
  }

  // A busca, depois os atalhos.
  const buscadas = pedido.busca?.trim() ? carteira.filter((e) => casaComABusca(pedido.busca!, e)) : carteira;
  const contagens = Object.fromEntries(RECORTES.map((r) => [r, 0])) as Record<Recorte, number>;
  const doRecorte: typeof carteira = [];
  for (const e of buscadas) {
    const r = recortesDaEmpresa(
      precisa.get(e.id)!.map((t) => queVale(e.id, t)),
      hoje
    );
    for (const x of r) contagens[x]++;
    if (r.has(recorte)) doRecorte.push(e);
  }

  const totalDePaginas = Math.max(1, Math.ceil(doRecorte.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Math.floor(pedido.pagina ?? 1)), totalDePaginas);
  const daPagina = doRecorte.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  // 3. O detalhe só da página: a última que saiu, senão a última tentativa.
  const historico = daPagina.length
    ? await prisma.certidao.findMany({
        where: { tenantId, companyId: { in: daPagina.map((e) => e.id) } },
        select: { id: true, companyId: true, tipo: true, situacao: true, emitidaEm: true, validaAte: true, mensagem: true, driveFileId: true, vistaEm: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const ultimaConsulta = new Map<string, (typeof historico)[number]>();
  const ultimaQueSaiu = new Map<string, (typeof historico)[number]>();
  for (const r of historico) {
    const k = chave(r.companyId, r.tipo);
    if (!ultimaConsulta.has(k)) ultimaConsulta.set(k, r);
    if (r.situacao !== "NAO_SAIU" && !ultimaQueSaiu.has(k)) ultimaQueSaiu.set(k, r);
  }
  const naTela = (k: string): CertidaoNaTela | null => {
    const r = ultimaQueSaiu.get(k) ?? ultimaConsulta.get(k);
    if (!r) return null;
    return {
      id: r.id,
      situacao: r.situacao as SituacaoDaCertidao,
      emitidaEm: r.emitidaEm,
      validaAte: r.validaAte,
      mensagem: r.mensagem,
      arquivoId: r.driveFileId,
      vista: !!r.vistaEm,
      consultadaEm: r.createdAt,
    };
  };

  const linhas: LinhaDaLista[] = daPagina.map((e) => {
    const tipos = precisa.get(e.id)!;
    return {
      companyId: e.id,
      empresa: nomeExibicao(e),
      cnpj: formatCnpj(e.cnpj),
      local: e.city ? `${e.city}${e.stateCode ? `/${e.stateCode.toUpperCase()}` : ""}` : null,
      certidoes: Object.fromEntries(TIPOS_DE_CERTIDAO.filter((t) => tipos.includes(t)).map((t) => [t, naTela(chave(e.id, t))])),
    };
  });

  const recusados = servicosRecusados(doMes);
  return {
    linhas,
    total: doRecorte.length,
    pagina,
    totalDePaginas,
    contagens,
    totais,
    consultasNoMes: consultasCobradas(doMes),
    gastoNoMesCentavos: gastoDoMesEmCentavos(doMes),
    servicosRecusados: TIPOS_DE_CERTIDAO.flatMap((tipo) => {
      const em = recusados.get(tipo);
      return em ? [{ tipo, em }] : [];
    }),
  };
}
