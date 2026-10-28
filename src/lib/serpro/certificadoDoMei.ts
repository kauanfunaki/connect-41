// O certificado da condição de MEI (CCMEI) pela ficha da empresa (Societário,
// 28/10/2026): uma emissão, cobrada, que não pede Autorização de Acesso. O
// PDF vai para a pasta Societário da empresa, que não é do portal: para o
// cliente, "Enviar ao cliente" a partir dos Arquivos.

import { logAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { hojeIso } from "@/lib/datas/calendario";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { nomeExibicao } from "@/lib/companyName";
import { guardarArquivo } from "@/lib/drive/servidor";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { chamarSerpro, configuracaoDoSerpro, prontidaoDoSerpro, SO_EXEMPLOS_NA_DEMONSTRACAO } from "./cliente";
import { pastaDoModeloDaEmpresa } from "./situacaoFiscal";
import { CERTIFICADO_DO_MEI, lerCertificadoDoMei, pedidoDoServico } from "./servicos";
import type { Transporte } from "./transporte";

/** "Certificado MEI - Empresa - 2026-10-28.pdf". */
export function nomeDoCertificadoDoMei(empresa: string, dia: string): string {
  const limpo = empresa.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return `Certificado MEI - ${limpo} - ${dia}.pdf`;
}

export type ResultadoDoCertificado = { ok: true; texto: string; arquivoId: string } | { ok: false; erro: string };

export async function emitirCertificadoDoMei(
  tenantId: string,
  userId: string,
  companyId: string,
  opcoes: { transporte?: Transporte; hoje?: string } = {}
): Promise<ResultadoDoCertificado> {
  const cfg = await configuracaoDoSerpro(tenantId);
  const pronta = prontidaoDoSerpro(cfg);
  if (!pronta.pronta) return { ok: false, erro: pronta.motivo };
  if (cfg!.ambiente === "demonstracao") return { ok: false, erro: SO_EXEMPLOS_NA_DEMONSTRACAO };

  const empresa = await getPrisma().company.findFirst({
    where: { id: companyId, tenantId },
    select: { kind: true, cnpj: true, cpf: true, name: true, displayName: true, taxRegimeKind: true },
  });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };
  if (empresa.taxRegimeKind !== "MEI") return { ok: false, erro: "O certificado de MEI é só de empresa cadastrada no regime MEI." };
  const doc = documentoDaEmpresa(empresa);
  if (!doc || doc.digitos.length !== 14) return { ok: false, erro: "A empresa não tem CNPJ válido no cadastro." };

  // Sem onde guardar, a emissão (cobrada) não sai.
  if (!(await isModuleEnabled(tenantId, MODULO_ARQUIVOS))) return { ok: false, erro: "O certificado vai para a pasta Societário da empresa, e os Arquivos estão desligados." };
  const pasta = await pastaDoModeloDaEmpresa(tenantId, companyId, "societario");
  if (!pasta) return { ok: false, erro: "A empresa não tem a pasta Societário nos Arquivos (ela vem do modelo de pastas do escritório)." };

  const r = await chamarSerpro(tenantId, pedidoDoServico(CERTIFICADO_DO_MEI, doc.digitos, null), { userId, origem: "ccmei", transporte: opcoes.transporte });
  if (!r.ok) return { ok: false, erro: r.erro };
  const lido = lerCertificadoDoMei(r.resposta);
  if (!lido.ok) return lido;

  const guardado = await guardarArquivo({
    tenantId,
    folderId: pasta,
    arquivo: new File([Buffer.from(lido.dados.pdf, "base64")], nomeDoCertificadoDoMei(nomeExibicao(empresa), opcoes.hoje ?? hojeIso()), { type: "application/pdf" }),
    uploadedByUserId: userId,
  });
  await logAudit({
    tenantId,
    userId,
    action: "autorizacoes.serpro_ccmei",
    entityType: "Company",
    entityId: companyId,
    metadata: { servico: CERTIFICADO_DO_MEI.idServico, arquivo: guardado.ok ? guardado.arquivoId : null },
  });
  // A emissão já foi paga: o motivo fica, para alguém resolver a pasta e emitir de novo.
  if (!guardado.ok) return { ok: false, erro: `O certificado veio do Serpro, mas não foi guardado nos Arquivos: ${guardado.erro}` };
  return { ok: true, texto: "Certificado de MEI emitido. Está em Arquivos › Societário.", arquivoId: guardado.arquivoId };
}
