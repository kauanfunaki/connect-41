// O banco e o transporte de mentira dos testes do cliente e do lote (20/10/2026).
//
// O banco guarda em memória só o que o `chamarSerpro` e o lote tocam: a
// conexão (com a configuração em texto, porque o teste troca o `lerConfig`), o
// "quem recebe", as autorizações e as linhas de `serpro_calls`. O transporte
// responde à autenticação com um token e ao serviço com o roteiro do teste —
// é o que segura os 401, 403, 429, 504 e 304, que a demonstração não simula.

import { randomUUID } from "node:crypto";
import { converterPfxAntigo } from "./pkcs12";
import { certificadoDeTeste } from "./pfx.fixture";
import type { CabecalhosDaResposta, RequisicaoHttps, RespostaHttps, Transporte } from "./transporte";

export const TENANT = "t-41";
/** O CNPJ de exemplo de sempre (válido, de ninguém): é o escritório e o titular do certificado. */
export const ESCRITORIO = "11222333000181";

export type LinhaDaChamada = {
  tenantId: string;
  caminho: string;
  idSistema: string;
  idServico: string;
  contribuinte: string;
  httpStatus: number | null;
  cobrada: boolean;
  tipoDeCobranca: string | null;
  mensagens: string | null;
  ambiente: string;
  requestTag: string | null;
  origem: string;
  createdAt: Date;
};

type Autorizacao = {
  status: string;
  requestedAt: Date | null;
  receivedAt: Date | null;
  validatedAt: Date | null;
  expiresAt: Date | null;
  allServices: boolean;
  services: string | null;
  checkedVia?: string;
};

type Onde<T> = { where: T };
/** Sem filtro de ambiente, vale qualquer um — como no Prisma. */
const doAmbiente = (c: { ambiente: string }, ambiente: string | undefined) => ambiente === undefined || c.ambiente === ambiente;

/** A senha e o .pfx moderno do escritório, montados uma vez por arquivo de teste. */
const SENHA_DO_PFX = randomUUID();
let pfxModerno: string | null = null;
function pfxDoEscritorio(): string {
  if (!pfxModerno) {
    const c = converterPfxAntigo(certificadoDeTeste("ESCRITORIO FICTICIO LTDA", ESCRITORIO).legado(SENHA_DO_PFX), SENHA_DO_PFX);
    if (!c.ok) throw new Error("o certificado de teste não converteu");
    pfxModerno = c.pfx.toString("base64");
  }
  return pfxModerno;
}

/** A configuração de produção pronta para chamar, com teto de R$ 400. */
export function configDeProducao(): Record<string, string> {
  return {
    ambiente: "producao",
    consumerKey: randomUUID(),
    consumerSecret: randomUUID(),
    certificado: pfxDoEscritorio(),
    senhaDoCertificado: SENHA_DO_PFX,
    tetoMensal: "400",
  };
}

// ─── Uma tabela genérica (Fase 1, 20/10/2026) ────────────────────────────────
// O bastante do Prisma para os eventos, os pedidos e as mensagens: igualdade,
// `in`, `not`, `startsWith`, `lte`/`lt`/`gte`, chave composta, `orderBy`, `take`.

type Linha = Record<string, unknown> & { id: string };

const igual = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);
const valorDe = (v: unknown) => (v instanceof Date ? v.getTime() : (v as number | string));

function casa(l: Record<string, unknown>, onde: Record<string, unknown> = {}): boolean {
  return Object.entries(onde).every(([k, cond]) => {
    const v = l[k];
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      const c = cond as Record<string, unknown>;
      if ("in" in c) return (c.in as unknown[]).some((x) => igual(x, v));
      if ("not" in c) return !igual(c.not, v);
      if ("startsWith" in c) return typeof v === "string" && v.startsWith(c.startsWith as string);
      if ("lte" in c) return v != null && valorDe(v) <= valorDe(c.lte);
      if ("lt" in c) return v != null && valorDe(v) < valorDe(c.lt);
      if ("gte" in c) return v != null && valorDe(v) >= valorDe(c.gte);
      return casa(l, c); // a chave composta: { tenantId_chave_evento: { … } }
    }
    return igual(cond, v);
  });
}

export function tabela(padroes: Record<string, unknown> = {}) {
  const linhas: Linha[] = [];
  let n = 0;
  const nova = (data: Record<string, unknown>): Linha => {
    const agora = new Date();
    const l = { createdAt: agora, updatedAt: agora, ...padroes, ...data, id: (data.id as string) ?? `id-${++n}` } as Linha;
    linhas.push(l);
    return l;
  };
  const ordenar = (lista: Linha[], orderBy?: Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[]) => {
    const criterios = orderBy ? [orderBy].flat() : [];
    return [...lista].sort((a, b) => {
      for (const c of criterios) {
        const [campo, sentido] = Object.entries(c)[0];
        const x = valorDe(a[campo]) ?? "";
        const y = valorDe(b[campo]) ?? "";
        if (x < y) return sentido === "asc" ? -1 : 1;
        if (x > y) return sentido === "asc" ? 1 : -1;
      }
      return 0;
    });
  };
  type Busca = { where?: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc">; take?: number; distinct?: string[] };
  const buscar = (b: Busca = {}) => {
    let r = ordenar(linhas.filter((l) => casa(l, b.where)), b.orderBy);
    if (b.distinct) {
      const vistos = new Set<string>();
      r = r.filter((l) => {
        const chave = b.distinct!.map((d) => String(l[d])).join("|");
        return vistos.has(chave) ? false : (vistos.add(chave), true);
      });
    }
    return (b.take ? r.slice(0, b.take) : r).map((l) => ({ ...l }));
  };
  return {
    linhas,
    findMany: async (b: Busca = {}) => buscar(b),
    findFirst: async (b: Busca = {}) => buscar(b)[0] ?? null,
    findUnique: async (b: { where: Record<string, unknown> }) => buscar(b)[0] ?? null,
    count: async (b: Busca = {}) => buscar(b).length,
    create: async ({ data }: { data: Record<string, unknown> }) => ({ ...nova(data) }),
    createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
      data.forEach(nova);
      return { count: data.length };
    },
    update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const l = linhas.find((x) => casa(x, where));
      if (!l) throw new Error("registro não encontrado");
      Object.assign(l, data, { updatedAt: new Date() });
      return { ...l };
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const alvo = linhas.filter((x) => casa(x, where));
      alvo.forEach((l) => Object.assign(l, data, { updatedAt: new Date() }));
      return { count: alvo.length };
    },
    upsert: async ({ where, create, update }: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const l = linhas.find((x) => casa(x, where));
      if (l) return { ...Object.assign(l, update, { updatedAt: new Date() }) };
      return { ...nova(create) };
    },
    zerar: () => {
      linhas.length = 0;
    },
  };
}

export function bancoFalso() {
  const estado = {
    conexao: null as { id: string; enabled: boolean; configEnc: string; updatedAt: Date; cursor: string | null } | null,
    quemRecebe: null as { name: string; cnpj: string } | null,
    autorizacoes: new Map<string, Autorizacao>(),
    chamadas: [] as LinhaDaChamada[],
  };
  // Fase 1: os modelos novos e o que o Sitfis e a Caixa Postal leem.
  const tabelas = {
    serproEvento: tabela({ semAcesso: false, pendente: false, ultimoEm: null }),
    serproPedido: tabela({ tentativas: 0, protocolo: null, companyId: null, erro: null, driveFileId: null, pedidoPorId: null }),
    serproMensagem: tabela({ lidaNoSerpro: false, abertaEm: null, abertaPorId: null, corpo: null, cienciaEm: null, validaAte: null, origem: null, numeroControle: null }),
    company: tabela({ displayName: null, cpf: null, cnpj: null }),
    driveFolder: tabela({ parentId: null, deletedAt: null, systemKey: null }),
    user: tabela(),
  };

  const prisma = {
    ...tabelas,
    tenantIntegration: {
      findUnique: async () => (estado.conexao ? { ...estado.conexao } : null),
      update: async ({ data }: { data: { cursor: string | null } }) => {
        estado.conexao!.cursor = data.cursor;
        return {};
      },
      updateMany: async ({ where, data }: Onde<{ id: string; cursor: string }> & { data: { cursor: string | null } }) => {
        if (!estado.conexao || estado.conexao.id !== where.id || estado.conexao.cursor !== where.cursor) return { count: 0 };
        estado.conexao.cursor = data.cursor;
        return { count: 1 };
      },
    },
    accessAuthorizationGrantee: { findUnique: async () => estado.quemRecebe },
    accessAuthorization: {
      findUnique: async ({ where }: Onde<{ tenantId_documento: { documento: string } }>) => {
        const doc = where.tenantId_documento.documento;
        const r = estado.autorizacoes.get(doc);
        return r ? { id: doc, ...r } : null;
      },
      update: async ({ where, data }: Onde<{ id: string }> & { data: Partial<Autorizacao> }) => {
        estado.autorizacoes.set(where.id, { ...estado.autorizacoes.get(where.id)!, ...data });
        return {};
      },
      upsert: async ({ where, create, update }: Onde<{ tenantId_documento: { documento: string } }> & { create: Autorizacao; update: Autorizacao }) => {
        const doc = where.tenantId_documento.documento;
        const atual = estado.autorizacoes.get(doc);
        estado.autorizacoes.set(doc, atual ? { ...atual, ...update } : { ...create });
        return {};
      },
    },
    serproCall: {
      create: async ({ data }: { data: Omit<LinhaDaChamada, "createdAt"> }) => {
        estado.chamadas.push({ ...data, createdAt: new Date() });
        return {};
      },
      groupBy: async ({ where }: Onde<{ cobrada: boolean; ambiente?: string }>) => {
        const contagem = new Map<string | null, number>();
        for (const c of estado.chamadas) {
          if (c.cobrada === where.cobrada && doAmbiente(c, where.ambiente)) contagem.set(c.tipoDeCobranca, (contagem.get(c.tipoDeCobranca) ?? 0) + 1);
        }
        return [...contagem].map(([tipoDeCobranca, n]) => ({ tipoDeCobranca, _count: { _all: n } }));
      },
      findMany: async ({ where }: Onde<{ idServico: string; ambiente?: string; httpStatus: { in: number[] } }>) => {
        const docs = new Set(
          estado.chamadas
            .filter((c) => c.idServico === where.idServico && doAmbiente(c, where.ambiente) && c.httpStatus !== null && where.httpStatus.in.includes(c.httpStatus))
            .map((c) => c.contribuinte)
        );
        return [...docs].map((contribuinte) => ({ contribuinte }));
      },
    },
  };

  /** Liga a conexão com esta configuração (e o "quem recebe" do escritório). */
  const conectar = (config: Record<string, string>, opcoes: { ligada?: boolean; cursor?: string | null } = {}) => {
    estado.conexao = { id: "conexao-serpro", enabled: opcoes.ligada ?? true, configEnc: JSON.stringify(config), updatedAt: new Date(), cursor: opcoes.cursor ?? null };
    estado.quemRecebe = { name: "Escritório Fictício", cnpj: ESCRITORIO };
  };

  const zerar = () => {
    estado.conexao = null;
    estado.quemRecebe = null;
    estado.autorizacoes.clear();
    estado.chamadas.length = 0;
    Object.values(tabelas).forEach((t) => t.zerar());
  };

  return { estado, prisma, tabelas, conectar, zerar };
}

export type RespostaRoteirizada = { status: number; corpo?: string; cabecalhos?: CabecalhosDaResposta } | Error;

/** O corpo de sucesso do Serpro, com o `dados` em texto, como ele manda. */
export const corpoDoSerpro = (dados: unknown, mensagens = [{ codigo: "[Sucesso-TESTE]", texto: "Requisição efetuada com sucesso." }]) =>
  JSON.stringify({ status: 200, dados: JSON.stringify(dados), mensagens });

/**
 * O transporte do teste. A autenticação devolve um token novo a cada vez
 * (dá para ver quando renovou); o serviço segue `responder`, que recebe a
 * requisição e a ordem dela entre as chamadas ao serviço.
 */
export function transporteFalso(responder: (r: RequisicaoHttps, n: number) => RespostaRoteirizada, autenticacao?: () => RespostaRoteirizada) {
  const pedidos: RequisicaoHttps[] = [];
  let tokens = 0;
  let n = 0;
  const responderCom = (x: RespostaRoteirizada): RespostaHttps => {
    if (x instanceof Error) throw x;
    return { corpo: "", cabecalhos: {}, ...x };
  };
  const transporte: Transporte = async (r) => {
    pedidos.push(r);
    if (r.url.endsWith("/authenticate")) {
      tokens++;
      return responderCom(autenticacao?.() ?? { status: 200, corpo: JSON.stringify({ access_token: `acesso-${tokens}`, jwt_token: `jwt-${tokens}`, expires_in: 2008 }) });
    }
    return responderCom(responder(r, n++));
  };
  return {
    transporte,
    autenticacoes: () => pedidos.filter((p) => p.url.endsWith("/authenticate")),
    chamadas: () => pedidos.filter((p) => !p.url.endsWith("/authenticate")),
  };
}

/** O transporte com um roteiro por serviço (Fase 1): cada um conta as próprias chamadas. */
export function transportePorServico(roteiro: Record<string, (n: number, corpo: { pedidoDados: { idServico: string; dados: string } }) => RespostaRoteirizada>) {
  const vezes = new Map<string, number>();
  const t = transporteFalso((r) => {
    const corpo = JSON.parse(r.corpo) as { pedidoDados: { idServico: string; dados: string } };
    const id = corpo.pedidoDados.idServico;
    const responder = roteiro[id];
    if (!responder) throw new Error(`o teste não esperava ${id}`);
    const n = vezes.get(id) ?? 0;
    vezes.set(id, n + 1);
    return responder(n, corpo);
  });
  const doServico = (id: string) => t.chamadas().filter((c) => (JSON.parse(c.corpo) as { pedidoDados: { idServico: string } }).pedidoDados.idServico === id);
  return { ...t, doServico };
}
