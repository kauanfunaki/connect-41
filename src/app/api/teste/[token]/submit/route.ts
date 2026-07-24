import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { hit, clientIp } from "@/lib/rateLimit";
import { notifyUser } from "@/lib/notifications";
import { validateDiscAnswers, scoreDisc } from "@/lib/disc";
import { stageIndex } from "@/lib/recruitmentFunnel";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientIp(req);

  const prisma = getPrisma();
  const link = await prisma.assessmentLink.findUnique({
    where: { token },
    select: { id: true, tenantId: true, personId: true, candidaturaId: true, status: true, expiresAt: true, createdById: true },
  });

  if (!link) {
    // Rate-limita token inexistente pra dificultar enumeração.
    hit(`teste-miss:${ip}`, 20, 10 * 60_000);
    return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  }
  if (link.status !== "PENDENTE") {
    return NextResponse.json({ error: "Este teste já foi respondido." }, { status: 409 });
  }
  if (link.expiresAt < new Date()) {
    return NextResponse.json({ error: "Este link expirou. Solicite um novo ao recrutador." }, { status: 410 });
  }

  const form = await req.formData();

  if (form.get("consent") !== "true") {
    return NextResponse.json({ error: "É preciso autorizar o uso dos dados para enviar o teste." }, { status: 400 });
  }

  let rawAnswers: unknown;
  try {
    rawAnswers = JSON.parse((form.get("answers") as string) ?? "");
  } catch {
    return NextResponse.json({ error: "Respostas inválidas." }, { status: 400 });
  }
  const answers = validateDiscAnswers(rawAnswers);
  if (!answers) {
    return NextResponse.json({ error: "Respostas incompletas ou inválidas. Responda todos os blocos e tente novamente." }, { status: 400 });
  }

  const result = scoreDisc(answers);

  await prisma.assessmentLink.update({
    where: { id: link.id },
    data: {
      status: "RESPONDIDO",
      submittedAt: new Date(),
      answers,
      scores: result.scores,
      primaryProfile: result.primaryProfile,
      secondaryProfile: result.secondaryProfile,
    },
  });

  // Se o teste veio de uma candidatura, avança o funil pra "Teste" (mesmo
  // padrão de meeting-actions.ts ao agendar entrevista → "Entrevista").
  if (link.candidaturaId) {
    const candidatura = await prisma.candidatura.findUnique({
      where: { id: link.candidaturaId },
      select: { stage: true },
    });
    if (candidatura && stageIndex(candidatura.stage) < stageIndex("TESTE")) {
      await prisma.candidatura.update({ where: { id: link.candidaturaId }, data: { stage: "TESTE" } });
    }
  }

  // Sem entityType/entityId: buildNotificationUrl (src/lib/notifications.ts)
  // resolve PERSON sempre para /pessoas/:id, que hoje só renderiza
  // Person.type === COLABORADOR (candidatos vivem em /candidatos/:id) — um
  // link ali pra um candidato daria 404. Cai no fallback seguro /notificacoes.
  const person = await prisma.person.findUnique({ where: { id: link.personId }, select: { name: true } });
  await notifyUser(link.createdById, {
    tenantId: link.tenantId,
    type: "TESTE_DISC_RESPONDIDO",
    message: `${person?.name ?? "Candidato"} respondeu o teste DISC — perfil ${result.primaryProfile}.`,
  });

  return NextResponse.json({ ok: true });
}
