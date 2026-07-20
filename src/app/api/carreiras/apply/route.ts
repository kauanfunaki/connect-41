import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getPrisma } from "@/lib/prisma";
import { hit, clientIp } from "@/lib/rateLimit";
import { notifyUser, notifySector } from "@/lib/notifications";
import { PersonType } from "@/generated/prisma/enums";

// Currículos do portal ficam fora de public/ (mesma razão do storage de
// documents): só são servidos via /api/resumes/[candidaturaId], com sessão.
const STORAGE_DIR = path.join(process.cwd(), "storage", "resumes");

const RESUME_TYPES: Record<string, string> = { "application/pdf": "pdf" };
const MAX_RESUME_SIZE = 5 * 1024 * 1024;

// Rota pública (candidato não tem login) — as defesas são: rate limit por IP,
// slug+vaga validados contra isPublic/ABERTA, consentimento LGPD obrigatório
// e dedup por (vaga, e-mail). Nenhum dado do form entra em caminho de arquivo.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = hit(`careers-apply:${ip}`, 5, 15 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Muitas candidaturas em sequência. Tente novamente em alguns minutos." },
      { status: 429 }
    );
  }

  const form = await req.formData();
  const slug = (form.get("slug") as string)?.trim();
  const vagaId = (form.get("vagaId") as string)?.trim();
  const name = (form.get("name") as string)?.trim();
  const email = (form.get("email") as string)?.trim().toLowerCase();
  const phone = (form.get("phone") as string)?.trim();
  const city = (form.get("city") as string)?.trim();
  const stateCode = (form.get("stateCode") as string)?.trim().toUpperCase();
  const consent = form.get("consent") === "true";
  const resume = form.get("resume");

  if (!slug || !vagaId) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  if (!name || name.length < 3) return NextResponse.json({ error: "Informe seu nome completo." }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json({ error: "É preciso autorizar o uso dos dados para participar do processo seletivo." }, { status: 400 });
  }

  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, active: true } });
  if (!tenant || !tenant.active) return NextResponse.json({ error: "Página não encontrada." }, { status: 404 });

  const vaga = await prisma.vaga.findFirst({
    where: { id: vagaId, tenantId: tenant.id, isPublic: true, status: "ABERTA" },
    select: { id: true, title: true, sectorCode: true, responsibleUserId: true },
  });
  if (!vaga) return NextResponse.json({ error: "Esta vaga não está mais disponível." }, { status: 404 });

  // Currículo é opcional, mas quando vem precisa ser PDF pequeno.
  let resumeUrl: string | null = null;
  if (resume instanceof File && resume.size > 0) {
    const ext = RESUME_TYPES[resume.type];
    if (!ext) return NextResponse.json({ error: "Currículo precisa ser um PDF." }, { status: 400 });
    if (resume.size > MAX_RESUME_SIZE) {
      return NextResponse.json({ error: "Currículo maior que 5MB." }, { status: 400 });
    }
    const storedFileName = `${randomUUID()}.${ext}`;
    const dir = path.join(STORAGE_DIR, tenant.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, storedFileName), Buffer.from(await resume.arrayBuffer()));
    resumeUrl = `${tenant.id}/${storedFileName}`;
  }

  // Reaproveita o candidato pelo e-mail (mesma pessoa aplicando pra outra vaga
  // não vira duplicata) — Person não tem unique de e-mail, então findFirst.
  let person = await prisma.person.findFirst({
    where: { tenantId: tenant.id, type: PersonType.CANDIDATO, email },
    select: { id: true },
  });
  if (!person) {
    person = await prisma.person.create({
      data: {
        tenantId: tenant.id,
        type: PersonType.CANDIDATO,
        name,
        email,
        phone: phone || null,
        city: city || null,
        stateCode: stateCode && /^[A-Z]{2}$/.test(stateCode) ? stateCode : null,
      },
      select: { id: true },
    });
  }

  const existing = await prisma.candidatura.findUnique({
    where: { vagaId_personId: { vagaId: vaga.id, personId: person.id } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Você já se candidatou a esta vaga com este e-mail." }, { status: 409 });
  }

  await prisma.candidatura.create({
    data: {
      tenantId: tenant.id,
      vagaId: vaga.id,
      personId: person.id,
      origin: "PORTAL",
      resumeUrl,
    },
  });

  const message = `Nova candidatura de ${name} para a vaga "${vaga.title}" (via portal).`;
  if (vaga.responsibleUserId) {
    await notifyUser(vaga.responsibleUserId, { tenantId: tenant.id, type: "NEW_APPLICATION", message, entityType: "PERSON", entityId: person.id });
  } else {
    await notifySector(vaga.sectorCode, { tenantId: tenant.id, type: "NEW_APPLICATION", message, entityType: "PERSON", entityId: person.id });
  }

  return NextResponse.json({ ok: true });
}
