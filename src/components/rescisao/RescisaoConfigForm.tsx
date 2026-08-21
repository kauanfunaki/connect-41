"use client";

import { useActionState } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { RESCISAO_CHECKLIST } from "@/lib/rescisaoChecklist";
import type { RescisaoConfig, OrigemCampo } from "@/lib/rescisao/config";

export type RescisaoConfigState = { error: string } | null;

type Props = {
  action: (prev: RescisaoConfigState, form: FormData) => Promise<RescisaoConfigState>;
  /** Valores efetivos hoje (já resolvidos). */
  valores: RescisaoConfig;
  /** De onde cada valor veio — só é exibido no nível empresa. */
  origem?: Record<keyof RescisaoConfig, OrigemCampo>;
  /** true = tela da empresa (campos podem herdar). */
  nivelEmpresa: boolean;
  canEdit: boolean;
};

const GRAU_OPTIONS = [
  { value: "NENHUM", label: "Nenhum" },
  { value: "MINIMO", label: "Mínimo (10%)" },
  { value: "MEDIO", label: "Médio (20%)" },
  { value: "MAXIMO", label: "Máximo (40%)" },
];

const BASE_INSALUBRIDADE_OPTIONS = [
  { value: "SALARIO_MINIMO", label: "Salário mínimo" },
  { value: "SALARIO_BASE", label: "Salário base do colaborador" },
  { value: "PISO_CATEGORIA", label: "Piso da categoria" },
];

const MEDIA_BASE_OPTIONS = [
  { value: "PERIODO_AQUISITIVO", label: "Período aquisitivo" },
  { value: "ANO_CIVIL", label: "Ano civil" },
  { value: "ULTIMOS_N_MESES", label: "Últimos N meses" },
];

const ORIGEM_LABEL: Record<OrigemCampo, string> = {
  PADRAO_LEGAL: "padrão legal",
  TENANT: "padrão do escritório",
  EMPRESA: "definido nesta empresa",
};

export function RescisaoConfigForm({ action, valores, origem, nivelEmpresa, canEdit }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Sem isso a herança se perde na prática: o usuário abre a tela da empresa e
  // não sabe o que está vindo do padrão do escritório.
  const heranca = (campo: keyof RescisaoConfig) =>
    nivelEmpresa && origem ? `Origem: ${ORIGEM_LABEL[origem[campo]]}` : undefined;

  const verbasDesabilitadas = new Set(valores.verbasDesabilitadas);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{state.error}</p>
      )}

      <section>
        <h2 className="text-[14px] font-semibold text-fg mb-1">Adicionais</h2>
        <p className="text-[12px] text-fg-muted mb-3">
          Os percentuais são fixos em lei — o que varia por empresa é o grau apurado no laudo e a incidência.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoForm label="Grau de insalubridade" htmlFor="insalubridadeGrau" helper={heranca("insalubridadeGrau")}>
            <Select id="insalubridadeGrau" name="insalubridadeGrau" defaultValue={valores.insalubridadeGrau} disabled={!canEdit}>
              {GRAU_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </CampoForm>

          <CampoForm
            label="Base da insalubridade"
            htmlFor="insalubridadeBase"
            helper={heranca("insalubridadeBase") ?? "A Súmula Vinculante 4 do STF deixou o tema em aberto."}
          >
            <Select id="insalubridadeBase" name="insalubridadeBase" defaultValue={valores.insalubridadeBase} disabled={!canEdit}>
              {BASE_INSALUBRIDADE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </CampoForm>
        </div>

        <div className="mt-3 space-y-2">
          <Checkbox
            name="periculosidadeAplica"
            value="true"
            defaultChecked={valores.periculosidadeAplica}
            disabled={!canEdit}
            label="Aplica periculosidade (30% sobre o salário base)"
          />
          <Checkbox
            name="periculosidadeIntegral"
            value="true"
            defaultChecked={valores.periculosidadeIntegral}
            disabled={!canEdit}
            label="Periculosidade sobre a remuneração integral — somente eletricitários (Súmula 191 TST)"
          />
        </div>
      </section>

      <section className="pt-4 border-t border-border">
        <h2 className="text-[14px] font-semibold text-fg mb-3">Médias de variáveis</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CampoForm label="Janela (meses)" htmlFor="mediaMeses" helper={heranca("mediaMeses") ?? "Entre 3 e 12."}>
            <Input
              id="mediaMeses"
              name="mediaMeses"
              type="number"
              min={3}
              max={12}
              defaultValue={valores.mediaMeses}
              disabled={!canEdit}
            />
          </CampoForm>

          <CampoForm label="Base das férias" htmlFor="mediaBaseFerias" helper={heranca("mediaBaseFerias")}>
            <Select id="mediaBaseFerias" name="mediaBaseFerias" defaultValue={valores.mediaBaseFerias} disabled={!canEdit}>
              {MEDIA_BASE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </CampoForm>

          <CampoForm label="Base do 13º" htmlFor="mediaBaseDecimoTerceiro" helper={heranca("mediaBaseDecimoTerceiro")}>
            <Select
              id="mediaBaseDecimoTerceiro"
              name="mediaBaseDecimoTerceiro"
              defaultValue={valores.mediaBaseDecimoTerceiro}
              disabled={!canEdit}
            >
              {MEDIA_BASE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </CampoForm>
        </div>
      </section>

      <section className="pt-4 border-t border-border">
        <h2 className="text-[14px] font-semibold text-fg mb-3">Conferência</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoForm
            label="Tolerância de divergência (%)"
            htmlFor="toleranciaPct"
            helper={heranca("toleranciaPct") ?? "Máximo 5% — acima disso divergências reais deixariam de acender."}
          >
            <Input
              id="toleranciaPct"
              name="toleranciaPct"
              type="number"
              step="0.1"
              min={0}
              max={5}
              defaultValue={valores.toleranciaPct}
              disabled={!canEdit}
            />
          </CampoForm>
        </div>

        <div className="mt-3">
          <Checkbox
            name="tercoApresentadoSeparado"
            value="true"
            defaultChecked={valores.tercoApresentadoSeparado}
            disabled={!canEdit}
            label="A contabilidade apresenta o 1/3 constitucional como item separado"
          />
          <p className="text-[11px] text-fg-muted mt-1 ml-6">
            Desmarque se ela envia o 1/3 embutido nas férias — o item deixa de acusar divergência.
          </p>
        </div>
      </section>

      <section className="pt-4 border-t border-border">
        <h2 className="text-[14px] font-semibold text-fg mb-1">Verbas não praticadas</h2>
        <p className="text-[12px] text-fg-muted mb-3">
          Marcadas aqui deixam de entrar no total — mas continuam aparecendo na conferência com o valor que teriam,
          pra ninguém esconder verba devida sem querer.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {RESCISAO_CHECKLIST.filter((i) => i.hasValue).map((i) => (
            <Checkbox
              key={i.key}
              name="verbasDesabilitadas"
              value={i.key}
              defaultChecked={verbasDesabilitadas.has(i.key)}
              disabled={!canEdit}
              label={i.label}
            />
          ))}
        </div>
      </section>

      <section className="pt-4 border-t border-border">
        <h2 className="text-[14px] font-semibold text-fg mb-1">Convenção coletiva</h2>
        <p className="text-[12px] text-fg-muted mb-3">
          Texto de orientação exibido ao conferente — <strong>não é regra executável</strong>. O motor não interpreta
          cláusula de CCT.
        </p>
        <div className="space-y-4">
          <CampoForm label="Sindicato / CCT" htmlFor="cctNome" helper={heranca("cctNome")}>
            <Input id="cctNome" name="cctNome" type="text" defaultValue={valores.cctNome ?? ""} maxLength={180} disabled={!canEdit} />
          </CampoForm>
          <CampoForm label="Observações da CCT" htmlFor="cctObservacoes" helper={heranca("cctObservacoes")}>
            <Textarea
              id="cctObservacoes"
              name="cctObservacoes"
              rows={3}
              defaultValue={valores.cctObservacoes ?? ""}
              disabled={!canEdit}
              placeholder="Ex: piso da categoria, adicionais previstos, prazos específicos…"
            />
          </CampoForm>
        </div>
      </section>

      {canEdit && (
        <div className="pt-4 border-t border-border">
          <button
            type="submit"
            disabled={isPending}
            className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
          >
            {isPending ? "Salvando…" : "Salvar configuração"}
          </button>
        </div>
      )}
    </form>
  );
}
