"use client";

// Avaliação rápida (o `study-quick-layout` do Connect Tributário): a empresa,
// os seis totais principais, os outros valores da DRE recolhidos e, ao lado,
// quantos grupos da DRE já foram preenchidos. Sem importação de documentos na
// Fase 1: os totais são digitados.

import { ArrowRight, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { dreKeys } from "@/lib/tributario/avaliacao/assessment";
import type { Study } from "@/lib/tributario/avaliacao/model";
import { PAINEL, ROTULO, TEXTO_DE_APOIO, TITULO_DA_SECAO } from "../estilos";
import type { Edicao, IrPara, ResultadoDaAvaliacao } from "../tipos";
import { CampoDaAvaliacao } from "./CampoDaAvaliacao";
import { DadosDaEmpresa } from "./DadosDaEmpresa";

/** Os seis totais da avaliação rápida, na ordem do original. */
export const TOTAIS_PRINCIPAIS = [
  "receita_bruta",
  "devolucoes_descontos",
  "custos_diretos",
  "despesas_administrativas",
  "folha_encargos_dre",
  "impostos_sobre_vendas",
];
const OUTROS_DA_DRE = dreKeys.filter((k) => !TOTAIS_PRINCIPAIS.includes(k));

type Props = { estudo: Study; resultado: ResultadoDaAvaliacao; edicao: Edicao; irPara: IrPara };

export function DadosRapidos({ estudo, resultado, edicao, irPara }: Props) {
  const campo = (chave: string) => (
    <CampoDaAvaliacao
      key={chave}
      chave={chave}
      informado={estudo.values[chave]}
      resolvido={resultado.fields[chave]}
      onChange={(v) => edicao.campo(chave, v)}
    />
  );
  const preenchidos = dreKeys.length - resultado.missing.length;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <section className={PAINEL}>
          <DadosDaEmpresa estudo={estudo} patch={edicao.patch} />
        </section>
        <section className={PAINEL}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={ROTULO}>Comece pelos totais</p>
              <h2 className={TITULO_DA_SECAO}>Como foi a operação?</h2>
              <p className={TEXTO_DE_APOIO}>Informe cada valor uma vez. Pessoal e impostos têm campos próprios.</p>
            </div>
            <Zap size={23} className="text-fg-muted" aria-hidden />
          </div>
          <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">{TOTAIS_PRINCIPAIS.map(campo)}</FieldGrid>
          <BlocoRecolhivel titulo="Outros valores da DRE" classeDoConteudo="px-4 pb-4">
            <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
              {OUTROS_DA_DRE.map(campo)}
              {campo("irpj_csll")}
            </FieldGrid>
          </BlocoRecolhivel>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              const values = { ...estudo.values };
              for (const k of OUTROS_DA_DRE) if (resultado.fields[k].value === null) values[k] = 0;
              edicao.patch({ values });
            }}
          >
            Não há movimento nas demais linhas da DRE
          </Button>
        </section>
        <Button onClick={() => irPara("premissas")}>
          Continuar para premissas <ArrowRight size={17} />
        </Button>
      </div>
      <aside className="space-y-4">
        <section className={PAINEL}>
          <p className={ROTULO}>Seu estudo, em construção</p>
          <h2 className="text-card-title font-semibold text-fg">Clareza a cada informação</h2>
          <p className="text-fg">
            <span className="text-display font-semibold tabular-nums">{preenchidos}</span>{" "}
            <span className="text-helper text-fg-secondary">de {dreKeys.length} grupos da DRE preenchidos</span>
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-brand-solid" style={{ width: `${(100 * preenchidos) / dreKeys.length}%` }} />
          </div>
          <p className={TEXTO_DE_APOIO}>Continue digitando: seus números ficam guardados nesta avaliação quando você salva.</p>
          <Button onClick={() => irPara("resultado")}>
            Ver comparação <ArrowRight size={17} />
          </Button>
        </section>
        <section className={PAINEL}>
          <Sparkles size={22} className="text-brand" aria-hidden />
          <h3 className="text-card-title font-semibold text-fg">
            Comece simples.
            <br />
            Aprofunde quando quiser.
          </h3>
          <p className={TEXTO_DE_APOIO}>Na avaliação analítica, o Connect organiza os dados em etapas e pede somente o que ainda falta.</p>
        </section>
      </aside>
    </div>
  );
}
