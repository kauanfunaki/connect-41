// A abertura de processo do Societário — a parte que lê e grava (09/11/2026).
//
// Era o corpo de `abrirProcesso` (`processos/actions.ts`), preso ao FormData da
// abertura guiada. Saiu para cá quando a Ceci passou a abrir processo pelo
// cartão do chat: as duas portas gravam por `abrirProcessoNoServidor`, com as
// mesmas regras — roteiro vigente, empresa do tenant, responsável do setor,
// checklist marcado e pedido ao cliente pelo portal. Quem pode abrir (o setor
// que opera o módulo) continua sendo conferido nas actions, como sempre foi.
//
// A regra pura — argumentos da proposta, conferência e cartão — mora em
// `abertura.ts`, que o cartão do chat importa sem levar o Prisma junto.

import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getSectorUsers, type SectorUser } from "@/lib/sectorUsers";
import { setoresDoModulo } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import { gravarMensagem, processoNoEscopo } from "./conversa";
import { avisarClienteDoProcesso } from "./avisoAoCliente";
import { lerDadosDoProcesso, type CamposDoProcesso } from "./dados-do-processo";
import { campoDaData } from "./datas";
import {
  conferirAbertura,
  lerArgumentosDaAbertura,
  SITUACOES_QUE_ABREM,
  type AberturaPreparada,
  type RoteiroDaAbertura,
} from "./abertura";

// `SECTOR` é o setor de origem, usado só como padrão: a equipe segue o setor
// que opera o módulo neste tenant — ver `setoresDoModulo`.
const SECTOR = "societario";
const MODULE = "societario_processos";

/** Processo nestes status não anda mais: não conta como "em andamento". */
const ENCERRADOS = ["CONCLUIDO", "CANCELADO", "INDEFERIDO"] as const;

/** Quem pode responder por processo: as pessoas do setor que opera o módulo e os admins. */
export async function responsaveisDoSocietario(tenantId: string): Promise<SectorUser[]> {
  return getSectorUsers(tenantId, (await setoresDoModulo(tenantId, MODULE)) ?? SECTOR);
}

/**
 * O roteiro vigente de um tipo do tenant — a versão publicada de maior número,
 * a mesma que a abertura usa —, com as etapas e o checklist na ordem da tela.
 * Nulo quando o tipo não é deste escritório.
 */
export async function roteiroVigente(tenantId: string, tipoId: string): Promise<RoteiroDaAbertura | null> {
  const tipo = await getPrisma().processType.findFirst({
    where: { id: tipoId, tenantId },
    select: {
      id: true,
      name: true,
      active: true,
      templates: {
        where: { published: true },
        orderBy: { version: "desc" },
        take: 1,
        select: {
          id: true,
          version: true,
          steps: {
            // A ordem do editor de roteiro: as paralelas dividem a posição.
            orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
            select: {
              label: true,
              optional: true,
              organ: { select: { name: true, acronym: true } },
              items: { orderBy: { position: "asc" }, select: { id: true, label: true, required: true } },
            },
          },
        },
      },
    },
  });
  if (!tipo) return null;
  const v = tipo.templates[0];
  return {
    tipo: { id: tipo.id, nome: tipo.name, ativo: tipo.active },
    vigente: v
      ? {
          id: v.id,
          versao: v.version,
          etapas: v.steps.map((s) => ({
            rotulo: s.label,
            orgao: s.organ ? s.organ.acronym || s.organ.name : null,
            opcional: s.optional,
            itens: s.items.map((i) => ({ id: i.id, rotulo: i.label, obrigatorio: i.required })),
          })),
        }
      : null,
  };
}

/**
 * O `preparar` de `propor_abrir_processo`: confere a proposta no tenant e monta
 * o resumo que o cartão mostra. **Só lê** — gravar é da aplicação.
 */
export async function prepararAbertura(
  argumentos: Record<string, unknown>,
  tenantId: string,
  agora: Date = new Date()
): Promise<{ erro: string } | { argumentos: AberturaPreparada }> {
  const lido = lerArgumentosDaAbertura(argumentos);
  if (!lido.ok) return { erro: lido.erro };
  const d = lido.dados;
  const prisma = getPrisma();
  const [roteiro, empresa, responsaveis, emAndamento] = await Promise.all([
    roteiroVigente(tenantId, d.tipoId),
    prisma.company.findFirst({
      where: { id: d.empresaId, tenantId },
      select: { id: true, name: true, displayName: true, cnpj: true, cpf: true, status: true },
    }),
    responsaveisDoSocietario(tenantId),
    prisma.process.count({
      where: { tenantId, companyId: d.empresaId, typeId: d.tipoId, status: { notIn: [...ENCERRADOS] } },
    }),
  ]);
  const r = conferirAbertura(
    d,
    {
      roteiro,
      empresa: empresa && { id: empresa.id, nome: nomeExibicao(empresa), cnpj: empresa.cnpj, cpf: empresa.cpf, situacao: empresa.status },
      responsaveis,
      emAndamento,
    },
    campoDaData(agora)
  );
  return r.ok ? { argumentos: r.abertura } : { erro: r.erro };
}

export type PedidoDeAbertura = {
  empresaId: string;
  tipoId: string;
  /** Título, responsável, prioridade e prazo, crus — lidos por `lerDadosDoProcesso`, como no editar. */
  campos: CamposDoProcesso;
  /**
   * A tela sem o campo de responsável: quem abre fica responsável e é aceito
   * mesmo fora da lista — como era antes de o campo existir.
   */
  aceitarQuemAbre: boolean;
  /** Os itens do checklist que o escritório já tem: nascem marcados. */
  jaTemos: readonly string[];
  /** O texto que vai ao cliente pela conversa do processo; nulo para não mandar. */
  pedidoAoCliente: string | null;
  /**
   * De onde veio. A proposta da Ceci pode ter esperado dias no chat, então a
   * gravação confere o que a tela garante por estar aberta na hora: o roteiro é
   * o mesmo que o cartão mostrou (`roteiroId`), todo item marcado é desse
   * roteiro, e tipo e empresa seguem ativos.
   */
  origem: { tipo: "tela" } | { tipo: "ceci"; roteiroId: string | null };
};

export type ResultadoDaAbertura = { ok: true; processoId: string } | { ok: false; erro: string };

/**
 * Abre um processo a partir do roteiro publicado do tipo.
 *
 * As etapas e os itens de checklist são instanciados **na abertura**, e não sob
 * demanda: a versão do roteiro fica congelada no `templateId`, e criar etapa
 * depois faria um processo antigo herdar um roteiro novo no meio do caminho.
 *
 * Não confere permissão: quem chama já conferiu (as actions de `processos`).
 */
export async function abrirProcessoNoServidor(
  quem: { tenantId: string; userId: string },
  pedido: PedidoDeAbertura
): Promise<ResultadoDaAbertura> {
  const { tenantId, userId } = quem;
  const { empresaId, tipoId: typeId } = pedido;
  const pelaCeci = pedido.origem.tipo === "ceci";
  if (!empresaId) return { ok: false, erro: "Escolha a empresa." };
  if (!typeId) return { ok: false, erro: "Escolha o tipo de processo." };

  // Responsável só pode ser alguém do Societário (ou admin).
  const validos = new Set((await responsaveisDoSocietario(tenantId)).map((r) => r.id));
  if (pedido.aceitarQuemAbre && userId) validos.add(userId);
  const lido = lerDadosDoProcesso(pedido.campos, validos);
  if (!lido.ok) return { ok: false, erro: lido.erro };
  const dados = lido.dados;
  // Abertura guiada (04/11/2026): os itens do checklist que o escritório já
  // tem nascem marcados, e o pedido do resto vai ao cliente pelo portal.
  const jaTemos = new Set(pedido.jaTemos.filter((v) => v.length > 0 && v.length <= 64));
  const pedirAoCliente = pedido.pedidoAoCliente !== null && pedido.pedidoAoCliente.length > 0;

  const prisma = getPrisma();

  const template = await prisma.processTemplate.findFirst({
    where: { tenantId, typeId, published: true },
    orderBy: { version: "desc" },
    select: {
      id: true,
      type: { select: { name: true, active: true } },
      steps: {
        select: { id: true, items: { select: { id: true } } },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!template) {
    return { ok: false, erro: "Este tipo de processo não tem roteiro publicado. Configure antes de abrir." };
  }
  if (template.steps.length === 0) {
    return { ok: false, erro: "O roteiro publicado não tem etapas." };
  }
  if (pedido.origem.tipo === "ceci") {
    const refazer = "Peça à Ceci para montar a proposta de novo.";
    if (!template.type.active) return { ok: false, erro: `O tipo ${template.type.name} foi desativado depois da proposta. ${refazer}` };
    if (pedido.origem.roteiroId && pedido.origem.roteiroId !== template.id) {
      return { ok: false, erro: `O roteiro de ${template.type.name} mudou depois da proposta, e o checklist pode ser outro. ${refazer}` };
    }
    // Na tela, item de fora é ignorado (a lista vem do roteiro na tela). Aqui
    // ele quer dizer que o roteiro mudou — e abrir sem a marca seria mentir no
    // cartão.
    const doRoteiro = new Set(template.steps.flatMap((s) => s.items.map((i) => i.id)));
    if ([...jaTemos].some((i) => !doRoteiro.has(i))) {
      return { ok: false, erro: `Há item marcado que não é do roteiro vigente de ${template.type.name}. ${refazer}` };
    }
  }

  // A empresa precisa ser do tenant — sem esta conferência, um id de outro
  // cliente abriria processo aqui dentro.
  const empresa = await prisma.company.findFirst({
    where: { id: empresaId, tenantId },
    select: { id: true, status: true },
  });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };
  if (pelaCeci && !(SITUACOES_QUE_ABREM as readonly string[]).includes(empresa.status)) {
    return { ok: false, erro: "A empresa não está mais ativa no escritório. Confira o cadastro antes de abrir." };
  }

  let processoId: string;
  try {
    processoId = await prisma.$transaction(
      async (tx) => {
        const processo = await tx.process.create({
          data: {
            tenantId,
            companyId: empresaId,
            typeId,
            templateId: template.id,
            ownerUserId: dados.responsavelId,
            title: dados.titulo,
            priority: dados.prioridade,
            dueAt: dados.prazoCombinado,
          },
          select: { id: true },
        });

        for (const passo of template.steps) {
          const etapa = await tx.processStep.create({
            data: {
              tenantId,
              processId: processo.id,
              templateStepId: passo.id,
            },
            select: { id: true },
          });
          for (const item of passo.items) {
            const temos = jaTemos.has(item.id);
            await tx.processChecklistItem.create({
              data: {
                tenantId,
                stepId: etapa.id,
                templateItemId: item.id,
                ...(temos ? { done: true, doneAt: new Date() } : {}),
              },
            });
          }
        }
        return processo.id;
      },
      { timeout: 60_000, maxWait: 30_000 }
    );
  } catch (err) {
    console.error("[abrirProcesso]", err);
    return { ok: false, erro: "Erro ao abrir o processo." };
  }

  await logAudit({
    tenantId,
    userId,
    // Pela Ceci (09/11/2026), a linha diz que a pessoa aprovou a proposta — o
    // resto do registro é o mesmo da tela.
    action: pelaCeci ? "process.open_ceci" : "process.open",
    entityType: "Process",
    entityId: processoId,
    metadata: { tipo: template.type.name, companyId: empresaId, prioridade: dados.prioridade, jaTemos: jaTemos.size, pedidoAoCliente: pedirAoCliente },
  });

  // O pedido ao cliente vai na conversa do processo, que ele vê no portal e
  // recebe por e-mail. Best-effort: o processo já está aberto.
  if (pedirAoCliente) {
    try {
      await gravarMensagem({ tenantId, processId: processoId, autor: { userId: userId || null }, corpo: pedido.pedidoAoCliente!, anexos: [] });
      const proc = await processoNoEscopo({ tenantId, companyIds: null }, processoId);
      if (proc) await avisarClienteDoProcesso(tenantId, proc, "mensagem");
    } catch (err) {
      console.error("[abrirProcesso] pedido ao cliente", processoId, err);
    }
  }

  return { ok: true, processoId };
}
