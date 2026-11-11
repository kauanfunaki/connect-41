// O ranking da Academia pela API pública (10/11/2026, pedido do Kauan): o
// fluxo do n8n que posta no Slack lê daqui (o Kauan aponta o fluxo depois).
// GET /api/v1/academia/ranking?mes=AAAA-MM&teste=digitacao|numeros|logica|atalhos
// Contrato em docs/ACADEMIA-API.md.
//
// Só entra quem deixou "Aparecer no ranking" ligado — quem desligou não sai
// na tela dos colegas e também não sai aqui (nem no post).

import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { ErroApi } from "@/lib/api-v1/erros";
import { NIVEIS, ROTULO_DO_NIVEL, ROTULO_DO_TESTE, TESTES, mesDoInstante, mesFechado, mesPorExtensoLongo, type Nivel, type Teste } from "./regras";
import { PODIO } from "./ranking";
import { premioDoMes, rankingDoMes } from "./servidor";

export const LIMITE_PADRAO_DA_API = 10;
export const LIMITE_MAXIMO_DA_API = 50;

const parametrosSchema = z.object({
  teste: z.enum(TESTES, { error: `Informe o teste: ${TESTES.join(", ")}.` }),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês como AAAA-MM.").optional(),
  nivel: z.enum(NIVEIS, { error: `O nível é ${NIVEIS.join(", ")} (ou sem o parâmetro, para todos os níveis).` }).optional(),
  limite: z.coerce.number({ error: "O limite é um número." }).int("O limite é um número inteiro.").min(1, "O limite vai de 1 a 50.").max(LIMITE_MAXIMO_DA_API, "O limite vai de 1 a 50.").optional(),
});

/** Os parâmetros da URL, conferidos. Puro, para o teste. */
export function lerParametrosDoRanking(params: Record<string, string>, agora: Date = new Date()): { teste: Teste; mes: string; nivel: Nivel | null; limite: number } {
  const p = parametrosSchema.safeParse(params);
  if (!p.success) throw new ErroApi("validation_error", p.error.issues[0].message);
  return { teste: p.data.teste, mes: p.data.mes ?? mesDoInstante(agora), nivel: p.data.nivel ?? null, limite: p.data.limite ?? LIMITE_PADRAO_DA_API };
}

export type LinhaDaApi = {
  posicao: number;
  nome: string;
  setor: string | null;
  nivel: Nivel;
  nivelRotulo: string;
  ppm: number | null;
  acertos: number | null;
  total: number | null;
  precisao: number;
  pontos: number;
  certificado: boolean;
};

export async function rankingParaApi(ator: { tenantId: string }, params: Record<string, string>, base: string, agora: Date = new Date()) {
  const { teste, mes, nivel, limite } = lerParametrosDoRanking(params, agora);
  const [{ ranking }, premio, { labels }] = await Promise.all([
    rankingDoMes(ator.tenantId, { teste, mes, nivel, setor: null }),
    premioDoMes(ator.tenantId, mes),
    getSectorMaps(ator.tenantId),
  ]);
  const topo = ranking.slice(0, limite);
  const pessoas = await getPrisma().user.findMany({ where: { tenantId: ator.tenantId, id: { in: topo.map((p) => p.userId) } }, select: { id: true, name: true } });
  const nomes = new Map(pessoas.map((p) => [p.id, p.name]));
  const encerrado = mesFechado(mes, agora);
  // O certificado é do pódio do ranking geral (todos os níveis), como no Hub.
  const certificadoNesteRecorte = encerrado && nivel === null;
  const linhas: LinhaDaApi[] = topo.map((p) => ({
    posicao: p.posicao,
    nome: nomes.get(p.userId) ?? "—",
    setor: p.sectorCode ? sectorLabel(labels, p.sectorCode) : null,
    nivel: p.nivel,
    nivelRotulo: ROTULO_DO_NIVEL[p.nivel],
    ppm: p.ppm,
    acertos: p.acertos,
    total: p.total,
    precisao: p.precisao,
    pontos: p.pontos,
    certificado: certificadoNesteRecorte && p.posicao <= PODIO,
  }));
  const busca = new URLSearchParams({ mes, teste, ...(nivel ? { nivel } : {}) });
  return {
    teste,
    testeRotulo: ROTULO_DO_TESTE[teste],
    mes,
    mesRotulo: mesPorExtensoLongo(mes),
    nivel,
    mesEncerrado: encerrado,
    premio,
    participantes: ranking.length,
    certificado: { disponivel: certificadoNesteRecorte, colocacoes: PODIO },
    ranking: linhas,
    url: `${base}/academia/ranking?${busca.toString()}`,
  };
}
