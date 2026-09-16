import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatInstantDateTime } from "@/lib/format";
import type { ConexaoNaTela } from "@/lib/whatsapp/data";
import type { NivelDeSaude } from "@/lib/whatsapp/saude";

const ESTILO: Record<NivelDeSaude, { icone: typeof CheckCircle2; cor: string; borda: string }> = {
  ok: { icone: CheckCircle2, cor: "text-success", borda: "border-border" },
  atencao: { icone: AlertTriangle, cor: "text-warning", borda: "border-warning/40" },
  problema: { icone: XCircle, cor: "text-danger", borda: "border-danger/40" },
};

/**
 * O estado de cada número, no topo das conversas.
 *
 * Fica acima da lista, e não numa tela de configuração, porque quem precisa
 * saber que o número caiu é quem está atendendo — e é esta tela que essa pessoa
 * abre.
 */
export function EstadoDasConexoes({ conexoes, podeConfigurar }: { conexoes: ConexaoNaTela[]; podeConfigurar: boolean }) {
  if (conexoes.length === 0) {
    return (
      <Card className="p-4 mb-4 text-[13px] text-fg-muted">
        Nenhum número de WhatsApp conectado.
        {podeConfigurar && (
          <>
            {" "}
            <Link href="/admin/integracoes" className="text-brand hover:underline">
              Conectar em Integrações
            </Link>
          </>
        )}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2 mb-4">
      {conexoes.map((c) => {
        const estilo = ESTILO[c.saude.nivel];
        const Icone = estilo.icone;
        return (
          <Card key={c.id} className={`p-3.5 border ${estilo.borda}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Icone size={16} className={`${estilo.cor} mt-0.5 shrink-0`} />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg">
                    {c.saude.titulo}
                    <span className="font-normal text-fg-muted">
                      {" · "}
                      {c.rotulo}
                      {c.instancia && ` · ${c.instancia}`}
                    </span>
                  </p>
                  {c.saude.motivos.map((motivo) => (
                    <p key={motivo} className="text-[12px] text-fg-secondary mt-0.5 break-words">
                      {motivo}
                    </p>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-fg-muted">
                {c.ultimaEntradaEm
                  ? `Última mensagem recebida: ${formatInstantDateTime(c.ultimaEntradaEm)}`
                  : "Nenhuma mensagem recebida ainda"}
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
