import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite, canActOnSector, podeExcluir } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { scopedAssessmentLinkWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Selo } from "@/components/ui/Selo";
import { LinkDoTeste } from "@/components/teste/LinkDoTeste";
import { ResultadoDisc } from "@/components/teste/ResultadoDisc";
import { ResultadoQuestionario } from "@/components/teste/ResultadoQuestionario";
import { formatInstantDate } from "@/lib/format";
import { prazoDoLink } from "@/lib/testes/linkDoTeste";
import { perguntasRespondidas } from "@/lib/testes/questionario";
import { letrasPorForca } from "@/lib/testes/discExplicado";
import type { DiscScores, DiscDimension } from "@/lib/disc";
import type { QuizScores } from "@/lib/quiz";

// A chave do dado e o padrão do gate, como em `testes/actions.ts`; o acesso
// segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "recrutamento";
const MODULE = "recrutamento_testes";

/** "13/10" — dia e mês, no fuso do escritório. */
function diaEMes(d: Date): string {
  return formatInstantDate(d, { day: "2-digit", month: "2-digit" });
}

/**
 * A página de um teste enviado (Testes › nome do candidato), refeita em
 * 14/10/2026 com as escolhas do Kauan para os três momentos do teste:
 * - **aguardando** (1A): o link com Copiar, Abrir e WhatsApp, "Gerar novo
 *   link", os passos e o prazo — `LinkDoTeste`;
 * - **DISC respondido** (2, A + B): barras, teia e o perfil explicado —
 *   `ResultadoDisc`;
 * - **questionário respondido** (3A): a nota e a lista de perguntas, com o
 *   filtro das erradas — `ResultadoQuestionario`.
 */
export default async function TesteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  // Vaga e teste são do setor que contrata (o escopo já filtra); aqui só o
  // módulo ligado, que antes não era checado e deixava a tela abrir desligada.
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const prisma = getPrisma();
  const link = await prisma.assessmentLink.findFirst({
    where: { id, ...scopedAssessmentLinkWhere(ctx) },
    include: {
      person: { select: { id: true, name: true, phone: true } },
      candidatura: { select: { id: true, vaga: { select: { id: true, title: true } } } },
      template: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!link) notFound();

  const respondido = link.status === "RESPONDIDO";
  const agora = new Date();
  const prazo = prazoDoLink({ criadoEm: link.createdAt, expiraEm: link.expiresAt, agora });
  const nomeDoTeste = link.type === "DISC" ? "DISC" : (link.template?.name ?? "Modelo excluído");
  const respondidoEm = link.submittedAt ? formatInstantDate(link.submittedAt) : null;

  // As perguntas do modelo, para o texto de cada uma — só no questionário respondido.
  const perguntasDoModelo =
    respondido && link.type === "MULTIPLA_ESCOLHA" && link.templateId
      ? await prisma.assessmentTemplateQuestion.findMany({
          where: { templateId: link.templateId, tenantId: link.tenantId },
          select: { id: true, order: true, text: true, options: true },
        })
      : [];

  // O resultado como o envio gravou (`scoreDisc` / `scoreQuiz`).
  const disc = link.scores as unknown as DiscScores;
  const quiz = link.scores as unknown as QuizScores | null;

  // "Gerar novo link": a mesma regra da action (`gerarLinkTeste`).
  const setores = (await setoresDoModulo(ctx.tenantId, MODULE)) ?? [SECTOR];
  const podeGerar = canWrite(ctx.role) && canActOnSector(ctx, setores);

  const situacao = respondido ? (
    <Selo tom="sucesso">Respondido</Selo>
  ) : prazo.vencido ? (
    <Selo tom="perigo">Link vencido</Selo>
  ) : (
    <Selo tom="atencao">Aguardando resposta</Selo>
  );

  return (
    <PageContainer>
      {/* Só a trilha, sem o "← Voltar" (P04, 15/10/2026): a tela tem pai fixo, e
          trilha e "Voltar" juntos diziam a mesma coisa duas vezes. */}
      <Breadcrumb items={[{ label: "Testes", href: "/testes" }, { label: link.person.name, truncate: true }]} />

      <PageHeader
        title={
          <Link href={`/candidatos/${link.person.id}`} className="hover:text-brand transition-colors">
            {link.person.name}
          </Link>
        }
        subtitle={
          <>
            Teste {nomeDoTeste}
            {link.candidatura && (
              <>
                {" · "}
                <Link
                  href={`/vagas/${link.candidatura.vaga.id}/candidaturas/${link.candidatura.id}`}
                  className="text-brand hover:underline"
                >
                  {link.candidatura.vaga.title}
                </Link>
              </>
            )}
          </>
        }
        meta={situacao}
      />

      {!respondido ? (
        <LinkDoTeste
          linkId={link.id}
          urlPublica={(process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "")}
          token={link.token}
          nome={link.person.name}
          telefone={link.person.phone}
          vaga={link.candidatura?.vaga.title ?? null}
          enviadoEm={diaEMes(link.createdAt)}
          enviadoPor={link.createdBy?.name ?? null}
          validoAte={diaEMes(link.expiresAt)}
          prazo={prazo}
          podeGerar={podeGerar}
          novoLink={{ personId: link.personId, candidaturaId: link.candidaturaId, type: link.type, templateId: link.templateId }}
          podeExcluir={canWrite(ctx.role) && podeExcluir(ctx)}
        />
      ) : link.type === "DISC" ? (
        <ResultadoDisc
          scores={disc}
          principal={(link.primaryProfile as DiscDimension | null) ?? letrasPorForca(disc)[0]}
          segunda={(link.secondaryProfile as DiscDimension | null) ?? null}
          respondidoEm={respondidoEm}
        />
      ) : (
        <ResultadoQuestionario
          acertos={quiz?.correct ?? 0}
          total={quiz?.total ?? 0}
          pct={quiz?.pct ?? 0}
          perguntas={perguntasRespondidas(quiz, perguntasDoModelo)}
          respondidoEm={respondidoEm}
        />
      )}
    </PageContainer>
  );
}
