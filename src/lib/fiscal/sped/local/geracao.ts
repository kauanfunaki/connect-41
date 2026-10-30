import "server-only";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { abrirMotor, atorDaSessao, estabelecimentosDaRaiz } from "@/lib/fiscal/motor/servidor";
import { ErroFiscal, carregarBase, json, montarPacote, prepararTelaLocal } from "./servidor";
import { obrigacaoSchema } from "./dominio";

const pedidoSchema = z.object({ obrigacao: obrigacaoSchema, tipo: z.enum(["0", "1"]), chave: z.string().uuid() });
export async function gerarComPacote(ctx: AuthContext, entrada: { empresa: string; competencia: string; revisao: number; dados: unknown }) {
  const pedido = pedidoSchema.parse(entrada.dados);
  const tela = await prepararTelaLocal({ empresa: entrada.empresa, competencia: entrada.competencia, obrigacao: pedido.obrigacao, escopo: pedido.obrigacao === "contribuicoes" ? "raiz" : "empresa" }, "gerar");
  const c = tela.contexto!;
  if (!c || c.companyId !== entrada.empresa) throw new ErroFiscal("A empresa em foco mudou. Confira a empresa antes de gerar.", 409);
  const motor = await abrirMotor(ctx.tenantId);
  if (!motor || !motor.escrita || !motor.raizes.includes(c.raiz)) throw new ErroFiscal("Configure a integração e o token de escrita em Administração › Integrações.");
  const saude = await motor.cliente.saude(c.raiz);
  if (!saude.capacidades?.includes("geracao_connect_v1")) throw new ErroFiscal("Este motor ainda não recebe a revisão do Connect. A adaptação está descrita no contrato para o Kauan.", 409);
  const ator = await atorDaSessao(ctx); if (!ator) throw new ErroFiscal("Sessão inválida.", 401);
  const mapa = await estabelecimentosDaRaiz(ctx.tenantId, c.raiz);
  const companyIdAlvo = pedido.obrigacao === "contribuicoes" ? tela.grupo.find(e => e.cnpj.slice(8, 12) === "0001")?.id : c.companyId;
  const estab = mapa.visiveis.find(e => e.companyId === companyIdAlvo);
  if (!estab) throw new ErroFiscal(pedido.obrigacao === "contribuicoes" ? "A matriz precisa estar autorizada no Connect e cadastrada no motor para gerar Contribuições." : "Cadastre este estabelecimento no motor antes de gerar.");
  const db = getPrisma();
  let revisao = await db.spedFiscalRevision.findUnique({ where: { tenantId_requestKey: { tenantId: ctx.tenantId, requestKey: pedido.chave } } });
  if (revisao && (revisao.companyId !== c.companyId || revisao.competence !== c.competencia || revisao.obligation !== pedido.obrigacao || (revisao.data as Record<string, unknown>).tipo_sped !== pedido.tipo)) throw new ErroFiscal("A chave já foi usada para outro pedido.", 409);
  if (!revisao) {
    const base = await carregarBase(tela);
    if (base.revisao !== entrada.revisao) throw new ErroFiscal("Os dados mudaram. Confira a revisão antes de gerar.", 409);
    const pacote = montarPacote(tela, base, pedido.obrigacao, pedido.tipo);
    revisao = await db.$transaction(async tx => {
      const lock = await tx.spedFiscalRoot.updateMany({ where: { tenantId: ctx.tenantId, raiz: c.raiz, revision: base.revisao }, data: { revision: { increment: 0 } } });
      if (!lock.count) throw new ErroFiscal("Os dados mudaram antes de congelar a revisão.", 409);
      const existente = await tx.spedFiscalRevision.findUnique({ where: { tenantId_requestKey: { tenantId: ctx.tenantId, requestKey: pedido.chave } } });
      if (existente) return existente;
      return tx.spedFiscalRevision.create({ data: { tenantId: ctx.tenantId, companyId: c.companyId, raiz: c.raiz, competence: c.competencia, obligation: pedido.obrigacao, revision: base.revisao, sha256: pacote.sha256, data: json(pacote.pacote), requestKey: pedido.chave, requestedBy: ctx.userId } });
    });
  }
  if (revisao.remoteExecutionId) return { execucaoId: revisao.remoteExecutionId, revisaoId: revisao.id };
  // Bytes canônicos são reconstruídos da ordem persistida no JSON MySQL (que pode reordenar chaves).
  const { serializarPacote } = await import("./pacote");
  const canonico = serializarPacote(revisao.data);
  if (canonico.sha256 !== revisao.sha256) throw new ErroFiscal("A integridade da revisão não confere.");
  const escrita = (sufixo: string) => ({ ator, chave: `c41:${revisao!.id}:${sufixo}` });
  if (!revisao.remotePackageId) {
    const upload = revisao.remoteUploadId
      ? await motor.cliente.obterUpload(c.raiz, revisao.remoteUploadId)
      : await motor.cliente.criarUploadDePacote(c.raiz, { nome: `connect-${revisao.id}.json`, tamanho: canonico.bytes.length, sha256: revisao.sha256 }, escrita("upload"));
    if (!revisao.remoteUploadId) await db.spedFiscalRevision.update({ where: { id: revisao.id, tenantId: ctx.tenantId }, data: { remoteUploadId: upload.id } });
    for (let i = 0; i < canonico.bytes.length; i += upload.tamanho_parte) {
      if (upload.partes_recebidas.includes(Math.floor(i / upload.tamanho_parte) + 1)) continue;
      const parte = canonico.bytes.slice(i, i + upload.tamanho_parte);
      await motor.cliente.enviarParteDoUpload(c.raiz, upload.id, Math.floor(i / upload.tamanho_parte) + 1, parte, { tamanho: parte.length }, escrita("parte"));
    }
    const pacote = await motor.cliente.concluirPacote(c.raiz, upload.id, revisao.sha256, escrita("concluir"));
    if (pacote.sha256 !== revisao.sha256) throw new ErroFiscal("O motor confirmou outro hash de pacote.");
    revisao = await db.spedFiscalRevision.update({ where: { id: revisao.id, tenantId: ctx.tenantId }, data: { remotePackageId: pacote.pacote_id } });
  }
  const execucao = await motor.cliente.criarExecucao(c.raiz, { acao: pedido.obrigacao === "icms_ipi" ? "sped" : "sped_contribuicoes", empresa_id: estab.id, competencia: c.competencia, tipo_sped: pedido.tipo, parametros: {}, confirmar_duplicado: false, pacote_id: revisao.remotePackageId! }, escrita("execucao"));
  if (execucao.pacote_id !== revisao.remotePackageId || execucao.sha256_connect !== revisao.sha256 || execucao.revisao_connect !== revisao.revision) throw new ErroFiscal("O motor não confirmou a revisão solicitada. Consulte o pedido antes de tentar novamente.", 409);
  await db.spedFiscalRevision.update({ where: { id: revisao.id, tenantId: ctx.tenantId }, data: { remoteExecutionId: execucao.id } });
  return { execucaoId: execucao.id, revisaoId: revisao.id };
}
