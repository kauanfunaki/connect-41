import Link from "next/link";
import { Inbox, Megaphone, MessageSquareWarning, ShieldCheck, Handshake } from "lucide-react";
import { pendenciasAguardandoCliente } from "@/lib/financeiro/pendencias/consultas";
import { aprovacoesDoCliente } from "@/lib/financeiro/aprovacao/portal";
import { contagemDeCobrancaDoCliente, MODULO_DE_COBRANCA } from "@/lib/financeiro/cobranca/consultas";
import { solicitacoesAguardandoCliente } from "@/lib/solicitacoes/consultas";
import { comunicadosNaoLidos } from "@/lib/comunicados/consultas";
import { pedidosAoClienteNoConjunto } from "@/lib/financeiro/pendencias/setor";

/**
 * O que espera o cliente, no topo da home do portal: pendências a responder,
 * contas a aprovar e títulos a receber em cobrança. Some quando não há nada — faixa de "0 pendências" em toda
 * visita vira paisagem, e aí deixa de ser lida no dia em que tem 3.
 */
export async function AvisosDaHome({
  tenantId,
  companyIds,
  portalUserId,
  clientGroupId,
  modulos,
}: {
  tenantId: string;
  companyIds: string[];
  portalUserId: string;
  /** Para os comunicados, que vão para o cliente (grupo), e não para cada empresa. */
  clientGroupId?: string;
  modulos: Set<string>;
}) {
  const escopo = { tenantId, companyIds };
  const [comunicados, solicitacoes, pendencias, aprovacoes, emCobranca] = await Promise.all([
    modulos.has("portal_solicitacoes") && clientGroupId ? comunicadosNaoLidos(tenantId, clientGroupId, portalUserId) : Promise.resolve(0),
    modulos.has("portal_solicitacoes") ? solicitacoesAguardandoCliente(escopo) : Promise.resolve(0),
    pedidosAoClienteNoConjunto(modulos) ? pendenciasAguardandoCliente(escopo) : Promise.resolve(0),
    modulos.has("bpo_aprovacoes") ? aprovacoesDoCliente(escopo, portalUserId) : Promise.resolve(null),
    modulos.has(MODULO_DE_COBRANCA) ? contagemDeCobrancaDoCliente(escopo, new Date()) : Promise.resolve(0),
  ]);
  const aprovar = aprovacoes?.contas.filter((c) => c.dentroDoTeto).length ?? 0;
  if (comunicados === 0 && solicitacoes === 0 && pendencias === 0 && aprovar === 0 && emCobranca === 0) return null;

  // Raio, ícone de 16px e respiro de 16px até o bloco de baixo: os mesmos dos
  // cartões de total das outras telas do portal. Eram `rounded-md`, ícone de
  // 18px e 24px abaixo.
  const base = "flex items-center gap-3 rounded-lg border px-4 py-3 text-[13px] transition-colors";
  const cartao = `${base} border-warning/40 bg-warning-bg hover:border-warning`;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
      {/* Aviso, não pedido: tom da marca, e não o amarelo do que espera o cliente. */}
      {comunicados > 0 && (
        <Link href="/portal/comunicados" className={`${base} border-brand/40 bg-brand-subtle hover:border-brand`}>
          <Megaphone size={16} className="text-brand shrink-0" />
          <span>
            <strong className="tabular-nums">{comunicados}</strong> {comunicados === 1 ? "comunicado novo do escritório" : "comunicados novos do escritório"}
          </span>
        </Link>
      )}
      {solicitacoes > 0 && (
        <Link href="/portal/solicitacoes" className={cartao}>
          <Inbox size={16} className="text-warning shrink-0" />
          <span>
            <strong className="tabular-nums">{solicitacoes}</strong>{" "}
            {solicitacoes === 1 ? "solicitação em que a equipe precisa de você" : "solicitações em que a equipe precisa de você"}
          </span>
        </Link>
      )}
      {pendencias > 0 && (
        <Link href="/portal/pendencias" className={cartao}>
          <MessageSquareWarning size={16} className="text-warning shrink-0" />
          <span>
            <strong className="tabular-nums">{pendencias}</strong>{" "}
            {pendencias === 1 ? "pendência aguardando a sua resposta" : "pendências aguardando a sua resposta"}
          </span>
        </Link>
      )}
      {aprovar > 0 && (
        <Link href="/portal/aprovacoes" className={cartao}>
          <ShieldCheck size={16} className="text-warning shrink-0" />
          <span>
            <strong className="tabular-nums">{aprovar}</strong>{" "}
            {aprovar === 1 ? "conta a pagar aguardando a sua aprovação" : "contas a pagar aguardando a sua aprovação"}
          </span>
        </Link>
      )}
      {/* Informativo, não pedido: a cobrança é trabalho da equipe. Tom neutro
          para não disputar atenção com o que de fato espera o cliente. */}
      {emCobranca > 0 && (
        <Link
          href="/portal/cobranca"
          className={`${base} border-border bg-surface hover:border-border-strong`}
        >
          <Handshake size={16} className="text-fg-muted shrink-0" />
          <span>
            <strong className="tabular-nums">{emCobranca}</strong>{" "}
            {emCobranca === 1 ? "título a receber em cobrança" : "títulos a receber em cobrança"}
          </span>
        </Link>
      )}
    </div>
  );
}
