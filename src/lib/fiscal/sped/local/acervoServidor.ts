// "Trazer do acervo" (10/11/2026) — o banco e a rede. A regra mora em
// `acervo.ts`.
//
// Um pedido por lote: a tela chama de novo com o cursor até não restar nada,
// e processa cada lote na fila como um envio manual. Assim nenhum pedido HTTP
// fica minutos aberto (2.600 documentos são seis lotes), e a pessoa vê o
// andamento e pode pausar.

import "server-only";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { credenciaisDoSped } from "@/lib/sped/credenciais";
import { obterXmls } from "@/lib/sped/client";
import { enfileirarArquivo } from "./fila";
import { ErroFiscal, prepararTelaLocal } from "./servidor";
import { mesesDoPeriodo, obrigacaoSchema } from "./dominio";
import {
  TAMANHO_DO_LOTE,
  buscarLote,
  identificadorDoMotor,
  mensagemDoMotor,
  naEmpresa,
  nomeNaFila,
  posicaoNoAcervo,
  proximoLote,
  restantesDepois,
  selecionarDoAcervo,
  type ContadoresDoAcervo,
} from "./acervo";

const entradaSchema = z.object({
  empresa: z.string().min(1),
  competencia: z.string(),
  aba: z.enum(["classificacao", "apuracao", "fechamento"]),
  escopo: z.enum(["empresa", "raiz"]).optional(),
  obrigacao: obrigacaoSchema.optional(),
  /** O cursor: a posição do último documento pedido. `null` na primeira volta. */
  depois: z.string().max(200).nullable().optional(),
  tamanho: z.number().int().min(1).max(TAMANHO_DO_LOTE).optional(),
});

export type ResumoDoAcervo = {
  /** Documentos do acervo no recorte (origem SPED, na origem, com XML segundo o índice). */
  total: number;
  naEscrituracao: number;
  naFila: number;
  semIdentificador: number;
  /** O que falta pedir, a partir do cursor recebido. */
  aPedir: number;
};

export type RespostaDoAcervo = {
  resumo: ResumoDoAcervo;
  /** Na primeira volta: as importações do acervo que ficaram na fila sem ser lidas, por empresa. */
  retomar: { empresa: string; ids: string[] }[];
  /** O lote desta volta; `null` quando não havia nada a pedir. */
  lote: { empresa: string; ids: string[]; contadores: ContadoresDoAcervo; pedidos: number } | null;
  depois: string | null;
  tamanho: number;
  restantes: number;
};

/** Uma rodada por empresa, competência e abrangência em cada processo: o segundo clique espera a primeira. */
const emAndamento = new Set<string>();

const emPartes = <T,>(lista: readonly T[], tamanho = 1000): T[][] => {
  const partes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) partes.push(lista.slice(i, i + tamanho));
  return partes;
};

export async function trazerDoAcervo(ctx: AuthContext, entrada: unknown): Promise<RespostaDoAcervo> {
  const r = entradaSchema.parse(entrada);
  const tela = await prepararTelaLocal({ empresa: r.empresa, competencia: r.competencia, escopo: r.escopo, obrigacao: r.obrigacao }, r.aba);
  if (!tela.contexto || tela.empresa?.id !== r.empresa) throw new ErroFiscal("A empresa em foco mudou. Atualize a tela antes de trazer do acervo.", 409);
  const c = tela.contexto;
  const trava = `${ctx.tenantId}:${c.companyId}:${c.competencia}:${c.consolidado ? "raiz" : "empresa"}`;
  if (emAndamento.has(trava)) throw new ErroFiscal("Já há uma busca no acervo em andamento para esta empresa e competência. Aguarde ela terminar.", 409);
  emAndamento.add(trava);
  try {
    return await umaVolta(ctx, tela, r);
  } finally {
    emAndamento.delete(trava);
  }
}

async function umaVolta(ctx: AuthContext, tela: Awaited<ReturnType<typeof prepararTelaLocal>>, r: z.infer<typeof entradaSchema>): Promise<RespostaDoAcervo> {
  const c = tela.contexto!;
  const db = getPrisma();
  const ids = tela.grupo.map((e) => e.id);
  const documentos = await db.fiscalDocument.findMany({
    where: { tenantId: ctx.tenantId, companyId: { in: ids }, competence: { in: mesesDoPeriodo(c.competencia) }, origin: "SPED", removedAtOrigin: false, renderizavel: true },
    select: { id: true, companyId: true, dedupKey: true, spedTipo: true, spedIdentificador: true },
  });

  // Na escrituração: a identidade do documento ligada ao livro da empresa (o mesmo que `carregarBase` usa).
  const naEscrituracao = new Set<string>();
  for (const parte of emPartes([...new Set(documentos.map((d) => d.dedupKey))])) {
    const escriturados = await db.spedFiscalDocument.findMany({ where: { tenantId: ctx.tenantId, identity: { in: parte } }, select: { id: true, identity: true } });
    if (!escriturados.length) continue;
    const identidade = new Map(escriturados.map((d) => [d.id, d.identity]));
    const livros = await db.spedFiscalBook.findMany({ where: { tenantId: ctx.tenantId, companyId: { in: ids }, documentId: { in: escriturados.map((d) => d.id) } }, select: { companyId: true, documentId: true } });
    for (const l of livros) {
      const chave = identidade.get(l.documentId);
      if (chave) naEscrituracao.add(naEmpresa(l.companyId, chave));
    }
  }

  // Na fila: o XML que já entrou, pelo nome com que o zip do motor o traz.
  const naFila = new Set<string>();
  const aRetomar = new Map<string, string[]>();
  const nomes = [...new Set(documentos.flatMap((d) => { const m = identificadorDoMotor(d); return m ? [nomeNaFila(m)] : []; }))];
  for (const parte of emPartes(nomes)) {
    const importacoes = await db.spedFiscalImport.findMany({ where: { tenantId: ctx.tenantId, companyId: { in: ids }, name: { in: parte } }, select: { id: true, companyId: true, name: true, state: true } });
    for (const i of importacoes) {
      naFila.add(naEmpresa(i.companyId, i.name));
      // O que ficou na fila sem ser lido (pausa, aba fechada) é retomado antes de pedir mais ao motor.
      if (i.state === "pendente" || i.state === "processando") aRetomar.set(i.companyId, [...(aRetomar.get(i.companyId) ?? []), i.id]);
    }
  }

  const selecao = selecionarDoAcervo(documentos, { naEscrituracao, naFila });
  const depois = r.depois ?? null;
  const tamanho = r.tamanho ?? TAMANHO_DO_LOTE;
  const resumo: ResumoDoAcervo = { total: documentos.length, naEscrituracao: selecao.naEscrituracao, naFila: selecao.naFila, semIdentificador: selecao.semIdentificador, aPedir: restantesDepois(selecao.aPedir, depois) };
  // Só na primeira volta: nas seguintes, o que está pendente é o lote que a tela acabou de receber.
  const retomar = depois === null ? [...aRetomar].map(([empresa, lista]) => ({ empresa, ids: lista })) : [];
  const lote = proximoLote(selecao.aPedir, depois, tamanho);
  if (!lote.length) return { resumo, retomar, lote: null, depois, tamanho, restantes: 0 };

  const creds = await credenciaisDoSped(ctx.tenantId);
  if (!creds) throw new ErroFiscal("A integração do SPED não está ligada neste escritório. Ligue em Administração › Integrações para trazer os XMLs do motor.", 409);
  const empresa = tela.grupo.find((e) => e.id === lote[0].companyId);
  if (!empresa) throw new ErroFiscal("Empresa do acervo fora da sua abrangência.", 404);

  let resultado: Awaited<ReturnType<typeof buscarLote>>;
  try {
    resultado = await buscarLote(lote, {
      tamanho,
      pedir: (docs) => obterXmls(creds, empresa.cnpj.slice(0, 8), docs),
      // O zip entra na fila de sempre, na empresa dona dos documentos.
      enfileirar: (bytes) => enfileirarArquivo(ctx, { id: empresa.id }, new File([bytes], `acervo-${c.competencia}.zip`, { type: "application/zip" })),
    });
  } catch (err) {
    const mensagem = mensagemDoMotor(err);
    if (mensagem) throw new ErroFiscal(mensagem, 502);
    throw err;
  }

  const ultimo = resultado.cobertos[resultado.cobertos.length - 1];
  const novoCursor = ultimo ? posicaoNoAcervo(ultimo) : depois;
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "fiscal.sped.acervo.trazido",
    entityType: "Company",
    entityId: empresa.id,
    metadata: { nome: empresa.nome, competencia: c.competencia, consolidado: c.consolidado, pedidos: resultado.cobertos.length, ...resultado.contadores },
  });
  return {
    resumo,
    retomar,
    lote: { empresa: empresa.id, ids: resultado.ids, contadores: resultado.contadores, pedidos: resultado.cobertos.length },
    depois: novoCursor,
    tamanho: resultado.tamanho,
    restantes: restantesDepois(selecao.aPedir, novoCursor),
  };
}
