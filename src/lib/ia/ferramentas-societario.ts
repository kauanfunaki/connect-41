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
import { linkDaTela, situacaoLegivel } from "@/lib/ia/legivel";
import { ABRIR_PROCESSO, MAX_PEDIDO, dataLegivel, prazoDoTipo } from "@/lib/societario/abertura";
import { prepararAbertura, responsaveisDoSocietario, roteiroVigente } from "@/lib/societario/aberturaServidor";
import { textoDoPedidoDeDocumentos } from "@/lib/societario/pedidoDeDocumentos";
import { MAX_TITULO } from "@/lib/societario/dados-do-processo";
import { campoDaData } from "@/lib/societario/datas";
import { PRIORIDADES } from "@/lib/societario/prioridade";

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

/** O tipo de processo que o modelo pediu, validado como texto. */
export function tipoPedido(argumentos: Record<string, unknown>): string {
  const id = argumentos.tipoId;
  if (typeof id !== "string" || !id.trim()) throw new Error("Informe o tipoId (de tipos_de_processo).");
  return id.trim();
}

/**
 * A data de hoje em São Paulo, para a Ceci contar "prazo dia 20" — o modelo
 * não sabe que dia é. Vai em `tipos_de_processo`, que ela chama antes de propor.
 */
export function hojeParaACeci(agora: Date): { data: string; legivel: string } {
  const data = campoDaData(agora);
  const semana = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).format(agora);
  return { data, legivel: `${semana}, ${dataLegivel(data)}` };
}

/** O prazo do processo em palavras ("dentro do prazo", "estourado") — o código vinha cru. */
const SITUACAO_DO_PRAZO: Readonly<Record<string, string>> = {
  sem_previsao: "sem previsão",
  dentro: "dentro do prazo",
  no_limite: "no limite do prazo",
  estourado: "prazo estourado",
};

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
        // A tela do processo, para a Ceci apontar pelo nome — nunca pelo id.
        link: linkDaTela(`${l.tipoNome} — ${l.empresaNome}`, `/processos/${l.id}`),
        responsavel: l.responsavelNome,
        situacao: situacaoLegivel(l.situacao),
        prazo: { ...l.prazo, situacao: situacaoLegivel(l.prazo.situacao, SITUACAO_DO_PRAZO) },
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
        status: situacaoLegivel(p.status),
        situacao: situacaoLegivel(situacaoDoProcesso(protocolos, p.status === "CONCLUIDO", p.status)),
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
          status: situacaoLegivel(s.status),
          quemFaz: situacaoLegivel(s.actor),
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
          desfecho: situacaoLegivel(x.outcome),
          exigencias: x.requirements.map((r) => ({
            descricao: r.description,
            resolvida: r.resolvedAt !== null,
          })),
        })),
      };
    },
  },

  // ─── Para abrir processo pela Ceci (09/11/2026) ───────────────────────────
  //
  // O que a abertura guiada pergunta na tela, em ferramentas: o tipo e o
  // roteiro vigente dele, a empresa (`buscar_empresa`, a do Fiscal, no tenant)
  // e quem pode responder. O roteiro é dado do escritório e muda pela tela
  // (PR #461): por isso a Ceci lê a versão vigente, e nunca uma lista fixa.

  tipos_de_processo: {
    def: {
      nome: "tipos_de_processo",
      descricao:
        "Os tipos de processo do escritório (como Constituição, Alteração, Baixa), com o prazo previsto e se têm roteiro publicado — sem roteiro, o processo não abre. Traz também a data de hoje, para contar o prazo combinado. Chame antes de propor_abrir_processo: o tipoId sai daqui, nunca de suposição.",
      parametros: SEM_PARAMETROS as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (_args, ctx) => {
      // Só os ativos, como o seletor da abertura guiada.
      const tipos = await getPrisma().processType.findMany({
        where: { tenantId: ctx.tenantId, active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          expectedDaysMin: true,
          expectedDaysMax: true,
          variableFlow: true,
          templates: {
            where: { published: true },
            orderBy: { version: "desc" },
            take: 1,
            select: { version: true, _count: { select: { steps: true } } },
          },
        },
      });
      return {
        hoje: hojeParaACeci(new Date()),
        tipos: tipos.map((t) => {
          const v = t.templates[0];
          const etapas = v?._count.steps ?? 0;
          return {
            tipoId: t.id,
            nome: t.name,
            ...(t.description ? { descricao: t.description } : {}),
            prazoPrevisto: prazoDoTipo(t),
            roteiro: v && etapas > 0 ? `versão ${v.version}, ${etapas} ${etapas === 1 ? "etapa" : "etapas"}` : "sem roteiro publicado — não abre processo",
          };
        }),
      };
    },
  },

  roteiro_do_tipo: {
    def: {
      nome: "roteiro_do_tipo",
      descricao:
        "O roteiro vigente de um tipo de processo: as etapas, na ordem, e o checklist de cada uma com o itemId de cada item — é o que o processo vai pedir. Traz também o modelo do pedido de documentos ao cliente, com todos os itens. Chame antes de propor_abrir_processo.",
      parametros: {
        type: "object",
        properties: { tipoId: { type: "string", description: "O tipoId que veio de tipos_de_processo" } },
        required: ["tipoId"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const roteiro = await roteiroVigente(ctx.tenantId, tipoPedido(args));
      if (!roteiro) throw new Error("Tipo de processo não encontrado. Use um tipoId de tipos_de_processo.");
      const { tipo, vigente } = roteiro;
      if (!vigente || vigente.etapas.length === 0) {
        return {
          tipo: tipo.nome,
          roteiro: null,
          aviso: "Este tipo não tem roteiro publicado: o processo não abre até a coordenação publicar um em Processos › Roteiros.",
        };
      }
      const itens = vigente.etapas.flatMap((e) => e.itens.map((i) => i.rotulo));
      return {
        tipo: tipo.nome,
        ...(tipo.ativo ? {} : { aviso: "Este tipo está desativado no escritório: não abre processo." }),
        versaoDoRoteiro: vigente.versao,
        etapas: vigente.etapas.map((e) => ({
          etapa: e.rotulo,
          ...(e.orgao ? { orgao: e.orgao } : {}),
          ...(e.opcional ? { opcional: true } : {}),
          checklist: e.itens.map((i) => ({ itemId: i.id, item: i.rotulo, obrigatorio: i.obrigatorio })),
        })),
        // O mesmo texto que a abertura guiada propõe na tela.
        modeloDoPedido: textoDoPedidoDeDocumentos(tipo.nome, itens) || null,
      };
    },
  },

  responsaveis_do_societario: {
    def: {
      nome: "responsaveis_do_societario",
      descricao:
        "As pessoas que podem responder por um processo do Societário — a equipe do setor e os administradores —, com o usuarioId de cada uma. `voce: true` marca quem está perguntando. Chame antes de propor_abrir_processo.",
      parametros: SEM_PARAMETROS as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (_args, ctx) => {
      // A mesma lista do campo Responsável da abertura guiada.
      const pessoas = await responsaveisDoSocietario(ctx.tenantId);
      return {
        pessoas: pessoas.map((p) => ({ usuarioId: p.id, nome: p.name, ...(p.id === ctx.userId ? { voce: true } : {}) })),
      };
    },
  },

  // ─── As de escrita. Sem executor, como sempre. ────────────────────────────

  [ABRIR_PROCESSO]: {
    def: {
      nome: ABRIR_PROCESSO,
      descricao:
        "Prepara a abertura de um processo do Societário para a pessoa confirmar no cartão. NÃO abre: o processo só nasce quando ela clicar em \"Abrir processo\". Antes, consulte tipos_de_processo (o tipo e a data de hoje), buscar_empresa (a empresa), responsaveis_do_societario (quem responde) e roteiro_do_tipo (o checklist vigente): os ids vêm dessas ferramentas, nunca de suposição. Se a conferência recusar, corrija com o que ela disse ou pergunte à pessoa.",
      parametros: {
        type: "object",
        properties: {
          tipoId: { type: "string", description: "O tipoId de tipos_de_processo" },
          empresaId: { type: "string", description: "O empresaId de buscar_empresa" },
          responsavelId: { type: "string", description: "O usuarioId de responsaveis_do_societario, ou \"\" para sem responsável" },
          titulo: {
            type: "string",
            description: `Até ${MAX_TITULO} caracteres: o que diferencia este processo de outro do mesmo tipo na mesma empresa (ex.: "Mudança para a sede nova"). "" se a pessoa não disse`,
          },
          prioridade: { type: "string", enum: [...PRIORIDADES], description: "NORMAL, a menos que a pessoa diga outra" },
          prazo: { type: "string", description: "O prazo combinado com o cliente, AAAA-MM-DD, contado a partir de hoje (de tipos_de_processo). \"\" se a pessoa não disse" },
          jaTemos: {
            type: "array",
            items: { type: "string" },
            description: "Os itemId de roteiro_do_tipo que o escritório JÁ TEM — só os que a pessoa disse. [] se nenhum",
          },
          pedidoAoCliente: {
            type: "string",
            description: `O texto que vai ao cliente pelo portal, pedindo o que falta (até ${MAX_PEDIDO} caracteres): parta de modeloDoPedido (roteiro_do_tipo) e tire as linhas do que está em jaTemos. "" para abrir sem pedir nada — só se a pessoa disser`,
          },
        },
        required: ["tipoId", "empresaId", "responsavelId", "titulo", "prioridade", "prazo", "jaTemos", "pedidoAoCliente"],
        additionalProperties: false,
      },
      natureza: "escrita",
    },
    // Confere tipo, roteiro vigente, empresa, responsável, itens e prazo no
    // tenant, e grava no cartão os nomes lidos do banco. Só lê — abrir é de
    // `abrirProcessoPelaCeci`, quando a pessoa aprova.
    preparar: (args, ctx) => prepararAbertura(args, ctx.tenantId),
  },

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
