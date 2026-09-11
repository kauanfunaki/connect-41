// As ferramentas do assistente do Societário.
//
// ─── Por que este setor é o teste da fundação ───────────────────────────────
//
// O Recrutamento entrou fácil porque as ferramentas dele eram consultas
// diretas: uma vaga, uma lista de candidatos. O Societário é diferente de
// propósito — o estado dele é **derivado**, não guardado: a situação vem dos
// protocolos, o prazo vem de dias úteis com feriados, as etapas liberadas vêm
// da posição no roteiro.
//
// Se a fundação servisse só para "SELECT e devolve", ela quebraria aqui. Como
// as regras já são funções puras em `src/lib/societario/`, as ferramentas só
// chamam o que a tela chama — e é esse o ponto: o agente lê o **mesmo** estado
// que a pessoa vê, calculado pelo mesmo código. Um agente que recalculasse por
// conta própria seria a segunda fonte de verdade que o setor levaria meses
// para descobrir estar errada.

import { getPrisma } from "@/lib/prisma";
import type { ContextoDaFerramenta, FerramentaRegistrada } from "@/lib/ia/ferramentas";
import { listarFila, feriadosDoTenant } from "@/lib/societario/fila";
import {
  etapasLiberadas,
  itensObrigatoriosPendentes,
  situacaoDoProcesso,
  totalDeVoltas,
  voltasPorOrgao,
} from "@/lib/societario/processo";

const SEM_PARAMETROS = { type: "object", properties: {}, additionalProperties: false } as const;

const PEDE_PROCESSO = {
  type: "object",
  properties: {
    processoId: { type: "string", description: "O id que veio de listar_fila" },
  },
  required: ["processoId"],
  additionalProperties: false,
} as const;

/** O id do processo que o modelo pediu, validado como texto. */
export function processoPedido(argumentos: Record<string, unknown>): string {
  const id = argumentos.processoId;
  if (typeof id !== "string" || !id.trim()) throw new Error("Informe o processoId.");
  return id.trim();
}

/**
 * O `where` de um processo.
 *
 * Função exportada pelo mesmo motivo de `recorteDaCandidatura`: é a cláusula
 * que impede ler processo de outro cliente, e cláusula de escopo inline não é
 * testável — e o que não é testável não é verificado.
 */
export function recorteDoProcesso(
  argumentos: Record<string, unknown>,
  ctx: ContextoDaFerramenta
): { id: string; tenantId: string } {
  return { id: processoPedido(argumentos), tenantId: ctx.tenantId };
}

export const FERRAMENTAS_DE_SOCIETARIO: Record<string, FerramentaRegistrada> = {
  listar_fila: {
    def: {
      nome: "listar_fila",
      descricao:
        "Todos os processos societários abertos, com empresa, situação (em andamento, aguardando órgão, em exigência), prazo, quantas voltas já deu e quais etapas podem ser trabalhadas agora. Comece por aqui.",
      parametros: SEM_PARAMETROS as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (_args, ctx) => {
      const agora = new Date();
      // Os mesmos feriados e a mesma `listarFila` da tela: um agente que
      // calculasse prazo por conta própria daria um número diferente do que o
      // setor está vendo, e a divergência apareceria tarde.
      const feriados = await feriadosDoTenant(ctx.tenantId);
      const linhas = await listarFila(ctx.tenantId, {}, feriados, agora);
      return linhas.map((l) => ({
        processoId: l.id,
        tipo: l.tipoNome,
        empresa: l.empresaNome,
        responsavel: l.responsavelNome,
        situacao: l.situacao,
        prazo: l.prazo,
        voltas: l.voltas,
        etapasLiberadasAgora: l.etapasAgora,
        iniciadoEm: l.iniciadoEm.toISOString().slice(0, 10),
      }));
    },
  },

  ver_processo: {
    def: {
      nome: "ver_processo",
      descricao:
        "O detalhe de um processo: as etapas com status e órgão, o checklist de cada uma, os protocolos com desfecho e as exigências em aberto.",
      parametros: PEDE_PROCESSO as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const where = recorteDoProcesso(args, ctx);
      const prisma = getPrisma();
      const p = await prisma.process.findFirst({
        where,
        select: {
          status: true,
          startedAt: true,
          company: { select: { name: true, tradeName: true } },
          type: { select: { name: true } },
          steps: {
            select: {
              id: true,
              templateStepId: true,
              status: true,
              actor: true,
              // Rótulo, posição e órgão vivem no template, não na instância —
              // a instância guarda só o que aconteceu. É a mesma leitura que a
              // tela faz.
              templateStep: {
                select: {
                  position: true,
                  label: true,
                  parallelGroup: true,
                  optional: true,
                  organ: { select: { name: true, acronym: true } },
                },
              },
              items: {
                select: { doneAt: true, templateItem: { select: { label: true, required: true } } },
              },
            },
          },
          protocols: {
            select: {
              number: true,
              attempt: true,
              outcome: true,
              organId: true,
              organ: { select: { name: true, acronym: true } },
              requirements: { select: { description: true, resolvedAt: true } },
            },
          },
        },
      });
      if (!p) throw new Error("Processo não encontrado.");

      // As mesmas funções puras da tela — ver o cabeçalho.
      const protocolos = p.protocols.map((x) => ({
        organId: x.organId,
        attempt: x.attempt,
        outcome: x.outcome,
      }));
      const liberadas = new Set(
        etapasLiberadas(
          p.steps.map((s) => ({
            templateStepId: s.templateStepId,
            position: s.templateStep.position,
            parallelGroup: s.templateStep.parallelGroup,
            optional: s.templateStep.optional,
          })),
          p.steps.map((s) => ({ templateStepId: s.templateStepId, status: s.status }))
        )
      );
      const voltas = voltasPorOrgao(protocolos);
      const nomeDoOrgao = new Map(
        p.protocols.map((x) => [x.organId, x.organ.acronym || x.organ.name])
      );

      const etapas = [...p.steps].sort((a, b) => a.templateStep.position - b.templateStep.position);

      return {
        empresa: p.company.tradeName || p.company.name,
        tipo: p.type.name,
        status: p.status,
        situacao: situacaoDoProcesso(protocolos, p.status === "CONCLUIDO"),
        iniciadoEm: p.startedAt.toISOString().slice(0, 10),
        totalDeVoltas: totalDeVoltas(protocolos),
        voltasPorOrgao: [...voltas.entries()].map(([organId, n]) => ({
          orgao: nomeDoOrgao.get(organId) ?? organId,
          voltas: n,
        })),
        etapas: etapas.map((s) => ({
          stepId: s.id,
          etapa: s.templateStep.label,
          posicao: s.templateStep.position,
          status: s.status,
          quemFaz: s.actor,
          orgao: s.templateStep.organ?.name ?? null,
          opcional: s.templateStep.optional,
          liberadaAgora: liberadas.has(s.templateStepId),
          itensObrigatoriosPendentes: itensObrigatoriosPendentes(
            s.items.map((i) => ({ obrigatorio: i.templateItem.required, feito: i.doneAt !== null }))
          ),
          checklist: s.items.map((i) => ({
            item: i.templateItem.label,
            obrigatorio: i.templateItem.required,
            feito: i.doneAt !== null,
          })),
        })),
        protocolos: p.protocols.map((x) => ({
          numero: x.number,
          tentativa: x.attempt,
          orgao: x.organ.acronym || x.organ.name,
          desfecho: x.outcome,
          exigencias: x.requirements.map((r) => ({
            descricao: r.description,
            resolvida: r.resolvedAt !== null,
          })),
        })),
      };
    },
  },

  // ─── As de escrita. Sem executor, como sempre. ────────────────────────────

  propor_concluir_etapa: {
    def: {
      nome: "propor_concluir_etapa",
      descricao:
        "Propõe marcar uma etapa como concluída. NÃO conclui: registra a sugestão para o coordenador confirmar. Só sugira quando a etapa estiver liberada e sem item obrigatório pendente.",
      parametros: {
        type: "object",
        properties: {
          stepId: { type: "string", description: "O stepId que veio de ver_processo" },
          motivo: { type: "string", description: "Por que, com base no que você leu" },
        },
        required: ["stepId", "motivo"],
        additionalProperties: false,
      },
      natureza: "escrita",
    },
  },

  propor_dispensar_etapa: {
    def: {
      nome: "propor_dispensar_etapa",
      descricao:
        "Propõe dispensar uma etapa que não se aplica a este processo. NÃO dispensa: registra a sugestão para o coordenador confirmar.",
      parametros: {
        type: "object",
        properties: {
          stepId: { type: "string" },
          motivo: { type: "string", description: "Por que a etapa não se aplica" },
        },
        required: ["stepId", "motivo"],
        additionalProperties: false,
      },
      natureza: "escrita",
    },
  },
};
