import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { StatusDot } from "@/components/shared/StatusDot";
import { canManageSector, podeExcluir } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { listDocuments } from "@/lib/documents";
import { CATEGORY_LABEL } from "@/lib/document-categories";
import { formatCalendarDate, formatInstantDate, formatPhone, maskCpf } from "@/lib/format";
import type { DiscScores, DiscDimension } from "@/lib/disc";
import type { QuizScores } from "@/lib/quiz";
import type { Faixa } from "@/lib/recrutamento/triagem";
import {
  dataCurta,
  enderecoEmUmaLinha,
  etapasDaCandidatura,
  idadeEm,
  resumoDosDocumentos,
  rotuloDaOrigem,
} from "@/lib/recrutamento/fichaDoCandidato";
import {
  escolherCurriculo,
  lerResumoDoCurriculo,
  nomeDoCurriculoDoPortal,
  resumoEhDoArquivo,
} from "@/lib/recrutamento/curriculoDoCandidato";
import { TesteCard } from "@/components/teste/TesteCard";
import { AcoesDoCandidato } from "@/components/candidatos/AcoesDoCandidato";
import { CandidaturasDoCandidato } from "@/components/candidatos/CandidaturasDoCandidato";
import { BlocoDoCurriculo, type ArquivoDoCurriculo } from "@/components/candidatos/BlocoDoCurriculo";
import { DocumentosDoCandidato } from "@/components/candidatos/DocumentosDoCandidato";
import { DadosPessoaisDoCandidato } from "@/components/candidatos/DadosPessoaisDoCandidato";
import { TagsDoCandidato } from "@/components/candidatos/TagsDoCandidato";
import { alternarTagPessoa } from "../actions";
import { extrairDadosCurriculo } from "./ai-actions";
import { salvarSecaoDoCandidato } from "./ficha-actions";

const vazioViraNulo = (v: string | null | undefined) => v?.trim() || null;

/**
 * Ficha do candidato (Recrutamento › Candidatos), redesenhada em 14/10/2026
 * com as escolhas do Kauan na página de alternativas: o cabeçalho e, embaixo,
 * duas colunas no computador — à esquerda o processo (candidaturas, teste,
 * currículo, documentos), à direita a pessoa (dados pessoais e tags). No
 * celular, uma coluna só, com o processo primeiro. Eram oito blocos empilhados
 * na largura toda, com muito espaço vazio.
 */
export default async function CandidatoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, setor } = await abrirTelaDoModulo("recrutamento_candidatos");
  const canEdit = canManageSector(ctx, setor);

  const prisma = getPrisma();
  const [person, documents, allTags] = await Promise.all([
    prisma.person.findFirst({
      where: { id, tenantId: ctx.tenantId, type: "CANDIDATO" },
      include: { tags: { select: { tagId: true } } },
    }),
    listDocuments(ctx.tenantId, "PERSON", id),
    prisma.tag.findMany({
      where: { tenantId: ctx.tenantId, sectorCode: "recrutamento" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  if (!person) notFound();

  const candidaturas = await prisma.candidatura.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { createdAt: "desc" },
    include: { vaga: { select: { id: true, title: true, company: { select: { name: true } } } } },
  });

  // Teste é traço da pessoa, reaproveitável entre candidaturas — mostra o link
  // mais recente independente de qual candidatura o gerou. A última nota da
  // triagem de cada candidatura vai no cartão dela; o resumo do currículo, no
  // bloco Currículo (sem a tabela nova, vem vazio).
  const [testeLink, templates, ultimasNotas, resumoGuardado] = await Promise.all([
    prisma.assessmentLink.findFirst({
      where: { tenantId: ctx.tenantId, personId: id },
      orderBy: { createdAt: "desc" },
      include: { template: { select: { name: true } } },
    }),
    canEdit
      ? prisma.assessmentTemplate.findMany({
          where: { tenantId: ctx.tenantId, sectorCode: "recrutamento", active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    candidaturas.length > 0
      ? prisma.candidaturaNota.findMany({
          where: { tenantId: ctx.tenantId, candidaturaId: { in: candidaturas.map((c) => c.id) } },
          orderBy: { createdAt: "desc" },
          distinct: ["candidaturaId"],
          select: { candidaturaId: true, score: true, faixa: true },
        })
      : Promise.resolve([]),
    lerResumoDoCurriculo(prisma, ctx.tenantId, id),
  ]);
  const initialTesteLink =
    testeLink?.status === "PENDENTE"
      ? { status: "PENDENTE" as const, token: testeLink.token, expiresAtLabel: formatInstantDate(testeLink.expiresAt) }
      : testeLink?.status === "RESPONDIDO" && testeLink.type === "DISC"
        ? {
            status: "RESPONDIDO" as const,
            id: testeLink.id,
            type: "DISC" as const,
            scores: testeLink.scores as unknown as DiscScores,
            primaryProfile: testeLink.primaryProfile as DiscDimension,
            secondaryProfile: testeLink.secondaryProfile as DiscDimension | null,
            submittedAtLabel: testeLink.submittedAt ? formatInstantDate(testeLink.submittedAt) : "—",
          }
        : testeLink?.status === "RESPONDIDO"
          ? {
              status: "RESPONDIDO" as const,
              id: testeLink.id,
              type: "MULTIPLA_ESCOLHA" as const,
              scores: testeLink.scores as unknown as QuizScores,
              templateName: testeLink.template?.name ?? "Modelo excluído",
              submittedAtLabel: testeLink.submittedAt ? formatInstantDate(testeLink.submittedAt) : "—",
            }
          : null;

  // Excluir é só de administrador (13/10/2026) — gerir o Recrutamento dá
  // editar, não apagar.
  const excluivel = podeExcluir(ctx);
  const agora = new Date();
  const notaDa = new Map(ultimasNotas.map((n) => [n.candidaturaId, n]));

  // O currículo: o mesmo arquivo que o "Ler com IA" lê (ver ai-actions.ts).
  const curriculo = escolherCurriculo(
    candidaturas
      .filter((c) => c.resumeUrl)
      .map((c) => ({ candidaturaId: c.id, vagaTitulo: c.vaga.title, em: c.createdAt })),
    documents
      .filter((d) => d.category === "CURRICULO")
      .map((d) => ({
        documentId: d.id,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        mimeType: d.mimeType,
        enviadoPor: d.uploadedBy.name,
        em: d.createdAt,
      }))
  );
  const arquivoDoCurriculo: ArquivoDoCurriculo | null = !curriculo
    ? null
    : curriculo.tipo === "portal"
      ? {
          nome: nomeDoCurriculoDoPortal(person.name),
          href: `/api/resumes/${curriculo.candidaturaId}`,
          origem: `veio pelo portal em ${dataCurta(curriculo.em, agora)}`,
          contexto: curriculo.vagaTitulo ? `Candidatura ${curriculo.vagaTitulo}` : null,
          pdf: true,
        }
      : {
          nome: curriculo.fileName,
          href: `/api/documents/${curriculo.documentId}`,
          origem: `anexado em ${dataCurta(curriculo.em, agora)}`,
          contexto: curriculo.enviadoPor ? `Anexado por ${curriculo.enviadoPor}` : null,
          pdf: curriculo.pdf,
        };

  const idade = person.birthDate ? idadeEm(person.birthDate, agora) : null;
  const documentosDaFicha = documents.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    categoria: CATEGORY_LABEL[d.category],
    category: d.category,
    enviadoEm: dataCurta(d.createdAt, agora),
    enviadoPor: d.uploadedBy.name,
    sensitive: d.sensitive,
    expiresAtLabel: d.expiresAt ? formatCalendarDate(d.expiresAt) : null,
    expired: d.expiresAt != null && d.expiresAt < agora,
  }));

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Candidatos", href: "/candidatos" }, { label: person.name, truncate: true }]} />

      {/* Ativo/inativo de cadastro é a bolinha, como na lista de candidatos
          (escolha 2A, 08/10/2026), e mora no `meta`, embaixo do título. Editar
          agora é no próprio bloco; o formulário inteiro e o excluir ficam no
          "⋯". */}
      <PageHeader
        title={person.name}
        meta={
          <StatusDot
            color={person.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
            label={person.active ? "Ativo" : "Inativo"}
          />
        }
        subtitle={person.cpf ? <span className="tnum">CPF: {maskCpf(person.cpf)}</span> : undefined}
        action={<AcoesDoCandidato id={id} nome={person.name} podeEditar={canEdit} podeExcluir={excluivel} />}
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* O processo. */}
        <div className="flex min-w-0 flex-col gap-4">
          <CandidaturasDoCandidato
            candidaturas={candidaturas.map((c) => {
              const nota = notaDa.get(c.id);
              return {
                id: c.id,
                vagaId: c.vaga.id,
                vagaTitulo: c.vaga.title,
                empresa: c.vaga.company.name,
                inscritoEm: dataCurta(c.createdAt, agora),
                origem: rotuloDaOrigem(c.origin),
                etapa: etapasDaCandidatura(c.stage, c.status),
                nota: nota ? { score: nota.score, faixa: nota.faixa as Faixa } : null,
              };
            })}
          />

          <TesteCard
            personId={id}
            candidaturaId={null}
            initialLink={initialTesteLink}
            canManage={canEdit}
            templates={templates}
            urlPublica={(process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "")}
          />

          <BlocoDoCurriculo
            personId={id}
            arquivo={arquivoDoCurriculo}
            resumo={
              resumoGuardado
                ? {
                    texto: resumoGuardado.summary,
                    lidoEm: formatInstantDate(resumoGuardado.readAt, { day: "2-digit", month: "2-digit" }),
                    preencheu: resumoGuardado.filledFields,
                    deOutroArquivo: !!curriculo && !resumoEhDoArquivo(resumoGuardado, curriculo),
                  }
                : null
            }
            podeEditar={canEdit}
            ler={extrairDadosCurriculo.bind(null, id)}
          />

          <DocumentosDoCandidato
            personId={id}
            documentos={documentosDaFicha}
            resumo={resumoDosDocumentos(documentosDaFicha)}
            podeAnexar={canEdit}
          />
        </div>

        {/* A pessoa. */}
        <div className="flex min-w-0 flex-col gap-4">
          <DadosPessoaisDoCandidato
            podeEditar={canEdit}
            acoes={{
              identificacao: salvarSecaoDoCandidato.bind(null, id, "identificacao"),
              contato: salvarSecaoDoCandidato.bind(null, id, "contato"),
              endereco: salvarSecaoDoCandidato.bind(null, id, "endereco"),
            }}
            dados={{
              name: person.name,
              cpf: vazioViraNulo(person.cpf),
              birthDate: person.birthDate ? person.birthDate.toISOString().slice(0, 10) : null,
              nascimento: person.birthDate
                ? `${formatCalendarDate(person.birthDate)}${idade != null ? ` · ${idade} ${idade === 1 ? "ano" : "anos"}` : ""}`
                : null,
              rg: vazioViraNulo(person.rg),
              education: vazioViraNulo(person.education),
              email: vazioViraNulo(person.email),
              phone: vazioViraNulo(person.phone),
              telefone: vazioViraNulo(person.phone) ? formatPhone(person.phone) : null,
              zipCode: vazioViraNulo(person.zipCode),
              addressStreet: vazioViraNulo(person.addressStreet),
              addressNumber: vazioViraNulo(person.addressNumber),
              addressComplement: vazioViraNulo(person.addressComplement),
              neighborhood: vazioViraNulo(person.neighborhood),
              city: vazioViraNulo(person.city),
              stateCode: vazioViraNulo(person.stateCode),
              endereco: enderecoEmUmaLinha(person),
            }}
          />

          <TagsDoCandidato
            todas={allTags}
            marcadas={person.tags.map((t) => t.tagId)}
            alternar={alternarTagPessoa.bind(null, id)}
            podeEditar={canEdit}
          />
        </div>
      </div>
    </PageContainer>
  );
}
