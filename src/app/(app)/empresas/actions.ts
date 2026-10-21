"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { CompanyStatus, CompanyKind } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { canWriteEntity } from "@/lib/auth/policy";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { getCompanySectors, getApplicableCustomFields, saveCustomFieldValues } from "@/lib/customFields";
import { pick, pickDate } from "@/lib/forms";
import { isValidCNPJ, isValidCPF, digitsOnly } from "@/lib/validation/common";
import { logAudit } from "@/lib/audit";
import { validarMatriz } from "@/lib/companyHierarchyDb";
import { rotuloDoDocumento } from "@/lib/companyTaxId";
import { camposDoRegime } from "@/lib/taxRegime";
import { ASSINATURA_SOMENTE_LEITURA, papelExclui } from "@/lib/exclusao/comum";
import { SO_ADMIN_EXCLUI } from "@/lib/auth/papeis";
import { excluirEmpresasEmMassa as excluirEmpresasEmMassaDeVez } from "@/lib/exclusao/empresa";
import type { ResultadoEmMassa } from "@/lib/exclusao/tipos";

export type EmpresaState = { error: string } | null;

function companyData(form: FormData) {
  return {
    name:                  (form.get("name") as string)?.trim(),
    tradeName:             pick(form, "tradeName"),
    displayName:           pick(form, "displayName"),
    kind:                  lerKind(form),
    cnpj:                  digitsOnly(pick(form, "cnpj")),
    cpf:                   digitsOnly(pick(form, "cpf")),
    // O texto e os quatro campos derivados dele (regime, sem movimento,
    // funcionários, pró-labore) — nunca um sem os outros.
    ...camposDoRegime(pick(form, "taxRegime")),
    externalId:            pick(form, "externalId"),
    foundationDate:        pickDate(form, "foundationDate"),
    cnaePrincipal:         pick(form, "cnaePrincipal"),
    cnaeSecundarios:       pick(form, "cnaeSecundarios"),
    zipCode:               pick(form, "zipCode"),
    addressStreet:         pick(form, "addressStreet"),
    addressNumber:         pick(form, "addressNumber"),
    addressComplement:     pick(form, "addressComplement"),
    neighborhood:          pick(form, "neighborhood"),
    city:                  pick(form, "city"),
    stateCode:             pick(form, "stateCode"),
    stateRegistration:     pick(form, "stateRegistration"),
    municipalRegistration: pick(form, "municipalRegistration"),
    nire:                  pick(form, "nire"),
    email:                 pick(form, "email"),
    phone:                 pick(form, "phone"),
    website:               pick(form, "website"),
    status:                (form.get("status") as CompanyStatus) ?? CompanyStatus.PROSPECT,
    source:                pick(form, "source"),
    parentCompanyId:       pick(form, "parentCompanyId"),
  };
}

// PJ é o default: formulário antigo, importador e qualquer chamada que não
// mande o campo continuam cadastrando pessoa jurídica, que é o que sempre
// foram.
function lerKind(form: FormData): CompanyKind {
  return (form.get("kind") as string) === CompanyKind.PESSOA_FISICA
    ? CompanyKind.PESSOA_FISICA
    : CompanyKind.PESSOA_JURIDICA;
}

/**
 * Valida nome e o documento que corresponde ao tipo do cadastro.
 *
 * O unique `(tenantId, cnpj)` e o `(tenantId, cpf)` existem no banco desde
 * 02/09 e 03/09 — esta checagem não está no lugar deles, está antes: a
 * constraint devolveria P2002, e a tela precisa de uma frase que diga qual
 * campo repetiu.
 *
 * Cada tipo olha só o seu documento. O outro é zerado em `normalizarDocumento`
 * antes de gravar, para que um cadastro trocado de PJ para PF não deixe um CNPJ
 * órfão ocupando o índice único.
 */
async function validateCompany(
  data: ReturnType<typeof companyData>,
  tenantId: string,
  ignoreId?: string
): Promise<string | null> {
  const ehPF = data.kind === CompanyKind.PESSOA_FISICA;
  if (!data.name) return ehPF ? "O nome é obrigatório." : "A razão social é obrigatória.";

  const documento = ehPF ? data.cpf : data.cnpj;
  const rotulo = rotuloDoDocumento(data.kind);

  if (documento) {
    const valido = ehPF ? isValidCPF(documento) : isValidCNPJ(documento);
    if (!valido) return `${rotulo} inválido.`;

    const prisma = getPrisma();
    const dup = await prisma.company.findFirst({
      where: {
        tenantId,
        ...(ehPF ? { cpf: documento } : { cnpj: documento }),
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (dup) return `Já existe um cadastro com este ${rotulo}.`;
  }
  return null;
}

/**
 * Zera o documento que não pertence ao tipo escolhido.
 *
 * Sem isto, trocar um cadastro de PJ para PF guardaria o CNPJ antigo numa linha
 * marcada como pessoa física: ela não seria casável por ele (ver
 * `documentoDaEmpresa`), mas continuaria ocupando o par único `(tenant, CNPJ)` e
 * impediria o cadastro legítimo daquele CNPJ por outra empresa.
 */
function normalizarDocumento<T extends { kind: CompanyKind; cnpj: string | null; cpf: string | null }>(data: T): T {
  return data.kind === CompanyKind.PESSOA_FISICA
    ? { ...data, cnpj: null }
    : { ...data, cpf: null };
}

export async function criarEmpresa(
  _prev: EmpresaState,
  form: FormData
): Promise<EmpresaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWriteEntity(ctx)) return { error: "Sem permissão para criar empresas." };

  const data = normalizarDocumento(companyData(form));
  const validationError = await validateCompany(data, ctx.tenantId);
  if (validationError) return { error: validationError };

  const matrizError = await validarMatriz(ctx.tenantId, null, data.parentCompanyId);
  if (matrizError) return { error: matrizError };

  const prisma = getPrisma();
  let id: string;

  try {
    const company = await prisma.company.create({
      data: { tenantId: ctx.tenantId, ...data },
    });
    id = company.id;
  } catch (err) {
    console.error("[criarEmpresa]", err);
    return { error: "Erro ao criar empresa. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "company.create",
    entityType: "Company",
    entityId: id,
    metadata: { name: data.name },
  });

  redirect(`/empresas/${id}`);
}

export async function atualizarEmpresa(
  _prev: EmpresaState,
  form: FormData
): Promise<EmpresaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWriteEntity(ctx)) return { error: "Sem permissão para editar empresas." };

  const id = form.get("id") as string;
  const data = normalizarDocumento(companyData(form));
  const validationError = await validateCompany(data, ctx.tenantId, id);
  if (validationError) return { error: validationError };

  const prisma = getPrisma();

  const existing = await prisma.company.findFirst({
    where: { id, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true },
  });
  if (!existing) return { error: "Empresa não encontrada ou fora do seu escopo." };

  const matrizError = await validarMatriz(ctx.tenantId, id, data.parentCompanyId);
  if (matrizError) return { error: matrizError };

  // O Cliente saiu do cadastro em 15/10/2026 (etapa 3): a edição não mexe mais
  // na coluna antiga, que fica como está até sair do banco.
  try {
    await prisma.company.update({
      where: { id },
      data,
    });
  } catch (err) {
    console.error("[atualizarEmpresa]", err);
    return { error: "Erro ao atualizar empresa." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "company.update",
    entityType: "Company",
    entityId: id,
    metadata: { name: data.name },
  });

  const companySectors = await getCompanySectors(ctx.tenantId, id);
  const applicableFields = await getApplicableCustomFields(ctx, "COMPANY", id, companySectors);
  await saveCustomFieldValues(ctx.tenantId, id, applicableFields, form);

  revalidatePath(`/empresas/${id}`);
  redirect(`/empresas/${id}`);
}

// A exclusão de uma empresa saiu daqui em 13/10/2026: é o diálogo
// ExcluirCadastro (src/components/exclusao), com a prévia do que está ligado,
// pelas ações de src/app/(app)/exclusao-actions.ts. Só administrador exclui.

export async function atualizarStatusEmMassa(ids: string[], status: CompanyStatus): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWriteEntity(ctx) || ids.length === 0) return;

  const prisma = getPrisma();
  await prisma.company.updateMany({
    where: { id: { in: ids }, ...(await scopedCompanyWhere(ctx)) },
    data: { status },
  });

  revalidatePath("/empresas");
}

/**
 * Exclusão em massa — só o modo simples (13/10/2026): sai a empresa sem
 * histórico; a com histórico fica, e o resultado diz qual e por quê. Era um
 * `deleteMany` que a tela disparava sem esperar: uma empresa com histórico
 * derrubava o lote inteiro em silêncio.
 *
 * Administrador (ADMIN ou SUPER_ADMIN), como toda exclusão; antes era só
 * Super Admin.
 */
export async function excluirEmpresasEmMassa(ids: string[]): Promise<ResultadoEmMassa | { erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { erro: "Não autenticado." };
  if (!papelExclui(ctx.role)) return { erro: SO_ADMIN_EXCLUI };
  if (ctx.subscriptionReadOnly) return { erro: ASSINATURA_SOMENTE_LEITURA };
  if (!Array.isArray(ids)) return { erro: "Pedido inválido." };

  const resultado = await excluirEmpresasEmMassaDeVez(getPrisma(), {
    tenantId: ctx.tenantId,
    ator: { id: ctx.userId, role: ctx.role },
    ids,
  });
  // Aqui a tela é a própria lista: atualizar é o que se quer.
  if ("excluidas" in resultado && resultado.excluidas.length > 0) revalidatePath("/empresas");
  return resultado;
}

export type ServiceState = { error: string } | null;

// Adiciona um serviço (setor) contratado pela empresa. Gate por canManageSector
// — só quem gerencia aquele setor pode marcar a empresa como cliente dele.
export async function adicionarServico(
  companyId: string,
  sectorCode: string
): Promise<ServiceState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canManageSector(ctx, sectorCode)) {
    return { error: "Sem permissão para adicionar este setor." };
  }

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true },
  });
  if (!company) return { error: "Empresa não encontrada ou fora do seu escopo." };

  try {
    await prisma.companyService.create({
      data: { tenantId: ctx.tenantId, companyId, sectorCode },
    });
  } catch (err) {
    console.error("[adicionarServico]", err);
    return { error: "Erro ao adicionar setor. Ele já pode estar cadastrado." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "companyservice.create",
    entityType: "CompanyService",
    entityId: companyId,
    metadata: { sectorCode },
  });

  revalidatePath(`/empresas/${companyId}`);
  return null;
}

// Define (ou remove) o responsável de um serviço/setor já contratado pela
// empresa — a "tag" no vocabulário do Acessorias, referenciado por você.
export async function atribuirResponsavelServico(
  serviceId: string,
  userId: string | null
): Promise<ServiceState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const service = await prisma.companyService.findFirst({ where: { id: serviceId, tenantId: ctx.tenantId } });
  if (!service) return { error: "Serviço não encontrado." };
  if (!canManageSector(ctx, service.sectorCode)) {
    return { error: "Sem permissão para atribuir responsável neste setor." };
  }

  if (userId) {
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId: ctx.tenantId, active: true } });
    if (!user) return { error: "Usuário inválido." };
  }

  try {
    await prisma.companyService.update({ where: { id: serviceId }, data: { responsibleUserId: userId } });
  } catch (err) {
    console.error("[atribuirResponsavelServico]", err);
    return { error: "Erro ao atribuir responsável." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "companyservice.assign",
    entityType: "CompanyService",
    entityId: serviceId,
    metadata: { sectorCode: service.sectorCode, responsibleUserId: userId },
  });

  revalidatePath(`/empresas/${service.companyId}`);
  return null;
}
