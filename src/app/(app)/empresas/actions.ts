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
import { isPrismaForeignKeyError } from "@/lib/prismaErrors";
import { isValidCNPJ, isValidCPF, digitsOnly } from "@/lib/validation/common";
import { logAudit } from "@/lib/audit";
import { cnpjRoot, lerEscolhaDeCliente } from "@/lib/clientGroups";
import { validarMatriz } from "@/lib/companyHierarchyDb";
import { rotuloDoDocumento } from "@/lib/companyTaxId";

export type EmpresaState = { error: string } | null;

function companyData(form: FormData) {
  return {
    name:                  (form.get("name") as string)?.trim(),
    tradeName:             pick(form, "tradeName"),
    displayName:           pick(form, "displayName"),
    kind:                  lerKind(form),
    cnpj:                  digitsOnly(pick(form, "cnpj")),
    cpf:                   digitsOnly(pick(form, "cpf")),
    taxRegime:             pick(form, "taxRegime"),
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
  if (!data.name) return ehPF ? "Nome é obrigatório." : "Razão Social é obrigatória.";

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

/**
 * Resolve o cliente escolhido no formulário para um `clientGroupId`, criando o
 * grupo quando o usuário pediu um novo. Devolve `null` quando não foi escolhido.
 *
 * **Opcional desde 2026-09-02**, revertendo a decisão de 01/09. O motivo:
 * obrigatório + criação automática 1:1 produziu 315 clientes que eram cópia do
 * nome da própria empresa — não agrupavam nada e enchiam a listagem de faixas
 * inúteis. Cliente passa a existir só quando de fato junta empresas de um mesmo
 * dono, que é para o que ele serve.
 *
 * A checagem de tenant não é cerimônia: `clientGroupId` chega do formulário,
 * ou seja, do cliente, e o Prisma não expressa "grupo e empresa do mesmo
 * tenant" como constraint (seria FK composta entre duas tabelas). Sem esta
 * consulta, um id de outro tenant faria a empresa atravessar a fronteira de
 * acesso.
 */
async function resolverClientGroupId(
  form: FormData,
  tenantId: string,
  cnpj: string | null
): Promise<{ clientGroupId: string | null } | { error: string }> {
  const escolha = lerEscolhaDeCliente(
    form.get("clientGroupId") as string | null,
    form.get("clientGroupNewName") as string | null
  );

  if (escolha.tipo === "ausente") return { clientGroupId: null };

  const prisma = getPrisma();

  if (escolha.tipo === "existente") {
    const grupo = await prisma.clientGroup.findFirst({
      where: { id: escolha.clientGroupId, tenantId },
      select: { id: true },
    });
    if (!grupo) return { error: "Cliente não encontrado." };
    return { clientGroupId: grupo.id };
  }

  // Grupo novo: guarda a raiz do CNPJ da empresa que o está criando. Se uma
  // filial da mesma raiz for cadastrada depois, o campo já diz a qual grupo ela
  // pertence — é dica de agrupamento, não identidade (holding tem raízes
  // diferentes e cliente pessoa física não tem nenhuma).
  const novo = await prisma.clientGroup.create({
    data: { tenantId, name: escolha.name, cnpjRoot: cnpjRoot(cnpj) },
    select: { id: true },
  });
  return { clientGroupId: novo.id };
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

  // Depois de validar a empresa: um cliente novo não deve ser criado se o
  // cadastro vai ser recusado por CNPJ inválido, duplicado ou matriz inválida.
  const cliente = await resolverClientGroupId(form, ctx.tenantId, data.cnpj);
  if ("error" in cliente) return { error: cliente.error };

  const prisma = getPrisma();
  let id: string;

  try {
    const company = await prisma.company.create({
      data: { tenantId: ctx.tenantId, ...data, clientGroupId: cliente.clientGroupId },
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

  const cliente = await resolverClientGroupId(form, ctx.tenantId, data.cnpj);
  if ("error" in cliente) return { error: cliente.error };

  try {
    await prisma.company.update({
      where: { id },
      data: { ...data, clientGroupId: cliente.clientGroupId },
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

export async function excluirEmpresa(id: string): Promise<EmpresaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWriteEntity(ctx)) return { error: "Sem permissão." };

  const prisma = getPrisma();

  const existing = await prisma.company.findFirst({
    where: { id, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!existing) return { error: "Empresa não encontrada ou fora do seu escopo." };

  try {
    await prisma.company.delete({ where: { id } });
  } catch (err) {
    if (isPrismaForeignKeyError(err)) {
      return {
        error:
          "Esta empresa tem registros vinculados (colaboradores, serviços, vagas, etc.) e não pode ser excluída.",
      };
    }
    console.error("[excluirEmpresa]", err);
    return { error: "Erro ao excluir empresa." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "company.delete",
    entityType: "Company",
    entityId: id,
    metadata: { name: existing.name },
  });

  revalidatePath("/empresas");
  redirect("/empresas");
}

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

// Exclusão em massa é mais restrita que a individual (canWrite) — só Super Admin.
export async function excluirEmpresasEmMassa(ids: string[]): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || ctx.role !== "SUPER_ADMIN" || ids.length === 0) return;

  const prisma = getPrisma();
  await prisma.company.deleteMany({
    where: { id: { in: ids }, ...(await scopedCompanyWhere(ctx)) },
  });

  revalidatePath("/empresas");
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
