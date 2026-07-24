import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedAssessmentLinkWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
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
    <PageContainer variant="narrow">
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link href="/testes" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Testes
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate">{link.person.name}</span>
      </div>

      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">
          <Link href={`/candidatos/${link.person.id}`} className="hover:text-brand transition-colors">
            {link.person.name}
          </Link>
        </h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Teste {link.type === "DISC" ? "DISC" : link.template?.name}
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
        </p>
      </div>

      <div className="bg-surface border border-border rounded-lg p-5">
        {link.status === "PENDENTE" ? (
          <>
            <p className="text-[13px] text-fg-muted mb-3">
              Aguardando resposta do candidato. Link expira em {formatInstantDate(link.expiresAt)}.
            </p>
            {linkUrl && <p className="text-[12px] text-fg-muted break-all mb-4">{linkUrl}</p>}
            {canManage && <DeleteFieldButton action={excluirLinkTeste.bind(null, link.id)} nome="este teste" />}
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
      </div>
    </PageContainer>
  );
}
