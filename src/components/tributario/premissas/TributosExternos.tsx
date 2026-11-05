"use client";

// Recolhimentos adicionais por ano de uma atividade (IPI, ST, DIFAL…) do
// Planejamento tributário (05/11/2026). Porte de `components/fiscal/external-taxes.tsx`
// do Connect Tributário: mesmos campos, textos, limites e cálculos; só a camada
// visual virou a do Connect.

import { useId, useState, type ComponentProps } from "react";
import { Calculator, Copy, Plus, Trash2 } from "lucide-react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useConfirm } from "@/components/ui/useConfirm";
import { CampoValor } from "@/components/tributario/CampoValor";
import {
  CABECALHO,
  CABECALHO_NUMERO,
  CELULA,
  CELULA_NUMERO,
  PAINEL,
  ROLAGEM_DA_TABELA,
  TABELA,
  TEXTO_DE_APOIO,
  TITULO_DO_PAINEL,
} from "@/components/tributario/estilos";
import type { ActivityAnnual } from "@/lib/tributario/motor/activities";
import {
  createExternalTax,
  detailExternalYear,
  externalAmounts,
  externalRegimes,
  externalStatuses,
  externalTaxKinds,
  externalTaxProblem,
  externalTaxResult,
  externalTaxSources,
  filterExternalItems,
  type ExternalRegime,
  type ExternalReviewFilter,
  type ExternalTax,
} from "@/lib/tributario/motor/external-taxes";

/** O `money` do original: reais com centavos (o `brl` do motor arredonda para inteiro). */
const money = (value: number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const VAZIO = "rounded-md border border-dashed border-border px-3 py-2 text-ui text-fg-muted";

/** O `Pick` do original: rótulo + seleção a partir de um mapa valor → texto. */
function Escolha({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <CampoForm label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(options).map(([chave, texto]) => (
          <option value={chave} key={chave}>
            {texto}
          </option>
        ))}
      </Select>
    </CampoForm>
  );
}

/**
 * O `<details open={...}>` do original: abre ou fecha quando a condição muda
 * (o item fecha ao ser conferido e reabre ao ser editado); no meio, quem decide
 * é a pessoa.
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

export function EditorDeTributosExternos({
  value,
  year,
  change,
}: {
  value: ActivityAnnual;
  year: number;
  change: (next: ActivityAnnual) => void;
}) {
  const prefixo = useId();
  const { dialog, requestConfirm } = useConfirm();
  const [kind, setKind] = useState<ExternalTax["kind"]>("ipi"),
    [regime, setRegime] = useState<ExternalRegime>("real");
  const [filterRegime, setFilterRegime] = useState<ExternalRegime | "all">("all"),
    [filterReview, setFilterReview] = useState<ExternalReviewFilter>("all"),
    [query, setQuery] = useState("");
  const items = value.externalItems,
    totals = externalAmounts(value),
    visible = filterExternalItems(items, filterRegime, filterReview, query),
    pending = items.filter((item) => externalTaxProblem(item) !== null).length;
  const clearFilters = () => {
    setFilterRegime("all");
    setFilterReview("all");
    setQuery("");
  };
  const update = (next: ExternalTax[]) => change({ ...value, externalItems: next });
  const edit = (id: string, patch: Partial<ExternalTax>) =>
    update(
      items.map((item) =>
        item.id === id
          ? { ...item, ...patch, reviewed: Object.keys(patch).length === 1 && "reviewed" in patch ? !!patch.reviewed : false }
          : item
      )
    );

  function field(item: ExternalTax, key: "base" | "rate" | "debits" | "deductions" | "amount", label: string) {
    const id = `${prefixo}-${item.id}-${key}`;
    return (
      <CampoForm label={label} htmlFor={id}>
        <CampoValor
          id={id}
          value={item[key]}
          prefix={key === "rate" ? undefined : "R$"}
          suffix={key === "rate" ? "%" : undefined}
          onChange={(v) => edit(item.id, { [key]: v ?? 0 })}
        />
      </CampoForm>
    );
  }

  return (
    <section className={PAINEL}>
      <div className="flex items-center gap-2">
        <Calculator size={19} aria-hidden className="shrink-0 text-fg-muted" />
        <h3 className={TITULO_DO_PAINEL}>Composição dos recolhimentos de {year}</h3>
      </div>
      <Escolha
        label="Como informar os recolhimentos adicionais"
        value={value.externalMode}
        options={{ total: "Totais por regime", items: "Detalhar por tributo" }}
        onChange={(mode) => {
          if (mode === "items") change(detailExternalYear(value, () => crypto.randomUUID()));
          else
            requestConfirm(
              {
                title: "Usar novamente os totais por regime?",
                description: "Os itens detalhados serão preservados, mas deixarão de entrar no cálculo.",
                confirmLabel: "Usar os totais",
              },
              async () => change({ ...value, externalMode: "total" })
            );
        }}
      />
      {value.externalMode === "total" ? (
        <p className={TEXTO_DE_APOIO}>
          Os quatro totais abaixo entram no comparativo. Para explicar sua composição, escolha Detalhar por tributo; os totais
          existentes serão convertidos em itens na primeira utilização.
        </p>
      ) : (
        <>
          <p className={TEXTO_DE_APOIO}>
            Cadastre cada tributo no regime correspondente. Estes itens substituem os quatro totais manuais deste ano. Valores
            informados já devem considerar a vigência e a transição; o app não determina alíquota, base legal, MVA ou
            enquadramento.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(externalRegimes) as ExternalRegime[]).map((k) => (
              <div key={k} className="rounded-md border border-border bg-surface-2 px-3 py-2">
                <span className="block text-helper text-fg-muted">{externalRegimes[k]}</span>
                <strong className="block text-ui font-semibold text-fg tabular-nums">{money(totals[k])}</strong>
              </div>
            ))}
          </div>
          {!items.length && (
            <p className={VAZIO}>Nenhum recolhimento detalhado para {year}. O adicional é zero em todos os regimes.</p>
          )}
          {items.length > 0 && (
            <>
              <FieldGrid columns="sm:grid-cols-3">
                <Escolha
                  label="Filtrar regime"
                  value={filterRegime}
                  options={{ all: "Todos os regimes", ...externalRegimes }}
                  onChange={(v) => setFilterRegime(v as ExternalRegime | "all")}
                />
                <Escolha
                  label="Filtrar situação"
                  value={filterReview}
                  options={{
                    all: "Todas as situações",
                    pending: "Pendentes de conferência",
                    external: "Adicionais externos",
                    included: "Já incluídos",
                    notApplicable: "Não devidos",
                  }}
                  onChange={(v) => setFilterReview(v as ExternalReviewFilter)}
                />
                <CampoForm label="Buscar tributo ou operação" htmlFor={`${prefixo}-busca`}>
                  <CampoDeBusca
                    id={`${prefixo}-busca`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Nome do tributo ou da operação"
                  />
                </CampoForm>
              </FieldGrid>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span role="status" className="text-ui text-fg-secondary">
                  {visible.length} de {items.length} itens · {pending} pendentes neste ano
                </span>
                <Button variant="link" className="text-ui" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              </div>
              <p className={TEXTO_DE_APOIO}>
                Os filtros apenas organizam a lista. Os totais acima continuam incluindo todos os itens do ano.
              </p>
              {!visible.length && <p className={VAZIO}>Nenhum recolhimento corresponde aos filtros.</p>}
            </>
          )}
          <div className="space-y-2">
            {visible.map((item) => {
              const r = externalTaxResult(item),
                problem = externalTaxProblem(item);
              return (
                <Recolhivel
                  key={item.id}
                  abrir={!!problem}
                  className="bg-surface"
                  classeDoConteudo="space-y-4 px-4 pb-4"
                  titulo={
                    <span className="block min-w-0">
                      <span className="block truncate">{item.name || externalTaxKinds[item.kind]}</span>
                      <span className={`block text-helper font-normal ${problem ? "text-warning-fg" : "text-fg-muted"}`}>
                        {externalRegimes[item.regime]} · {problem ? "Conferir" : "Conferido"}
                      </span>
                    </span>
                  }
                  resumo={
                    <span className="flex flex-col items-end">
                      <span className="font-semibold text-fg">{money(r.added)}</span>
                      <span className="text-helper">
                        {item.status === "external" ? "Adicional" : item.status === "included" ? "Já incluído" : "Não devido"}
                      </span>
                    </span>
                  }
                >
                  <FieldGrid>
                    <Escolha
                      label="Tributo"
                      value={item.kind}
                      options={externalTaxKinds}
                      onChange={(v) =>
                        edit(item.id, {
                          kind: v as ExternalTax["kind"],
                          name:
                            item.name === externalTaxKinds[item.kind] ? externalTaxKinds[v as ExternalTax["kind"]] : item.name,
                        })
                      }
                    />
                    <Escolha
                      label="Regime"
                      value={item.regime}
                      options={externalRegimes}
                      onChange={(v) => edit(item.id, { regime: v as ExternalRegime })}
                    />
                    <CampoForm label="Identificação da operação" htmlFor={`${prefixo}-${item.id}-nome`}>
                      <Input
                        id={`${prefixo}-${item.id}-nome`}
                        value={item.name}
                        maxLength={140}
                        onChange={(e) => edit(item.id, { name: e.target.value })}
                        placeholder="Ex.: IPI — linha de produção A"
                      />
                    </CampoForm>
                    <Escolha
                      label="Tratamento no comparativo"
                      value={item.status}
                      options={externalStatuses}
                      onChange={(v) => edit(item.id, { status: v as ExternalTax["status"] })}
                    />
                  </FieldGrid>
                  <Escolha
                    label="Memória de cálculo"
                    value={item.method}
                    options={{ amount: "Valor líquido apurado", calculated: "Base × alíquota + débitos − abatimentos" }}
                    onChange={(v) => edit(item.id, { method: v as ExternalTax["method"] })}
                  />
                  {item.method === "amount" ? (
                    field(item, "amount", "Valor líquido anual (R$)")
                  ) : (
                    <>
                      <FieldGrid>
                        {field(item, "base", "Base de cálculo já ajustada (R$)")}
                        {field(item, "rate", "Alíquota aplicável no ano (%)")}
                        {field(item, "debits", "Outros débitos (R$)")}
                        {field(item, "deductions", "Créditos / abatimentos admitidos (R$)")}
                      </FieldGrid>
                      <p className={TEXTO_DE_APOIO}>
                        A base deve ser preparada conforme a operação. Para ST, não informe MVA como alíquota; para DIFAL, use
                        valor já apurado se a fórmula aplicável exigir bases ou cálculos distintos. Abatimentos excedentes não
                        reduzem outros tributos nem geram restituição nesta simulação.
                      </p>
                    </>
                  )}
                  <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-2 px-3 py-2 text-ui text-fg-secondary">
                    <span>
                      {item.method === "calculated"
                        ? `${money(item.base)} × ${Number(item.rate).toLocaleString("pt-BR")}% + ${money(item.debits)} − ${money(item.deductions)}`
                        : "Valor líquido informado: " + money(item.amount)}
                    </span>
                    <strong className="font-semibold text-fg">Adicionado ao comparativo: {money(r.added)}</strong>
                    {item.status !== "external" && <span>{externalStatuses[item.status]} — sem acréscimo.</span>}
                    {r.unused > 0 && <span>Abatimento excedente não utilizado: {money(r.unused)}.</span>}
                  </div>
                  <CampoForm label="Origem dos valores e fundamentação" htmlFor={`${prefixo}-${item.id}-basis`}>
                    <Textarea
                      id={`${prefixo}-${item.id}-basis`}
                      value={item.basis}
                      maxLength={1500}
                      onChange={(e) => edit(item.id, { basis: e.target.value })}
                      placeholder="Norma, período, documento e composição da base. Se já incluído, identifique o componente. Se não devido, justifique."
                    />
                  </CampoForm>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Checkbox
                      id={`${prefixo}-${item.id}-reviewed`}
                      checked={item.reviewed}
                      disabled={!item.name.trim() || !item.basis.trim()}
                      onChange={(e) => edit(item.id, { reviewed: e.target.checked })}
                      label="Conferi regra, período, cálculo e ausência de duplicidade."
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        requestConfirm(
                          { title: "Excluir este recolhimento de " + year + "?", confirmLabel: "Excluir", destructive: true },
                          async () => update(items.filter((x) => x.id !== item.id))
                        )
                      }
                    >
                      <Trash2 size={15} aria-hidden />
                      Excluir
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={TEXTO_DE_APOIO}>Copiar para outro regime e revisar:</span>
                    {(Object.keys(externalRegimes) as ExternalRegime[])
                      .filter((k) => k !== item.regime)
                      .map((k) => (
                        <Button
                          variant="secondary"
                          size="xs"
                          key={k}
                          disabled={items.length >= 24}
                          onClick={() => {
                            clearFilters();
                            update([...items, { ...structuredClone(item), id: crypto.randomUUID(), regime: k, reviewed: false }]);
                          }}
                        >
                          <Copy size={14} aria-hidden />
                          {externalRegimes[k]}
                        </Button>
                      ))}
                  </div>
                </Recolhivel>
              );
            })}
          </div>
          <FieldGrid columns="sm:grid-cols-[1fr_1fr_auto]">
            <Escolha
              label="Novo tributo"
              value={kind}
              options={externalTaxKinds}
              onChange={(v) => setKind(v as ExternalTax["kind"])}
            />
            <Escolha
              label="Regime de destino"
              value={regime}
              options={externalRegimes}
              onChange={(v) => setRegime(v as ExternalRegime)}
            />
            <AlinhadoAoCampo>
              <Button
                variant="secondary"
                disabled={items.length >= 24}
                onClick={() => {
                  clearFilters();
                  update([...items, createExternalTax(crypto.randomUUID(), kind, regime)]);
                }}
              >
                <Plus size={17} aria-hidden />
                Adicionar recolhimento
              </Button>
            </AlinhadoAoCampo>
          </FieldGrid>
          <p className={TEXTO_DE_APOIO}>
            Até 24 itens por atividade e ano. Itens sem fundamentação ou conferência mantêm o respectivo regime pendente. Para
            copiar para outros anos, use Copiar para outros anos, confira a prévia e revise os destinos selecionados.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-helper">
            {externalTaxSources.map(([label, url]) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                {label}
              </a>
            ))}
          </div>
        </>
      )}
      {dialog}
    </section>
  );
}

export function MemoriaDeTributosExternos({ name, items }: { name: string; items: ExternalTax[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h3 className={TITULO_DO_PAINEL}>{name} — recolhimentos detalhados</h3>
      <div className={ROLAGEM_DA_TABELA}>
        <table className={TABELA}>
          <thead>
            <tr>
              <th className={CABECALHO}>Tributo / regime</th>
              <th className={CABECALHO_NUMERO}>Débito calculado</th>
              <th className={CABECALHO_NUMERO}>Abatimentos</th>
              <th className={CABECALHO_NUMERO}>Adicional</th>
              <th className={CABECALHO}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const r = externalTaxResult(item);
              return (
                <tr key={item.id}>
                  <td className={CELULA}>
                    <strong className="font-semibold">{item.name}</strong>
                    <div className={TEXTO_DE_APOIO}>
                      {externalTaxKinds[item.kind]} · {externalRegimes[item.regime]}
                    </div>
                  </td>
                  <td className={CELULA_NUMERO}>
                    {money(r.gross)}
                    <div className={TEXTO_DE_APOIO}>
                      {item.method === "calculated"
                        ? `${money(item.base)} × ${item.rate}% + ${money(item.debits)}`
                        : "Valor líquido informado"}
                    </div>
                  </td>
                  <td className={CELULA_NUMERO}>
                    {money(r.deductions)}
                    {r.unused > 0 && <div className={TEXTO_DE_APOIO}>Não utilizado: {money(r.unused)}</div>}
                  </td>
                  <td className={CELULA_NUMERO}>{money(r.added)}</td>
                  <td className={CELULA}>
                    {externalStatuses[item.status]}
                    <div className={TEXTO_DE_APOIO}>{item.reviewed ? "Conferido" : "Pendente de conferência"}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {items.map((item) => (
        <p className="text-ui text-fg-secondary" key={item.id}>
          <strong className="font-semibold text-fg">
            {item.name} ({externalRegimes[item.regime]}):
          </strong>{" "}
          {item.basis || "Fundamentação pendente."}
        </p>
      ))}
    </section>
  );
}
