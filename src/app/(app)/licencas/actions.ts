"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { lerFormularioDeLicenca } from "@/lib/societario/licenca-form";
import { pedirImpressaoDoAlvara } from "@/lib/robo/servidor";
import { gerarEstruturado } from "@/lib/ai";
import { saoPauloParts } from "@/lib/agenda";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { nomeExibicao } from "@/lib/companyName";
import { guardarArquivo } from "@/lib/drive/servidor";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { pastaDoModeloDaEmpresa } from "@/lib/serpro/situacaoFiscal";
import { TAMANHO_MAXIMO_DO_ANEXO } from "@/lib/financeiro/pendencias/anexo";
import {
  AGENTE_DA_LICENCA,
  SCHEMA_DA_LICENCA,
  SISTEMA_DA_LICENCA,
  lerRespostaDaLicenca,
  nomeDoPdfDaLicenca,
  type LeituraDaLicenca,
} from "@/lib/societario/leituraDaLicenca";

// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "societario";
const MODULE = "societario_licencas";

export type LicencaState = { error: string } | { success: true } | null;

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { erro: "Não autenticado", ctx: null };
  if (!canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) return { erro: "Sem permissão no Societário.", ctx: null };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { erro: "O módulo de licenças não está ligado.", ctx: null };
  return { erro: null, ctx };
}

/** O PDF do formulário, conferido pelos bytes: o nome e o tipo são o que o navegador disse. */
async function pdfDoFormulario(form: FormData): Promise<{ pdf: { nome: string; bytes: Buffer } | null } | { error: string }> {
  const arquivo = form.get("pdf");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { pdf: null };
  if (arquivo.size > TAMANHO_MAXIMO_DO_ANEXO) return { error: "O PDF passa de 10 MB." };
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return { error: "O arquivo não é um PDF." };
  return { pdf: { nome: arquivo.name, bytes } };
}

function mensagemDeErroDaIa(err: unknown): string {
  const m = err instanceof Error ? err.message : "";
  if (/desligad/i.test(m)) return "A leitura de alvará e licença está desligada. Um administrador liga em Configurações › Inteligência artificial.";
  if (/chave|api key|configur/i.test(m)) return "O escritório não tem chave de IA configurada.";
  if (/teto|limite/i.test(m)) return "O teto de gasto da leitura de licenças no mês foi atingido.";
  return "A IA não conseguiu ler agora. Tente de novo em alguns minutos, ou preencha à mão.";
}

export type ResultadoDaLeituraDaLicenca = { error: string } | { ok: true; leitura: LeituraDaLicenca };

/**
 * "Ler do PDF" no formulário da licença (04/11/2026). Manda o PDF à IA, confere
 * o que voltou e devolve o que preenche a tela. Não grava nada: o PDF só vai
 * para os Arquivos com o "Salvar", depois que a pessoa conferiu.
 */
export async function lerPdfDaLicenca(form: FormData): Promise<ResultadoDaLeituraDaLicenca> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  const lido = await pdfDoFormulario(form);
  if ("error" in lido) return lido;
  if (!lido.pdf) return { error: "Escolha o PDF do alvará ou da licença." };

  // A empresa é opcional na licença nova: sem ela, só não há a conferência do titular.
  const companyId = String(form.get("companyId") ?? "").trim();
  const empresa = companyId
    ? await getPrisma().company.findFirst({ where: { id: companyId, tenantId: ctx.tenantId }, select: { id: true, name: true, displayName: true, kind: true, cnpj: true, cpf: true } })
    : null;

  try {
    const r = await gerarEstruturado({
      tenantId: ctx.tenantId,
      agentCode: AGENTE_DA_LICENCA,
      sistema: SISTEMA_DA_LICENCA,
      texto: empresa ? `Leia este alvará ou licença da empresa ${nomeExibicao(empresa)}.` : "Leia este alvará ou licença.",
      pdfBase64: lido.pdf.bytes.toString("base64"),
      nomeDoArquivo: lido.pdf.nome.slice(0, 120) || "licenca.pdf",
      nome: "licenca",
      schema: SCHEMA_DA_LICENCA,
      maxTokens: 1024,
      contexto: { userId: ctx.userId, entityType: "empresa", entityId: empresa?.id },
    });
    return { ok: true, leitura: lerRespostaDaLicenca(r.valor, saoPauloParts(new Date()).dateKey, empresa ? (documentoDaEmpresa(empresa)?.digitos ?? null) : null) };
  } catch (err) {
    console.error("[lerPdfDaLicenca]", err);
    return { error: mensagemDeErroDaIa(err) };
  }
}

/** Guarda o PDF da licença em Arquivos › Societário, pela convenção do setor. */
async function guardarPdfDaLicenca(tenantId: string, companyId: string, tipo: string, emitidaEm: Date | null, pdf: { bytes: Buffer }): Promise<{ ok: true } | { error: string }> {
  if (!(await isModuleEnabled(tenantId, MODULO_ARQUIVOS))) return { error: "Os Arquivos estão desligados: não há onde guardar o PDF. Tire o PDF e salve, ou peça para ligar os Arquivos." };
  const pasta = await pastaDoModeloDaEmpresa(tenantId, companyId, "societario");
  if (!pasta) return { error: "A empresa não tem a pasta Societário nos Arquivos. Tire o PDF e salve, ou crie a pasta." };
  const empresa = await getPrisma().company.findFirst({ where: { id: companyId, tenantId }, select: { name: true, displayName: true } });
  const ano = (emitidaEm ?? new Date()).getUTCFullYear();
  const nome = nomeDoPdfDaLicenca(empresa ? nomeExibicao(empresa) : "EMPRESA", tipo, ano);
  const g = await guardarArquivo({ tenantId, folderId: pasta, arquivo: new File([new Uint8Array(pdf.bytes)], nome, { type: "application/pdf" }) });
  return g.ok ? { ok: true } : { error: `A licença não foi salva: o PDF não entrou nos Arquivos (${g.erro}).` };
}

/**
 * Cria ou edita uma licença.
 *
 * O tenant é conferido nas três pontas — empresa, órgão e a própria licença —,
 * porque os três ids chegam pelo formulário. Com um PDF lido (04/11/2026), ele
 * vai para Arquivos › Societário antes de gravar: se não couber, nada é gravado
 * e a pessoa decide.
 */
export async function salvarLicenca(_prev: LicencaState, form: FormData): Promise<LicencaState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  const tenantId = ctx.tenantId;
  const doPdf = await pdfDoFormulario(form);
  if ("error" in doPdf) return doPdf;

  const id = String(form.get("id") ?? "").trim() || null;
  const lido = lerFormularioDeLicenca({
    companyId: form.get("companyId"),
    kind: form.get("kind"),
    organId: form.get("organId"),
    number: form.get("number"),
    issuedAt: form.get("issuedAt"),
    expiresAt: form.get("expiresAt"),
    notes: form.get("notes"),
  });
  if (!lido.ok) return { error: lido.erro };
  const { dados } = lido;

  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({
    where: { id: dados.companyId, tenantId },
    select: { id: true },
  });
  if (!empresa) return { error: "Empresa não encontrada." };

  if (dados.organId) {
    const orgao = await prisma.processOrgan.findFirst({
      where: { id: dados.organId, tenantId },
      select: { id: true },
    });
    if (!orgao) return { error: "Órgão não encontrado." };
  }

  if (doPdf.pdf) {
    const guardado = await guardarPdfDaLicenca(tenantId, dados.companyId, dados.kind, dados.issuedAt, doPdf.pdf);
    if ("error" in guardado) return guardado;
  }

  try {
    if (id) {
      const atual = await prisma.license.findFirst({
        where: { id, tenantId },
        select: { id: true, companyId: true },
      });
      if (!atual) return { error: "Licença não encontrada." };
      // A empresa não muda na edição: licença de outra empresa é outra licença,
      // e mover esta levaria junto o histórico de renovação da primeira.
      if (atual.companyId !== dados.companyId) {
        return { error: "A empresa de uma licença não muda — cadastre uma nova." };
      }
      await prisma.license.update({
        where: { id },
        data: {
          kind: dados.kind,
          organId: dados.organId,
          number: dados.number,
          issuedAt: dados.issuedAt,
          expiresAt: dados.expiresAt,
          notes: dados.notes,
        },
      });
      await logAudit({
        tenantId,
        userId: ctx.userId,
        action: "license.update",
        entityType: "License",
        entityId: id,
        metadata: { kind: dados.kind },
      });
    } else {
      const criada = await prisma.license.create({
        data: { tenantId, ...dados },
        select: { id: true },
      });
      await logAudit({
        tenantId,
        userId: ctx.userId,
        action: "license.create",
        entityType: "License",
        entityId: criada.id,
        metadata: { kind: dados.kind, companyId: dados.companyId },
      });
    }
  } catch (err) {
    console.error("[salvarLicenca]", err);
    return { error: "Erro ao salvar a licença." };
  }

  revalidatePath("/licencas");
  revalidatePath(`/empresas/${dados.companyId}`);
  return { success: true };
}

async function mudarRevogacao(id: string, revogar: boolean): Promise<LicencaState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const prisma = getPrisma();
  const licenca = await prisma.license.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, companyId: true, revokedAt: true },
  });
  if (!licenca) return { error: "Licença não encontrada." };
  if (revogar && licenca.revokedAt) return { error: "Esta licença já está revogada." };
  if (!revogar && !licenca.revokedAt) return { error: "Esta licença não está revogada." };

  await prisma.license.update({
    where: { id },
    data: { revokedAt: revogar ? new Date() : null },
  });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: revogar ? "license.revoke" : "license.reactivate",
    entityType: "License",
    entityId: id,
  });

  revalidatePath("/licencas");
  revalidatePath(`/empresas/${licenca.companyId}`);
  return { success: true };
}

/**
 * Revoga: cassada, substituída ou deixou de valer.
 *
 * Não apaga — a licença sai da fila de renovação e fica no histórico da empresa.
 * Apagar faria sumir a prova de que ela existiu, e é essa prova que se procura
 * quando o cliente é fiscalizado.
 */
/**
 * Pede ao robô do Societário a impressão do alvará (30/10/2026). A máquina do
 * TI busca a tarefa, imprime no site da prefeitura e o PDF vai para
 * Arquivos › Societário da empresa. Ver `src/lib/robo/`.
 */
export async function imprimirAlvaraPeloRobo(id: string): Promise<{ error: string } | { success: true; texto: string }> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  if (!(await isModuleEnabled(ctx.tenantId, "societario_robo"))) return { error: "O robô do Societário não está ligado neste escritório." };
  const r = await pedirImpressaoDoAlvara(ctx.tenantId, id, ctx.userId ?? null);
  if (!r.ok) return { error: r.erro };
  revalidatePath("/robo");
  return { success: true, texto: r.texto };
}

export async function revogarLicenca(id: string): Promise<LicencaState> {
  return mudarRevogacao(id, true);
}

/** Desfaz a revogação — quando foi marcada por engano. */
export async function reativarLicenca(id: string): Promise<LicencaState> {
  return mudarRevogacao(id, false);
}
