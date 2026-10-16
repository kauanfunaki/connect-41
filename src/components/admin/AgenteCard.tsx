"use client";

import { useActionState, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
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
import { Aviso } from "@/components/ui/Aviso";

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
            <h3 className="text-card-title font-semibold text-fg">{linha.def.label}</h3>
            <Selo tom={tomDaVariante(SAUDE_VARIANTE[linha.saude])}>{SAUDE_LABEL[linha.saude]}</Selo>
            {linha.temOverride && (
              <Selo tom="neutro">configurado</Selo>
            )}
          </div>
          <p className="text-fs-3 text-fg-secondary mt-1 max-w-[60ch]">{linha.def.description}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-fs-3 tabular-nums font-medium text-fg">{resumoDoGasto(linha.gasto)}</p>
          <p className="text-fs-1 text-fg-muted">neste mês</p>
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
        <span className="text-fs-1 text-fg-muted tabular-nums whitespace-nowrap">
          teto {moeda(linha.tetoMensalCentavos)} · {linha.tetoMensalChamadas} chamadas
        </span>
      </div>

      <p className="text-fs-2 text-fg-muted">{SAUDE_EXPLICACAO[linha.saude]}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fs-2 text-fg-muted">
        <span>
          modelo <code className="text-fg-secondary">{linha.model}</code>
        </span>
        {!linha.temPrecoConhecido && (
          // Vale dizer antes de gastar, e não só depois: com este modelo, o
          // teto em reais não vai proteger nada.
          <span className="text-warning-fg">sem preço na tabela — o gasto não será apurado</span>
        )}
        {linha.def.ferramentas.length === 0 && <span>não usa ferramentas</span>}
        <span>{linha.def.escreve ? "escreve sozinho" : "propõe, não escreve"}</span>
      </div>

      {podeEditar && (
        <>
          {/* Botão, e não texto azul (polimento de 30/09): abre o formulário. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAberto((v) => !v)}
            className="self-start"
            aria-expanded={aberto}
          >
            <ChevronDown size={14} className={aberto ? "rotate-180 transition-transform" : "transition-transform"} />
            {aberto ? "Fechar" : "Configurar"}
          </Button>

          {aberto && (
            <form action={formAction} className="border-t border-border-soft pt-3 flex flex-col gap-3">
              <input type="hidden" name="agentCode" value={linha.def.code} />

              {state && "error" in state && (
                <Aviso>
                  {state.error}
                </Aviso>
              )}
              {state && "success" in state && (
                <Aviso tom="sucesso">
                  Configuração salva.
                </Aviso>
              )}

              <Checkbox
                id={`enabled-${linha.def.code}`}
                name="enabled"
                defaultChecked={linha.enabled}
                label="Agente ligado"
              />

              <FieldGrid columns="sm:grid-cols-3">
                <CampoForm
                  label="Teto de gasto"
                  htmlFor={`cap-cents-${linha.def.code}`}
                  helper={`Em branco usa o padrão: ${moeda(linha.def.tetoMensalCentavos)}. Zero bloqueia.`}
                >
                  <CampoTetoEmReais
                    id={`cap-cents-${linha.def.code}`}
                    name="monthlyCapCents"
                    centavos={linha.override?.monthlyCapCents ?? null}
                    padrao={linha.def.tetoMensalCentavos}
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
              </FieldGrid>

              {/* Salvar à direita, o primário por último; "Voltar ao padrão"
                  descarta a configuração e fica separado, à esquerda. */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-border-soft">
                {linha.temOverride && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mr-auto"
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
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </Card>
  );
}

/** "1.234,56" — o valor do campo de reais, sem o "R$" (que é o prefixo). */
function reaisDoCampo(centavos: number): string {
  return Number(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Centavos do que se digitou em reais: "12", "12,5", "1.234,56" ou "12.50".
 * Vazio volta vazio (o padrão do catálogo); o que não é valor volta como veio,
 * e a action recusa com a mensagem dela.
 */
function centavosDoCampo(texto: string): string {
  const limpo = texto.replace(/R\$/i, "").replace(/\s/g, "");
  if (limpo === "") return "";
  const decimal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  if (!/^\d+(\.\d{0,2})?$/.test(decimal)) return limpo;
  return String(Math.round(Number(decimal) * 100));
}

/**
 * O teto de gasto em reais, com "R$" (15/10/2026): era um número de
 * centavos, com o sufixo "centavos". A action continua recebendo centavos —
 * a conta vai num campo escondido com o mesmo nome de antes.
 */
function CampoTetoEmReais({ id, name, centavos, padrao }: { id: string; name: string; centavos: number | null; padrao: number }) {
  const [texto, setTexto] = useState(centavos === null ? "" : reaisDoCampo(centavos));
  return (
    <>
      <Input
        id={id}
        inputMode="decimal"
        prefix="R$"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={reaisDoCampo(padrao)}
      />
      <input type="hidden" name={name} value={centavosDoCampo(texto)} />
    </>
  );
}
