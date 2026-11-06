"use client";

// Premissas do Simples, créditos separados por tributo e encargos manuais do
// Planejamento tributário (05/11/2026), portados de
// `components/fiscal/r1-controls.tsx` do Connect Tributário (R1Controls,
// DetailedMemory e Sensitivity). Mesmos campos, textos, condições e cálculos;
// só a camada visual é a do Connect.

import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Deslizante } from "@/components/ui/Deslizante";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Selo } from "@/components/ui/Selo";
import { CampoValor } from "@/components/tributario/CampoValor";
import {
  CABECALHO,
  CABECALHO_NUMERO,
  CELULA,
  CELULA_NUMERO,
  NOTA,
  PAINEL,
  ROLAGEM_DA_TABELA,
  TABELA,
  TEXTO_DE_APOIO,
  TITULO_DO_PAINEL,
} from "@/components/tributario/estilos";
import { brl, calculate, creditInputs, ENGINE, percent, scope, simplesReference, type Data } from "@/lib/tributario/motor/fiscal";

/**
 * Os campos numéricos abertos deste bloco. Todos admitem vazio (`null`): vazio
 * herda o valor geral (compras, parcela elegível, "Outros tributos").
 */
type CampoComPadrao =
  | "cbsCreditBase"
  | "cbsCreditRate"
  | "ibsCreditBase"
  | "ibsCreditRate"
  | "pisCreditBase"
  | "pisCreditRate"
  | "extraSimple"
  | "extraHybrid"
  | "extraPresumed"
  | "extraReal";

/** Conteúdo de cada bloco recolhível (o `<details>` do original). */
const CONTEUDO_DO_BLOCO = "space-y-3 px-4 pb-4";
const LINK_EXTERNO = "inline-flex items-center gap-1 text-ui text-brand hover:underline";

/** O `Pick` do original: rótulo + seletor com pares [valor, rótulo]. */
function Escolha({
  id,
  value,
  values,
  onChange,
  label,
}: {
  id: string;
  value: string;
  values: [string, string][];
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <CampoForm label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {values.map(([v, l]) => (
          <option value={v} key={v}>
            {l}
          </option>
        ))}
      </Select>
    </CampoForm>
  );
}

export function ControlesDoSimples({
  d,
  change,
  studyMode = false,
}: {
  d: Data;
  change: (p: Partial<Data>) => void;
  studyMode?: boolean;
}) {
  const idBase = useId();
  const ref = simplesReference(d),
    bases = creditInputs(d);

  // Vazio vira `null` (herda o padrão), como no original; o padrão aparece no placeholder.
  function field(key: CampoComPadrao, label: string, fallback: number, unidade: "R$" | "%") {
    const id = `${idBase}-${key}`;
    return (
      <CampoForm key={key} label={label} htmlFor={id}>
        <CampoValor
          id={id}
          prefix={unidade === "R$" ? "R$" : undefined}
          suffix={unidade === "%" ? "%" : undefined}
          placeholder={"Padrão: " + Number(fallback).toLocaleString("pt-BR")}
          value={d[key]}
          onChange={(v) => change({ [key]: v })}
        />
      </CampoForm>
    );
  }

  return (
    <div className="space-y-3">
      {!d.activities.enabled && (
        <>
          <BlocoRecolhivel titulo="Simples por anexo e Fator R" abertoInicial classeDoConteudo={CONTEUDO_DO_BLOCO}>
            <FieldGrid>
              <Escolha
                id={`${idBase}-simpleMethod`}
                label="Método do DAS"
                value={d.simpleMethod}
                values={[
                  ["manual", "Percentuais informados por ano"],
                  ["reference", "Projeção pela alíquota de referência"],
                ]}
                onChange={(v) => change({ simpleMethod: v as Data["simpleMethod"] })}
              />
              <Escolha
                id={`${idBase}-annex`}
                label="Anexo de referência"
                value={d.annex}
                values={["I", "II", "III", "IV", "V"].map((x): [string, string] => [x, "Anexo " + x])}
                onChange={(v) => change({ annex: v as Data["annex"], factorR: false })}
              />
            </FieldGrid>
            <Checkbox
              id={`${idBase}-factorR`}
              label="Atividade sujeita ao Fator R (III / V)"
              helper="Marque apenas para atividades abrangidas pelo Fator R. FS12 deve incluir os componentes legais da folha e encargos."
              checked={d.factorR}
              onChange={(e) => change({ factorR: e.target.checked })}
            />
            {ref ? (
              <div className={`${NOTA} flex flex-col gap-2`}>
                <b className="font-semibold text-fg">
                  Anexo {ref.annex} · Faixa {ref.band}
                </b>
                <span>Fator R: {percent(ref.factor * 100)}</span>
                <span>
                  Nominal: {percent(ref.nominal)} · Dedução: {brl(ref.deduction)}
                </span>
                <strong className="font-semibold text-fg">Alíquota efetiva: {percent(ref.effective)}</strong>
                <code className="whitespace-normal text-micro text-fg-muted">(RBT12 × alíquota − dedução) ÷ RBT12</code>
              </div>
            ) : (
              <Aviso tom="perigo">Informe RBT12 positiva de até R$ 4,8 milhões para consultar a tabela.</Aviso>
            )}
            <p className={TEXTO_DE_APOIO}>
              Referência geral da LC 123, sem segregação de receitas. No modo de projeção, mantém RBT12 e alíquota
              constantes; a exclusão do DAS no híbrido continua manual. Não calcula início de atividade, sublimites,
              monofásicos, ST, exportações ou transporte com partilha especial.
            </p>
            {ref?.annex === "IV" && (
              <Aviso tom="perigo">
                Anexo IV: configure a CPP e o RAT em Folha e encargos. Se usar valores manuais, mantenha a folha automática
                desativada ou concilie a parcela a substituir.
              </Aviso>
            )}
            <a
              className={LINK_EXTERNO}
              href="https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm"
              target="_blank"
              rel="noreferrer"
            >
              Consultar LC 123 e anexos <ExternalLink size={14} aria-hidden />
            </a>
          </BlocoRecolhivel>

          <BlocoRecolhivel titulo="Créditos separados por tributo" classeDoConteudo={CONTEUDO_DO_BLOCO}>
            <p className={TEXTO_DE_APOIO}>
              {studyMode
                ? "As bases vêm dos totais desta avaliação. Os percentuais abaixo definem a parcela elegível, não a alíquota do tributo."
                : "Campos vazios usam as compras e a parcela elegível gerais. Zero significa ausência de crédito. Bases sem tributos; percentual elegível não é alíquota tributária."}{" "}
              Saldos de CBS e IBS não se compensam entre si.
            </p>
            <FieldGrid>
              {!studyMode && field("cbsCreditBase", "Base de compras CBS (R$)", d.creditBase, "R$")}
              {field("cbsCreditRate", "Elegibilidade CBS (%)", d.creditRate, "%")}
              {!studyMode && field("ibsCreditBase", "Base de compras IBS (R$)", d.creditBase, "R$")}
              {field("ibsCreditRate", "Elegibilidade IBS (%)", d.creditRate, "%")}
              {field("pisCreditBase", "Base PIS/Cofins atual (R$)", d.creditBase, "R$")}
              {field("pisCreditRate", "Elegibilidade PIS/Cofins (%)", d.creditRate, "%")}
            </FieldGrid>
            <p className={TEXTO_DE_APOIO}>
              Bases utilizadas: CBS {brl(bases.cbsBase)}, IBS {brl(bases.ibsBase)}, PIS/Cofins {brl(bases.pisBase)}.
            </p>
          </BlocoRecolhivel>
        </>
      )}

      <BlocoRecolhivel titulo="Outros tributos e encargos manuais" classeDoConteudo={CONTEUDO_DO_BLOCO}>
        <p className={TEXTO_DE_APOIO}>
          {studyMode
            ? "Não repita aqui os encargos patronais já informados na avaliação. Estes valores são adicionais anuais separados."
            : "Vazio herda “Outros tributos”. Informe recolhimentos externos ao DAS."}{" "}
          Com a folha automática, declare a parcela de folha a substituir na conciliação. Estes campos entram no comparativo;
          não são deduzidos novamente da margem.
        </p>
        <FieldGrid>
          {field("extraSimple", "Fora do DAS • Simples (R$/ano)", d.extra, "R$")}
          {field("extraHybrid", "Fora do DAS • Híbrido (R$/ano)", d.extra, "R$")}
          {field("extraPresumed", "Outros • Presumido (R$/ano)", d.extra, "R$")}
          {field("extraReal", "Outros • Real (R$/ano)", d.extra, "R$")}
        </FieldGrid>
      </BlocoRecolhivel>

      {!studyMode && (
        <BlocoRecolhivel titulo="Identificação e revisão" classeDoConteudo={CONTEUDO_DO_BLOCO}>
          <FieldGrid>
            <CampoForm label="Nome do cenário" htmlFor={`${idBase}-scenario`}>
              <Input
                id={`${idBase}-scenario`}
                value={d.scenario}
                maxLength={160}
                onChange={(e) => change({ scenario: e.target.value })}
              />
            </CampoForm>
            <CampoForm label="Responsável pela análise" htmlFor={`${idBase}-responsible`}>
              <Input
                id={`${idBase}-responsible`}
                value={d.responsible}
                maxLength={160}
                onChange={(e) => change({ responsible: e.target.value, reviewed: false })}
              />
            </CampoForm>
          </FieldGrid>
          <Checkbox
            id={`${idBase}-reviewed`}
            label="Revisei os dados e as premissas deste cenário"
            helper="Registro declaratório do responsável; não é certificação fiscal. Alterar premissas remove esta marcação."
            checked={d.reviewed}
            onChange={(e) => change({ reviewed: e.target.checked })}
          />
        </BlocoRecolhivel>
      )}
    </div>
  );
}

/** As tabelas de duas colunas de valores da memória (CBS/IBS, Presumido/Real). */
function TabelaDaMemoria({ cabecalho, linhas }: { cabecalho: [string, string, string]; linhas: [string, number, number][] }) {
  return (
    <div className={ROLAGEM_DA_TABELA}>
      <table className={TABELA}>
        <thead>
          <tr>
            <th className={CABECALHO}>{cabecalho[0]}</th>
            <th className={CABECALHO_NUMERO}>{cabecalho[1]}</th>
            <th className={CABECALHO_NUMERO}>{cabecalho[2]}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(([l, a, b]) => (
            <tr key={l}>
              <td className={CELULA}>{l}</td>
              <td className={CELULA_NUMERO}>{brl(a)}</td>
              <td className={CELULA_NUMERO}>{brl(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MemoriaDetalhada({ d, year }: { d: Data; year: number }) {
  const r = calculate(d, year),
    b = creditInputs(d);
  return (
    <section className={PAINEL}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={TITULO_DO_PAINEL}>Cálculo aberto, tributo a tributo</h2>
        <span className={TEXTO_DE_APOIO}>Motor {ENGINE}</span>
      </div>
      <TabelaDaMemoria
        cabecalho={["Componente", "CBS", "IBS"]}
        linhas={[
          ["Base de compras", b.cbsBase, b.ibsBase],
          ["Crédito elegível", r.cbsCredit, r.ibsCredit],
          ["Débito nas vendas", r.cbsDebit, r.ibsDebit],
          ["A recolher", r.cbsDue, r.ibsDue],
          ["Saldo credor separado", r.cbsBalance, r.ibsBalance],
        ]}
      />
      <p className={TEXTO_DE_APOIO}>
        Crédito = base × elegibilidade × alíquota da compra, salvo substituição anual informada. No modo por atividade, a
        compensação respeita os créditos marcados como segregados. Saldo credor não gera ressarcimento nesta simulação.
        Alíquotas integrais e redução de vendas são hipóteses.
      </p>
      <TabelaDaMemoria
        cabecalho={["Tributos sobre lucro", "Presumido", "Real"]}
        linhas={[
          ["Base IRPJ", r.irBase, r.realBase],
          ["IRPJ (15%)", r.irpj, r.realIrpj],
          ["Adicional IRPJ", r.additional, r.realAdditional],
          ["Base CSLL", r.csBase, r.realBase],
          ["CSLL (9%)", r.csll, r.realCsll],
        ]}
      />
      <p className={TEXTO_DE_APOIO}>
        Real usa a margem de referência antes de IRPJ/CSLL, já líquida dos demais tributos e despesas. Com a folha
        automática, os encargos calculados substituem o valor já incluído nessa margem. Na avaliação, essa margem é
        composta pelos totais da DRE. Lucro e adicional anualizados: não modela sazonalidade, prejuízos fiscais, regimes
        especiais ou CSLL setorial.
      </p>
    </section>
  );
}

export function Sensibilidade({ d, year }: { d: Data; year: number }) {
  const id = useId();
  const [variation, setVariation] = useState(20),
    b = creditInputs(d);
  const rows = [-variation, 0, variation].map((v) => ({
    v,
    result: calculate(
      {
        ...d,
        cbsCreditBase: b.cbsBase * (1 + v / 100),
        ibsCreditBase: b.ibsBase * (1 + v / 100),
        activities: {
          ...d.activities,
          rows: d.activities.rows.map((a) => ({
            ...a,
            cbsCreditBase: a.cbsCreditBase * (1 + v / 100),
            ibsCreditBase: a.ibsCreditBase * (1 + v / 100),
          })),
        },
      },
      year,
    ),
  }));
  const excluded = scope(d);
  return (
    <section className={PAINEL}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={TITULO_DO_PAINEL}>Sensibilidade aos créditos</h2>
        <Selo>{year}</Selo>
      </div>
      <CampoForm label={`Variação das bases de compras: ±${variation}%`} htmlFor={id} className="max-w-md">
        <Deslizante
          id={id}
          aria-label="Variação das bases de compras"
          min={5}
          max={50}
          step={5}
          value={variation}
          onChange={(e) => setVariation(Number(e.target.value))}
        />
      </CampoForm>
      <div className={ROLAGEM_DA_TABELA}>
        <table className={TABELA}>
          <thead>
            <tr>
              <th className={CABECALHO}>Compras elegíveis</th>
              <th className={CABECALHO_NUMERO}>CBS/IBS a recolher</th>
              <th className={CABECALHO_NUMERO}>Híbrido</th>
              <th className={CABECALHO_NUMERO}>Presumido</th>
              <th className={CABECALHO_NUMERO}>Real</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ v, result: r }) => (
              <tr key={v}>
                <td className={CELULA}>{v === 0 ? "Base" : (v > 0 ? "+" : "") + v + "%"}</td>
                <td className={CELULA_NUMERO}>{brl(r.vat)}</td>
                <td className={CELULA_NUMERO}>{excluded[1] ? "Fora do escopo" : brl(r.hybrid)}</td>
                <td className={CELULA_NUMERO}>{excluded[2] ? "Fora do escopo" : brl(r.presumed)}</td>
                <td className={CELULA_NUMERO}>{excluded[3] ? "Fora do escopo" : brl(r.real)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={TEXTO_DE_APOIO}>
        Mantém vendas, margem, DAS e demais hipóteses. Varia apenas as bases de crédito; substituições anuais de crédito
        permanecem fixas. Não simula custos adicionais, efeito contábil ou ressarcimento. O cenário salvo permanece
        inalterado.
      </p>
    </section>
  );
}
