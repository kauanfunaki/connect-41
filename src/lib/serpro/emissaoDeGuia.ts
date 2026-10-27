// A emissão de uma guia federal pela ficha da empresa (Fase 2 enxuta do
// Integra Contador, 27/10/2026): confere tudo antes de gastar, chama o
// Serpro (o portão da autorização e o teto ficam no `chamarSerpro`) e guarda o
// PDF na pasta Guias da empresa. As regras de cada guia estão em ./guias.ts.
//
// A pasta Guias do modelo padrão é compartilhada com o portal: o cliente vê o
// PDF lá, sem aviso nenhum. Não há envio, rastreio nem guia como dado — isso é
// do "Guias pelo Connect", em standby (decisão do Kauan, 27/10/2026).

import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isModuleEnabled } from "@/lib/modules";
import { hojeIso } from "@/lib/datas/calendario";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { nomeExibicao } from "@/lib/companyName";
import { guardarArquivo } from "@/lib/drive/servidor";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { chamarSerpro, configuracaoDoSerpro, prontidaoDoSerpro, SO_EXEMPLOS_NA_DEMONSTRACAO } from "./cliente";
import { pastaDoModeloDaEmpresa } from "./situacaoFiscal";
import { lerGuiaEmitida, lerPedidoDeGuia, nomeDaGuia, pedidoDaGuia, ROTULO_DA_GUIA, resumoDaGuia, servicoDaGuia } from "./guias";
import type { Transporte } from "./transporte";

export type ResultadoDaGuia = { ok: true; texto: string; arquivoId: string } | { ok: false; erro: string };

export async function emitirGuia(
  tenantId: string,
  userId: string,
  companyId: string,
  bruto: Record<string, unknown>,
  opcoes: { transporte?: Transporte; hoje?: string } = {}
): Promise<ResultadoDaGuia> {
  const hoje = opcoes.hoje ?? hojeIso();
  const lido = lerPedidoDeGuia(bruto, hoje);
  if (!lido.ok) return lido;
  const p = lido.pedido;

  const cfg = await configuracaoDoSerpro(tenantId);
  const pronta = prontidaoDoSerpro(cfg);
  if (!pronta.pronta) return { ok: false, erro: pronta.motivo };
  if (cfg!.ambiente === "demonstracao") return { ok: false, erro: SO_EXEMPLOS_NA_DEMONSTRACAO };

  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { kind: true, cnpj: true, cpf: true, name: true, displayName: true } });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };
  const doc = documentoDaEmpresa(empresa);
  if (!doc) return { ok: false, erro: "A empresa não tem CNPJ ou CPF válido no cadastro." };
  if (doc.digitos.length !== 14 && p.tipo !== "DCTFWEB" && p.tipo !== "DARF") {
    return { ok: false, erro: `${ROTULO_DA_GUIA[p.tipo]} é de CNPJ, e esta empresa está cadastrada com CPF.` };
  }

  // Sem onde guardar, a emissão (cobrada) não sai.
  if (!(await isModuleEnabled(tenantId, MODULO_ARQUIVOS))) return { ok: false, erro: "A guia vai para a pasta Guias da empresa, e os Arquivos estão desligados." };
  const pasta = await pastaDoModeloDaEmpresa(tenantId, companyId, "guias");
  if (!pasta) return { ok: false, erro: "A empresa não tem a pasta Guias nos Arquivos (ela vem do modelo de pastas do escritório)." };

  const r = await chamarSerpro(tenantId, pedidoDaGuia(p, doc.digitos), { userId, origem: "guias", transporte: opcoes.transporte });
  if (!r.ok) return { ok: false, erro: r.erro };
  const guia = lerGuiaEmitida(p, r.resposta);
  if (!guia.ok) return { ok: false, erro: guia.erro };

  const nome = nomeDaGuia(p, nomeExibicao(empresa));
  const guardado = await guardarArquivo({
    tenantId,
    folderId: pasta,
    arquivo: new File([Buffer.from(guia.dados.pdf, "base64")], nome, { type: "application/pdf" }),
    uploadedByUserId: userId,
  });
  const servico = servicoDaGuia(p);
  await logAudit({
    tenantId,
    userId,
    action: "autorizacoes.serpro_guia",
    entityType: "Company",
    entityId: companyId,
    metadata: { guia: p.tipo, servico: servico.idServico, arquivo: guardado.ok ? guardado.arquivoId : null },
  });
  // A emissão já foi paga: o motivo fica, para alguém resolver a pasta e emitir de novo.
  if (!guardado.ok) return { ok: false, erro: `A guia veio do Serpro, mas não foi guardada nos Arquivos: ${guardado.erro}` };
  return { ok: true, texto: `${resumoDaGuia(p, guia.dados)}. Está em Arquivos › Guias.`, arquivoId: guardado.arquivoId };
}
