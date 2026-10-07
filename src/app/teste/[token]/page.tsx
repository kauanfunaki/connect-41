import { headers } from "next/headers";
import { getPrisma } from "@/lib/prisma";
import { hit, clientIp } from "@/lib/rateLimit";
import { DiscForm } from "@/components/teste/DiscForm";
import { QuizForm } from "@/components/teste/QuizForm";
import { CheckCircle2, Clock, FileX, Link2Off } from "lucide-react";
import { CabecalhoPublico } from "@/components/publico/CabecalhoPublico";
import { TelaDeAvisoPublica } from "@/components/publico/TelaDeAvisoPublica";

export const metadata = { title: "Teste" };

export default async function TestePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = clientIp({ headers: h });

  const prisma = getPrisma();
  const link = await prisma.assessmentLink.findUnique({
    where: { token },
    include: {
      tenant: { select: { name: true } },
      person: { select: { name: true } },
    },
  });

  if (!link) {
    hit(`teste-view-miss:${ip}`, 20, 10 * 60_000);
    return <TelaDeAvisoPublica icone={<Link2Off />} titulo="Link inválido" texto="Este link de teste não existe ou foi digitado incorretamente. Solicite um novo ao recrutador." />;
  }
  if (link.status !== "PENDENTE") {
    return <TelaDeAvisoPublica icone={<CheckCircle2 />} tom="sucesso" titulo="Teste já respondido" texto="Suas respostas já foram recebidas. Se precisar refazer o teste, entre em contato com o recrutador." />;
  }
  if (link.expiresAt < new Date()) {
    return <TelaDeAvisoPublica icone={<Clock />} titulo="Link expirado" texto="Este link de teste expirou. Solicite um novo ao recrutador." />;
  }

  // MULTIPLA_ESCOLHA busca o template à parte — select só id/text/options nas
  // perguntas, NUNCA correctIndex (não pode vazar o gabarito pro público).
  let quizQuestions: { id: string; text: string; options: string[] }[] | null = null;
  let quizTemplateName: string | null = null;
  if (link.type === "MULTIPLA_ESCOLHA") {
    const template = await prisma.assessmentTemplate.findUnique({
      where: { id: link.templateId! },
      select: {
        name: true,
        questions: { orderBy: { order: "asc" }, select: { id: true, text: true, options: true } },
      },
    });
    if (!template) {
      return <TelaDeAvisoPublica icone={<FileX />} titulo="Teste indisponível" texto="O modelo deste teste não está mais disponível. Solicite um novo ao recrutador." />;
    }
    quizTemplateName = template.name;
    quizQuestions = template.questions.map((q) => ({ id: q.id, text: q.text, options: q.options as string[] }));
  }

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <CabecalhoPublico
          titulo={<>Olá, {link.person.name}!</>}
          subtitulo={
            <>
              {link.tenant.name} convidou você a responder{" "}
              {link.type === "DISC" ? "um teste de perfil comportamental (DISC)" : `o teste "${quizTemplateName}"`}. Leva
              poucos minutos.
            </>
          }
        />

        {link.type === "DISC" ? <DiscForm token={token} /> : <QuizForm token={token} questions={quizQuestions!} />}

        <p className="text-[length:var(--fs-micro)] text-fg-muted mt-6 text-center">
          Processo conduzido por {link.tenant.name}. Suas respostas são usadas apenas para este processo seletivo (LGPD).
        </p>
      </div>
    </div>
  );
}
