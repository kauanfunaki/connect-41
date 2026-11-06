// O lado da máquina na geração do SPED pela fila do Connect (06/11/2026).
//
// O motor roda por fora, sem o app do EasyPanel: o agente dele é uma automação
// do Ops Center e busca a tarefa `gerar_sped` pela fila do robô
// (`src/lib/robo/`). Daqui ele baixa o pacote da revisão, devolve o TXT em
// partes e conclui. Toda rota confere que a tarefa está com **esta** máquina:
// a que voltou para a fila por prazo pode ter ido para outra.
//
// O contrato com o agente está em `docs/SPED-GERACAO-PELO-AGENTE.md`. O pedido
// e a tela ficam em `geracao.ts`; o disco, em `gerados.ts`.

import "server-only";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ErroOps, type CredencialAutenticadaOps } from "@/lib/ops/servidor";
import { serializarPacote } from "./pacote";
import { ErroDoArquivo, apagarPartes, caminhoDoGerado, gravarParte, juntarPartes } from "./gerados";

const SHA256 = /^[0-9a-f]{64}$/;

/** O que a máquina recebe em `dados` ao pegar `gerar_sped`. */
export const pedidoDeGeracaoSchema = z.object({
  revisao_id: z.string().uuid(),
  raiz: z.string().regex(/^\d{8}$/),
  /** O estabelecimento do arquivo: o da empresa no ICMS/IPI, a matriz no Contribuições. */
  cnpj: z.string().regex(/^\d{14}$/),
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  obrigacao: z.enum(["icms_ipi", "contribuicoes"]),
  tipo_sped: z.enum(["0", "1"]),
  /** O SHA-256 dos bytes do pacote, que a máquina confere depois de baixar. */
  sha256: z.string().regex(SHA256),
  tamanho: z.number().int().positive(),
});
export type PedidoDeGeracao = z.infer<typeof pedidoDeGeracaoSchema>;

/** O que a máquina devolve em `resultado` quando o arquivo saiu. */
export const resultadoDaGeracaoSchema = z.object({
  arquivo: z.object({
    nome: z.string().trim().min(1).max(200),
    tamanho: z.number().int().positive(),
    sha256: z.string().regex(SHA256),
    partes: z.number().int().positive(),
  }),
  /** A versão do motor que gerou, para a trilha. */
  motor: z.object({ versao: z.string().max(40) }).partial().optional(),
});

async function tarefaDaMaquina(w: CredencialAutenticadaOps, id: string) {
  if (!w.slug) throw new ErroOps("O endereço precisa da automação.", 400);
  const t = await getPrisma().robotTask.findFirst({
    where: { id, tenantId: w.tenantId, kind: "gerar_sped", status: "EM_EXECUCAO", machineSlug: w.slug },
    select: { id: true, attempts: true, payload: true, requestedById: true },
  });
  if (!t) throw new ErroOps("A tarefa não está mais com esta máquina.", 409);
  const pedido = pedidoDeGeracaoSchema.safeParse(JSON.parse(t.payload));
  if (!pedido.success) throw new ErroOps("A tarefa está fora do formato da geração.", 500);
  return { ...t, pedido: pedido.data };
}

function erroDoDisco(err: unknown): never {
  if (err instanceof ErroDoArquivo) throw new ErroOps(err.message, err.status);
  throw err;
}

/** Os bytes canônicos do pacote, os mesmos que deram o SHA-256 ao congelar a revisão. */
export async function pacoteDaTarefa(w: CredencialAutenticadaOps, id: string): Promise<{ bytes: Uint8Array; sha256: string }> {
  const t = await tarefaDaMaquina(w, id);
  const revisao = await getPrisma().spedFiscalRevision.findFirst({ where: { id: t.pedido.revisao_id, tenantId: w.tenantId }, select: { data: true, sha256: true } });
  if (!revisao) throw new ErroOps("A revisão desta tarefa não existe mais.", 410);
  // O JSON do MySQL pode reordenar as chaves: os bytes saem da forma canônica.
  const { bytes, sha256 } = serializarPacote(revisao.data);
  if (sha256 !== revisao.sha256) throw new ErroOps("A revisão congelada não confere no Connect. Avise quem pediu a geração.", 500);
  return { bytes, sha256 };
}

/** Uma parte do TXT, gravada na pasta da tentativa atual da tarefa. */
export async function receberParte(w: CredencialAutenticadaOps, id: string, numero: number, bytes: Uint8Array, sha256: string) {
  const t = await tarefaDaMaquina(w, id);
  try {
    return await gravarParte({ tenantId: w.tenantId, tarefaId: t.id, tentativa: t.attempts, numero, bytes, sha256 });
  } catch (err) {
    erroDoDisco(err);
  }
}

/** Só letras, números, ponto, hífen e sublinhado, terminando em `.txt`. */
export function nomeSeguro(nome: string): string {
  const base = nome.replace(/^.*[\\/]/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 190) || "sped";
  return /\.txt$/i.test(base) ? base : `${base}.txt`;
}

/**
 * A devolução de `gerar_sped` (chamada pela devolução da fila, em
 * `robo/servidor.ts`). Junta as partes, confere tamanho e SHA-256 e só então
 * fecha a tarefa e grava o arquivo na geração — tudo ou nada: se a tarefa já
 * não está com a máquina, nada é gravado.
 */
export async function concluirGeracaoSped(w: CredencialAutenticadaOps, t: { id: string }, bruto: Record<string, unknown>): Promise<string> {
  const tarefa = await tarefaDaMaquina(w, t.id);
  const lido = resultadoDaGeracaoSchema.safeParse(bruto);
  if (!lido.success) throw new ErroOps("Resultado da geração fora do formato.", 400);
  const { arquivo } = lido.data;
  const prisma = getPrisma();
  const geracao = await prisma.spedFiscalGeneration.findFirst({ where: { tenantId: w.tenantId, robotTaskId: tarefa.id }, select: { id: true, revisionId: true } });
  if (!geracao) throw new ErroOps("A geração desta tarefa não existe mais.", 410);

  const destino = caminhoDoGerado(w.tenantId, geracao.revisionId);
  try {
    await juntarPartes({ tenantId: w.tenantId, tarefaId: tarefa.id, tentativa: tarefa.attempts, partes: arquivo.partes, tamanho: arquivo.tamanho, sha256: arquivo.sha256, destino });
  } catch (err) {
    erroDoDisco(err);
  }

  const nome = nomeSeguro(arquivo.nome);
  const agora = new Date();
  const fechada = await prisma.$transaction(async (tx) => {
    const r = await tx.robotTask.updateMany({
      where: { id: tarefa.id, tenantId: w.tenantId, status: "EM_EXECUCAO", machineSlug: w.slug },
      data: { status: "CONCLUIDA", reason: null, result: JSON.stringify({ arquivo: { ...arquivo, nome }, motor: lido.data.motor ?? null }), openKey: null, finishedAt: agora },
    });
    if (r.count !== 1) return false;
    await tx.spedFiscalGeneration.update({ where: { id: geracao.id }, data: { fileName: nome, filePath: destino, fileSha256: arquivo.sha256, fileBytes: arquivo.tamanho, finishedAt: agora } });
    return true;
  });
  if (!fechada) throw new ErroOps("A tarefa não está mais com esta máquina.", 409);

  await apagarPartes(w.tenantId, tarefa.id).catch((err) => console.error("[sped] partes", err instanceof Error ? err.name : "erro"));
  // Quem gerou foi a máquina: a trilha mostra o agente, não quem pediu (esse está no pedido).
  await logAudit({
    tenantId: w.tenantId,
    rotina: "agenteDoSped",
    action: "fiscal.sped.geracao_concluida",
    entityType: "SpedFiscalGeneration",
    entityId: geracao.id,
    metadata: { maquina: w.slug, sha256: arquivo.sha256, bytes: arquivo.tamanho, motor: lido.data.motor?.versao ?? null },
  });
  return "CONCLUIDA";
}

/** A tentativa falhou: as partes dela não servem para a próxima. */
export async function descartarPartesDaTentativa(tenantId: string, tarefaId: string, tentativa: number): Promise<void> {
  await apagarPartes(tenantId, tarefaId, tentativa).catch((err) => console.error("[sped] partes", err instanceof Error ? err.name : "erro"));
}
