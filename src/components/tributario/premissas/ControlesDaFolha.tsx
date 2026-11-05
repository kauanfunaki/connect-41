"use client";

// Folha e encargos do Planejamento tributário (05/11/2026), portados de
// `components/fiscal/payroll-controls.tsx` do Connect Tributário
// (PayrollControls e PayrollMemory). Mesmos campos, textos, condições e
// cálculos; só a camada visual é a do Connect.

import { useId } from "react";
import { ExternalLink } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Select } from "@/components/ui/Select";
import { Selo } from "@/components/ui/Selo";
import { CampoValor } from "@/components/tributario/CampoValor";
import {
  CABECALHO,
  CABECALHO_NUMERO,
  CELULA,
  CELULA_NUMERO,
  PAINEL,
  ROLAGEM_DA_TABELA,
  ROTULO,
  TABELA,
  TEXTO_DE_APOIO,
  TITULO_DO_PAINEL,
} from "@/components/tributario/estilos";
import { brl, calculate, manualExtras, payrollAnnex, percent, scope, type Data } from "@/lib/tributario/motor/fiscal";
import { payrollLabels, payrollRegimes, payrollSources, type PayrollConfig } from "@/lib/tributario/motor/payroll";

/** Os campos numéricos da folha (o RAT é um seletor). */
type CampoDaFolha =
  | "employees"
  | "thirteenth"
  | "contributors"
  | "apprentices"
  | "apprenticeThirteenth"
  | "fap"
  | "thirdPartyRate"
  | "mixedEmployeeShare"
  | "mixedContributorShare"
  | "cprbRevenue"
  | "cprbRate"
  | "includedInMargin";

/**
 * Os que admitem vazio ("não informado", `.nullable()` no `payrollSchema`): no
 * original, só nestes o campo vazio virava `null`; nos demais, `Number('')`
 * dava zero.
 */
const ACEITA_VAZIO: readonly CampoDaFolha[] = ["includedInMargin", "thirdPartyRate", "mixedEmployeeShare", "mixedContributorShare"];

/** Reais com "R$", percentuais com "%"; FAP é multiplicador, sem unidade. */
const UNIDADE: Record<CampoDaFolha, { prefix?: string; suffix?: string }> = {
  employees: { prefix: "R$" },
  thirteenth: { prefix: "R$" },
  contributors: { prefix: "R$" },
  apprentices: { prefix: "R$" },
  apprenticeThirteenth: { prefix: "R$" },
  fap: {},
  thirdPartyRate: { suffix: "%" },
  mixedEmployeeShare: { suffix: "%" },
  mixedContributorShare: { suffix: "%" },
  cprbRevenue: { prefix: "R$" },
  cprbRate: { suffix: "%" },
  includedInMargin: { prefix: "R$" },
};

/** Conteúdo de cada bloco recolhível (o `<details>` do original). */
const CONTEUDO_DO_BLOCO = "space-y-3 px-4 pb-4";

export function ControlesDaFolha({ d, change }: { d: Data; change: (p: Partial<Data>) => void }) {
  const idBase = useId();
  const p = d.payrollConfig,
    extras = manualExtras(d),
    hasExtras = payrollRegimes.some((k) => extras[k] > 0 || p.manualOverlap[k] > 0),
    annex = payrollAnnex(d);
  const update = (v: Partial<PayrollConfig>) =>
    change({
      payrollConfig: {
        ...p,
        ...v,
        mixedReviewed: Object.keys(v).length === 1 && "mixedReviewed" in v ? !!v.mixedReviewed : false,
      },
    });
  const field = (key: CampoDaFolha, label: string, help?: string) => {
    const id = `${idBase}-${key}`;
    return (
      <CampoForm key={key} label={label} htmlFor={id} helper={help}>
        <CampoValor
          id={id}
          {...UNIDADE[key]}
          value={p[key]}
          placeholder={key === "includedInMargin" ? "Informe o valor ou zero" : undefined}
          onChange={(v) => update({ [key]: ACEITA_VAZIO.includes(key) ? v : (v ?? 0) })}
        />
      </CampoForm>
    );
  };
  return (
    <section className={PAINEL} id="payroll-settings">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={ROTULO}>CUSTO DA EQUIPE</p>
          <h2 className={TITULO_DO_PAINEL}>Folha e encargos</h2>
        </div>
        <Selo>Anual</Selo>
      </div>
      <Checkbox
        id={`${idBase}-enabled`}
        label="Calcular encargos automaticamente"
        checked={p.enabled}
        onChange={(e) => update({ enabled: e.target.checked })}
      />
      {!p.enabled ? (
        <p className={TEXTO_DE_APOIO}>
          Ative para incluir CPP, RAT/FAP, terceiros e FGTS no comparativo. A FS12 do Fator R permanece um dado fiscal
          separado.
        </p>
      ) : (
        <>
          <p className={TEXTO_DE_APOIO}>
            Informe bases anuais de remuneração, antes dos descontos e sem encargos patronais. Salários e pró-labore já
            devem estar nas despesas da margem/DRE.
          </p>
          <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
            {field("employees", "Empregados • sem 13º (R$/ano)", "Inclua férias tributáveis e seu terço; exclua aprendizes.")}
            {field("thirteenth", "13º dos empregados (R$/ano)")}
            {field(
              "contributors",
              "Pró-labore e autônomos (R$/ano)",
              "Base previdenciária de contribuintes individuais. Sem FGTS, RAT e terceiros.",
            )}
          </FieldGrid>
          <BlocoRecolhivel titulo="Aprendizes" classeDoConteudo={CONTEUDO_DO_BLOCO}>
            <FieldGrid>
              {field("apprentices", "Aprendizes • sem 13º (R$/ano)")}
              {field("apprenticeThirteenth", "13º dos aprendizes (R$/ano)")}
            </FieldGrid>
            <p className={TEXTO_DE_APOIO}>FGTS de 2% para aprendizes e 8% para os demais empregados.</p>
          </BlocoRecolhivel>
          <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
            <CampoForm label="RAT da atividade" htmlFor={`${idBase}-rat`}>
              <Select
                id={`${idBase}-rat`}
                value={p.rat === null ? "unset" : String(p.rat)}
                onChange={(e) => {
                  const v = e.target.value;
                  update({ rat: v === "unset" ? null : (Number(v) as 1 | 2 | 3) });
                }}
              >
                <option value="unset">Selecione</option>
                <option value="1">1% • risco leve</option>
                <option value="2">2% • risco médio</option>
                <option value="3">3% • risco grave</option>
              </Select>
            </CampoForm>
            {field(
              "fap",
              "FAP do estabelecimento",
              "Multiplicador entre 0,5000 e 2,0000. Confirme a vigência; a projeção mantém o valor informado.",
            )}
            {field(
              "thirdPartyRate",
              "Terceiros • alíquota (%)",
              "Informe conforme FPAS; zero se dispensado. Não é aplicada ao Simples.",
            )}
          </FieldGrid>
          <Aviso tom="info">
            {annex === "mixed"
              ? "Atividades do Anexo IV e de outros anexos: confira a parcela da folha sujeita à CPP e ao RAT externos."
              : annex === "IV"
                ? "Anexo IV: CPP e RAT são calculados fora do DAS."
                : "Anexo " + annex + ": CPP permanece no DAS; o cálculo não acrescenta CPP nem RAT externos."}{" "}
            Terceiros ficam zerados no Simples tradicional e híbrido. O FGTS aparece separado.
          </Aviso>
          {annex === "mixed" && (
            <BlocoRecolhivel titulo="Folha em atividades mistas com Anexo IV" abertoInicial classeDoConteudo={CONTEUDO_DO_BLOCO}>
              <p className={TEXTO_DE_APOIO}>
                Informe os percentuais efetivos anuais das bases sujeitos à contribuição externa. Prepare-os a partir da
                folha exclusiva e compartilhada e do rateio mensal aplicável; o app não usa a proporção anual das receitas
                como substituto. O percentual de empregados também é aplicado ao RAT, inclusive 13º. Para bases ou
                incidências diferentes, utilize encargos manuais revisados.
              </p>
              <FieldGrid>
                {field("mixedEmployeeShare", "Parcela da base de empregados sujeita à CPP/RAT (%)")}
                {field("mixedContributorShare", "Parcela de pró-labore/autônomos sujeita à CPP (%)")}
              </FieldGrid>
              <Checkbox
                id={`${idBase}-mixedReviewed`}
                label="Conferi a composição exclusiva/compartilhada e o rateio por competência."
                checked={p.mixedReviewed}
                onChange={(e) => update({ mixedReviewed: e.target.checked })}
              />
              <p className={TEXTO_DE_APOIO}>
                FGTS permanece sobre a base integral. A combinação com CPRB parcial no Simples não é automática e fica fora
                do comparativo.
              </p>
            </BlocoRecolhivel>
          )}
          <BlocoRecolhivel titulo="Desoneração / CPRB" classeDoConteudo={CONTEUDO_DO_BLOCO}>
            <p className={TEXTO_DE_APOIO}>
              Use somente para atividade elegível com folha integralmente abrangida pela substituição. Atividades mistas,
              obras com tratamentos distintos e perda do benefício exigem segregação própria.
            </p>
            <div className="flex flex-col gap-2">
              <Checkbox
                id={`${idBase}-cprbRegular`}
                label="Aplicar CPRB no Presumido e no Real"
                checked={p.cprbRegular}
                onChange={(e) => update({ cprbRegular: e.target.checked, cprbEligible: false })}
              />
              <Checkbox
                id={`${idBase}-cprbSimple`}
                label="Aplicar CPRB ao Anexo IV elegível"
                checked={p.cprbSimple}
                onChange={(e) => update({ cprbSimple: e.target.checked, cprbEligible: false })}
              />
            </div>
            {(p.cprbRegular || p.cprbSimple) && (
              <>
                <FieldGrid>
                  {field("cprbRevenue", "Receita sujeita à CPRB (R$/ano)", "Base já ajustada pelas exclusões legais.")}
                  {field(
                    "cprbRate",
                    "Alíquota integral da CPRB (%)",
                    "Informe a alíquota da atividade antes da redução transitória.",
                  )}
                </FieldGrid>
                <Checkbox
                  id={`${idBase}-cprbEligible`}
                  label="Enquadramento, opção e condição de manutenção de empregos conferidos; toda a folha informada está abrangida."
                  checked={p.cprbEligible}
                  onChange={(e) => update({ cprbEligible: e.target.checked })}
                />
              </>
            )}
            <p className={TEXTO_DE_APOIO}>
              2025: CPP de 5% + 80% da alíquota CPRB. 2026: 10% + 60%. 2027: 15% + 40%. Desde 2028: CPP de 20%, sem CPRB.
              De 2025 a 2027, a CPP da folha desonerada exclui o 13º; RAT, terceiros e FGTS mantêm suas bases.
            </p>
          </BlocoRecolhivel>
          <BlocoRecolhivel titulo="Conciliação com a DRE" abertoInicial classeDoConteudo={CONTEUDO_DO_BLOCO}>
            <FieldGrid>
              {field(
                "includedInMargin",
                "Encargos já incluídos na margem / DRE (R$/ano)",
                "Somente CPP externa, RAT, terceiros, CPRB e FGTS já deduzidos. Exclua salários, pró-labore e a CPP dentro do DAS. Informe zero se nenhum estiver incluído.",
              )}
            </FieldGrid>
            {d.dre && (
              <p className={TEXTO_DE_APOIO}>
                Pessoal e encargos na DRE original: {brl(d.dre.values.folha_encargos_dre)}. O detalhamento não é inferido
                desse total.
              </p>
            )}
            <p className={TEXTO_DE_APOIO}>
              Resultado ajustado = resultado informado + encargos já incluídos − encargos calculados. A DRE original é
              preservada. No Real, esse resultado ajusta a base de IRPJ/CSLL.
            </p>
          </BlocoRecolhivel>
          {hasExtras && (
            <BlocoRecolhivel titulo="Conciliação com lançamentos manuais" abertoInicial classeDoConteudo={CONTEUDO_DO_BLOCO}>
              <p className={TEXTO_DE_APOIO}>
                Dos valores manuais abaixo, informe a parcela de folha que será substituída pelo cálculo automático. Zero
                mantém o valor manual integral.
              </p>
              <FieldGrid>
                {payrollRegimes
                  .filter((k) => extras[k] > 0 || p.manualOverlap[k] > 0)
                  .map((k) => {
                    const id = `${idBase}-manualOverlap-${k}`;
                    return (
                      <CampoForm
                        key={k}
                        label={`${payrollLabels[k]} • folha já lançada (R$/ano)`}
                        htmlFor={id}
                        helper={`Total manual: ${brl(extras[k])}`}
                      >
                        <CampoValor
                          id={id}
                          prefix="R$"
                          value={p.manualOverlap[k]}
                          onChange={(v) =>
                            update({ manualOverlap: { ...p.manualOverlap, [k]: v ?? 0 }, extrasReviewed: false })
                          }
                        />
                      </CampoForm>
                    );
                  })}
              </FieldGrid>
              <Checkbox
                id={`${idBase}-extrasReviewed`}
                label="Conferi os valores manuais para evitar duplicidade."
                checked={p.extrasReviewed}
                onChange={(e) => update({ extrasReviewed: e.target.checked })}
              />
            </BlocoRecolhivel>
          )}
          <p className={TEXTO_DE_APOIO}>
            Bases comuns às contribuições; um estabelecimento; no modo por atividade, o Anexo IV misto utiliza as parcelas
            efetivas conferidas acima. Não calcula retenções de INSS/IRRF dos trabalhadores, verbas rescisórias, adicionais
            de aposentadoria especial ou tratamentos setoriais. FS12 não é recalculada pela projeção.
          </p>
        </>
      )}
    </section>
  );
}

type Regime = (typeof payrollRegimes)[number];

export function MemoriaDaFolha({ d, year }: { d: Data; year: number }) {
  if (!d.payrollConfig.enabled) return null;
  const r = calculate(d, year),
    p = d.payrollConfig,
    excluded = scope(d),
    money = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const rows: [string, (key: Regime) => number][] = [
    ["CPP • empregados e aprendizes", (k) => r.payroll[k].cppEmployees],
    ["CPP • pró-labore e autônomos", (k) => r.payroll[k].cppContributors],
    ["RAT × FAP", (k) => r.payroll[k].rat],
    ["Terceiros", (k) => r.payroll[k].thirdParties],
    ["CPRB • sobre a receita", (k) => r.payroll[k].cprbDue],
    ["Contribuições fora do DAS", (k) => r.payroll[k].taxes],
    ["FGTS • empregados (8%)", (k) => r.payroll[k].fgtsEmployees],
    ["FGTS • aprendizes (2%)", (k) => r.payroll[k].fgtsApprentices],
    ["Total de encargos calculados", (k) => r.payroll[k].total],
    ["Remuneração + encargos externos", (k) => r.payroll[k].employerCost],
  ];
  const conciliacao: [string, (key: Regime) => number][] = [
    ["Resultado antes de IRPJ/CSLL informado", () => r.profit],
    ["(+) Encargos já incluídos", () => p.includedInMargin ?? 0],
    ["(−) Encargos calculados", (k) => r.payroll[k].total],
    ["Resultado após ajuste da folha", (k) => r.payrollProfits[k]],
    ["Outros encargos manuais mantidos", (k) => r.remainingExtras[k]],
  ];
  return (
    <section className={PAINEL}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={ROTULO}>FOLHA DE PAGAMENTO</p>
          <h2 className={TITULO_DO_PAINEL}>Encargos por regime</h2>
        </div>
        <Selo>{year}</Selo>
      </div>
      <p className={TEXTO_DE_APOIO}>
        Valores anuais. FGTS é custo trabalhista e aparece separado das contribuições. A remuneração não é somada aos
        cartões de tributos e encargos.
      </p>
      <div className={ROLAGEM_DA_TABELA}>
        <table className={TABELA}>
          <thead>
            <tr>
              <th className={CABECALHO}>Componente</th>
              {payrollRegimes.map((k) => (
                <th key={k} className={CABECALHO_NUMERO}>
                  {payrollLabels[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, get]) => (
              <tr key={label}>
                <td className={CELULA}>{label}</td>
                {payrollRegimes.map((k, i) => (
                  <td key={k} className={CELULA_NUMERO}>
                    {excluded[i] ? "Fora do escopo" : money(get(k))}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className={CELULA}>CPP aplicada à base</td>
              {payrollRegimes.map((k, i) => (
                <td key={k} className={CELULA_NUMERO}>
                  {excluded[i] ? "—" : r.payroll[k].inDas ? "Incluída no DAS" : percent(r.payroll[k].cppRate)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className={TEXTO_DE_APOIO}>
        RAT ajustado: {percent((p.rat ?? 0) * p.fap)} · Terceiros no Presumido/Real: {percent(p.thirdPartyRate ?? 0)}. Base
        de empregados: {money(r.payroll.real.employeeBase)}. Base CPP no Real: {money(r.payroll.real.cppBase)}
        {r.payroll.real.cprb ? " (13º excluído)" : ""}.
      </p>
      {(p.cprbRegular || p.cprbSimple) && (
        <p className={TEXTO_DE_APOIO}>
          CPRB no Real: {percent(r.payroll.real.cprbRate)} × {money(p.cprbRevenue)}. Referência atual ({d.period}): CPP{" "}
          {percent(r.payroll.current.cppRate)}, CPRB {percent(r.payroll.current.cprbRate)}. A projeção aplica as regras do
          ano selecionado.
        </p>
      )}
      {payrollAnnex(d) === "mixed" && (
        <p className={TEXTO_DE_APOIO}>
          Folha mista: parcela de empregados para CPP/RAT {percent(p.mixedEmployeeShare ?? 0)}; parcela de contribuintes
          individuais para CPP {percent(p.mixedContributorShare ?? 0)}. O FGTS não é proporcionalizado. Estes percentuais
          devem refletir os cálculos por competência.
        </p>
      )}
      <h3 className="pt-2 text-label font-semibold text-fg">Resultado da DRE após ajuste da folha</h3>
      <div className={ROLAGEM_DA_TABELA}>
        <table className={TABELA}>
          <thead>
            <tr>
              <th className={CABECALHO}>Conciliação</th>
              {payrollRegimes.map((k) => (
                <th key={k} className={CABECALHO_NUMERO}>
                  {payrollLabels[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {conciliacao.map(([label, get]) => (
              <tr key={label}>
                <td className={CELULA}>{label}</td>
                {payrollRegimes.map((k, i) => (
                  <td key={k} className={CELULA_NUMERO}>
                    {excluded[i] ? "—" : money(get(k))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={TEXTO_DE_APOIO}>
        Este quadro altera apenas os encargos da folha no resultado informado. Mantém remuneração, outras despesas e
        tributos já embutidos na margem; não é uma DRE integral recalculada por regime. O IRPJ/CSLL do Presumido continua
        baseado na receita.
      </p>
      <BlocoRecolhivel titulo="Regras e fontes da folha" classeDoConteudo="flex flex-col items-start gap-2 px-4 pb-4">
        {payrollSources.map(([label, url]) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-ui text-brand hover:underline"
          >
            {label} <ExternalLink size={14} aria-hidden />
          </a>
        ))}
      </BlocoRecolhivel>
    </section>
  );
}
