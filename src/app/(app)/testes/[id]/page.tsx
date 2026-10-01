import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedAssessmentLinkWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { ExcluirComConfirmacao } from "@/components/vagas/ExcluirComConfirmacao";
import { AssessmentResult } from "@/components/teste/AssessmentResult";
import { formatInstantDate } from "@/lib/format";
import { excluirLinkTeste } from "../actions";
import type { DiscScores, DiscDimension } from "@/lib/disc";
import type { QuizScores } from "@/lib/quiz";

export default async function TesteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const link = await prisma.assessmentLink.findFirst({
    where: { id, ...scopedAssessmentLinkWhere(ctx) },
    include: {
      person: { select: { id: true, name: true } },
      candidatura: { select: { id: true, vaga: { select: { id: true, title: true } } } },
      template: { select: { name: true } },
    },
  });
  if (!link) notFound();

  const canManage = canWrite(ctx.role);
  const baseUrl = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const linkUrl = link.status === "PENDENTE" ? `${baseUrl}/teste/${link.token}` : null;

  return (
    <PageContainer>
      {/* Trilha antes do "Voltar", como na candidatura e no resto do app —
          aqui era o contrário. */}
      <Breadcrumb items={[{ label: "Testes", href: "/testes" }, { label: link.person.name, truncate: true }]} />
      <BackButton className="mb-3" />

      <PageHeader
        title={<><Link href={`/candidatos/${link.person.id}`} className="hover:text-brand transition-colors">
            {link.person.name}
          </Link></>}
        subtitle={<>Teste {link.type === "DISC" ? "DISC" : link.template?.name}
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
          )}</>}
      />

      <Card className="p-5">
        {link.status === "PENDENTE" ? (
          <>
            <p className="text-[13px] text-fg-muted mb-3">
              Aguardando resposta do candidato. Link expira em {formatInstantDate(link.expiresAt)}.
            </p>
            {linkUrl && <p className="text-[12px] text-fg-muted break-all mb-4">{linkUrl}</p>}
            {canManage && (
              <ExcluirComConfirmacao
                action={excluirLinkTeste.bind(null, link.id)}
                titulo="Excluir este teste?"
                descricao="O link enviado ao candidato deixa de funcionar. Esta ação não pode ser desfeita."
                size="sm"
              />
            )}
          </>
        ) : (
          <>
            <p className="text-[12px] text-fg-muted mb-4">
              Respondido em {link.submittedAt ? formatInstantDate(link.submittedAt) : "—"}.
            </p>
            {link.type === "DISC" ? (
              <AssessmentResult
                type="DISC"
                scores={link.scores as unknown as DiscScores}
                primaryProfile={link.primaryProfile! as DiscDimension}
                secondaryProfile={link.secondaryProfile as DiscDimension | null}
              />
            ) : (
              <AssessmentResult
                type="MULTIPLA_ESCOLHA"
                scores={link.scores as unknown as QuizScores}
                templateName={link.template?.name ?? "Modelo excluído"}
              />
            )}
          </>
        )}
      </Card>
    </PageContainer>
  );
}
