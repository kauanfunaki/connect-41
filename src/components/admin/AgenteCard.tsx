"use client";

import { useActionState, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { salvarAgente, restaurarPadraoDoAgente, type AgenteState } from "@/app/(app)/admin/ia/actions";
import {
  SAUDE_LABEL,
  SAUDE_VARIANTE,
  SAUDE_EXPLICACAO,
  fracaoDoTeto,
  moeda,
  resumoDoGasto,
} from "@/lib/ia/tela";
import type { LinhaDeAgente } from "@/lib/ia/data";

type Props = {
  linha: LinhaDeAgente;
  podeEditar: boolean;
};

// Serializável: o server component passa a linha inteira, e o cliente só lê.
export function AgenteCard({ linha, podeEditar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, isPending] = useActionState<AgenteState, FormData>(salvarAgente, null);
  const [restaurando, setRestaurando] = useState(false);

  const fracao = fracaoDoTeto(linha.gasto, linha.tetoMensalCentavos, linha.tetoMensalChamadas);
  const alerta = linha.saude === "no_teto" || linha.saude === "perto_do_teto";

  return (
    <Card as="section" className="p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-fg">{linha.def.label}</h3>
            <Badge variant={SAUDE_VARIANTE[linha.saude]}>{SAUDE_LABEL[linha.saude]}</Badge>
            {linha.temOverride && (
              <span className="text-[11px] text-fg-muted border border-border rounded px-1.5 py-0.5">
                configurado
              </span>
            )}
          </div>
          <p className="text-[13px] text-fg-secondary mt-1 max-w-[60ch]">{linha.def.description}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[13px] tabular-nums font-medium text-fg">{resumoDoGasto(linha.gasto)}</p>
          <p className="text-[11px] text-fg-muted">neste mês</p>
        </div>
      </div>

      {/* A barra mostra a maior das duas frações — a que trava primeiro. */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-surface-hover overflow-hidden">
          <div
            className={`h-full rounded-full ${alerta ? "bg-warning" : "bg-brand"}`}
            style={{ width: `${Math.round(fracao * 100)}%` }}
          />
        </div>
        <span className="text-[11px] text-fg-muted tabular-nums whitespace-nowrap">
          teto {moeda(linha.tetoMensalCentavos)} · {linha.tetoMensalChamadas} chamadas
        </span>
      </div>

      <p className="text-[12px] text-fg-muted">{SAUDE_EXPLICACAO[linha.saude]}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-muted">
        <span>
          modelo <code className="text-fg-secondary">{linha.model}</code>
        </span>
        {!linha.temPrecoConhecido && (
          // Vale dizer antes de gastar, e não só depois: com este modelo, o
          // teto em reais não vai proteger nada.
          <span className="text-warning">sem preço na tabela — o gasto não será apurado</span>
        )}
        {linha.def.ferramentas.length === 0 && <span>não usa ferramentas</span>}
        <span>{linha.def.escreve ? "escreve sozinho" : "propõe, não escreve"}</span>
      </div>

      {podeEditar && (
        <>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="flex items-center gap-1 text-[13px] text-brand hover:underline self-start"
            aria-expanded={aberto}
          >
            <ChevronDown size={14} className={aberto ? "rotate-180 transition-transform" : "transition-transform"} />
            {aberto ? "Fechar" : "Configurar"}
          </button>

          {aberto && (
            <form action={formAction} className="border-t border-border-soft pt-3 flex flex-col gap-3">
              <input type="hidden" name="agentCode" value={linha.def.code} />

              {state && "error" in state && (
                <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
                  {state.error}
                </p>
              )}
              {state && "success" in state && (
                <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">
                  Configuração salva.
                </p>
              )}

              <Checkbox
                id={`enabled-${linha.def.code}`}
                name="enabled"
                defaultChecked={linha.enabled}
                label="Agente ligado"
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <CampoForm
                  label="Teto de gasto (centavos)"
                  htmlFor={`cap-cents-${linha.def.code}`}
                  helper={`Em branco usa o padrão: ${moeda(linha.def.tetoMensalCentavos)}. Zero bloqueia.`}
                >
                  <Input
                    id={`cap-cents-${linha.def.code}`}
                    name="monthlyCapCents"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={linha.override?.monthlyCapCents ?? ""}
                    placeholder={String(linha.def.tetoMensalCentavos)}
                  />
                </CampoForm>

                <CampoForm
                  label="Teto de chamadas"
                  htmlFor={`cap-calls-${linha.def.code}`}
                  helper={`Em branco usa o padrão: ${linha.def.tetoMensalChamadas}. É o que segura quando o preço do modelo é desconhecido.`}
                >
                  <Input
                    id={`cap-calls-${linha.def.code}`}
                    name="monthlyCapCalls"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={linha.override?.monthlyCapCalls ?? ""}
                    placeholder={String(linha.def.tetoMensalChamadas)}
                  />
                </CampoForm>

                <CampoForm
                  label="Modelo"
                  htmlFor={`model-${linha.def.code}`}
                  helper="Em branco usa o modelo da faixa do agente — o recomendado."
                >
                  <Input
                    id={`model-${linha.def.code}`}
                    name="model"
                    defaultValue={linha.override?.model ?? ""}
                    placeholder={linha.model}
                  />
                </CampoForm>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Salvando…" : "Salvar"}
                </Button>
                {linha.temOverride && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={restaurando}
                    onClick={async () => {
                      setRestaurando(true);
                      await restaurarPadraoDoAgente(linha.def.code);
                      setRestaurando(false);
                    }}
                  >
                    {restaurando ? "Restaurando…" : "Voltar ao padrão"}
                  </Button>
                )}
              </div>
            </form>
          )}
        </>
      )}
    </Card>
  );
}
