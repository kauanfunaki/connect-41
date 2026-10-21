"use server";

// "Ler boleto" no Novo lançamento (19/10, lote H2). Manda o PDF à IA, confere o
// que voltou (`lerRespostaDoBoleto`) e devolve o que preenche a tela. Não grava
// nada: quem grava é o "Lançar", depois que a pessoa conferiu — e o PDF entra
// como anexo da conta junto com ele.

import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { gerarEstruturado } from "@/lib/ai";
import { saoPauloParts } from "@/lib/agenda";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { nomeExibicao } from "@/lib/companyName";
import { AGENTE_DO_BOLETO, SCHEMA_DO_BOLETO, SISTEMA_DO_BOLETO, lerRespostaDoBoleto, type LeituraDoBoleto } from "./leituraDoBoleto";
import { TAMANHO_MAXIMO_DO_ANEXO } from "./pendencias/anexo";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";

const MODULE = "bpo_lancamentos";

export type ResultadoDaLeituraDoBoleto =
  | { error: string }
  | {
      ok: true;
      leitura: LeituraDoBoleto;
      /** A execução da IA — volta no "Lançar" para a auditoria ligar a conta à leitura. */
      runId: string | null;
      /** O fornecedor já cadastrado nesta empresa com o CNPJ lido. */
      contraparte: { id: string; nome: string } | null;
    };

function mensagemDeErroDaIa(err: unknown): string {
  const m = err instanceof Error ? err.message : "";
  if (/desligad/i.test(m)) return "A leitura de boleto está desligada. Um administrador liga em Configurações › Inteligência artificial.";
  if (/chave|api key|configur/i.test(m)) return "O escritório não tem chave de IA configurada.";
  if (/teto|limite/i.test(m)) return "O teto de gasto da leitura de boleto no mês foi atingido.";
  return "A IA não conseguiu ler agora. Tente de novo em alguns minutos, ou lance à mão.";
}

export async function lerBoletoParaLancar(formData: FormData): Promise<ResultadoDaLeituraDoBoleto> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  if (!canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode)) return { error: "Sem permissão para lançar." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { error: "Módulo não habilitado." };

  const prisma = getPrisma();
  const companyId = String(formData.get("companyId") ?? "");
  const empresa = await prisma.company.findFirst({
    where: { id: companyId, tenantId: ctx.tenantId },
    select: { id: true, name: true, displayName: true, kind: true, cnpj: true, cpf: true },
  });
  if (!empresa) return { error: "Empresa não encontrada." };
  // Uma empresa por vez no BPO (21/10/2026): com foco, só lança nele — e não gasta a IA fora dele.
  const foraDoFoco = await recusaDoFoco(ctx, [empresa.id]);
  if (foraDoFoco) return { error: foraDoFoco };

  const arquivo = formData.get("boleto");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { error: "Escolha o PDF do boleto." };
  if (arquivo.size > TAMANHO_MAXIMO_DO_ANEXO) return { error: "O PDF passa de 10 MB." };
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  // O tipo pelos bytes, como no anexo: o nome e o tipo declarado são o que quem mandou disse.
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return { error: "O arquivo não é um PDF. A leitura aceita o boleto em PDF." };

  let valor: unknown;
  let runId: string | null;
  try {
    const r = await gerarEstruturado({
      tenantId: ctx.tenantId,
      agentCode: AGENTE_DO_BOLETO,
      sistema: SISTEMA_DO_BOLETO,
      texto: `Leia este documento de cobrança que a empresa ${nomeExibicao(empresa)} recebeu para pagar.`,
      pdfBase64: bytes.toString("base64"),
      nomeDoArquivo: arquivo.name.slice(0, 120) || "boleto.pdf",
      nome: "boleto",
      schema: SCHEMA_DO_BOLETO,
      maxTokens: 2048,
      contexto: { userId: ctx.userId, entityType: "empresa", entityId: empresa.id },
    });
    valor = r.valor;
    runId = r.runId;
  } catch (err) {
    console.error("[lerBoletoParaLancar]", err);
    return { error: mensagemDeErroDaIa(err) };
  }

  const leitura = lerRespostaDoBoleto(valor, saoPauloParts(new Date()).dateKey, documentoDaEmpresa(empresa)?.digitos ?? null);
  // Fornecedor inativo não está na lista da tela: fica como contraparte nova, e
  // o "Lançar" reaproveita a ficha pelo documento (`criarLancamentoManual`).
  const contraparte = leitura.documentoDoBeneficiario
    ? await prisma.financeCounterparty.findFirst({
        where: { tenantId: ctx.tenantId, companyId: empresa.id, document: leitura.documentoDoBeneficiario, active: true },
        select: { id: true, name: true },
      })
    : null;

  return { ok: true, leitura, runId, contraparte: contraparte ? { id: contraparte.id, nome: contraparte.name } : null };
}
