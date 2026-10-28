"use server";

// Emitir NFS-e (Fase 2, 13/10/2026): as listas para o formulário, o pedido da
// nota e o cancelamento. Quem atende a empresa — hoje o Omie — sai de
// `emissorDaEmpresa` (lote 2, 28/10/2026); daqui não se fala com emissor
// nenhum diretamente.
//
// As três pedem o mesmo nível — administrador do setor que opera o módulo (ver
// `acessoAEmissao`). Até as listas: ler o Omie de cada empresa gasta o limite
// da conta, e só quem emite precisa delas.

import { revalidatePath } from "next/cache";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import { competenciaDoInstante } from "@/lib/financeiro/periodo";
import { acessoAEmissao, MODULO_EMITIR_NFSE } from "@/lib/integracoes/omie/acessoEmissao";
import { validarPedido } from "@/lib/integracoes/omie/emissao";
import { emissorDaEmissao, emissorDaEmpresa, SEM_EMISSOR } from "@/lib/fiscal/nfse/emissores";
import type { EstadoDaEmissao, ProvedorDeNfse, ResultadoDaBusca, ResultadoDasListas } from "@/lib/fiscal/nfse/emissor";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";

const SEM_PERMISSAO = "Só o administrador do setor emite e cancela NFS-e.";

// As ações do AuditLog por emissor, escritas por extenso: o catálogo da
// auditoria (`acoes.test.ts`) lê os códigos daqui, e emissor novo sem frase lá
// quebra o teste.
const ACAO_DE_EMITIR: Record<ProvedorDeNfse, string> = { omie: "integration.omie.nfse_emitir" };
const ACAO_DE_CANCELAR: Record<ProvedorDeNfse, string> = { omie: "integration.omie.nfse_cancelar" };

async function quemEmite(): Promise<{ ok: true; ctx: AuthContext; tenantId: string; userId: string } | { ok: false; erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { ok: false, erro: "Não autenticado." };
  const [setor, ligado] = await Promise.all([setoresDoModulo(ctx.tenantId, MODULO_EMITIR_NFSE), isModuleEnabled(ctx.tenantId, MODULO_EMITIR_NFSE)]);
  const acesso = acessoAEmissao(ctx, setor ?? getModuleDef(MODULO_EMITIR_NFSE)!.sectorCode, ligado);
  if (!acesso.emitir) return { ok: false, erro: ligado ? SEM_PERMISSAO : "O módulo Emitir NFS-e não está ligado." };
  return { ok: true, ctx, tenantId: ctx.tenantId, userId: ctx.userId };
}

function revalidar() {
  revalidatePath("/emitir-nfse");
  revalidatePath("/documentos-fiscais");
}

/** Tomadores e serviços do emissor da empresa, e se ela pode emitir por ele. Só leitura. */
export async function carregarListasAction(companyId: string, atualizar: boolean): Promise<ResultadoDasListas> {
  const e = await quemEmite();
  if (!e.ok) return e;
  if (!companyId) return { ok: false, erro: "Escolha a empresa." };
  const emissor = await emissorDaEmpresa(e.tenantId, companyId);
  if (!emissor) return { ok: false, erro: SEM_EMISSOR };
  return emissor.listas(e.tenantId, companyId, atualizar);
}

/** O tomador que ficou fora da lista (ela para em 1.000), buscado no cadastro do emissor. Só leitura. */
export async function buscarTomadoresAction(companyId: string, termo: string): Promise<ResultadoDaBusca> {
  const e = await quemEmite();
  if (!e.ok) return e;
  if (!companyId) return { ok: false, erro: "Escolha a empresa." };
  const emissor = await emissorDaEmpresa(e.tenantId, companyId);
  if (!emissor) return { ok: false, erro: SEM_EMISSOR };
  return emissor.buscarTomadores(e.tenantId, companyId, termo);
}

export type DadosDoPedido = {
  companyId: string;
  tomadorCodigo: string;
  servicoCodigo: string;
  /** Como a pessoa digitou: "1.234,56". */
  valor: string;
  competencia: string;
  descricao: string;
  /** A categoria no Omie (`cCodCateg`) — obrigatória. */
  categoria: string;
  /** Opcionais: só para o serviço sem código municipal nem LC 116 no cadastro. */
  codigoServicoMunicipal: string;
  codigoLC116: string;
  /** A caixa "isto emite uma nota de verdade" marcada — conferida aqui também. */
  confirmado: boolean;
};

export async function emitirNfseAction(
  dados: DadosDoPedido
): Promise<{ ok: true; estado: EstadoDaEmissao; mensagem: string | null } | { ok: false; erro: string }> {
  const e = await quemEmite();
  if (!e.ok) return e;
  if (!dados.companyId) return { ok: false, erro: "Escolha a empresa." };
  // Uma empresa por vez no BPO (21/10/2026): com foco, só grava nele.
  const foraDoFoco = await recusaDoFoco(e.ctx, [dados.companyId]);
  if (foraDoFoco) return { ok: false, erro: foraDoFoco };
  if (dados.confirmado !== true) return { ok: false, erro: "Confirme que esta é uma nota de verdade antes de emitir." };

  const v = validarPedido(
    {
      tomadorCodigo: dados.tomadorCodigo,
      servicoCodigo: dados.servicoCodigo,
      valorCentavos: centavosDeTexto(dados.valor),
      competencia: dados.competencia,
      descricao: dados.descricao ?? "",
      categoria: dados.categoria ?? "",
      codigoServicoMunicipal: dados.codigoServicoMunicipal ?? "",
      codigoLC116: dados.codigoLC116 ?? "",
    },
    competenciaDoInstante(new Date())
  );
  if (!v.ok) return { ok: false, erro: v.erro };

  const emissor = await emissorDaEmpresa(e.tenantId, dados.companyId);
  if (!emissor) return { ok: false, erro: SEM_EMISSOR };
  const r = await emissor.emitir({ tenantId: e.tenantId, companyId: dados.companyId, userId: e.userId, pedido: v.pedido });
  if (!r.ok) return { ok: false, erro: r.erro };
  // O pedido e o desfecho do envio. O que a prefeitura responder depois fica na
  // própria emissão (o cron não tem pessoa para assinar o registro).
  await logAudit({
    tenantId: e.tenantId,
    userId: e.userId,
    action: ACAO_DE_EMITIR[emissor.provedor],
    entityType: emissor.entidade,
    entityId: r.emissaoId,
    metadata: {
      companyId: dados.companyId,
      tomadorCodigoOmie: v.pedido.tomadorCodigo,
      servicoCodigoOmie: v.pedido.servicoCodigo,
      valorCentavos: v.pedido.valorCentavos,
      competencia: v.pedido.competencia,
      // A emissão não tem coluna para estes: o registro é onde ficam.
      categoria: v.pedido.categoria,
      codigoServicoMunicipal: v.pedido.codigoServicoMunicipal,
      codigoLC116: v.pedido.codigoLC116,
      estado: r.estado,
    },
  });
  revalidar();
  return { ok: true, estado: r.estado, mensagem: r.mensagem };
}

export async function cancelarEmissaoAction(emissaoId: string): Promise<{ ok: true; mensagem: string | null } | { ok: false; erro: string }> {
  const e = await quemEmite();
  if (!e.ok) return e;
  if (!emissaoId) return { ok: false, erro: "Emissão não encontrada." };
  // Cancela pelo mesmo emissor que emitiu, e não pelo que atende a empresa hoje.
  const dona = await emissorDaEmissao(e.tenantId, emissaoId);
  if (!dona) return { ok: false, erro: "Emissão não encontrada." };
  // Uma empresa por vez no BPO (21/10/2026): com foco, só cancela nota dele.
  const foraDoFoco = await recusaDoFoco(e.ctx, [dona.companyId]);
  if (foraDoFoco) return { ok: false, erro: foraDoFoco };
  const r = await dona.emissor.cancelar({ tenantId: e.tenantId, emissaoId, userId: e.userId });
  // A tentativa recusada também fica no registro: cancelar nota é ato que se audita inteiro.
  await logAudit({
    tenantId: e.tenantId,
    userId: e.userId,
    action: ACAO_DE_CANCELAR[dona.emissor.provedor],
    entityType: dona.emissor.entidade,
    entityId: emissaoId,
    metadata: r.ok ? { ok: true, naPrefeitura: r.naPrefeitura } : { ok: false, erro: r.erro.slice(0, 300) },
  });
  if (!r.ok) return r;
  revalidar();
  return { ok: true, mensagem: r.mensagem };
}
