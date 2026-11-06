"use client";

// Avaliação analítica (o `study-guided-layout` do Connect Tributário): oito
// etapas — Empresa, Receitas, Operação, Pessoal, Contabilidade, Tributos,
// Caixa e Resultado —, com os mesmos campos, avisos e atalhos para as
// premissas. Sem importação de documentos na Fase 1.

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Stepper, type StepDef } from "@/components/ui/Stepper";
import { Textarea } from "@/components/ui/Textarea";
import { steps, type Study } from "@/lib/tributario/avaliacao/model";
import { brl } from "@/lib/tributario/motor/fiscal";
import { NOTA, ROTULO, TEXTO_DE_APOIO, TITULO_DA_SECAO } from "../estilos";
import type { Edicao, IrPara, ResultadoDaAvaliacao } from "../tipos";
import { CampoDaAvaliacao } from "./CampoDaAvaliacao";
import { DadosDaEmpresa } from "./DadosDaEmpresa";

type Props = { estudo: Study; resultado: ResultadoDaAvaliacao; edicao: Edicao; irPara: IrPara };

export function DadosGuiados({ estudo, resultado, edicao, irPara }: Props) {
  const etapa = estudo.step;
  const completa = (i: number) => {
    const st = steps[i];
    return i === 0 ? !!estudo.cnpj && !!estudo.name : st.fields.length > 0 && st.fields.every((k) => resultado.fields[k].value !== null);
  };
  const etapas: StepDef[] = steps.map((st, i) => ({
    label: st.short,
    status: etapa === i ? "current" : completa(i) ? "done" : "upcoming",
    disabled: false,
  }));
  const campo = (chave: string) => (
    <CampoDaAvaliacao
      key={chave}
      chave={chave}
      informado={estudo.values[chave]}
      resolvido={resultado.fields[chave]}
      onChange={(v) => edicao.campo(chave, v)}
    />
  );
  const vendas = resultado.fields.documentos_vendas?.value ?? null;
  const compras = resultado.fields.documentos_compras?.value ?? null;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-surface">
        <Stepper steps={etapas} onStepClick={(i) => (i === 7 ? irPara("resultado") : edicao.patch({ step: i }))} />
        <div className="space-y-4 p-4">
          {etapa === 0 ? (
            <DadosDaEmpresa estudo={estudo} patch={edicao.patch} />
          ) : etapa === 7 ? (
            <div className="space-y-3">
              <h2 className={TITULO_DA_SECAO}>Dados da avaliação reunidos</h2>
              <Button onClick={() => irPara("resultado")}>Ver resultado</Button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={ROTULO}>Etapa {etapa + 1} de 8</p>
                  <h2 className={TITULO_DA_SECAO}>{steps[etapa].title}</h2>
                  <p className={TEXTO_DE_APOIO}>{steps[etapa].description}</p>
                </div>
                <span className="text-display font-semibold text-fg-muted tabular-nums" aria-hidden>
                  0{etapa + 1}
                </span>
              </div>
              <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
                {steps[etapa].fields.filter((k) => etapa !== 5 || !["base_cbs", "base_ibs"].includes(k)).map(campo)}
              </FieldGrid>
              {etapa === 1 && vendas !== null && (
                <div className={NOTA}>
                  <b>{brl(vendas)} em documentos de saída</b>
                  <p>
                    Esse total é documental. Confira se representa toda a receita operacional do período, sem transferências ou
                    operações que não sejam vendas.
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => edicao.campo("receita_bruta", vendas)}>
                    Usar como receita do período
                  </Button>
                </div>
              )}
              {etapa === 2 && compras !== null && (
                <p className={NOTA}>
                  Compras documentadas: {brl(compras)}. Compra não é necessariamente custo do período ou crédito elegível.
                </p>
              )}
              {etapa === 3 && (
                <Button variant="secondary" onClick={() => irPara("premissas", "folha")}>
                  Configurar encargos por regime
                </Button>
              )}
              {etapa === 4 && (
                <p className={NOTA}>
                  Balanço representa uma posição patrimonial. Balancetes acumulados não são somados como receitas mensais. Prejuízos
                  fiscais são registrados como evidência; sua compensação ainda não é calculada automaticamente.
                </p>
              )}
              {etapa === 5 && (
                <Button variant="secondary" onClick={() => irPara("premissas")}>
                  Configurar premissas e créditos
                </Button>
              )}
              {etapa === 6 && (
                <p className={NOTA}>
                  Prazos apoiam a análise de capital de giro. O total de impostos não é um fluxo de caixa projetado nem uma simulação
                  de split payment.
                </p>
              )}
              <CampoForm label="Observações da avaliação" htmlFor="avaliacao-observacoes">
                <Textarea
                  id="avaliacao-observacoes"
                  value={estudo.notes}
                  maxLength={5000}
                  onChange={(e) => edicao.patch({ notes: e.target.value })}
                  placeholder="Registre particularidades, contratos e hipóteses relevantes."
                />
              </CampoForm>
            </>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <Button variant="secondary" disabled={etapa === 0} onClick={() => edicao.patch({ step: etapa - 1 })}>
              <ArrowLeft size={16} /> Anterior
            </Button>
            <span className="text-helper text-fg-muted">Salve para retomar em outro momento.</span>
            <Button onClick={() => (etapa >= 6 ? irPara("premissas") : edicao.patch({ step: etapa + 1 }))}>
              {etapa >= 6 ? "Continuar para premissas" : "Continuar"} <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </section>
      {[1, 5].includes(etapa) && (
        <Button variant="secondary" onClick={() => irPara("premissas", "atividades")}>
          Configurar receitas por atividade
        </Button>
      )}
    </div>
  );
}
