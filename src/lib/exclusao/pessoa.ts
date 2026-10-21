// Exclusão de pessoa — as três populações: a equipe do escritório
// (`isInternal`), o funcionário de empresa cliente e o candidato.
//
// O plano trabalha sobre uma lista de pessoas: é o mesmo que a exclusão da
// empresa usa para levar os funcionários junto, numa transação só.

import type { PrismaClient } from "@/generated/prisma/client";
import { formatCalendarDate, maskCpf } from "@/lib/format";
import {
  OPCOES_DA_TRANSACAO,
  Recusa,
  compactar,
  contarLigacoes,
  executarPlano,
  item,
  itensDasContagens,
  juntos,
  mensagemDeErro,
  n,
  nomeDoAtor,
  papelExclui,
  registrarExclusao,
  validarModo,
  type Passo,
  type Tx,
} from "./comum";
import { SO_ADMIN_EXCLUI } from "@/lib/auth/papeis";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { anotar, apagarArquivos, curriculosSemUso, semArquivos, totalDeArquivos, type ArquivosDoCadastro } from "./arquivos";
import { LIGACOES } from "./registro";
import type { ItemDaPrevia, ModoDaExclusao, Previa, ResultadoDaExclusao } from "./tipos";

export type AlvoPessoas = { tenantId: string; ids: string[] };

const daPessoa = (a: AlvoPessoas) => ({ tenantId: a.tenantId, personId: { in: a.ids } });
const daEntidade = (a: AlvoPessoas) => ({ tenantId: a.tenantId, entityType: "PERSON" as const, entityId: { in: a.ids } });

async function candidaturasDasPessoas(tx: Tx, a: AlvoPessoas): Promise<string[]> {
  return (await tx.candidatura.findMany({ where: daPessoa(a), select: { id: true } })).map((c) => c.id);
}

/**
 * A ordem importa: o banco recusa apagar a linha apontada antes de quem aponta
 * (`plano.test.ts` confere contra o schema). A pessoa é o último passo.
 */
export const PLANO_DA_PESSOA: readonly Passo<AlvoPessoas>[] = [
  // A conversa do WhatsApp fica — é do número do escritório —, sem a pessoa.
  {
    modelo: "WhatsappThread",
    acao: "anular",
    coluna: "candidaturaId",
    executar: async (tx, a) => {
      const ids = await candidaturasDasPessoas(tx, a);
      if (ids.length === 0) return 0;
      return n(tx.whatsappThread.updateMany({ where: { tenantId: a.tenantId, candidaturaId: { in: ids } }, data: { candidaturaId: null } }));
    },
  },
  {
    modelo: "WhatsappThread",
    acao: "anular",
    coluna: "personId",
    executar: (tx, a) =>
      n(tx.whatsappThread.updateMany({ where: { tenantId: a.tenantId, personId: { in: a.ids } }, data: { personId: null } })),
  },
  {
    modelo: "WhatsappThread",
    acao: "anular",
    coluna: "linkPendingPersonId",
    executar: (tx, a) =>
      n(
        tx.whatsappThread.updateMany({
          where: { tenantId: a.tenantId, linkPendingPersonId: { in: a.ids } },
          data: { linkPendingPersonId: null },
        })
      ),
  },
  // O teste enviado para a candidatura solta dela antes (o da própria pessoa
  // sai com ela, em cascata, no último passo). Depois da migration
  // 20261014200000 o banco faria isso sozinho (SET NULL); antes dela a chave é
  // RESTRICT e travava a exclusão da candidatura.
  {
    modelo: "AssessmentLink",
    acao: "anular",
    coluna: "candidaturaId",
    executar: async (tx, a) => {
      const ids = await candidaturasDasPessoas(tx, a);
      if (ids.length === 0) return 0;
      return n(tx.assessmentLink.updateMany({ where: { tenantId: a.tenantId, candidaturaId: { in: ids } }, data: { candidaturaId: null } }));
    },
  },
  // Notas, avaliações de entrevista e reuniões da candidatura vão junto (cascata).
  { modelo: "Candidatura", acao: "apagar", executar: (tx, a) => n(tx.candidatura.deleteMany({ where: daPessoa(a) })) },
  { modelo: "ExameAdmissional", acao: "apagar", executar: (tx, a) => n(tx.exameAdmissional.deleteMany({ where: daPessoa(a) })) },
  { modelo: "SalaryChange", acao: "apagar", executar: (tx, a) => n(tx.salaryChange.deleteMany({ where: daPessoa(a) })) },
  { modelo: "Vacation", acao: "apagar", executar: (tx, a) => n(tx.vacation.deleteMany({ where: daPessoa(a) })) },
  { modelo: "Absence", acao: "apagar", executar: (tx, a) => n(tx.absence.deleteMany({ where: daPessoa(a) })) },
  // A conferência do desligamento vai junto (cascata).
  { modelo: "Termination", acao: "apagar", executar: (tx, a) => n(tx.termination.deleteMany({ where: daPessoa(a) })) },
  { modelo: "PayrollEntry", acao: "apagar", executar: (tx, a) => n(tx.payrollEntry.deleteMany({ where: daPessoa(a) })) },
  { modelo: "OvertimeEntry", acao: "apagar", executar: (tx, a) => n(tx.overtimeEntry.deleteMany({ where: daPessoa(a) })) },
  { modelo: "BenefitAssignment", acao: "apagar", executar: (tx, a) => n(tx.benefitAssignment.deleteMany({ where: daPessoa(a) })) },
  { modelo: "ScheduleEntry", acao: "apagar", executar: (tx, a) => n(tx.scheduleEntry.deleteMany({ where: daPessoa(a) })) },
  { modelo: "TrainingParticipant", acao: "apagar", executar: (tx, a) => n(tx.trainingParticipant.deleteMany({ where: daPessoa(a) })) },
  // As notas da avaliação vão junto (cascata).
  { modelo: "Evaluation", acao: "apagar", executar: (tx, a) => n(tx.evaluation.deleteMany({ where: daPessoa(a) })) },

  // Referências sem chave estrangeira.
  { modelo: "Document", acao: "apagar", executar: (tx, a) => n(tx.document.deleteMany({ where: daEntidade(a) })) },
  { modelo: "Handoff", acao: "apagar", executar: (tx, a) => n(tx.handoff.deleteMany({ where: daEntidade(a) })) },
  { modelo: "Notification", acao: "apagar", executar: (tx, a) => n(tx.notification.deleteMany({ where: daEntidade(a) })) },
  {
    modelo: "CustomValue",
    acao: "apagar",
    executar: (tx, a) => n(tx.customValue.deleteMany({ where: { tenantId: a.tenantId, entityId: { in: a.ids } } })),
  },
  // O resumo do currículo que a IA escreveu na ficha do candidato (14/10/2026).
  // Sem a tabela (deploy antes da migration), não há o que apagar, e a exclusão
  // segue.
  {
    modelo: "CandidateResumeSummary",
    acao: "apagar",
    executar: async (tx, a) => {
      try {
        return await n(tx.candidateResumeSummary.deleteMany({ where: { tenantId: a.tenantId, personId: { in: a.ids } } }));
      } catch (err) {
        if (isPrismaMissingTableError(err)) return 0;
        throw err;
      }
    },
  },
  // A tarefa do Kanban fica, sem a pessoa.
  {
    modelo: "PipelineItem",
    acao: "anular",
    coluna: "entityId",
    executar: (tx, a) =>
      n(
        tx.pipelineItem.updateMany({
          where: { tenantId: a.tenantId, entityType: "PERSON", entityId: { in: a.ids } },
          data: { entityType: null, entityId: null },
        })
      ),
  },

  // Etiquetas, links de admissão e de teste e dependentes vão junto (cascata).
  { modelo: "Person", acao: "apagar", executar: (tx, a) => n(tx.person.deleteMany({ where: { tenantId: a.tenantId, id: { in: a.ids } } })) },
];

/** Os arquivos das pessoas — documentos da ficha e currículos. Rodar antes de apagar. */
export async function arquivosDasPessoas(tx: Tx, a: AlvoPessoas): Promise<ArquivosDoCadastro> {
  const arquivos = semArquivos();
  if (a.ids.length === 0) return arquivos;
  const [documentos, candidaturas] = await juntos(tx, [
    () => tx.document.findMany({ where: daEntidade(a), select: { fileUrl: true } }),
    () => tx.candidatura.findMany({ where: daPessoa(a), select: { resumeUrl: true } }),
  ]);
  anotar(arquivos, "documents", documentos.map((d) => d.fileUrl));
  arquivos.curriculos.push(...candidaturas.map((c) => c.resumeUrl).filter((u): u is string => !!u));
  return arquivos;
}

/** O que está ligado às pessoas, já em itens da prévia. */
export async function itensDasPessoas(db: Tx, tenantId: string, ids: string[]): Promise<ItemDaPrevia[]> {
  if (ids.length === 0) return [];
  const a = { tenantId, ids };
  const [contagens, documentos, transferencias, tarefas, conversas] = await juntos(db, [
    () => contarLigacoes(db, LIGACOES.Person, { in: ids }),
    () => db.document.count({ where: daEntidade(a) }),
    () => db.handoff.count({ where: daEntidade(a) }),
    () => db.pipelineItem.count({ where: { tenantId, entityType: "PERSON", entityId: { in: ids } } }),
    () => db.whatsappThread.count({ where: { tenantId, OR: [{ personId: { in: ids } }, { linkPendingPersonId: { in: ids } }] } }),
  ]);
  return [
    ...itensDasContagens(contagens),
    ...compactar([
      item("Document.entityId", documentos, ["documento da ficha", "documentos da ficha"], "apagar", true),
      item("Handoff.entityId", transferencias, ["transferência entre setores", "transferências entre setores"], "apagar", true),
      item("PipelineItem.entityId", tarefas, ["atividade dos Quadros (fica, sem a pessoa)", "atividades dos Quadros (ficam, sem a pessoa)"], "desligar"),
      item("WhatsappThread.personId", conversas, ["conversa do WhatsApp (fica, sem a pessoa)", "conversas do WhatsApp (ficam, sem a pessoa)"], "desligar"),
    ]),
  ];
}

type PessoaDaPrevia = {
  id: string;
  name: string;
  cpf: string | null;
  email: string | null;
  type: "CANDIDATO" | "COLABORADOR";
  isInternal: boolean;
  linkedUserId: string | null;
  dataDeletionRequestedAt: Date | null;
};

const SELECAO = {
  id: true,
  name: true,
  cpf: true,
  email: true,
  type: true,
  isInternal: true,
  linkedUserId: true,
  dataDeletionRequestedAt: true,
} as const;

/** Para onde a tela volta depois — a lista de onde a pessoa veio. */
export function listaDaPessoa(p: Pick<PessoaDaPrevia, "type" | "isInternal">): string {
  if (p.type === "CANDIDATO") return "/candidatos";
  return p.isInternal ? "/pessoas" : "/colaboradores-clientes";
}

async function previaDe(db: Tx, tenantId: string, p: PessoaDaPrevia): Promise<Previa> {
  const itens = await itensDasPessoas(db, tenantId, [p.id]);
  const avisos: string[] = [];
  if (p.linkedUserId) {
    const conta = await db.user.findFirst({ where: { id: p.linkedUserId, tenantId }, select: { name: true, email: true } });
    if (conta) {
      avisos.push(
        `A conta de acesso de ${conta.name} (${conta.email}) continua: só deixa de estar ligada a esta ficha. Para tirar o acesso, exclua ou inative o usuário em Configurações › Usuários.`
      );
    }
  }
  if (p.dataDeletionRequestedAt) {
    avisos.push(`Esta pessoa pediu a exclusão dos dados pelo portal de vagas em ${formatCalendarDate(p.dataDeletionRequestedAt)}.`);
  }
  return {
    tipo: "pessoa",
    id: p.id,
    nome: p.name,
    detalhe: p.cpf ? `CPF ${maskCpf(p.cpf)}` : p.email,
    itens,
    temHistorico: itens.some((i) => i.historico),
    bloqueio: null,
    avisos,
    opcao: null,
    rotuloDoModoCompleto: "Excluir com tudo o que está ligado",
  };
}

export async function previaDaPessoa(db: Tx, tenantId: string, id: string): Promise<Previa | null> {
  const p = await db.person.findFirst({ where: { id, tenantId }, select: SELECAO });
  return p ? previaDe(db, tenantId, p) : null;
}

export type PedidoDaPessoa = {
  tenantId: string;
  ator: { id: string; role: string };
  id: string;
  modo: ModoDaExclusao;
  confirmacao?: string;
};

/**
 * Exclui a pessoa. Confere tudo de novo dentro da transação — papel, tenant,
 * histórico e o nome digitado —, apaga na ordem do plano, grava o registro e,
 * depois do commit, tira os arquivos do disco.
 */
export async function excluirPessoaDeVez(prisma: PrismaClient, pedido: PedidoDaPessoa): Promise<ResultadoDaExclusao> {
  if (!pedido.tenantId || !papelExclui(pedido.ator.role)) return { ok: false, erro: SO_ADMIN_EXCLUI };

  let arquivos: ArquivosDoCadastro = semArquivos();
  let saida: { nome: string; resumo: string[]; destino: string };
  try {
    saida = await prisma.$transaction(async (tx) => {
      const p = await tx.person.findFirst({ where: { id: pedido.id, tenantId: pedido.tenantId }, select: SELECAO });
      if (!p) throw new Recusa("Pessoa não encontrada.");
      const previa = await previaDe(tx, pedido.tenantId, p);
      validarModo(previa, pedido.modo, pedido.confirmacao);

      const alvo = { tenantId: pedido.tenantId, ids: [p.id] };
      arquivos = await arquivosDasPessoas(tx, alvo);
      const mexido = await executarPlano(tx, PLANO_DA_PESSOA, alvo);
      const resumo = previa.itens.filter((i) => i.efeito !== "desligar").map((i) => i.texto);

      await registrarExclusao(tx, {
        tenantId: pedido.tenantId,
        ator: { id: pedido.ator.id, nome: await nomeDoAtor(tx, pedido.ator.id) },
        acao: "person.delete",
        entityType: "Person",
        entityId: p.id,
        metadata: {
          nome: p.name,
          cpf: p.cpf,
          email: p.email,
          tipo: p.isInternal ? "equipe" : p.type === "CANDIDATO" ? "candidato" : "funcionário de cliente",
          modo: pedido.modo,
          removido: resumo.join(" · ") || "nada ligado",
          arquivos: totalDeArquivos(arquivos),
          contagens: mexido,
        },
      });
      return { nome: p.name, resumo, destino: listaDaPessoa(p) };
    }, OPCOES_DA_TRANSACAO);
  } catch (err) {
    return { ok: false, erro: mensagemDeErro(err, "pessoa") };
  }

  arquivos.curriculos = await curriculosSemUso(prisma, arquivos.curriculos);
  const arquivosNaoApagados = await apagarArquivos(arquivos);
  return { ok: true, ...saida, arquivosNaoApagados };
}
