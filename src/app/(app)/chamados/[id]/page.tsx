import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { DetalheDoChamado } from "@/components/chamados/DetalheDoChamado";
import { contexto } from "@/lib/chamados/contexto";
import { detalhe, categorias, usuarios, strings, marcarChamadoVisto } from "@/lib/chamados/consultas";
import { podeGerenciarNo, podeOperarNo, podeRedirecionar, podeResponder, podeVerInternoNo } from "@/lib/chamados/acesso";
import { isFullWrite } from "@/lib/auth/papeis";
import { getActiveSectors } from "@/lib/sectors";
import { categoriaSchema } from "@/lib/chamados/regras";
import { podeNoModulo } from "@/lib/auth/modulo";
import { MODULO_OPS } from "@/lib/ops/regras";
import { abrirPeloEndereco } from "@/lib/enderecoCurtoServidor";
import { idCurto } from "@/lib/enderecoCurto";
import { feriadosDoEscritorio } from "@/lib/feriados";
import { addDaysToKey, saoPauloParts } from "@/lib/agenda";
import { MAXIMO_DE_DIAS_DO_TESTE, atalhosDoTeste, podeResponderTeste } from "@/lib/chamados/teste";

export const dynamic = "force-dynamic";
export default async function DetalhePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const c = await contexto().catch(() => null); if (!c) notFound();
  // O endereço curto (10/11/2026, pedido do Kauan): /chamados/chamado-45. O do
  // uuid passa para ele; quem confere se a pessoa vê o chamado é o `detalhe`.
  const { id } = await abrirPeloEndereco("chamado", c.ctx.tenantId, (await params).id, await searchParams);
  const t = await detalhe(c, id).catch(() => null); if (!t) notFound();
  // Abrir o chamado apaga o número dele no menu (06/11/2026). Falhar aqui não impede a tela.
  const [cats, users, setores, verOrquestrador] = await Promise.all([categorias(c, true), usuarios(c), getActiveSectors(c.ctx.tenantId), podeNoModulo(c.ctx, MODULO_OPS, "ver").catch(() => false), marcarChamadoVisto(c, t.id).catch(() => {})]);
  const alvo = { ...t, approverIds: strings(t.approverIds) };
  const operar = podeOperarNo(c.ctx, c.config, t.handlingSectorCode);
  // O prazo do teste (26/11/2026, funcionalidade-853): os atalhos em dias úteis
  // já com a data, contando os feriados do escritório. Só para quem atende.
  const hoje = saoPauloParts(new Date()).dateKey;
  const feriados = operar ? await feriadosDoEscritorio(c.ctx.tenantId).then(m => new Set(m.keys())).catch(() => new Set<string>()) : new Set<string>();
  const prazosDoTeste = operar ? { atalhos: atalhosDoTeste(hoje, feriados), hoje, maximo: addDaysToKey(hoje, MAXIMO_DE_DIAS_DO_TESTE) } : null;
  const responderTeste = podeResponderTeste({ userId: c.ctx.userId, role: c.ctx.role, somenteLeitura: c.ctx.subscriptionReadOnly }, t);
  // O cabeçalho (título, situação e ações) mora no DetalheDoChamado desde 18/11/2026 (melhoria-782):
  // o seletor de situação e o menu "…" dividem o estado da tela. A trilha fica no lugar do "Voltar".
  return <PageContainer><Breadcrumb items={[{ label: "Chamados", href: "/chamados" }, { label: idCurto("chamado", t.number) }]} /><DetalheDoChamado key={t.version} chamado={t} eu={c.ctx.userId} agora={new Date().toISOString()} usuarios={users.map(u => ({ id: u.id, name: u.name, atendente: u.role !== "READONLY" && u.sectors.some(s => s.sectorCode === t.handlingSectorCode) }))} categorias={cats.map(cat => ({ ...categoriaSchema.parse(cat), id: cat.id }))} setores={setores.map(s => ({ code: s.code, label: s.label }))} setoresQueAtendem={c.config.sectorCodes.map(code => ({ code, label: setores.find(s => s.code === code)?.label ?? code }))} prazosDoTeste={prazosDoTeste} permissoes={{ operar, responderTeste, gerenciar: podeGerenciarNo(c.ctx, c.config, t.handlingSectorCode), interno: podeVerInternoNo(c.ctx, c.config, t.handlingSectorCode), redirecionar: podeRedirecionar(c.ctx, c.config, t.handlingSectorCode), responder: podeResponder(c.ctx, c.config, alvo, t.status, false), aprovar: t.createdById !== c.ctx.userId && !c.ctx.subscriptionReadOnly && c.ctx.role !== "READONLY" && (isFullWrite(c.ctx.role) || alvo.approverIds.includes(c.ctx.userId)), escrever: !c.ctx.subscriptionReadOnly && c.ctx.role !== "READONLY", verOrquestrador, reclassificar: isFullWrite(c.ctx.role) }} /></PageContainer>;
}
