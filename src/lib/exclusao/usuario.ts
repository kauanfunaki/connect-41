// Exclusão de usuário (conta de acesso da equipe).
//
// Diferente da empresa e da pessoa, aqui nada do trabalho é apagado: um
// usuário de teste pode ter anexado documento, comentado card e lançado hora
// em cliente de verdade. O que ele criou passa para o administrador que está
// excluindo (decisão do Kauan, 13/10/2026) — a prévia diz quanto, por tipo —,
// a trilha de auditoria fica com o nome dele (migration 20261013200000), e só
// o que é da própria conta sai: sessões, preferências, notificações, setores.
//
// Travas: ninguém exclui a si mesmo; o último administrador ativo do
// escritório não sai; Super Admin só sai pelas mãos de outro Super Admin; e
// conta com acesso a outros escritórios só sai pela 41 Tech (o que ela fez lá
// fora não passa pelo filtro deste escritório).

import type { PrismaClient } from "@/generated/prisma/client";
import { ROLE_LABELS } from "@/lib/roles";
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
  somaSemRotulo,
  validarModo,
  type Passo,
  type Tx,
} from "./comum";
import { SO_ADMIN_EXCLUI } from "@/lib/auth/papeis";
import { apagarArquivos, curriculosSemUso, juntarArquivos, semArquivos, totalDeArquivos, type ArquivosDoCadastro } from "./arquivos";
import { PLANO_DA_PESSOA, arquivosDasPessoas, itensDasPessoas } from "./pessoa";
import { LIGACOES } from "./registro";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import type { ModoDaExclusao, Previa, ResultadoDaExclusao } from "./tipos";

/** `id`: quem sai. `para`: o administrador que exclui e herda o que foi criado. */
export type AlvoUsuario = { tenantId: string; id: string; para: string };

type Ator = { id: string; role: string };

function reatribuir(modelo: string, coluna: string, executar: Passo<AlvoUsuario>["executar"]): Passo<AlvoUsuario> {
  return { modelo, acao: "reatribuir", coluna, executar };
}

export const PLANO_DO_USUARIO: readonly Passo<AlvoUsuario>[] = [
  { modelo: "GithubConnection", acao: "anular", coluna: "connectedBy", executar: (tx, a) => n(tx.githubConnection.updateMany({ where: { tenantId: a.tenantId, connectedBy: a.id }, data: { connectedBy: null } })) },
  { modelo: "GithubOAuthAttempt", acao: "apagar", executar: (tx, a) => n(tx.githubOAuthAttempt.deleteMany({ where: { tenantId: a.tenantId, userId: a.id } })) },
  { modelo: "UserTaskView", acao: "apagar", executar: (tx, a) => n(tx.userTaskView.deleteMany({ where: { tenantId: a.tenantId, userId: a.id } })) },
  // Quem pediu ao robô (30/10/2026): a tarefa fica, sem a pessoa.
  { modelo: "RobotTask", acao: "anular", coluna: "requestedById", executar: (tx, a) => n(tx.robotTask.updateMany({ where: { tenantId: a.tenantId, requestedById: a.id }, data: { requestedById: null } })) },
  reatribuir("HelpdeskDraft", "createdById", (tx, a) => n(tx.helpdeskDraft.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))),
  reatribuir("HelpdeskTicket", "createdById", (tx, a) => n(tx.helpdeskTicket.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))),
  reatribuir("HelpdeskAttachment", "uploadedById", (tx, a) => n(tx.helpdeskAttachment.updateMany({ where: { tenantId: a.tenantId, uploadedById: a.id }, data: { uploadedById: a.para } }))),
  reatribuir("HelpdeskComment", "authorId", (tx, a) => n(tx.helpdeskComment.updateMany({ where: { tenantId: a.tenantId, authorId: a.id }, data: { authorId: a.para } }))),
  { modelo: "HelpdeskAssignee", acao: "apagar", executar: (tx, a) => n(tx.helpdeskAssignee.deleteMany({ where: { tenantId: a.tenantId, userId: a.id } })) },
  { modelo: "HelpdeskParticipant", acao: "apagar", executar: (tx, a) => n(tx.helpdeskParticipant.deleteMany({ where: { tenantId: a.tenantId, userId: a.id } })) },
  // Avaliação de entrevista é uma por avaliador e candidatura: onde quem
  // exclui já avaliou a mesma candidatura, a do usuário excluído sai em vez de
  // passar (passaria a ser uma duplicata).
  {
    modelo: "InterviewScorecard",
    acao: "apagar",
    executar: async (tx, a) => {
      const jaAvaliadas = (
        await tx.interviewScorecard.findMany({ where: { tenantId: a.tenantId, evaluatorUserId: a.para }, select: { candidaturaId: true } })
      ).map((s) => s.candidaturaId);
      if (jaAvaliadas.length === 0) return 0;
      return n(
        tx.interviewScorecard.deleteMany({
          where: { tenantId: a.tenantId, evaluatorUserId: a.id, candidaturaId: { in: jaAvaliadas } },
        })
      );
    },
  },

  // O que ele criou passa para quem exclui.
  reatribuir("Activity", "userId", (tx, a) =>
    n(tx.activity.updateMany({ where: { tenantId: a.tenantId, userId: a.id }, data: { userId: a.para } }))
  ),
  reatribuir("TimeEntry", "userId", (tx, a) =>
    n(tx.timeEntry.updateMany({ where: { tenantId: a.tenantId, userId: a.id }, data: { userId: a.para } }))
  ),
  reatribuir("Document", "uploadedById", (tx, a) =>
    n(tx.document.updateMany({ where: { tenantId: a.tenantId, uploadedById: a.id }, data: { uploadedById: a.para } }))
  ),
  reatribuir("ClientDocument", "createdById", (tx, a) =>
    n(tx.clientDocument.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))
  ),
  reatribuir("Handoff", "requestedBy", (tx, a) =>
    n(tx.handoff.updateMany({ where: { tenantId: a.tenantId, requestedBy: a.id }, data: { requestedBy: a.para } }))
  ),
  reatribuir("Meeting", "createdByUserId", (tx, a) =>
    n(tx.meeting.updateMany({ where: { tenantId: a.tenantId, createdByUserId: a.id }, data: { createdByUserId: a.para } }))
  ),
  reatribuir("Evaluation", "evaluatorUserId", (tx, a) =>
    n(tx.evaluation.updateMany({ where: { tenantId: a.tenantId, evaluatorUserId: a.id }, data: { evaluatorUserId: a.para } }))
  ),
  reatribuir("InterviewScorecard", "evaluatorUserId", (tx, a) =>
    n(tx.interviewScorecard.updateMany({ where: { tenantId: a.tenantId, evaluatorUserId: a.id }, data: { evaluatorUserId: a.para } }))
  ),
  reatribuir("AdmissaoLink", "createdById", (tx, a) =>
    n(tx.admissaoLink.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))
  ),
  reatribuir("AssessmentLink", "createdById", (tx, a) =>
    n(tx.assessmentLink.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))
  ),
  reatribuir("AssessmentTemplate", "createdById", (tx, a) =>
    n(tx.assessmentTemplate.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))
  ),
  reatribuir("Budget", "createdById", (tx, a) =>
    n(tx.budget.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))
  ),
  reatribuir("ManualDocument", "createdById", (tx, a) =>
    n(tx.manualDocument.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))
  ),
  reatribuir("ManualPage", "createdById", (tx, a) =>
    n(tx.manualPage.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))
  ),
  reatribuir("BpoCredential", "createdById", (tx, a) =>
    n(tx.bpoCredential.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))
  ),
  reatribuir("ValoraProposta", "createdById", (tx, a) =>
    n(tx.valoraProposta.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))
  ),

  // Autor guardado sem chave estrangeira — passa também.
  reatribuir("CandidaturaNota", "createdById", (tx, a) =>
    n(tx.candidaturaNota.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))
  ),
  reatribuir("VagaRequisitos", "createdById", (tx, a) =>
    n(tx.vagaRequisitos.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))
  ),
  reatribuir("DriveFolder", "createdById", (tx, a) =>
    n(tx.driveFolder.updateMany({ where: { tenantId: a.tenantId, createdById: a.id }, data: { createdById: a.para } }))
  ),
  reatribuir("OmieEmissao", "pedidoPorId", (tx, a) =>
    n(tx.omieEmissao.updateMany({ where: { tenantId: a.tenantId, pedidoPorId: a.id }, data: { pedidoPorId: a.para } }))
  ),
  reatribuir("OmieEmissao", "canceladaPorId", (tx, a) =>
    n(tx.omieEmissao.updateMany({ where: { tenantId: a.tenantId, canceladaPorId: a.id }, data: { canceladaPorId: a.para } }))
  ),
  reatribuir("DreImport", "importedById", (tx, a) =>
    n(tx.dreImport.updateMany({ where: { tenantId: a.tenantId, importedById: a.id }, data: { importedById: a.para } }))
  ),

  // Responsável e cronômetro ligado ficam vazios.
  {
    modelo: "Company",
    acao: "anular",
    coluna: "responsibleUserId",
    executar: (tx, a) => n(tx.company.updateMany({ where: { tenantId: a.tenantId, responsibleUserId: a.id }, data: { responsibleUserId: null } })),
  },
  // Quem pediu a situação fiscal (Serpro, 20/10/2026): o pedido fica, sem a pessoa para avisar.
  {
    modelo: "SerproPedido",
    acao: "anular",
    coluna: "pedidoPorId",
    executar: (tx, a) => n(tx.serproPedido.updateMany({ where: { tenantId: a.tenantId, pedidoPorId: a.id }, data: { pedidoPorId: null } })),
  },
  // Quem enviou o termo de autorização do Serpro (27/10/2026): o termo fica, e a auditoria guarda quem foi.
  {
    modelo: "SerproTermo",
    acao: "anular",
    coluna: "enviadoPorId",
    executar: (tx, a) => n(tx.serproTermo.updateMany({ where: { tenantId: a.tenantId, enviadoPorId: a.id }, data: { enviadoPorId: null } })),
  },
  {
    modelo: "Vaga",
    acao: "anular",
    coluna: "responsibleUserId",
    executar: (tx, a) => n(tx.vaga.updateMany({ where: { tenantId: a.tenantId, responsibleUserId: a.id }, data: { responsibleUserId: null } })),
  },
  {
    modelo: "PipelineItem",
    acao: "anular",
    coluna: "activeTimerUserId",
    executar: (tx, a) =>
      n(
        tx.pipelineItem.updateMany({
          where: { tenantId: a.tenantId, activeTimerUserId: a.id },
          data: { activeTimerUserId: null, activeTimerStartedAt: null },
        })
      ),
  },
  {
    modelo: "Process",
    acao: "anular",
    coluna: "activeTimerUserId",
    executar: (tx, a) =>
      n(
        tx.process.updateMany({
          where: { tenantId: a.tenantId, activeTimerUserId: a.id },
          data: { activeTimerUserId: null, activeTimerStartedAt: null },
        })
      ),
  },

  // Quem viu senha do cofre: a lista vai para o registro da exclusão (ver
  // `excluirUsuarioDeVez`) e as linhas saem.
  {
    modelo: "BpoCredentialView",
    acao: "apagar",
    executar: (tx, a) => n(tx.bpoCredentialView.deleteMany({ where: { tenantId: a.tenantId, userId: a.id } })),
  },
  // Sessões e pedidos de troca de senha da conta.
  { modelo: "RefreshToken", acao: "apagar", executar: (tx, a) => n(tx.refreshToken.deleteMany({ where: { userId: a.id } })) },
  {
    modelo: "PasswordResetToken",
    acao: "apagar",
    executar: (tx, a) => n(tx.passwordResetToken.deleteMany({ where: { userId: a.id, subject: "USER" } })),
  },
  // A "última empresa aberta" da conta.
  { modelo: "UserLastCompany", acao: "apagar", executar: (tx, a) => n(tx.userLastCompany.deleteMany({ where: { userId: a.id } })) },
  // O tutorial do primeiro acesso que a conta já viu (13/10/2026) — só as
  // linhas da equipe: a mesma coluna guarda ids de acessos do portal. Sem a
  // tabela (deploy antes da migration), não há o que apagar, e a exclusão segue.
  {
    modelo: "TutorialVisto",
    acao: "apagar",
    executar: async (tx, a) => {
      try {
        return await n(tx.tutorialVisto.deleteMany({ where: { subject: "USER", userId: a.id } }));
      } catch (err) {
        if (isPrismaMissingTableError(err)) return 0;
        throw err;
      }
    },
  },

  // Setores, preferências, notificações, conversas com a Ceci, atribuições e
  // acessos vão em cascata; a auditoria e os autores opcionais ficam, sem o
  // vínculo.
  { modelo: "User", acao: "apagar", executar: (tx, a) => n(tx.user.deleteMany({ where: { tenantId: a.tenantId, id: a.id } })) },
];

type UsuarioDaPrevia = { id: string; name: string; email: string; role: string; photoUrl: string | null };

const SELECAO = { id: true, name: true, email: true, role: true, photoUrl: true } as const;

/** A trava que impede a exclusão, ou null. */
async function trava(db: Tx, tenantId: string, u: UsuarioDaPrevia, ator: Ator): Promise<string | null> {
  if (u.id === ator.id) return "Você não pode excluir a própria conta.";
  if (u.role === "SUPER_ADMIN" && ator.role !== "SUPER_ADMIN") return "Só um Super Admin pode excluir outro Super Admin.";
  if (u.role === "ADMIN" || u.role === "SUPER_ADMIN") {
    const outros = await db.user.count({
      where: { tenantId, id: { not: u.id }, active: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    });
    if (outros === 0) {
      return "Esta é a última conta de administrador ativa do escritório. Dê o papel de administrador a outra pessoa antes de excluí-la.";
    }
  }
  const acessos = await db.userTenantAccess.count({ where: { userId: u.id } });
  if (acessos > 0) {
    return "Esta conta tem acesso a outros escritórios do Connect, e o que ela fez lá não aparece daqui. Para excluí-la, fale com a 41 Tech.";
  }
  return null;
}

async function fichaLigada(db: Tx, tenantId: string, id: string) {
  return db.person.findFirst({ where: { tenantId, linkedUserId: id }, select: { id: true, name: true } });
}

async function previaDe(db: Tx, tenantId: string, u: UsuarioDaPrevia, ator: Ator): Promise<Previa> {
  const [contagens, notas, requisitos, pastas, pedidosOmie, cancelamentosOmie, importacoesDre, empresas, vagas, cronometros, ficha, bloqueio, nomeDeQuemExclui] =
    await juntos(db, [
      () => contarLigacoes(db, LIGACOES.User, u.id),
      () => db.candidaturaNota.count({ where: { tenantId, createdById: u.id } }),
      () => db.vagaRequisitos.count({ where: { tenantId, createdById: u.id } }),
      () => db.driveFolder.count({ where: { tenantId, createdById: u.id } }),
      () => db.omieEmissao.count({ where: { tenantId, pedidoPorId: u.id } }),
      () => db.omieEmissao.count({ where: { tenantId, canceladaPorId: u.id } }),
      () => db.dreImport.count({ where: { tenantId, importedById: u.id } }),
      () => db.company.count({ where: { tenantId, responsibleUserId: u.id } }),
      () => db.vaga.count({ where: { tenantId, responsibleUserId: u.id } }),
      async () =>
        (await db.pipelineItem.count({ where: { tenantId, activeTimerUserId: u.id } })) +
        (await db.process.count({ where: { tenantId, activeTimerUserId: u.id } })),
      () => fichaLigada(db, tenantId, u.id),
      () => trava(db, tenantId, u, ator),
      () => nomeDoAtor(db, ator.id),
  ]);

  const semAutor = somaSemRotulo(contagens, "desligar");
  const itens = [
    ...itensDasContagens(contagens),
    ...compactar([
      item("CandidaturaNota.createdById", notas, ["nota em candidatura", "notas em candidaturas"], "reatribuir", true),
      item("VagaRequisitos.createdById", requisitos, ["versão de requisitos de vaga", "versões de requisitos de vaga"], "reatribuir", true),
      item("DriveFolder.createdById", pastas, ["pasta criada em Arquivos", "pastas criadas em Arquivos"], "reatribuir", true),
      item("OmieEmissao.pedidoPorId", pedidosOmie, ["nota pedida ao Omie", "notas pedidas ao Omie"], "reatribuir", true),
      item("OmieEmissao.canceladaPorId", cancelamentosOmie, ["cancelamento de nota no Omie", "cancelamentos de nota no Omie"], "reatribuir", true),
      item("DreImport.importedById", importacoesDre, ["importação da DRE", "importações da DRE"], "reatribuir", true),
      item("Company.responsibleUserId", empresas, ["empresa em que ele é o responsável (fica sem responsável)", "empresas em que ele é o responsável (ficam sem responsável)"], "desligar"),
      item("Vaga.responsibleUserId", vagas, ["vaga sob responsabilidade dele (fica sem responsável)", "vagas sob responsabilidade dele (ficam sem responsável)"], "desligar"),
      item("activeTimerUserId", cronometros, ["cronômetro ligado (é desligado)", "cronômetros ligados (são desligados)"], "desligar"),
      item("autoria", semAutor, ["outro registro fica sem o nome dele como autor", "outros registros ficam sem o nome dele como autor"], "desligar"),
    ]),
  ];

  const avisos: string[] = [];
  if (itens.some((i) => i.efeito === "reatribuir")) {
    avisos.push(
      `O que ${u.name} criou passa a aparecer como seu${nomeDeQuemExclui ? ` (${nomeDeQuemExclui})` : ""}. A auditoria continua mostrando o nome dele nas ações que ele fez.`
    );
  }
  avisos.push("As sessões abertas desta conta são encerradas na hora.");

  let opcao: Previa["opcao"] = null;
  if (ficha) {
    const itensDaFicha = await itensDasPessoas(db, tenantId, [ficha.id]);
    opcao = {
      rotulo: `Excluir também a ficha de ${ficha.name} em Pessoas`,
      ajuda: "Sem marcar, a ficha continua em Pessoas, sem conta de acesso ligada.",
      trazHistorico: itensDaFicha.some((i) => i.historico),
      itens: itensDaFicha,
    };
  }

  return {
    tipo: "usuario",
    id: u.id,
    nome: u.name,
    detalhe: `${u.email} · ${ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}`,
    itens,
    temHistorico: itens.some((i) => i.historico),
    bloqueio,
    avisos,
    opcao,
    rotuloDoModoCompleto: "Excluir e passar os registros para mim",
  };
}

export async function previaDoUsuario(db: Tx, tenantId: string, id: string, ator: Ator): Promise<Previa | null> {
  const u = await db.user.findFirst({ where: { id, tenantId }, select: SELECAO });
  return u ? previaDe(db, tenantId, u, ator) : null;
}

export type PedidoDoUsuario = {
  tenantId: string;
  ator: Ator;
  id: string;
  modo: ModoDaExclusao;
  confirmacao?: string;
  incluirFicha?: boolean;
};

export async function excluirUsuarioDeVez(prisma: PrismaClient, pedido: PedidoDoUsuario): Promise<ResultadoDaExclusao> {
  if (!pedido.tenantId || !papelExclui(pedido.ator.role)) return { ok: false, erro: SO_ADMIN_EXCLUI };

  let arquivos: ArquivosDoCadastro = semArquivos();
  let saida: { nome: string; resumo: string[] };
  try {
    saida = await prisma.$transaction(async (tx) => {
      const u = await tx.user.findFirst({ where: { id: pedido.id, tenantId: pedido.tenantId }, select: SELECAO });
      if (!u) throw new Recusa("Usuário não encontrado.");
      const previa = await previaDe(tx, pedido.tenantId, u, pedido.ator);
      const comFicha = !!pedido.incluirFicha && !!previa.opcao;
      validarModo(previa, pedido.modo, pedido.confirmacao, comFicha && !!previa.opcao?.trazHistorico);

      if (u.photoUrl) arquivos.publicos.push({ pasta: "avatars", url: u.photoUrl });
      let mexidoNaFicha: Record<string, number> = {};
      let ficha: { id: string; name: string } | null = null;
      if (comFicha) {
        ficha = await fichaLigada(tx, pedido.tenantId, u.id);
        if (ficha) {
          const daFicha = { tenantId: pedido.tenantId, ids: [ficha.id] };
          arquivos = juntarArquivos(arquivos, await arquivosDasPessoas(tx, daFicha));
          mexidoNaFicha = await executarPlano(tx, PLANO_DA_PESSOA, daFicha);
        }
      }

      // Quem viu qual senha do cofre, e quando — as linhas saem, a lista fica.
      const senhasVistas = await tx.bpoCredentialView.findMany({
        where: { tenantId: pedido.tenantId, userId: u.id },
        orderBy: { viewedAt: "asc" },
        select: { viewedAt: true, credential: { select: { title: true, company: { select: { name: true } } } } },
      });

      const mexido = await executarPlano(tx, PLANO_DO_USUARIO, { tenantId: pedido.tenantId, id: u.id, para: pedido.ator.id });

      const passaram = previa.itens.filter((i) => i.efeito === "reatribuir").map((i) => i.texto);
      const resumo = [
        ...(passaram.length > 0 ? [`passaram para você: ${passaram.join(", ")}`] : []),
        ...previa.itens.filter((i) => i.efeito === "apagar").map((i) => i.texto),
        ...(ficha ? [`a ficha de ${ficha.name} em Pessoas`] : []),
      ];
      await registrarExclusao(tx, {
        tenantId: pedido.tenantId,
        ator: { id: pedido.ator.id, nome: await nomeDoAtor(tx, pedido.ator.id) },
        acao: "user.delete",
        entityType: "User",
        entityId: u.id,
        metadata: {
          nome: u.name,
          email: u.email,
          papel: u.role,
          modo: pedido.modo,
          removido: resumo.join(" · ") || "nada ligado",
          arquivos: totalDeArquivos(arquivos),
          contagens: mexido,
          ...(senhasVistas.length > 0
            ? {
                senhasVistas: senhasVistas.map((v) => ({
                  em: v.viewedAt.toISOString(),
                  senha: v.credential.title,
                  empresa: v.credential.company?.name ?? null,
                })),
              }
            : {}),
          ...(ficha ? { ficha: { id: ficha.id, nome: ficha.name, contagens: mexidoNaFicha } } : {}),
        },
      });
      return { nome: u.name, resumo };
    }, OPCOES_DA_TRANSACAO);
  } catch (err) {
    return { ok: false, erro: mensagemDeErro(err, "usuario") };
  }

  arquivos.curriculos = await curriculosSemUso(prisma, arquivos.curriculos);
  const arquivosNaoApagados = await apagarArquivos(arquivos);
  return { ok: true, ...saida, arquivosNaoApagados, destino: "/admin/usuarios" };
}
