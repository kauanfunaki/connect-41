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

export function bancoFalso() {
  const estado = {
    conexao: null as { id: string; enabled: boolean; configEnc: string; updatedAt: Date; cursor: string | null } | null,
    quemRecebe: null as { name: string; cnpj: string } | null,
    autorizacoes: new Map<string, Autorizacao>(),
    chamadas: [] as LinhaDaChamada[],
  };

  const prisma = {
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
  };

  return { estado, prisma, conectar, zerar };
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
