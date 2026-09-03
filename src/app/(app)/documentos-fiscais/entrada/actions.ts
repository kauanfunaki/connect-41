"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { lerXmlFiscal } from "@/lib/fiscal/xml";
import { chaveDeDeduplicacao, competenciaDe } from "@/lib/fiscal/documentos";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { alcanceDaEquipe } from "../alcance";
import { acharPorDedupKey } from "@/lib/fiscal/data";
import { alcancaEmpresa } from "@/lib/fiscal/alcance";

const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";

/** Um arquivo, um veredito. A tela mostra a lista inteira, não só o resumo. */
export type Veredito =
  | { arquivo: string; situacao: "aceito"; documentoId: string; empresa: string }
  | { arquivo: string; situacao: "duplicata"; detalhe: string }
  | { arquivo: string; situacao: "invalido"; detalhe: string }
  | { arquivo: string; situacao: "empresa_nao_cadastrada"; detalhe: string }
  | { arquivo: string; situacao: "ambigua"; detalhe: string };

export type EstadoDaEntrada = { erro: string } | { vereditos: Veredito[] } | null;

const MAX_ARQUIVOS = 50;

export async function importarXmls(_anterior: EstadoDaEntrada, form: FormData): Promise<EstadoDaEntrada> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) return { erro: "Sem permissão." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { erro: "Módulo não habilitado." };

  const arquivos = form.getAll("xmls").filter((f): f is File => f instanceof File && f.size > 0);
  if (arquivos.length === 0) return { erro: "Selecione ao menos um arquivo XML." };
  if (arquivos.length > MAX_ARQUIVOS) return { erro: `Máximo de ${MAX_ARQUIVOS} arquivos por vez.` };

  const empresaEscolhida = (form.get("companyId") as string) || null;

  const prisma = getPrisma();
  const alcance = alcanceDaEquipe(ctx.tenantId);

  // Uma leitura só das empresas do tenant, indexada pelo documento. Buscar por
  // CNPJ dentro do laço faria uma consulta por arquivo.
  const empresas = await prisma.company.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, name: true, displayName: true, kind: true, cnpj: true, cpf: true },
  });
  const porDocumento = new Map<string, (typeof empresas)[number]>();
  for (const e of empresas) {
    const doc = documentoDaEmpresa(e);
    if (doc) porDocumento.set(doc.digitos, e);
  }

  const vereditos: Veredito[] = [];

  for (const arquivo of arquivos) {
    const nome = arquivo.name;
    const leitura = lerXmlFiscal(await arquivo.text());

    if (!leitura.ok) {
      vereditos.push({ arquivo: nome, situacao: "invalido", detalhe: leitura.detalhe });
      continue;
    }
    const doc = leitura.documento;

    // Qual das nossas empresas é a dona deste documento.
    //
    // As duas pontas podem ser nossas — transferência entre estabelecimentos do
    // mesmo grupo, que é comum. O unique é `(tenant, dedupKey)`, então o acervo
    // guarda UMA linha: escolher sozinho penduraria a nota na empresa errada em
    // metade dos casos. Aqui a entrada devolve "ambígua" e pede a escolha, que a
    // tela oferece no seletor de empresa.
    const daEmitente = porDocumento.get(doc.emitente.documento ?? "");
    const daDestinataria = porDocumento.get(doc.destinatario.documento ?? "");
    const empresa = empresaEscolhida
      ? empresas.find((e) => e.id === empresaEscolhida)
      : (daEmitente ?? daDestinataria);

    if (!empresaEscolhida && daEmitente && daDestinataria && daEmitente.id !== daDestinataria.id) {
      vereditos.push({
        arquivo: nome,
        situacao: "ambigua",
        detalhe: `Emitente e destinatário são empresas do escritório (${daEmitente.name} e ${daDestinataria.name}). Escolha a empresa e reenvie.`,
      });
      continue;
    }
    if (!empresa) {
      vereditos.push({
        arquivo: nome,
        situacao: "empresa_nao_cadastrada",
        detalhe: `Nenhuma empresa com o CNPJ do emitente (${doc.emitente.documento ?? "—"}) nem do destinatário (${doc.destinatario.documento ?? "—"}).`,
      });
      continue;
    }
    // Empresa escolhida à mão ainda precisa estar no alcance — o id vem do
    // formulário, ou seja, do cliente.
    if (!alcancaEmpresa(alcance, empresa.id)) {
      vereditos.push({ arquivo: nome, situacao: "empresa_nao_cadastrada", detalhe: "Empresa fora do seu alcance." });
      continue;
    }

    // A competência declarada vence a data de emissão, e só NFS-e tem uma.
    // Serviço prestado em agosto e faturado em setembro pertence a agosto — que
    // é o mês que o contador fecha.
    const competencia = doc.competenciaDeclarada ?? competenciaDe(doc.emitidoEm);
    const dedupKey = chaveDeDeduplicacao({
      tipo: doc.tipo,
      chaveAcesso: doc.chaveAcesso,
      emitenteDocumento: doc.emitente.documento ?? "",
      serie: doc.serie,
      numero: doc.numero,
      competencia,
    });
    if (!dedupKey) {
      vereditos.push({ arquivo: nome, situacao: "invalido", detalhe: "Documento sem identidade para deduplicar." });
      continue;
    }

    const jaExiste = await acharPorDedupKey(alcance, dedupKey);
    if (jaExiste) {
      vereditos.push({
        arquivo: nome,
        situacao: "duplicata",
        detalhe: `Já está no acervo como nº ${jaExiste.number}.`,
      });
      continue;
    }

    try {
      const criado = await prisma.fiscalDocument.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: empresa.id,
          type: doc.tipo,
          accessKey: doc.chaveAcesso,
          dedupKey,
          number: doc.numero,
          series: doc.serie || null,
          issuerName: doc.emitente.nome ?? "—",
          issuerDocument: doc.emitente.documento ?? "",
          recipientName: doc.destinatario.nome,
          recipientDocument: doc.destinatario.documento,
          amount: doc.valorTotal,
          issuedAt: doc.emitidoEm,
          competence: competencia,
          origin: "UPLOAD",
          // NFS-e pode chegar já cancelada, no mesmo envelope. Entrar como
          // autorizada colocaria uma nota morta na fila de lançamento.
          situation: doc.cancelada ? "CANCELADA" : "AUTORIZADA",
          uploadedById: ctx.userId,
        },
        select: { id: true },
      });
      vereditos.push({
        arquivo: nome,
        situacao: "aceito",
        documentoId: criado.id,
        empresa: empresa.displayName ?? empresa.name,
      });
      await logAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "fiscal.document.uploaded",
        entityType: "FiscalDocument",
        entityId: criado.id,
        metadata: { arquivo: nome, tipo: doc.tipo, dedupKey },
      });
    } catch {
      // O unique do banco é a garantia real: duas subidas simultâneas do mesmo
      // arquivo passam pela checagem acima e só uma sobrevive aqui. A outra cai
      // como duplicata, que é o que ela é.
      vereditos.push({ arquivo: nome, situacao: "duplicata", detalhe: "Já estava no acervo." });
    }
  }

  revalidatePath("/documentos-fiscais");
  return { vereditos };
}
