"use server";

// Emitir NFS-e pelo Omie (Fase 2, 13/10/2026): as listas do Omie para o
// formulário, o pedido da nota e o cancelamento.
//
// As três pedem o mesmo nível — administrador do setor que opera o módulo (ver
// `acessoAEmissao`). Até as listas: ler o Omie de cada empresa gasta o limite
// da conta, e só quem emite precisa delas.

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import { competenciaDoInstante } from "@/lib/financeiro/periodo";
import { acessoAEmissao, MODULO_EMITIR_NFSE } from "@/lib/integracoes/omie/acessoEmissao";
import { validarPedido } from "@/lib/integracoes/omie/emissao";
import { cancelarEmissao, emitirNfse, listasParaEmitir, type ListasParaATela } from "@/lib/integracoes/omie/emissaoServidor";
import type { EstadoDaEmissao } from "@/lib/integracoes/omie/emissao";

const SEM_PERMISSAO = "Só o administrador do setor emite e cancela NFS-e.";

async function emissor(): Promise<{ ok: true; tenantId: string; userId: string } | { ok: false; erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { ok: false, erro: "Não autenticado." };
  const [setor, ligado] = await Promise.all([setorDoModulo(ctx.tenantId, MODULO_EMITIR_NFSE), isModuleEnabled(ctx.tenantId, MODULO_EMITIR_NFSE)]);
  const acesso = acessoAEmissao(ctx, setor ?? getModuleDef(MODULO_EMITIR_NFSE)!.sectorCode, ligado);
  if (!acesso.emitir) return { ok: false, erro: ligado ? SEM_PERMISSAO : "O módulo Emitir NFS-e não está ligado." };
  return { ok: true, tenantId: ctx.tenantId, userId: ctx.userId };
}

function revalidar() {
  revalidatePath("/emitir-nfse");
  revalidatePath("/documentos-fiscais");
}

/** Tomadores e serviços do Omie da empresa, e se ela pode emitir por esta conta. Só leitura no Omie. */
export async function carregarListasAction(
  companyId: string,
  atualizar: boolean
): Promise<{ ok: true; listas: ListasParaATela } | { ok: false; erro: string }> {
  const e = await emissor();
  if (!e.ok) return e;
  if (!companyId) return { ok: false, erro: "Escolha a empresa." };
  return listasParaEmitir(e.tenantId, companyId, atualizar);
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
  const e = await emissor();
  if (!e.ok) return e;
  if (!dados.companyId) return { ok: false, erro: "Escolha a empresa." };
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

  const r = await emitirNfse({ tenantId: e.tenantId, companyId: dados.companyId, userId: e.userId, pedido: v.pedido });
  if (!r.ok) return { ok: false, erro: r.erro };
  // O pedido e o desfecho do envio. O que a prefeitura responder depois fica na
  // própria emissão (o cron não tem pessoa para assinar o registro).
  await logAudit({
    tenantId: e.tenantId,
    userId: e.userId,
    action: "integration.omie.nfse_emitir",
    entityType: "OmieEmissao",
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
  const e = await emissor();
  if (!e.ok) return e;
  if (!emissaoId) return { ok: false, erro: "Emissão não encontrada." };
  const r = await cancelarEmissao({ tenantId: e.tenantId, emissaoId, userId: e.userId });
  // A tentativa recusada também fica no registro: cancelar nota é ato que se audita inteiro.
  await logAudit({
    tenantId: e.tenantId,
    userId: e.userId,
    action: "integration.omie.nfse_cancelar",
    entityType: "OmieEmissao",
    entityId: emissaoId,
    metadata: r.ok ? { ok: true, naPrefeitura: r.naPrefeitura } : { ok: false, erro: r.erro.slice(0, 300) },
  });
  if (!r.ok) return r;
  revalidar();
  return { ok: true, mensagem: r.mensagem };
}
