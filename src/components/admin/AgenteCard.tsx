"use client";

import { useActionState, useState } from "react";
import { Settings2 } from "lucide-react";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { SlideOver } from "@/components/ui/SlideOver";
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
  /** A cor do setor do agente, para a bolinha ao lado do nome. */
  cor?: string;
};

/**
 * O agente num cartão compacto, para a grade da aba Agentes (escolha 7A dos
 * Ajustes de 15/10, 20/10/2026): o nome, a situação, o gasto do mês e a barra
 * do teto — o agente perto do teto se vê pela barra. O resto (o que ele faz, o
 * modelo, as ferramentas) e o formulário abrem no painel do Configurar. Era um
 * cartão largo com tudo à vista, empilhado com os outros, e o formulário abria
 * dentro dele.
 *
 * Serializável: o server component passa a linha inteira, e o cliente só lê.
 */
export function AgenteCard({ linha, podeEditar, cor }: Props) {
  const [aberto, setAberto] = useState(false);

  const fracao = fracaoDoTeto(linha.gasto, linha.tetoMensalCentavos, linha.tetoMensalChamadas);
  const alerta = linha.saude === "no_teto" || linha.saude === "perto_do_teto";

  return (
    <Card as="section" aria-label={linha.def.label} className="flex flex-col gap-2.5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-fs-3 font-semibold text-fg">
            {cor && <span className="size-2.5 flex-shrink-0 rounded-full" style={{ background: cor }} aria-hidden />}
            <span className="min-w-0 truncate" title={linha.def.label}>
              {linha.def.label}
            </span>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Selo tom={tomDaVariante(SAUDE_VARIANTE[linha.saude])}>{SAUDE_LABEL[linha.saude]}</Selo>
            {linha.temOverride && <Selo tom="neutro">configurado</Selo>}
          </div>
        </div>
        <p className="shrink-0 text-right text-fs-3 font-medium tabular-nums text-fg">{resumoDoGasto(linha.gasto)}</p>
      </div>

      {/* A barra mostra a maior das duas frações — a que trava primeiro. */}
      <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
        <div className={`h-full rounded-full ${alerta ? "bg-warning" : "bg-brand"}`} style={{ width: `${Math.round(fracao * 100)}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-fs-1 tabular-nums text-fg-muted">
          teto {moeda(linha.tetoMensalCentavos)} · {linha.tetoMensalChamadas} chamadas
        </span>
        <Button variant="secondary" size="xs" onClick={() => setAberto(true)}>
          <Settings2 size={12} /> {podeEditar ? "Configurar" : "Detalhes"}
        </Button>
      </div>

      <SlideOver open={aberto} onClose={() => setAberto(false)} title={linha.def.label} width="max-w-lg" fundo="leve">
        <DetalheDoAgente linha={linha} podeEditar={podeEditar} />
      </SlideOver>
    </Card>
  );
}

/** O que era o corpo do cartão largo, mais o formulário: no painel do Configurar. */
function DetalheDoAgente({ linha, podeEditar }: { linha: LinhaDeAgente; podeEditar: boolean }) {
  const [state, formAction, isPending] = useActionState<AgenteState, FormData>(salvarAgente, null);
  const [restaurando, setRestaurando] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Selo tom={tomDaVariante(SAUDE_VARIANTE[linha.saude])}>{SAUDE_LABEL[linha.saude]}</Selo>
          <span className="text-fs-2 tabular-nums text-fg-secondary">{resumoDoGasto(linha.gasto)} neste mês</span>
        </div>
        <p className="text-fs-3 text-fg-secondary">{linha.def.description}</p>
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
      </div>

      {podeEditar && (
        <form action={formAction} className="flex flex-col gap-3 border-t border-border-soft pt-4">
          <input type="hidden" name="agentCode" value={linha.def.code} />

          {state && "error" in state && <Aviso>{state.error}</Aviso>}
          {state && "success" in state && <Aviso tom="sucesso">Configuração salva.</Aviso>}

          <Checkbox id={`enabled-${linha.def.code}`} name="enabled" defaultChecked={linha.enabled} label="Agente ligado" />

          <FieldGrid>
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
          </FieldGrid>

          <CampoForm
            label="Modelo"
            htmlFor={`model-${linha.def.code}`}
            helper="Em branco usa o modelo da faixa do agente — o recomendado."
          >
            <Input id={`model-${linha.def.code}`} name="model" defaultValue={linha.override?.model ?? ""} placeholder={linha.model} />
          </CampoForm>

          {/* Salvar à direita, o primário por último; "Voltar ao padrão"
              descarta a configuração e fica separado, à esquerda. */}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border-soft pt-3">
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
    </div>
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
