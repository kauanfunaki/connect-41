"use server";

import { getAuthContext, podeExcluir } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { getPrisma } from "@/lib/prisma";
import { executarAcao } from "@/lib/fiscal/previa/cenario";
import { lerEstadoFiscalLocal, type EstadoFiscalLocal } from "@/lib/fiscal/local/servidor";
import { acaoFiscalLocalSchema } from "@/lib/fiscal/local/entrada";
import { criarCenarioFiscalLocal } from "@/lib/fiscal/local/cenario";
import { geracao } from "@/lib/fiscal/previa/execucao";

type Resultado = { estado?: EstadoFiscalLocal; mensagem: string; erro?: boolean };
export async function agirNoFiscalLocal(entrada: unknown, revisao: number): Promise<Resultado> {
  const acao = acaoFiscalLocalSchema.safeParse(entrada);
  if (!acao.success || !Number.isSafeInteger(revisao) || revisao < 1) return { erro: true, mensagem: "Solicitação fiscal inválida." };
  const ctx = await getAuthContext();
  const estado = await lerEstadoFiscalLocal(ctx);
  if (!estado) return { erro: true, mensagem: "Cenário local indisponível." };
  if (estado.revisao !== revisao) return { estado, erro: true, mensagem: "Os dados foram atualizados em outra aba. Confira e repita a ação." };
  const tipo = acao.data.tipo;
  const modulo = ["parametros", "empresa", "regra"].includes(tipo) ? "fiscal_configuracoes"
    : ["importar", "recuperar"].includes(tipo) ? "fiscal_acervo"
    : tipo === "classificar" ? "fiscal_classificacao"
    : ["gerar", "validar", "entregar"].includes(tipo) ? "fiscal_entregas"
    : ["enfileirar", "solicitar-execucao", "iniciar-execucao", "concluir-execucao", "falhar-execucao", "processar", "cancelar", "reprocessar"].includes(tipo) ? "fiscal_operacao"
    : ["confrontar", "conciliar"].includes(tipo) ? "fiscal_conferencia"
    : "fiscal_contribuicoes";
  if (tipo !== "contexto" && tipo !== "favoritar" && tipo !== "restaurar") {
    const apuracao = ["apurar", "fechar", "ajuste", "remover-ajuste"].includes(tipo);
    const permitido = apuracao
      ? await podeNoModulo(ctx, "fiscal_icms_ipi", "agir") || await podeNoModulo(ctx, "fiscal_contribuicoes", "agir")
      : await podeNoModulo(ctx, modulo, ["parametros", "empresa", "regra"].includes(tipo) ? "gerir" : "agir");
    if (!permitido || (tipo === "remover-ajuste" && !podeExcluir(ctx))) return { erro: true, mensagem: "Seu perfil não permite esta ação." };
    if (modulo === "fiscal_operacao" && tipo !== "cancelar" && tipo !== "falhar-execucao") {
      const dados = acao.data;
      const execucao = "id" in dados ? estado.cenario.execucoes.find((e) => e.id === dados.id) : undefined;
      const parametros = dados.tipo === "solicitar-execucao" ? dados.parametros : execucao?.parametros;
      const destino = !parametros || geracao(parametros.modo) ? "fiscal_entregas" : "fiscal_acervo";
      if (!await podeNoModulo(ctx, destino, "agir")) return { erro: true, mensagem: "Seu perfil não permite produzir resultados nesta área fiscal." };
    }
  }
  let seguinte = estado;
  let mensagem: string;
  if (acao.data.tipo === "restaurar") {
    seguinte = { ...estado, cenario: criarCenarioFiscalLocal(), favoritas: [] };
    mensagem = "Dados de teste restaurados no banco local para este usuário e escritório.";
  } else if (acao.data.tipo === "favoritar") {
    const empresaId = acao.data.empresaId;
    if (!estado.cenario.empresas.some((e) => e.id === empresaId)) return { erro: true, mensagem: "Empresa indisponível." };
    seguinte = { ...estado, favoritas: estado.favoritas.includes(empresaId) ? estado.favoritas.filter((id) => id !== empresaId) : [...estado.favoritas, empresaId] };
    mensagem = "Favoritos atualizados.";
  } else {
    const resultado = executarAcao(estado.cenario, acao.data);
    if (resultado.erro) return { estado, erro: true, mensagem: resultado.mensagem };
    seguinte = { ...estado, cenario: resultado.cenario };
    mensagem = resultado.mensagem;
  }
  const gravado = await getPrisma().localFiscalScenario.updateMany({
    where: { tenantId: ctx.tenantId, userId: ctx.userId, revision: revisao },
    data: { data: seguinte.cenario, favorites: seguinte.favoritas, revision: { increment: 1 } },
  });
  if (gravado.count !== 1) return { estado: (await lerEstadoFiscalLocal(ctx)) ?? undefined, erro: true, mensagem: "Outra aba alterou os dados. Confira e repita a ação." };
  return { estado: { ...seguinte, revisao: revisao + 1 }, mensagem };
}
