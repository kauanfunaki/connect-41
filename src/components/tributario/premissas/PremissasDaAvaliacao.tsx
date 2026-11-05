"use client";

// Premissas da avaliação (a seção `parameters` do workspace do Connect
// Tributário), em três grupos: Tributação, Folha e encargos, Receitas por
// atividade. A Tributação é o bloco `parameters` do original: hipóteses de
// CBS/IBS, presunções, bases de crédito, o Simples (ControlesDoSimples), os
// percentuais anuais do DAS, a elegibilidade e o "utilizar estas premissas".

import { ArrowRight } from "lucide-react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import type { Study } from "@/lib/tributario/avaliacao/model";
import { years, type Data } from "@/lib/tributario/motor/fiscal";
import { CampoValor } from "../CampoValor";
import { CampoDaAvaliacao } from "../dados/CampoDaAvaliacao";
import { PAINEL, TEXTO_DE_APOIO, TITULO_DA_SECAO } from "../estilos";
import type { AbaDasPremissas, Edicao, IrPara, ResultadoDaAvaliacao } from "../tipos";
import { ControlesDoSimples } from "./ControlesDoSimples";
import { ControlesDaFolha } from "./ControlesDaFolha";
import { AtividadesDaAvaliacao } from "./AtividadesDaAvaliacao";

type Props = {
  estudo: Study;
  resultado: ResultadoDaAvaliacao;
  edicao: Edicao;
  aba: AbaDasPremissas;
  onAba: (aba: AbaDasPremissas) => void;
  irPara: IrPara;
  onSalvar: () => void;
  salvando: boolean;
};

type ChaveDePremissa = "cbs" | "ibs" | "legacy" | "presIR" | "presCS" | "reduction";

const ELEGIBILIDADE = [
  ["simple", "Simples / híbrido"],
  ["presumed", "Presumido"],
  ["real", "Real"],
] as const;

export function PremissasDaAvaliacao({ estudo, resultado, edicao, aba, onAba, irPara, onSalvar, salvando }: Props) {
  const premissa = (chave: ChaveDePremissa, rotulo: string) => (
    <CampoForm key={chave} label={rotulo} htmlFor={`premissa-${chave}`}>
      <CampoValor
        id={`premissa-${chave}`}
        suffix="%"
        value={Number(estudo.base[chave]) || 0}
        onChange={(v) => edicao.base({ [chave]: v ?? 0 } as Partial<Data>)}
      />
    </CampoForm>
  );
  const campo = (chave: string) => (
    <CampoDaAvaliacao
      key={chave}
      chave={chave}
      informado={estudo.values[chave]}
      resolvido={resultado.fields[chave]}
      onChange={(v) => edicao.campo(chave, v)}
    />
  );

  return (
    <section className={PAINEL}>
      <SegmentedControl
        label="Grupos de premissas"
        active={aba}
        onChange={(k) => onAba(k as AbaDasPremissas)}
        items={[
          { key: "tributacao", label: "Tributação" },
          { key: "folha", label: "Folha e encargos" },
          { key: "atividades", label: "Receitas por atividade" },
        ]}
      />

      {aba === "tributacao" && (
        <div className="space-y-4">
          <div>
            <h2 className={TITULO_DA_SECAO}>Premissas da comparação</h2>
            <p className={TEXTO_DE_APOIO}>Alíquotas e enquadramentos são hipóteses editáveis do estudo.</p>
          </div>
          <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
            {premissa("cbs", "CBS integral · hipótese (%)")}
            {premissa("ibs", "IBS integral · hipótese (%)")}
            {premissa("legacy", "ICMS/ISS líquido atual (%)")}
            {premissa("presIR", "Presunção IRPJ (%)")}
            {premissa("presCS", "Presunção CSLL (%)")}
            {premissa("reduction", "Redução nas vendas (%)")}
            {campo("base_cbs")}
            {campo("base_ibs")}
            {campo("real_adjust")}
            {campo("rbt12")}
            {campo("fs12")}
            {campo("encargos")}
          </FieldGrid>
          <Button variant="link" size="sm" onClick={() => edicao.patch({ values: { ...estudo.values, base_cbs: 0, base_ibs: 0 } })}>
            Simular explicitamente sem créditos de CBS/IBS
          </Button>
          <ControlesDoSimples studyMode d={{ ...resultado.data, simpleMethod: estudo.base.simpleMethod }} change={edicao.base} />
          <BlocoRecolhivel titulo="Percentuais anuais do DAS e parcela retirada no híbrido" classeDoConteudo="px-4 pb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {years.map((ano, i) => (
                <div key={ano} className="space-y-2 rounded-md border border-border p-3">
                  <p className="text-card-title font-semibold text-fg">{ano}</p>
                  <CampoForm label="DAS %" htmlFor={`das-${ano}`}>
                    <CampoValor
                      id={`das-${ano}`}
                      suffix="%"
                      compact
                      value={estudo.base.das[i]}
                      onChange={(v) => edicao.base({ das: estudo.base.das.map((x, j) => (i === j ? (v ?? 0) : x)) })}
                    />
                  </CampoForm>
                  <CampoForm label="Retirar do DAS %" htmlFor={`retirar-${ano}`}>
                    <CampoValor
                      id={`retirar-${ano}`}
                      suffix="%"
                      compact
                      value={estudo.base.removed[i]}
                      onChange={(v) => edicao.base({ removed: estudo.base.removed.map((x, j) => (i === j ? (v ?? 0) : x)) })}
                    />
                  </CampoForm>
                </div>
              ))}
            </div>
          </BlocoRecolhivel>
          <FieldGrid columns="sm:grid-cols-3">
            {ELEGIBILIDADE.map(([chave, rotulo]) => (
              <CampoForm key={chave} label={`Elegibilidade: ${rotulo}`} htmlFor={`elegibilidade-${chave}`}>
                <Select
                  id={`elegibilidade-${chave}`}
                  value={estudo.eligibility[chave]}
                  onChange={(e) =>
                    edicao.patch({ eligibility: { ...estudo.eligibility, [chave]: e.target.value as "unknown" | "yes" | "no" } })
                  }
                >
                  <option value="unknown">Ainda não verificada</option>
                  <option value="yes">Compatível com a empresa</option>
                  <option value="no">Não elegível</option>
                </Select>
              </CampoForm>
            ))}
          </FieldGrid>
          <Checkbox
            id="premissas-revisadas"
            checked={estudo.assumptionsReviewed}
            onChange={(e) => edicao.patch({ assumptionsReviewed: e.target.checked })}
            label="Utilizar estas premissas na comparação."
          />
        </div>
      )}
      {aba === "folha" && <ControlesDaFolha d={resultado.data} change={edicao.base} />}
      {aba === "atividades" && (
        <AtividadesDaAvaliacao
          studyMode
          d={resultado.data}
          change={edicao.base}
          onSave={onSalvar}
          busy={salvando}
          onDashboard={() => irPara("resultado")}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="secondary" onClick={() => irPara("dados")}>
          Voltar aos dados
        </Button>
        <Button onClick={() => irPara("resultado")}>
          Ver resultado <ArrowRight size={17} />
        </Button>
      </div>
    </section>
  );
}
