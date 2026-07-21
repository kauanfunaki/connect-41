import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getPrisma } from "@/lib/prisma";
import { hit, clientIp } from "@/lib/rateLimit";
import { notifyUser } from "@/lib/notifications";
import { isValidCPF, digitsOnly } from "@/lib/validation/common";
import { DependenteRelationship } from "@/generated/prisma/enums";
import type { DocumentCategory } from "@/generated/prisma/enums";

// Documentos da admissão ficam no mesmo storage do módulo genérico de anexos
// (fora de public/, servidos só por /api/documents/[id] com permissão). O ASO
// entra como categoria ASO → herda o gate DADOS_MEDICOS automaticamente.
const STORAGE_DIR = path.join(process.cwd(), "storage", "documents");
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Checklist fixo de documentos da admissão (P0). Cada slot vira um Document
// com o rótulo no fileName pra o DP identificar na conferência.
const DOC_SLOTS: { field: string; label: string; category: DocumentCategory; sensitive: boolean }[] = [
  { field: "doc_rg", label: "RG", category: "ADMISSAO", sensitive: false },
  { field: "doc_cpf", label: "CPF", category: "ADMISSAO", sensitive: false },
  { field: "doc_comprovante", label: "Comprovante de residência", category: "ADMISSAO", sensitive: false },
  { field: "doc_foto", label: "Foto 3x4", category: "ADMISSAO", sensitive: false },
  { field: "doc_ctps", label: "Carteira de Trabalho", category: "ADMISSAO", sensitive: false },
  { field: "doc_aso", label: "ASO (exame admissional)", category: "ASO", sensitive: true },
];

function pickStr(form: FormData, key: string): string | null {
  return (form.get(key) as string)?.trim() || null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientIp(req);

  const prisma = getPrisma();
  const link = await prisma.admissaoLink.findUnique({
    where: { token },
    select: { id: true, tenantId: true, personId: true, status: true, expiresAt: true, createdById: true },
  });

  if (!link) {
    // Rate-limita token inexistente pra dificultar enumeração.
    hit(`admissao-miss:${ip}`, 20, 10 * 60_000);
    return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  }
  if (link.status !== "PENDENTE") {
    return NextResponse.json({ error: "Seus dados já foram enviados. Se precisar corrigir algo, avise o RH." }, { status: 409 });
  }
  if (link.expiresAt < new Date()) {
    return NextResponse.json({ error: "Este link expirou. Solicite um novo ao RH." }, { status: 410 });
  }

  const form = await req.formData();

  if (form.get("consent") !== "true") {
    return NextResponse.json({ error: "É preciso autorizar o uso dos dados para concluir a admissão." }, { status: 400 });
  }

  // CPF: só valida se veio preenchido — armazenado só com dígitos.
  const cpfRaw = pickStr(form, "cpf");
  let cpf: string | null | undefined = undefined; // undefined = não mexe no valor atual
  if (cpfRaw) {
    if (!isValidCPF(cpfRaw)) return NextResponse.json({ error: "CPF inválido." }, { status: 400 });
    cpf = digitsOnly(cpfRaw);
  }

  const birthRaw = pickStr(form, "birthDate");
  const birthDate = birthRaw && /^\d{4}-\d{2}-\d{2}$/.test(birthRaw) ? new Date(birthRaw) : undefined;

  // Só grava campos que vieram preenchidos — não apaga dado já existente no
  // Person com string vazia.
  const data: Record<string, unknown> = {};
  const set = (key: string, value: string | null) => {
    if (value) data[key] = value;
  };
  if (cpf !== undefined) data.cpf = cpf;
  if (birthDate) data.birthDate = birthDate;
  set("rg", pickStr(form, "rg"));
  set("pis", pickStr(form, "pis"));
  set("ctps", pickStr(form, "ctps"));
  set("ctpsSerie", pickStr(form, "ctpsSerie"));
  set("education", pickStr(form, "education"));
  set("zipCode", pickStr(form, "zipCode"));
  set("addressStreet", pickStr(form, "addressStreet"));
  set("addressNumber", pickStr(form, "addressNumber"));
  set("addressComplement", pickStr(form, "addressComplement"));
  set("neighborhood", pickStr(form, "neighborhood"));
  set("city", pickStr(form, "city"));
  const uf = pickStr(form, "stateCode");
  if (uf && /^[A-Za-z]{2}$/.test(uf)) data.stateCode = uf.toUpperCase();
  set("bankName", pickStr(form, "bankName"));
  set("bankAgency", pickStr(form, "bankAgency"));
  set("bankAccount", pickStr(form, "bankAccount"));
  set("bankAccountType", pickStr(form, "bankAccountType"));

  // Valida os arquivos ANTES de escrever qualquer coisa (evita gravar dados e
  // falhar no meio dos uploads).
  const filesToSave: { slot: (typeof DOC_SLOTS)[number]; file: File; ext: string }[] = [];
  for (const slot of DOC_SLOTS) {
    const f = form.get(slot.field);
    if (f instanceof File && f.size > 0) {
      const ext = ALLOWED_TYPES[f.type];
      if (!ext) return NextResponse.json({ error: `${slot.label}: formato não suportado (use JPG, PNG, WEBP ou PDF).` }, { status: 400 });
      if (f.size > MAX_FILE_SIZE) return NextResponse.json({ error: `${slot.label}: arquivo maior que 10MB.` }, { status: 400 });
      filesToSave.push({ slot, file: f, ext });
    }
  }

  try {
    await prisma.person.update({ where: { id: link.personId }, data });
  } catch (err) {
    // Conflito mais provável: CPF já cadastrado em outra pessoa do tenant.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "O CPF informado já está cadastrado em outra pessoa. Confira o número ou avise o RH." }, { status: 409 });
    }
    console.error("[admissao/submit] person.update", err);
    return NextResponse.json({ error: "Não foi possível salvar seus dados. Tente novamente." }, { status: 500 });
  }

  // Grava os documentos (uploadedBy = quem gerou o link, já que o candidato não
  // tem usuário). fileName leva o rótulo do slot pra identificação na conferência.
  for (const { slot, file, ext } of filesToSave) {
    try {
      const id = randomUUID();
      const storedFileName = `${id}.${ext}`;
      const dir = path.join(STORAGE_DIR, link.tenantId);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, storedFileName), Buffer.from(await file.arrayBuffer()));
      await prisma.document.create({
        data: {
          id,
          tenantId: link.tenantId,
          entityType: "PERSON",
          entityId: link.personId,
          category: slot.category,
          fileName: `${slot.label} — ${file.name}`.slice(0, 180),
          fileUrl: `${link.tenantId}/${storedFileName}`,
          mimeType: file.type,
          fileSize: file.size,
          sensitive: slot.sensitive,
          uploadedById: link.createdById,
        },
      });
    } catch (err) {
      console.error("[admissao/submit] document", slot.field, err);
      // Não derruba o fluxo: os dados já foram salvos; o DP verá o doc faltando
      // na conferência e pode pedir reenvio.
    }
  }

  // Dependentes (controlados por índice no cliente). Recria do zero pra ser
  // idempotente caso o link tenha sido regenerado e re-submetido.
  const depCount = parseInt((form.get("dep_count") as string) ?? "0", 10) || 0;
  if (depCount > 0) {
    await prisma.dependente.deleteMany({ where: { personId: link.personId } });
    for (let i = 0; i < depCount; i++) {
      const name = (form.get(`dep_name_${i}`) as string)?.trim();
      if (!name) continue;
      const relRaw = (form.get(`dep_relationship_${i}`) as string) ?? "OUTRO";
      const relationship = (Object.values(DependenteRelationship) as string[]).includes(relRaw)
        ? (relRaw as DependenteRelationship)
        : DependenteRelationship.OUTRO;
      const depBirthRaw = (form.get(`dep_birthDate_${i}`) as string)?.trim();
      try {
        await prisma.dependente.create({
          data: {
            tenantId: link.tenantId,
            personId: link.personId,
            name: name.slice(0, 180),
            cpf: digitsOnly(form.get(`dep_cpf_${i}`) as string),
            birthDate: depBirthRaw && /^\d{4}-\d{2}-\d{2}$/.test(depBirthRaw) ? new Date(depBirthRaw) : null,
            relationship,
            isIRDependent: form.get(`dep_ir_${i}`) === "true",
            isSalarioFamilia: form.get(`dep_sf_${i}`) === "true",
          },
        });
      } catch (err) {
        console.error("[admissao/submit] dependente", i, err);
      }
    }
  }

  // ASO enviado → registra um ExameAdmissional (REALIZADO) pra o documento
  // aparecer no módulo de Exames, não só como anexo solto. Só cria se o
  // colaborador ainda não tem exame (evita duplicar); o DP classifica apto/
  // inapto depois na tela de Exames.
  if (filesToSave.some((f) => f.slot.field === "doc_aso")) {
    const jaTemExame = await prisma.exameAdmissional.count({ where: { tenantId: link.tenantId, personId: link.personId } });
    if (jaTemExame === 0) {
      try {
        await prisma.exameAdmissional.create({
          data: {
            tenantId: link.tenantId,
            personId: link.personId,
            status: "REALIZADO",
            performedAt: new Date(),
            notes: "ASO enviado pelo colaborador na admissão digital.",
          },
        });
      } catch (err) {
        console.error("[admissao/submit] exame admissional", err);
      }
    }
  }

  await prisma.admissaoLink.update({ where: { id: link.id }, data: { status: "PREENCHIDO", submittedAt: new Date() } });

  const person = await prisma.person.findUnique({ where: { id: link.personId }, select: { name: true } });
  await notifyUser(link.createdById, {
    tenantId: link.tenantId,
    type: "ADMISSAO_PREENCHIDA",
    message: `Admissão de ${person?.name ?? "colaborador"} preenchida — pronta para conferência.`,
    entityType: "PERSON",
    entityId: link.personId,
  });

  return NextResponse.json({ ok: true });
}
