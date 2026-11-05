"use client";

// Receitas por atividade (comércio, fabricação e serviços no mesmo CNPJ) do
// Planejamento tributário (05/11/2026). Porte de `components/fiscal/activities-view.tsx`
// do Connect Tributário: mesmos campos, textos, limites e cálculos; só a camada
// visual virou a do Connect.

import { useId, useState, type ComponentProps } from "react";
import { CheckCircle2, ClipboardList, Layers3, Plus, Save, Trash2 } from "lucide-react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { MetricCard } from "@/components/ui/MetricCard";
import { Select } from "@/components/ui/Select";
import { Selo } from "@/components/ui/Selo";
import { Textarea } from "@/components/ui/Textarea";
import { useConfirm } from "@/components/ui/useConfirm";
import { CampoValor } from "@/components/tributario/CampoValor";
import {
  CABECALHO,
  CABECALHO_NUMERO,
  CELULA,
  CELULA_NUMERO,
  NOTA,
  PAINEL,
  ROLAGEM_DA_TABELA,
  ROTULO,
  TABELA,
  TEXTO_DE_APOIO,
  TITULO_DA_SECAO,
  TITULO_DO_PAINEL,
} from "@/components/tributario/estilos";
import { EditorDeTributosExternos, MemoriaDeTributosExternos } from "@/components/tributario/premissas/TributosExternos";
import { JanelaDeCopiaAnual, PanoramaAnualExterno } from "@/components/tributario/premissas/RevisaoAnual";
import {
  activityReference,
  activityResults,
  brl,
  calculate,
  creditInputs,
  percent,
  scope,
  years,
  type Data,
} from "@/lib/tributario/motor/fiscal";
import {
  activityKinds,
  activityPresets,
  activitySources,
  createActivity,
  treatmentLabels,
  type Activity,
  type ActivityAnnual,
  type ActivityKind,
} from "@/lib/tributario/motor/activities";

/** Os campos numéricos da atividade (o `number(...)` do original só recebe estes). */
type CampoNumerico = { [K in keyof Activity]: Activity[K] extends number ? K : never }[keyof Activity];
type CampoAnual = Exclude<keyof ActivityAnnual, "externalMode" | "externalItems">;

const LINK = "text-brand hover:underline";

/** O `Pick` do original: rótulo + seleção a partir de pares [valor, texto]. */
function Escolha({
  value,
  options,
  label,
  onChange,
}: {
  value: string;
  options: readonly (readonly [string, string])[];
  label: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <CampoForm label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([key, text]) => (
          <option value={key} key={key}>
            {text}
          </option>
        ))}
      </Select>
    </CampoForm>
  );
}

/**
 * O `<details open={...}>` do original: abre ou fecha quando a condição muda
 * (uma atividade só aparece aberta; tratamentos marcados abrem o bloco dos
 * valores por ano); no meio, quem decide é a pessoa.
 */
function Recolhivel({
  abrir,
  ...resto
}: Omit<ComponentProps<typeof BlocoRecolhivel>, "aberto" | "onAbertoChange" | "abertoInicial"> & { abrir: boolean }) {
  const [aberto, setAberto] = useState(abrir);
  const [antes, setAntes] = useState(abrir);
  if (abrir !== antes) {
    setAntes(abrir);
    setAberto(abrir);
  }
  return <BlocoRecolhivel {...resto} aberto={aberto} onAbertoChange={setAberto} />;
}

export function AtividadesDaAvaliacao({
  d,
  change,
  onSave,
  onDashboard,
  busy,
  studyMode = false,
}: {
  d: Data;
  change: (p: Partial<Data>) => void;
  onSave: () => void;
  onDashboard: () => void;
  busy: boolean;
  studyMode?: boolean;
}) {
  const prefixo = useId();
  const { dialog, requestConfirm } = useConfirm();
  const [selectedYear, setSelectedYear] = useState("2027"),
    [kind, setKind] = useState<ActivityKind>("commerce");
  const rows = d.activities.rows,
    total = rows.reduce((sum, a) => sum + a.revenue, 0),
    i = years.indexOf(Number(selectedYear));
  function setRows(next: Activity[]) {
    change({
      activities: { enabled: true, rows: next },
      revenue: next.reduce((sum, a) => sum + a.revenue, 0),
      payrollConfig: { ...d.payrollConfig, mixedReviewed: false },
    });
  }
  function edit(id: string, patch: Partial<Activity>) {
    setRows(
      rows.map((a) =>
        a.id === id
          ? { ...a, ...patch, reviewed: Object.keys(patch).length === 1 && "reviewed" in patch ? !!patch.reviewed : false }
          : a
      )
    );
  }
  function enable() {
    if (rows.length) {
      change({ activities: { ...d.activities, enabled: true }, revenue: total });
      return;
    }
    const kind: ActivityKind = d.annex === "I" ? "commerce" : d.annex === "II" ? "industry" : "services",
      base = creditInputs(d);
    const a = createActivity(kind, crypto.randomUUID(), d.revenue);
    setRows([
      {
        ...a,
        name: d.activity || a.name,
        annex: d.annex,
        factorR: d.factorR,
        simpleMethod: d.simpleMethod,
        presIR: d.presIR,
        presCS: d.presCS,
        cbs: d.cbs,
        ibs: d.ibs,
        cbsReduction: d.reduction,
        ibsReduction: d.reduction,
        cbsPurchaseRate: d.cbs,
        ibsPurchaseRate: d.ibs,
        cbsCreditBase: base.cbsBase,
        ibsCreditBase: base.ibsBase,
        pisCreditBase: base.pisBase,
        cbsCreditRate: base.cbsRate,
        ibsCreditRate: base.ibsRate,
        pisCreditRate: base.pisRate,
        pis: d.pis,
        pisPurchaseRate: d.pis,
        icms: kind === "services" ? 0 : d.legacy,
        iss: kind === "services" ? d.legacy : 0,
        annual: a.annual.map((v, j) => ({ ...v, das: d.das[j], removed: d.removed[j] })),
      },
    ]);
  }
  function preset(kinds: readonly ActivityKind[]) {
    const aplicar = () => {
      const amount = Math.round((d.revenue / kinds.length) * 100) / 100;
      setRows(
        kinds.map((k, j) => ({
          ...createActivity(k, crypto.randomUUID(), j === kinds.length - 1 ? d.revenue - amount * j : amount),
          cbs: d.cbs,
          ibs: d.ibs,
          cbsPurchaseRate: d.cbs,
          ibsPurchaseRate: d.ibs,
        }))
      );
    };
    if (!rows.length) {
      aplicar();
      return;
    }
    requestConfirm(
      {
        title: "Substituir a composição das atividades?",
        description:
          "A receita total da empresa será distribuída igualmente. Créditos e parâmetros por atividade precisarão ser revisados.",
        confirmLabel: "Substituir",
      },
      async () => aplicar()
    );
  }
  function number(a: Activity, key: CampoNumerico, label: string, help?: string) {
    const id = `${prefixo}-${a.id}-${key}`;
    // Reais nos mesmos campos em que o original subia o limite para 1e12; o resto é percentual.
    const dinheiro = String(key).includes("Base") || key === "revenue" || key === "currentExtra";
    return (
      <CampoForm key={key} label={label} htmlFor={id} helper={help}>
        <CampoValor
          id={id}
          value={a[key]}
          prefix={dinheiro ? "R$" : undefined}
          suffix={dinheiro ? undefined : "%"}
          onChange={(v) => edit(a.id, { [key]: v ?? 0 })}
        />
      </CampoForm>
    );
  }
  function annual(a: Activity, key: CampoAnual, label: string, optional = false) {
    const id = `${prefixo}-${a.id}-anual-${key}`;
    return (
      <CampoForm key={key} label={label} htmlFor={id}>
        <CampoValor
          id={id}
          value={a.annual[i][key]}
          placeholder={optional ? "Automático" : "0"}
          prefix={key === "das" || key === "removed" ? undefined : "R$"}
          suffix={key === "das" ? "%" : key === "removed" ? "p.p." : undefined}
          onChange={(v) =>
            edit(a.id, { annual: a.annual.map((x, j) => (j === i ? { ...x, [key]: optional ? v : (v ?? 0) } : x)) })
          }
        />
      </CampoForm>
    );
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className={ROTULO}>COMPOSIÇÃO DA EMPRESA</p>
          <h2 className={`${TITULO_DA_SECAO} mt-1`}>Receitas por atividade</h2>
          <p className={`${TEXTO_DE_APOIO} mt-1`}>Comércio, fabricação e serviços no mesmo CNPJ.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onDashboard}>
            Ver comparativo
          </Button>
          <Button variant="primary" disabled={busy} onClick={onSave}>
            <Save size={17} aria-hidden />
            {busy ? "Salvando…" : studyMode ? "Salvar avaliação" : "Salvar análise"}
          </Button>
        </div>
      </div>
      {studyMode && (
        <p className={NOTA}>
          A receita total vem dos Dados da avaliação. Distribua esse total entre as atividades sem alterar a DRE; diferenças na
          composição precisam ser corrigidas antes do comparativo.
        </p>
      )}
      <section className={PAINEL}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className={TITULO_DO_PAINEL}>{d.name}</h2>
            <p className="text-ui text-fg-secondary">
              RBT12 consolidada: <strong className="font-semibold text-fg">{brl(d.rbt12)}</strong> · FS12:{" "}
              <strong className="font-semibold text-fg">{brl(d.payroll)}</strong>
            </p>
          </div>
          <Checkbox
            id={`${prefixo}-por-atividade`}
            checked={d.activities.enabled}
            onChange={(e) => (e.target.checked ? enable() : change({ activities: { ...d.activities, enabled: false } }))}
            label="Calcular por atividade"
          />
        </div>
      </section>
      {!d.activities.enabled ? (
        <section className={PAINEL}>
          <h2 className={TITULO_DO_PAINEL}>Separar as receitas</h2>
          <p className="text-ui text-fg-secondary">
            Ative o cálculo por atividade para usar anexos, presunções, ICMS, ISS e créditos diferentes. Os parâmetros atuais
            serão copiados para a primeira atividade.
          </p>
          <Button variant="primary" onClick={enable}>
            <Layers3 size={18} aria-hidden />
            Configurar atividades
          </Button>
        </section>
      ) : (
        <>
          <section className={PAINEL}>
            <h2 className={TITULO_DO_PAINEL}>Composição da empresa</h2>
            <p className="text-ui text-fg-secondary">
              Escolha um modelo ou adicione atividades individualmente. Os modelos distribuem a receita atual em partes iguais;
              ajuste os valores e confira os parâmetros.
            </p>
            <div className="flex flex-wrap gap-2">
              {activityPresets.map((p) => (
                <Button variant="secondary" size="sm" key={p.label} onClick={() => preset(p.kinds)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </section>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard label="Receita anual consolidada" value={brl(total)} />
            <MetricCard label="Atividades cadastradas" value={String(rows.length)} />
            <MetricCard label="Parâmetros revisados" value={`${rows.filter((a) => a.reviewed).length} / ${rows.length}`} />
          </div>
          <p className={TEXTO_DE_APOIO}>
            RBT12 e FS12 pertencem à empresa e não são divididas entre as atividades. As bases de crédito devem ser distribuídas
            uma única vez, inclusive as compras comuns. Ajuste os totais consolidados em Dados; a margem de referência vem da
            DRE.
          </p>
          <div className="space-y-3">
            {rows.map((a, index) => {
              const ref = activityReference(d, a);
              return (
                <Recolhivel
                  key={a.id}
                  abrir={rows.length === 1}
                  className="bg-surface"
                  classeDoConteudo="space-y-4 px-4 pb-4"
                  titulo={
                    <span className="flex min-w-0 items-start gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-micro font-semibold text-fg-secondary tabular-nums">
                        {index + 1}
                      </span>
                      <span className="block min-w-0">
                        <span className="block truncate">{a.name || "Nova atividade"}</span>
                        <span className="block text-helper font-normal text-fg-muted">
                          {activityKinds[a.kind]} · {brl(a.revenue)} · {total ? percent((a.revenue / total) * 100) : "0%"}
                        </span>
                      </span>
                    </span>
                  }
                  resumo={<Selo tom={a.reviewed ? "sucesso" : "atencao"}>{a.reviewed ? "Revisada" : "Conferir"}</Selo>}
                >
                  <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
                    <CampoForm label="Nome da atividade" htmlFor={`${prefixo}-${a.id}-nome`}>
                      <Input
                        id={`${prefixo}-${a.id}-nome`}
                        value={a.name}
                        maxLength={160}
                        onChange={(e) => edit(a.id, { name: e.target.value })}
                      />
                    </CampoForm>
                    <Escolha
                      value={a.kind}
                      label="Tipo de atividade"
                      options={Object.entries(activityKinds)}
                      onChange={(v) =>
                        edit(a.id, {
                          kind: v as ActivityKind,
                          annex: createActivity(v as ActivityKind, a.id).annex,
                          presIR: createActivity(v as ActivityKind, a.id).presIR,
                          presCS: createActivity(v as ActivityKind, a.id).presCS,
                          factorR: false,
                          treatments:
                            v === "industry"
                              ? [...new Set([...a.treatments, "ipi" as const])]
                              : v === "other"
                                ? [...new Set([...a.treatments, "specific" as const])]
                                : a.treatments,
                        })
                      }
                    />
                    {number(a, "revenue", "Receita anual (R$)")}
                    <CampoForm label="CNAE de referência" htmlFor={`${prefixo}-${a.id}-cnae`}>
                      <Input
                        id={`${prefixo}-${a.id}-cnae`}
                        value={a.cnae}
                        maxLength={30}
                        placeholder="Opcional"
                        onChange={(e) => edit(a.id, { cnae: e.target.value })}
                      />
                    </CampoForm>
                    <CampoForm label="NCM / código de serviço" htmlFor={`${prefixo}-${a.id}-classificacao`}>
                      <Input
                        id={`${prefixo}-${a.id}-classificacao`}
                        value={a.classification}
                        maxLength={100}
                        placeholder="Referência, sem consulta automática"
                        onChange={(e) => edit(a.id, { classification: e.target.value })}
                      />
                    </CampoForm>
                    <CampoForm label="UF de referência" htmlFor={`${prefixo}-${a.id}-uf`}>
                      <Input
                        id={`${prefixo}-${a.id}-uf`}
                        value={a.uf}
                        maxLength={2}
                        placeholder="PR"
                        onChange={(e) => edit(a.id, { uf: e.target.value.toUpperCase() })}
                      />
                    </CampoForm>
                  </FieldGrid>

                  <BlocoRecolhivel abertoInicial titulo="Simples e bases presumidas" classeDoConteudo="space-y-3 px-4 pb-4">
                    <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-4">
                      <Escolha
                        label="Método do DAS"
                        value={a.simpleMethod}
                        options={[
                          ["reference", "Referência por anexo"],
                          ["manual", "Informado por ano"],
                        ]}
                        onChange={(v) => edit(a.id, { simpleMethod: v as Activity["simpleMethod"] })}
                      />
                      <Escolha
                        label="Anexo de referência"
                        value={a.annex}
                        options={["I", "II", "III", "IV", "V"].map((k) => [k, "Anexo " + k] as const)}
                        onChange={(v) => edit(a.id, { annex: v as Activity["annex"], factorR: false })}
                      />
                      {number(a, "presIR", "Base presumida IRPJ (%)")}
                      {number(a, "presCS", "Base presumida CSLL (%)")}
                    </FieldGrid>
                    <Checkbox
                      id={`${prefixo}-${a.id}-fator-r`}
                      checked={a.factorR}
                      onChange={(e) => edit(a.id, { factorR: e.target.checked, annex: e.target.checked ? "III" : a.annex })}
                      label="Atividade sujeita ao Fator R (III / V)"
                    />
                    <p className={TEXTO_DE_APOIO}>
                      {ref
                        ? "Referência: Anexo " +
                          ref.annex +
                          " · alíquota efetiva " +
                          percent(ref.effective) +
                          " · Fator R " +
                          percent(ref.factor * 100) +
                          "."
                        : "Informe a RBT12 consolidada para consultar a referência."}{" "}
                      A escolha do anexo e a elegibilidade dependem da atividade real. Exclusões do DAS no híbrido são informadas
                      por ano.
                    </p>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {(
                        [
                          ["simpleAllowed", "Simples permitido"],
                          ["presumedAllowed", "Presumido permitido"],
                          ["realAllowed", "Real aplicável"],
                        ] as const
                      ).map(([key, label]) => (
                        <Checkbox
                          key={key}
                          id={`${prefixo}-${a.id}-${key}`}
                          checked={a[key]}
                          onChange={(e) => edit(a.id, { [key]: e.target.checked })}
                          label={label}
                        />
                      ))}
                    </div>
                  </BlocoRecolhivel>

                  <BlocoRecolhivel titulo="ICMS, ISS, CBS, IBS e créditos" classeDoConteudo="space-y-3 px-4 pb-4">
                    <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
                      {number(a, "icms", "ICMS líquido atual (% da receita)")}
                      {number(a, "iss", "ISS líquido atual (% da receita)")}
                      {number(a, "cbs", "CBS integral nas vendas (%)")}
                      {number(a, "ibs", "IBS integral nas vendas (%)")}
                      {number(a, "cbsReduction", "Redução de CBS nas vendas (%)")}
                      {number(a, "ibsReduction", "Redução de IBS nas vendas (%)")}
                      {number(a, "cbsCreditBase", "Compras para CBS (R$)")}
                      {number(a, "ibsCreditBase", "Compras para IBS (R$)")}
                      {number(a, "cbsCreditRate", "Elegibilidade do crédito CBS (%)")}
                      {number(a, "ibsCreditRate", "Elegibilidade do crédito IBS (%)")}
                      {number(a, "cbsPurchaseRate", "CBS integral nas compras (%)")}
                      {number(a, "ibsPurchaseRate", "IBS integral nas compras (%)")}
                      <Escolha
                        label="Compensação de créditos CBS / IBS"
                        value={a.creditPool}
                        options={[
                          ["company", "Consolidar com a empresa"],
                          ["isolated", "Manter segregados nesta atividade"],
                        ]}
                        onChange={(v) => edit(a.id, { creditPool: v as Activity["creditPool"] })}
                      />
                    </FieldGrid>
                    <p className={TEXTO_DE_APOIO}>
                      Informe bases sem CBS/IBS e créditos efetivamente admitidos. ICMS/ISS são cargas líquidas sobre a receita;
                      não são alíquotas de nota fiscal. A transição é aplicada automaticamente. Valores anuais específicos
                      substituem esse cálculo quando preenchidos.
                    </p>
                  </BlocoRecolhivel>

                  <BlocoRecolhivel titulo="Referência atual do Lucro Real" classeDoConteudo="space-y-3 px-4 pb-4">
                    <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
                      {number(a, "pis", "PIS/Cofins nas vendas (%)")}
                      {number(a, "pisCreditBase", "Base de crédito PIS/Cofins (R$)")}
                      {number(a, "pisCreditRate", "Elegibilidade PIS/Cofins (%)")}
                      {number(a, "pisPurchaseRate", "PIS/Cofins nas compras (%)")}
                      {number(a, "currentExtra", "Outros tributos externos atuais (R$/ano)")}
                    </FieldGrid>
                    <p className={TEXTO_DE_APOIO}>
                      Informe no último campo os valores líquidos de IPI, ST, DIFAL e outros que não estejam no ICMS/ISS ou nos
                      encargos gerais. Os valores futuros são separados por ano abaixo. A margem consolidada deve refletir as
                      despesas e os tributos pertinentes; estes campos não recalculam a DRE.
                    </p>
                  </BlocoRecolhivel>

                  <Recolhivel
                    abrir={a.treatments.length > 0}
                    titulo="Tratamentos especiais e valores por ano"
                    classeDoConteudo="space-y-4 px-4 pb-4"
                  >
                    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(treatmentLabels).map(([key, label]) => (
                        <Checkbox
                          key={key}
                          id={`${prefixo}-${a.id}-tratamento-${key}`}
                          checked={a.treatments.includes(key as Activity["treatments"][number])}
                          onChange={(e) =>
                            edit(a.id, {
                              treatments: e.target.checked
                                ? [...a.treatments, key as Activity["treatments"][number]]
                                : a.treatments.filter((v) => v !== key),
                            })
                          }
                          label={label}
                        />
                      ))}
                    </div>
                    <p className={TEXTO_DE_APOIO}>
                      A marcação identifica o tratamento; não determina alíquota, dispensa ou direito a crédito. Para ST,
                      monofásicos e outras exceções, informe o DAS ajustado no método manual, os débitos/créditos aplicáveis e os
                      recolhimentos externos, sem duplicar valores. Para indústria, confira expressamente o IPI, inclusive sua
                      transição e exceções.
                    </p>
                    <PanoramaAnualExterno
                      values={a.annual}
                      selected={Number(selectedYear)}
                      onSelect={(year) => setSelectedYear(String(year))}
                    />
                    <FieldGrid columns="sm:grid-cols-[minmax(0,14rem)_auto]">
                      <Escolha
                        label="Ano dos parâmetros"
                        value={selectedYear}
                        options={years.map((y) => [String(y), String(y)] as const)}
                        onChange={setSelectedYear}
                      />
                      <AlinhadoAoCampo>
                        <JanelaDeCopiaAnual values={a.annual} source={i} name={a.name} onApply={(annual) => edit(a.id, { annual })} />
                      </AlinhadoAoCampo>
                    </FieldGrid>
                    <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
                      {a.simpleMethod === "manual" && annual(a, "das", "DAS total (% da receita)")}
                      {annual(a, "removed", "Parcela do DAS excluída no híbrido (p.p.)")}
                    </FieldGrid>
                    <h3 className={TITULO_DO_PAINEL}>Substituir valores calculados de {selectedYear}</h3>
                    <p className={TEXTO_DE_APOIO}>
                      Vazio mantém o cálculo automático. Zero substitui o valor por zero. Preencha os valores anuais já
                      considerando a regra e a transição do período.
                    </p>
                    <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
                      {annual(a, "cbsDebit", "Débito CBS (R$)", true)}
                      {annual(a, "cbsCredit", "Crédito CBS (R$)", true)}
                      {annual(a, "ibsDebit", "Débito IBS (R$)", true)}
                      {annual(a, "ibsCredit", "Crédito IBS (R$)", true)}
                      {annual(a, "icms", "ICMS líquido (R$)", true)}
                      {annual(a, "iss", "ISS líquido (R$)", true)}
                    </FieldGrid>
                    <h3 className={TITULO_DO_PAINEL}>Recolhimentos adicionais em {selectedYear}</h3>
                    <p className={TEXTO_DE_APOIO}>
                      IPI, ST, DIFAL/FCP, importação, Imposto Seletivo ou outros valores externos. Informe somente o que ainda
                      não entrou nos cálculos acima ou nos encargos gerais. Não inclua folha, que tem conciliação própria. No
                      Simples, não repita tributos já presentes no DAS.
                    </p>
                    <EditorDeTributosExternos
                      key={a.id + selectedYear}
                      value={a.annual[i]}
                      year={Number(selectedYear)}
                      change={(value) => edit(a.id, { annual: a.annual.map((v, j) => (j === i ? value : v)) })}
                    />
                    {a.annual[i].externalMode === "total" && (
                      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-4">
                        {annual(a, "simple", "Fora do DAS — Simples (R$)")}
                        {annual(a, "hybrid", "Fora do DAS — Híbrido (R$)")}
                        {annual(a, "presumed", "Adicionais — Presumido (R$)")}
                        {annual(a, "real", "Adicionais — Real (R$)")}
                      </FieldGrid>
                    )}
                  </Recolhivel>

                  <CampoForm label="Fundamentação e memória dos tratamentos" htmlFor={`${prefixo}-${a.id}-basis`}>
                    <Textarea
                      id={`${prefixo}-${a.id}-basis`}
                      value={a.basis}
                      maxLength={2000}
                      onChange={(e) => edit(a.id, { basis: e.target.value })}
                      placeholder="Registre norma, vigência, origem dos valores e tributos incluídos. Obrigatório para tratamentos especiais; justifique também valores zero."
                    />
                  </CampoForm>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Checkbox
                      id={`${prefixo}-${a.id}-reviewed`}
                      checked={a.reviewed}
                      onChange={(e) => edit(a.id, { reviewed: e.target.checked })}
                      label="Conferi enquadramento, valores de todos os anos, créditos e ausência de duplicidade."
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        requestConfirm(
                          { title: "Remover " + a.name + " da composição?", confirmLabel: "Remover", destructive: true },
                          async () => setRows(rows.filter((x) => x.id !== a.id))
                        )
                      }
                    >
                      <Trash2 size={16} aria-hidden />
                      Remover
                    </Button>
                  </div>
                </Recolhivel>
              );
            })}
          </div>
          <section className={PAINEL}>
            <FieldGrid columns="sm:grid-cols-[minmax(0,20rem)_auto]">
              <Escolha
                label="Nova atividade"
                value={kind}
                options={Object.entries(activityKinds)}
                onChange={(v) => setKind(v as ActivityKind)}
              />
              <AlinhadoAoCampo>
                <Button
                  variant="secondary"
                  disabled={rows.length >= 30}
                  onClick={() => setRows([...rows, createActivity(kind, crypto.randomUUID())])}
                >
                  <Plus size={17} aria-hidden />
                  Adicionar atividade
                </Button>
              </AlinhadoAoCampo>
            </FieldGrid>
          </section>
          <section className={PAINEL}>
            <h2 className={`${TITULO_DO_PAINEL} flex items-center gap-2`}>
              <ClipboardList size={20} aria-hidden className="shrink-0 text-fg-muted" />
              Cobertura do cenário
            </h2>
            <ul className="divide-y divide-border">
              {scope(d).map((issue, index) => (
                <li key={index} className="flex items-start gap-3 py-2 text-ui">
                  <strong className="w-24 shrink-0 font-semibold text-fg">{["Simples", "Híbrido", "Presumido", "Real"][index]}</strong>
                  <span className="min-w-0 flex-1 text-fg-secondary">{issue || "Disponível com os parâmetros revisados."}</span>
                  {!issue && <CheckCircle2 size={17} className="shrink-0 text-success-fg" />}
                </li>
              ))}
            </ul>
            <p className={TEXTO_DE_APOIO}>
              O motor calcula estimativas anuais. Não consulta automaticamente CNAE/NCM, regras estaduais ou regimes setoriais.
              Casos com regras não representadas exigem cálculo específico documentado antes da revisão.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-helper">
              {activitySources.map(([label, url]) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className={LINK}>
                  {label}
                </a>
              ))}
            </div>
          </section>
        </>
      )}
      {dialog}
    </section>
  );
}

export function MemoriaDasAtividades({ d, year }: { d: Data; year: number }) {
  if (!d.activities.enabled) return null;
  const rows = activityResults(d, year),
    r = calculate(d, year),
    excluded = scope(d);
  return (
    <section className={PAINEL}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={TITULO_DO_PAINEL}>Receitas e tributos por atividade</h2>
        <Selo tom="neutro">{year}</Selo>
      </div>
      <p className={TEXTO_DE_APOIO}>
        {excluded.some(Boolean) && "Memória provisória: confira as pendências de cobertura. "}RBT12 consolidada: {brl(d.rbt12)} ·
        FS12: {brl(d.payroll)}. Bases do Presumido somadas antes do adicional de IRPJ. Créditos consolidados por tributo,
        respeitando atividades marcadas como segregadas.
      </p>
      <div className={ROLAGEM_DA_TABELA}>
        <table className={TABELA}>
          <thead>
            <tr>
              <th className={CABECALHO}>Atividade</th>
              <th className={CABECALHO_NUMERO}>Receita</th>
              <th className={CABECALHO_NUMERO}>DAS</th>
              <th className={CABECALHO_NUMERO}>Base IRPJ</th>
              <th className={CABECALHO_NUMERO}>Base CSLL</th>
              <th className={CABECALHO_NUMERO}>ICMS / ISS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={CELULA}>
                  <strong className="font-semibold">{a.name}</strong>
                  <div className={TEXTO_DE_APOIO}>
                    Anexo {a.annex}
                    {a.manual ? " · valores específicos" : ""}
                  </div>
                </td>
                <td className={CELULA_NUMERO}>{brl(a.revenue)}</td>
                <td className={CELULA_NUMERO}>{excluded[0] ? "Conferir" : brl(a.das)}</td>
                <td className={CELULA_NUMERO}>{brl(a.irBase)}</td>
                <td className={CELULA_NUMERO}>{brl(a.csBase)}</td>
                <td className={CELULA_NUMERO}>{brl(a.icms + a.iss)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={ROLAGEM_DA_TABELA}>
        <table className={TABELA}>
          <thead>
            <tr>
              <th className={CABECALHO}>Atividade</th>
              <th className={CABECALHO_NUMERO}>Débito CBS</th>
              <th className={CABECALHO_NUMERO}>Crédito CBS</th>
              <th className={CABECALHO_NUMERO}>Débito IBS</th>
              <th className={CABECALHO_NUMERO}>Crédito IBS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={CELULA}>
                  {a.name}
                  <div className={TEXTO_DE_APOIO}>{a.creditPool === "isolated" ? "Crédito segregado" : "Crédito consolidado"}</div>
                </td>
                <td className={CELULA_NUMERO}>{brl(a.cbsDebit)}</td>
                <td className={CELULA_NUMERO}>{brl(a.cbsCredit)}</td>
                <td className={CELULA_NUMERO}>{brl(a.ibsDebit)}</td>
                <td className={CELULA_NUMERO}>{brl(a.ibsCredit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className={TITULO_DO_PAINEL}>Recolhimentos adicionais informados</h3>
      <div className={ROLAGEM_DA_TABELA}>
        <table className={TABELA}>
          <thead>
            <tr>
              <th className={CABECALHO}>Atividade</th>
              {["Simples", "Híbrido", "Presumido", "Real"].map((x) => (
                <th className={CABECALHO_NUMERO} key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={CELULA}>{a.name}</td>
                {(["simple", "hybrid", "presumed", "real"] as const).map((k) => (
                  <td className={CELULA_NUMERO} key={k}>
                    {brl(a.external[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows
        .filter((a) => a.externalItems.length > 0)
        .map((a) => (
          <MemoriaDeTributosExternos key={a.id} name={a.name} items={a.externalItems} />
        ))}
      <p className="text-ui text-fg">
        Base IRPJ consolidada: {brl(r.irBase)} · Adicional IRPJ: {brl(r.additional)} · CBS a recolher: {brl(r.cbsDue)} · IBS a
        recolher: {brl(r.ibsDue)}.
      </p>
      {d.activities.rows
        .filter((a) => a.basis)
        .map((a) => (
          <p className="text-ui text-fg-secondary" key={a.id}>
            <strong className="font-semibold text-fg">{a.name}:</strong> {a.basis}
          </p>
        ))}
      <p className={TEXTO_DE_APOIO}>
        Resultados sujeitos à cobertura indicada no comparativo. O Lucro Real utiliza a margem consolidada, após conciliação da
        folha; os tributos por atividade não reconstroem automaticamente a DRE.
      </p>
    </section>
  );
}
