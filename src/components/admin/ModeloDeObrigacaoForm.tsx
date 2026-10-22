"use client";

// O formulário do modelo de obrigação por regime (22/10/2026), no painel ao
// lado da lista. A prévia ("pega 212 empresas" e a lista) acompanha o que se
// digita, antes de salvar: é a mesma regra que o motor aplica, lida pelo
// servidor do mesmo FormData (`lerModeloDoForm`).

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ModeloState, PreviaDaRegra } from "@/app/(app)/admin/obrigacoes/regime/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { formatarNumero } from "@/lib/format";

export type ValoresDoModelo = {
  id?: string;
  nome: string;
  descricao: string;
  pipelineId: string;
  periodicidade: "MENSAL" | "TRIMESTRAL" | "ANUAL";
  mesesAposCompetencia: number;
  diaLegal: number | null;
  diasUteisAntes: number;
  ajuste: "ANTECIPAR" | "ADIAR";
  regimes: string[];
  semMovimento: "QUALQUER" | "SIM" | "NAO";
  comFuncionarios: "QUALQUER" | "SIM" | "NAO";
  estados: string[];
  cidades: string[];
  exigeSetorContratado: boolean;
};

export const MODELO_EM_BRANCO: ValoresDoModelo = {
  nome: "",
  descricao: "",
  pipelineId: "",
  periodicidade: "MENSAL",
  mesesAposCompetencia: 1,
  diaLegal: 20,
  diasUteisAntes: 0,
  ajuste: "ADIAR",
  regimes: [],
  semMovimento: "QUALQUER",
  comFuncionarios: "QUALQUER",
  estados: [],
  cidades: [],
  exigeSetorContratado: true,
};

type Props = {
  action: (prev: ModeloState, form: FormData) => Promise<ModeloState>;
  previa: (form: FormData) => Promise<PreviaDaRegra>;
  cancelHref: string;
  pipelines: { id: string; name: string; sectorLabel: string }[];
  regimes: { value: string; label: string }[];
  valores: ValoresDoModelo;
};

const QUANTAS_NA_LISTA = 50;

export function ModeloDeObrigacaoForm({ action, previa, cancelHref, pipelines, regimes, valores }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [ultimoDiaUtil, setUltimoDiaUtil] = useState(valores.diaLegal === null);
  const [resultado, setResultado] = useState<PreviaDaRegra | null>(null);
  const [carregando, startTransition] = useTransition();
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const atualizarPrevia = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const dados = new FormData(form);
    startTransition(async () => {
      try {
        setResultado(await previa(dados));
      } catch {
        setResultado({ error: "Não deu para calcular a prévia agora." });
      }
    });
  }, [previa]);

  const agendarPrevia = useCallback(() => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(atualizarPrevia, 400);
  }, [atualizarPrevia]);

  useEffect(() => {
    atualizarPrevia();
    return () => {
      if (espera.current) clearTimeout(espera.current);
    };
  }, [atualizarPrevia]);

  return (
    <form ref={formRef} action={formAction} onChange={agendarPrevia} className="space-y-6">
      {valores.id && <input type="hidden" name="id" value={valores.id} />}
      {state?.error && <Aviso>{state.error}</Aviso>}

      <FormSection title="Obrigação">
        <CampoForm label="Nome" htmlFor="nome" required>
          <Input id="nome" name="nome" required maxLength={160} defaultValue={valores.nome} placeholder="Ex: DAS, DCTFWeb, DEFIS…" />
        </CampoForm>
        <CampoForm label="Kanban onde a atividade nasce" htmlFor="pipelineId" required helper="O setor da obrigação é o do kanban.">
          <Select id="pipelineId" name="pipelineId" required defaultValue={valores.pipelineId}>
            <option value="">Selecionar…</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sectorLabel} · {p.name}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Descrição" htmlFor="descricao" helper="Vai na atividade, embaixo das datas.">
          <Textarea id="descricao" name="descricao" defaultValue={valores.descricao} rows={2} />
        </CampoForm>
      </FormSection>

      <FormSection title="Datas" descricao="O vencimento conta a partir do último mês da competência (o fim do trimestre, dezembro).">
        <FieldGrid>
          <CampoForm label="Periodicidade" htmlFor="periodicidade">
            <Select id="periodicidade" name="periodicidade" defaultValue={valores.periodicidade}>
              <option value="MENSAL">Mensal</option>
              <option value="TRIMESTRAL">Trimestral</option>
              <option value="ANUAL">Anual</option>
            </Select>
          </CampoForm>
          <CampoForm label="Vence quantos meses depois" htmlFor="mesesAposCompetencia" helper="DAS de setembro vence em outubro: 1.">
            <Input id="mesesAposCompetencia" name="mesesAposCompetencia" type="number" min={0} max={24} required defaultValue={valores.mesesAposCompetencia} />
          </CampoForm>
          <CampoForm label="Dia legal" htmlFor="tipoDoDia">
            <Select id="tipoDoDia" name="tipoDoDia" defaultValue={ultimoDiaUtil ? "ULTIMO_DIA_UTIL" : "DIA"} onChange={(e) => setUltimoDiaUtil(e.target.value === "ULTIMO_DIA_UTIL")}>
              <option value="DIA">Dia do mês</option>
              <option value="ULTIMO_DIA_UTIL">Último dia útil</option>
            </Select>
          </CampoForm>
          {!ultimoDiaUtil && (
            <CampoForm label="Dia" htmlFor="diaLegal" helper="Mês mais curto usa o último dia.">
              <Input id="diaLegal" name="diaLegal" type="number" min={1} max={31} required defaultValue={valores.diaLegal ?? 20} />
            </CampoForm>
          )}
          {!ultimoDiaUtil && (
            <CampoForm label="Se não for dia útil" htmlFor="ajuste">
              <Select id="ajuste" name="ajuste" defaultValue={valores.ajuste}>
                <option value="ADIAR">Adia para o próximo dia útil</option>
                <option value="ANTECIPAR">Antecipa para o dia útil anterior</option>
              </Select>
            </CampoForm>
          )}
          <CampoForm label="Prazo interno (dias úteis antes)" htmlFor="diasUteisAntes" helper="0 = o próprio vencimento. É a data da atividade.">
            <Input id="diasUteisAntes" name="diasUteisAntes" type="number" min={0} max={30} defaultValue={valores.diasUteisAntes} />
          </CampoForm>
        </FieldGrid>
      </FormSection>

      <FormSection title="A quem se aplica" descricao="Só empresas ativas. Campo vazio = qualquer valor.">
        <fieldset>
          <legend className="text-label font-medium text-fg mb-1.5">Regime</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {regimes.map((r) => (
              <Checkbox key={r.value} id={`regime-${r.value}`} name="regimes" value={r.value} label={r.label} defaultChecked={valores.regimes.includes(r.value)} />
            ))}
          </div>
        </fieldset>
        <FieldGrid>
          <CampoForm label="Sem movimento" htmlFor="semMovimento">
            <Select id="semMovimento" name="semMovimento" defaultValue={valores.semMovimento}>
              <option value="QUALQUER">Tanto faz</option>
              <option value="NAO">Só com movimento</option>
              <option value="SIM">Só sem movimento</option>
            </Select>
          </CampoForm>
          <CampoForm label="Funcionários" htmlFor="comFuncionarios" helper="Pelo regime ou pelos colaboradores do DP.">
            <Select id="comFuncionarios" name="comFuncionarios" defaultValue={valores.comFuncionarios}>
              <option value="QUALQUER">Tanto faz</option>
              <option value="SIM">Só com funcionários</option>
              <option value="NAO">Só sem funcionários</option>
            </Select>
          </CampoForm>
          <CampoForm label="Estados (UF)" htmlFor="estados" helper="Separados por vírgula: SP, MG.">
            <Input id="estados" name="estados" defaultValue={valores.estados.join(", ")} placeholder="Todos" />
          </CampoForm>
          <CampoForm label="Cidades" htmlFor="cidades" helper="Separadas por vírgula.">
            <Input id="cidades" name="cidades" defaultValue={valores.cidades.join(", ")} placeholder="Todas" />
          </CampoForm>
        </FieldGrid>
        <Checkbox
          id="exigeSetorContratado"
          name="exigeSetorContratado"
          defaultChecked={valores.exigeSetorContratado}
          label="Só empresas com o setor contratado"
          helper="O responsável do setor na empresa vira o responsável da atividade."
        />
      </FormSection>

      <Previa resultado={resultado} carregando={carregando} />

      <FormFooter pending={isPending} cancelHref={cancelHref} nota="Ao salvar, as atividades das próximas competências são geradas." />
    </form>
  );
}

function Previa({ resultado, carregando }: { resultado: PreviaDaRegra | null; carregando: boolean }) {
  return (
    <section aria-live="polite" className="rounded-lg border border-border bg-surface-2 p-3 space-y-2">
      <p className="c41-rotulo">Prévia</p>
      {!resultado ? (
        <p className="text-helper text-fg-muted">Calculando…</p>
      ) : "error" in resultado ? (
        <p className="text-helper text-danger">{resultado.error}</p>
      ) : (
        <div className={carregando ? "opacity-60" : ""}>
          <p className="text-fs-3 font-semibold text-fg">
            Pega {formatarNumero(resultado.total, 0)} {resultado.total === 1 ? "empresa" : "empresas"}
          </p>
          {resultado.semDadoDeFuncionarios > 0 && (
            <p className="text-helper text-fg-muted">
              {formatarNumero(resultado.semDadoDeFuncionarios, 0)} ficaram de fora por não se saber se têm funcionários.
            </p>
          )}
          {resultado.ocorrencias.length > 0 && (
            <ul className="mt-2 text-helper text-fg-secondary">
              {resultado.ocorrencias.map((o) => (
                <li key={o.competencia}>
                  Competência {o.competencia}: vence {o.dataLegal}
                  {o.prazoInterno !== o.dataLegal ? ` · prazo interno ${o.prazoInterno}` : ""}
                </li>
              ))}
            </ul>
          )}
          {resultado.total > 0 && (
            <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-border rounded-md border border-border bg-surface text-helper text-fg">
              {resultado.empresas.slice(0, QUANTAS_NA_LISTA).map((e) => (
                <li key={e.id} className="px-2.5 py-1.5 truncate" title={e.nome}>
                  {e.nome}
                </li>
              ))}
              {resultado.total > QUANTAS_NA_LISTA && (
                <li className="px-2.5 py-1.5 text-fg-muted">e mais {formatarNumero(resultado.total - QUANTAS_NA_LISTA, 0)}…</li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
