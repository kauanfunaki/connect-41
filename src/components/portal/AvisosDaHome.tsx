import Link from "next/link";
import { MessageSquareWarning, ShieldCheck } from "lucide-react";
import { pendenciasAguardandoCliente } from "@/lib/financeiro/pendencias/consultas";
import { aprovacoesDoCliente } from "@/lib/financeiro/aprovacao/portal";

/**
 * O que espera o cliente, no topo da home do portal: pendências a responder e
 * contas a aprovar. Some quando não há nada — faixa de "0 pendências" em toda
 * visita vira paisagem, e aí deixa de ser lida no dia em que tem 3.
 */
export async function AvisosDaHome({
  tenantId,
  companyIds,
  portalUserId,
  modulos,
}: {
  tenantId: string;
  companyIds: string[];
  portalUserId: string;
  modulos: Set<string>;
}) {
  const escopo = { tenantId, companyIds };
  const [pendencias, aprovacoes] = await Promise.all([
    modulos.has("bpo_pendencias") ? pendenciasAguardandoCliente(escopo) : Promise.resolve(0),
    modulos.has("bpo_aprovacoes") ? aprovacoesDoCliente(escopo, portalUserId) : Promise.resolve(null),
  ]);
  const aprovar = aprovacoes?.contas.filter((c) => c.dentroDoTeto).length ?? 0;
  if (pendencias === 0 && aprovar === 0) return null;

  const cartao =
    "flex items-center gap-3 rounded-md border border-warning/40 bg-warning-bg px-4 py-3 text-[13px] hover:border-warning transition-colors";
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
      {pendencias > 0 && (
        <Link href="/portal/pendencias" className={cartao}>
          <MessageSquareWarning size={18} className="text-warning shrink-0" />
          <span>
            <strong className="tabular-nums">{pendencias}</strong>{" "}
            {pendencias === 1 ? "pendência aguardando a sua resposta" : "pendências aguardando a sua resposta"}
          </span>
        </Link>
      )}
      {aprovar > 0 && (
        <Link href="/portal/aprovacoes" className={cartao}>
          <ShieldCheck size={18} className="text-warning shrink-0" />
          <span>
            <strong className="tabular-nums">{aprovar}</strong>{" "}
            {aprovar === 1 ? "conta a pagar aguardando a sua aprovação" : "contas a pagar aguardando a sua aprovação"}
          </span>
        </Link>
      )}
    </div>
  );
}
