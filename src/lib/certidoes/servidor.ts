// O lado do banco e da rede das certidões (Certidões pelo Connect, 28/10/2026):
// a conexão com a InfoSimples, a emissão de uma certidão, a rotina do
// trimestre e o quadro da tela. As regras estão em ./regras.ts.
//
// A rotina anda no agendador por tenant (src/lib/alerts.ts), um lote pequeno
// por vez: cada consulta pode levar minutos, porque a InfoSimples emite no
// site do órgão. Nada roda sem a integração ligada, com token e teto.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { lerConfig } from "@/lib/integracoes/data";
import { isModuleEnabled } from "@/lib/modules";
import { notifySector } from "@/lib/notifications";
import { hojeIso } from "@/lib/datas/calendario";
import { nomeExibicao } from "@/lib/companyName";
import { guardarArquivo } from "@/lib/drive/servidor";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { pastaDoModeloDaEmpresa } from "@/lib/serpro/situacaoFiscal";
import { lerTeto } from "@/lib/serpro/regras";
import {
  certidoesDaCarteira,
  CONSULTA,
  ehRegular,
  grupoDaEmpresa,
  lerCertidao,
  mesDoTrimestre,
  nomeDoComprovante,
  PRECO_POR_CONSULTA_EM_CENTAVOS,
  ROTULO_DA_CERTIDAO,
  SETORES_DO_AVISO,
  TIPOS_DE_CERTIDAO,
  trimestreDe,
  type RespostaDaInfoSimples,
  type SituacaoDaCertidao,
  type TipoDeCertidao,
} from "./regras";

export const CODIGO_DA_INTEGRACAO = "infosimples";
export const MODULO_CERTIDOES = "societario_certidoes";

/** Consultas por passada do agendador: cada uma pode levar minutos. */
const LOTE = 8;
/** O tempo que a InfoSimples tem para emitir no site do órgão, em segundos. */
const TEMPO_DA_CONSULTA_S = 120;
/** Quantas vezes a rotina tenta a mesma certidão no trimestre. */
const TENTATIVAS_NO_TRIMESTRE = 3;
/** Depois de uma que não saiu, quanto esperar para tentar de novo. */
const ESPERA_DEPOIS_DE_FALHA_MS = 20 * 60 * 60_000;

// ─── A rede ──────────────────────────────────────────────────────────────────

export type TransporteDaInfoSimples = {
  consultar(caminho: string, corpo: URLSearchParams): Promise<RespostaDaInfoSimples>;
  /** O comprovante que a consulta devolve (`site_receipts`). */
  baixar(url: string): Promise<{ ok: true; bytes: Uint8Array; pdf: boolean } | { ok: false }>;
};

const transporteDeVerdade: TransporteDaInfoSimples = {
  async consultar(caminho, corpo) {
    try {
      const r = await fetch(`https://api.infosimples.com/api/v2/consultas/${caminho}`, {
        method: "POST",
        body: corpo,
        signal: AbortSignal.timeout((TEMPO_DA_CONSULTA_S + 30) * 1000),
      });
      return (await r.json()) as RespostaDaInfoSimples;
    } catch (err) {
      return { code_message: `Sem resposta da InfoSimples: ${err instanceof Error ? err.message : "falha de rede"}` };
    }
  },
  async baixar(url) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) return { ok: false };
      const pdf = (r.headers.get("content-type") ?? "").includes("pdf") || url.toLowerCase().split("?")[0].endsWith(".pdf");
      return { ok: true, bytes: new Uint8Array(await r.arrayBuffer()), pdf };
    } catch {
      return { ok: false };
    }
  },
};

// ─── A conexão ───────────────────────────────────────────────────────────────

export type ConexaoDaInfoSimples = { pronta: true; token: string; tetoCentavos: number } | { pronta: false; motivo: string };

export async function conexaoDaInfoSimples(tenantId: string): Promise<ConexaoDaInfoSimples> {
  const c = await getPrisma().tenantIntegration.findUnique({
    where: { tenantId_integrationCode_instanceKey: { tenantId, integrationCode: CODIGO_DA_INTEGRACAO, instanceKey: "default" } },
    select: { enabled: true, configEnc: true },
  });
  if (!c) return { pronta: false, motivo: "A InfoSimples não está configurada em Integrações." };
  if (!c.enabled) return { pronta: false, motivo: "A integração da InfoSimples está desligada." };
  const config = lerConfig(c.configEnc);
  const tetoCentavos = lerTeto(config.tetoMensal);
  if (!config.token) return { pronta: false, motivo: "Falta o token da InfoSimples em Integrações." };
  if (tetoCentavos === null) return { pronta: false, motivo: "Falta o teto mensal da InfoSimples em Integrações." };
  return { pronta: true, token: config.token, tetoCentavos };
}

const inicioDoMes = (hoje: string) => new Date(`${hoje.slice(0, 7)}-01T00:00:00-03:00`);

/** Cabe mais uma consulta no teto do mês? Conta pelo preço da primeira faixa, o mais caro. */
async function cabeNoTeto(tenantId: string, tetoCentavos: number, hoje: string): Promise<boolean> {
  const feitas = await getPrisma().certidao.count({ where: { tenantId, createdAt: { gte: inicioDoMes(hoje) } } });
  return (feitas + 1) * PRECO_POR_CONSULTA_EM_CENTAVOS <= tetoCentavos;
}

// ─── Uma certidão ────────────────────────────────────────────────────────────

export type OpcoesDasCertidoes = { transporte?: TransporteDaInfoSimples; agora?: () => Date };

export type ResultadoDaCertidao =
  | { ok: true; situacao: SituacaoDaCertidao; texto: string }
  | { ok: false; erro: string; configuracao?: boolean };

/**
 * Consulta uma certidão e grava o resultado, saia ou não. A regular vai para
 * a pasta Certidões (que o cliente vê no portal); a positiva fica na pasta
 * Societário até o setor ver, e os setores são avisados.
 */
export async function emitirCertidao(p: {
  tenantId: string;
  companyId: string;
  tipo: TipoDeCertidao;
  token: string;
  userId: string | null;
  trimestre: string | null;
  opcoes?: OpcoesDasCertidoes;
}): Promise<ResultadoDaCertidao> {
  const transporte = p.opcoes?.transporte ?? transporteDeVerdade;
  const hoje = hojeIso(p.opcoes?.agora?.() ?? new Date());
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: p.companyId, tenantId: p.tenantId }, select: { cnpj: true, name: true, displayName: true } });
  const cnpj = (empresa?.cnpj ?? "").replace(/\D/g, "");
  if (!empresa || cnpj.length !== 14) return { ok: false, erro: "A empresa não tem CNPJ válido no cadastro." };

  const consulta = CONSULTA[p.tipo];
  const corpo = new URLSearchParams({ token: p.token, timeout: String(TEMPO_DA_CONSULTA_S), cnpj, ...(consulta.fixos ?? {}) });
  const lida = lerCertidao(p.tipo, await transporte.consultar(consulta.caminho, corpo));
  const rotulo = ROTULO_DA_CERTIDAO[p.tipo];

  if (lida.tipo === "nao_saiu") {
    await prisma.certidao.create({
      data: { tenantId: p.tenantId, companyId: p.companyId, tipo: p.tipo, situacao: "NAO_SAIU", mensagem: lida.mensagem, trimestre: p.trimestre, pedidaPorId: p.userId },
    });
    return { ok: false, erro: `A certidão ${rotulo} não saiu: ${lida.mensagem}`, configuracao: lida.configuracao };
  }

  const regular = ehRegular(lida.situacao);
  const driveFileId = await guardarComprovante({
    tenantId: p.tenantId,
    companyId: p.companyId,
    pasta: regular ? "certidoes" : "societario",
    url: lida.comprovante,
    nome: (ext: "pdf" | "html") => nomeDoComprovante(p.tipo, nomeExibicao(empresa), lida.emitidaEm ?? hoje, ext),
    userId: p.userId,
    transporte,
  });
  const certidao = await prisma.certidao.create({
    data: {
      tenantId: p.tenantId,
      companyId: p.companyId,
      tipo: p.tipo,
      situacao: lida.situacao,
      codigo: lida.codigo,
      emitidaEm: lida.emitidaEm,
      validaAte: lida.validaAte,
      mensagem: lida.mensagem,
      trimestre: p.trimestre,
      driveFileId,
      pedidaPorId: p.userId,
    },
    select: { id: true },
  });

  if (!regular) {
    for (const setor of SETORES_DO_AVISO[p.tipo]) {
      await notifySector(setor, {
        tenantId: p.tenantId,
        type: "CERTIDAO_POSITIVA",
        message: `Certidão ${rotulo} positiva: ${nomeExibicao(empresa)}`.slice(0, 255),
        entityType: "COMPANY",
        entityId: p.companyId,
        deduplicationId: `certidao-positiva:${certidao.id}:${setor}`,
      });
    }
  }
  const onde = driveFileId ? (regular ? " Está em Arquivos › Certidões." : " Está em Arquivos › Societário.") : "";
  return { ok: true, situacao: lida.situacao, texto: `Certidão ${rotulo}: ${lida.situacao === "NEGATIVA" ? "negativa" : lida.situacao === "POSITIVA" ? "positiva" : "positiva com efeito de negativa"}.${onde}` };
}

/** Baixa o comprovante e guarda nos Arquivos. Sem pasta, sem Arquivos ou sem comprovante, a certidão fica só no registro. */
async function guardarComprovante(p: {
  tenantId: string;
  companyId: string;
  pasta: "certidoes" | "societario";
  url: string | null;
  nome: (ext: "pdf" | "html") => string;
  userId: string | null;
  transporte: TransporteDaInfoSimples;
}): Promise<string | null> {
  if (!p.url || !(await isModuleEnabled(p.tenantId, MODULO_ARQUIVOS))) return null;
  const pasta = await pastaDoModeloDaEmpresa(p.tenantId, p.companyId, p.pasta);
  if (!pasta) return null;
  const baixado = await p.transporte.baixar(p.url);
  if (!baixado.ok) return null;
  const guardado = await guardarArquivo({
    tenantId: p.tenantId,
    folderId: pasta,
    arquivo: new File([Buffer.from(baixado.bytes)], p.nome(baixado.pdf ? "pdf" : "html"), { type: baixado.pdf ? "application/pdf" : "text/html" }),
    uploadedByUserId: p.userId,
  });
  return guardado.ok ? guardado.arquivoId : null;
}

// ─── A rotina do trimestre ───────────────────────────────────────────────────

const ATIVAS: Prisma.CompanyWhereInput = { status: "ACTIVE" };

/**
 * A passada do agendador: as certidões do trimestre que ainda faltam, das
 * empresas cujo mês já chegou (as de meses anteriores que não saíram entram
 * junto), um lote por vez, dentro do teto. Token recusado para a rotina.
 */
export async function rotinaDasCertidoes(tenantId: string, opcoes: OpcoesDasCertidoes = {}): Promise<number> {
  if (!(await isModuleEnabled(tenantId, MODULO_CERTIDOES))) return 0;
  const conexao = await conexaoDaInfoSimples(tenantId);
  if (!conexao.pronta) return 0;
  const agora = opcoes.agora?.() ?? new Date();
  const hoje = hojeIso(agora);
  const trimestre = trimestreDe(hoje);
  const mes = mesDoTrimestre(hoje);
  const prisma = getPrisma();

  const empresas = await prisma.company.findMany({ where: { tenantId, ...ATIVAS }, select: { id: true, cnpj: true, stateCode: true, city: true } });
  const doMes = certidoesDaCarteira(empresas).filter((c) => grupoDaEmpresa(c.companyId) <= mes);
  if (!doMes.length) return 0;

  const feitas = await prisma.certidao.findMany({ where: { tenantId, trimestre }, select: { companyId: true, tipo: true, situacao: true, createdAt: true } });
  const chave = (companyId: string, tipo: string) => `${companyId}:${tipo}`;
  const saiu = new Set(feitas.filter((f) => f.situacao !== "NAO_SAIU").map((f) => chave(f.companyId, f.tipo)));
  const falhas = new Map<string, { vezes: number; ultima: number }>();
  for (const f of feitas.filter((x) => x.situacao === "NAO_SAIU")) {
    const k = chave(f.companyId, f.tipo);
    const antes = falhas.get(k) ?? { vezes: 0, ultima: 0 };
    falhas.set(k, { vezes: antes.vezes + 1, ultima: Math.max(antes.ultima, f.createdAt.getTime()) });
  }
  const pendentes = doMes.filter((c) => {
    const k = chave(c.companyId, c.tipo);
    if (saiu.has(k)) return false;
    const f = falhas.get(k);
    return !f || (f.vezes < TENTATIVAS_NO_TRIMESTRE && agora.getTime() - f.ultima >= ESPERA_DEPOIS_DE_FALHA_MS);
  });

  let feitasAgora = 0;
  for (const c of pendentes.slice(0, LOTE)) {
    if (!(await cabeNoTeto(tenantId, conexao.tetoCentavos, hoje))) break;
    const r = await emitirCertidao({ tenantId, companyId: c.companyId, tipo: c.tipo, token: conexao.token, userId: null, trimestre, opcoes });
    feitasAgora++;
    if (!r.ok && r.configuracao) break;
  }
  return feitasAgora;
}

/** "Emitir agora" pela tela: fora da rotina, dentro do teto. */
export async function emitirAgora(tenantId: string, userId: string, companyId: string, tipo: TipoDeCertidao, opcoes: OpcoesDasCertidoes = {}): Promise<ResultadoDaCertidao> {
  const conexao = await conexaoDaInfoSimples(tenantId);
  if (!conexao.pronta) return { ok: false, erro: conexao.motivo };
  const hoje = hojeIso(opcoes.agora?.() ?? new Date());
  if (!(await cabeNoTeto(tenantId, conexao.tetoCentavos, hoje))) return { ok: false, erro: "O teto mensal da InfoSimples foi atingido. Aumente em Integrações ou espere o mês virar." };
  return emitirCertidao({ tenantId, companyId, tipo, token: conexao.token, userId, trimestre: null, opcoes });
}

/** A positiva vista por alguém do setor: sai do recorte "a ver". */
export async function marcarCertidaoComoVista(tenantId: string, userId: string, certidaoId: string, agora = new Date()): Promise<{ companyId: string } | null> {
  const prisma = getPrisma();
  const c = await prisma.certidao.findFirst({ where: { id: certidaoId, tenantId, situacao: "POSITIVA" }, select: { id: true, companyId: true } });
  if (!c) return null;
  await prisma.certidao.update({ where: { id: c.id }, data: { vistaEm: agora, vistaPorId: userId } });
  return { companyId: c.companyId };
}

// ─── O quadro da tela ────────────────────────────────────────────────────────

export type CertidaoNaTela = {
  id: string;
  situacao: SituacaoDaCertidao;
  emitidaEm: string | null;
  validaAte: string | null;
  mensagem: string | null;
  arquivoId: string | null;
  vista: boolean;
  consultadaEm: Date;
};

export type LinhaDoQuadro = {
  companyId: string;
  empresa: string;
  /** Só as certidões que a empresa precisa; `null` = ainda não consultada. */
  certidoes: Partial<Record<TipoDeCertidao, CertidaoNaTela | null>>;
};

/**
 * Empresa por empresa, a última consulta de cada certidão que ela precisa.
 * A última que saiu vale mais que uma tentativa que falhou depois dela.
 */
export async function quadroDasCertidoes(tenantId: string, escopoDaEmpresa: Prisma.CompanyWhereInput = {}): Promise<{ linhas: LinhaDoQuadro[]; consultasNoMes: number }> {
  const prisma = getPrisma();
  const hoje = hojeIso();
  const empresas = await prisma.company.findMany({
    where: { tenantId, ...ATIVAS, ...escopoDaEmpresa },
    select: { id: true, cnpj: true, stateCode: true, city: true, name: true, displayName: true },
    orderBy: { name: "asc" },
  });
  const precisa = new Map<string, Set<TipoDeCertidao>>();
  for (const c of certidoesDaCarteira(empresas)) precisa.set(c.companyId, (precisa.get(c.companyId) ?? new Set()).add(c.tipo));

  const ids = [...precisa.keys()];
  const [registros, consultasNoMes] = await Promise.all([
    ids.length
      ? prisma.certidao.findMany({
          where: { tenantId, companyId: { in: ids } },
          select: { id: true, companyId: true, tipo: true, situacao: true, emitidaEm: true, validaAte: true, mensagem: true, driveFileId: true, vistaEm: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 20_000,
        })
      : Promise.resolve([]),
    prisma.certidao.count({ where: { tenantId, createdAt: { gte: inicioDoMes(hoje) } } }),
  ]);

  // Os registros vêm do mais novo: o primeiro de cada chave é a última consulta;
  // o primeiro que saiu é a certidão que vale.
  const ultimaConsulta = new Map<string, (typeof registros)[number]>();
  const ultimaQueSaiu = new Map<string, (typeof registros)[number]>();
  for (const r of registros) {
    const k = `${r.companyId}:${r.tipo}`;
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

  const linhas = empresas
    .filter((e) => precisa.has(e.id))
    .map((e) => ({
      companyId: e.id,
      empresa: nomeExibicao(e),
      certidoes: Object.fromEntries(TIPOS_DE_CERTIDAO.filter((t) => precisa.get(e.id)!.has(t)).map((t) => [t, naTela(`${e.id}:${t}`)])),
    }));
  return { linhas, consultasNoMes };
}
