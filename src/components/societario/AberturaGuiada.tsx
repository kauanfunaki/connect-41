"use client";

import { useActionState, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { Textarea } from "@/components/ui/Textarea";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { CamposDoProcesso } from "./CamposDoProcesso";
import type { ProcessoState } from "@/app/(app)/processos/actions";
import { textoDoPedidoDeDocumentos } from "@/lib/societario/pedidoDeDocumentos";

export type TipoNaAbertura = {
  id: string;
  nome: string;
  prazo: string;
  etapas: number;
  itens: { id: string; rotulo: string; etapa: string; obrigatorio: boolean }[];
  temRoteiro: boolean;
};

const PASSOS = ["Empresa e tipo", "O que o processo pede", "Pedido ao cliente"] as const;

/**
 * A abertura guiada (04/11/2026, escolha A): três passos com um resumo fixo ao
 * lado. Tudo num formulário só — os passos de trás ficam no formulário, só
 * escondidos —, e o processo nasce com o checklist marcado e, se a pessoa
 * quiser, com o pedido do que falta já mandado ao cliente.
 */
export function AberturaGuiada({
  empresas,
  empresaInicial,
  tipos,
  responsaveis,
  responsavelPadrao,
  abrirAction,
}: {
  empresas: Opcao[];
  empresaInicial: string;
  tipos: TipoNaAbertura[];
  responsaveis: { id: string; name: string }[];
  responsavelPadrao: string;
  abrirAction: (prev: ProcessoState, form: FormData) => Promise<ProcessoState>;
}) {
  const [estado, action, pendente] = useActionState(abrirAction, null);
  const [passo, setPasso] = useState(0);
  const [empresaId, setEmpresaId] = useState(empresaInicial);
  const [tipoId, setTipoId] = useState("");
  const [jaTemos, setJaTemos] = useState<ReadonlySet<string>>(new Set());
  const [pedirAoCliente, setPedirAoCliente] = useState(true);
  const [pedidoEditado, setPedidoEditado] = useState<string | null>(null);

  const tipo = tipos.find((t) => t.id === tipoId) ?? null;
  const empresaNome = empresas.find((e) => e.value === empresaId)?.label ?? null;
  const faltam = useMemo(() => (tipo ? tipo.itens.filter((i) => !jaTemos.has(i.id)) : []), [tipo, jaTemos]);
  const pedidoSugerido = tipo ? textoDoPedidoDeDocumentos(tipo.nome, faltam.map((i) => i.rotulo)) : "";
  const pedido = pedidoEditado ?? pedidoSugerido;
  const podeSeguir = passo === 0 ? Boolean(empresaId && tipo?.temRoteiro) : true;

  function trocarTipo(id: string) {
    setTipoId(id);
    setJaTemos(new Set());
    setPedidoEditado(null);
  }
  function alternar(id: string) {
    const novo = new Set(jaTemos);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    setJaTemos(novo);
    setPedidoEditado(null);
  }

  // Os itens agrupados pela etapa, na ordem do roteiro.
  const porEtapa = useMemo(() => {
    const grupos: { etapa: string; itens: TipoNaAbertura["itens"] }[] = [];
    for (const i of tipo?.itens ?? []) {
      const ultimo = grupos.at(-1);
      if (ultimo && ultimo.etapa === i.etapa) ultimo.itens.push(i);
      else grupos.push({ etapa: i.etapa, itens: [i] });
    }
    return grupos;
  }, [tipo]);

  return (
    <form action={action} className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        {/* Os passos */}
        <Card className="p-4">
          <ol className="flex flex-wrap items-center gap-3">
            {PASSOS.map((p, i) => (
              <li key={p} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`flex size-7 items-center justify-center rounded-full text-micro font-semibold ${
                    i < passo ? "bg-success/10 text-success-fg border border-success/25" : i === passo ? "bg-brand-solid text-on-brand" : "border-2 border-border text-fg-muted"
                  }`}
                >
                  {i < passo ? <Check size={14} /> : i + 1}
                </span>
                <span className={`text-ui ${i === passo ? "font-semibold text-fg" : "text-fg-muted"}`} aria-current={i === passo ? "step" : undefined}>
                  {p}
                </span>
                {i < PASSOS.length - 1 && <span aria-hidden className={`h-0.5 w-8 rounded-full ${i < passo ? "bg-success/40" : "bg-border"}`} />}
              </li>
            ))}
          </ol>
        </Card>

        {/* Passo 1 */}
        <Card className={`${passo === 0 ? "flex" : "hidden"} flex-col gap-4 p-4`}>
          <CampoForm label="Empresa" htmlFor="companyId" required>
            <SearchableSelect id="companyId" name="companyId" options={empresas} placeholder="Buscar empresa…" avatar lembrarRecentes="empresas" defaultValue={empresaInicial || undefined} onChange={setEmpresaId} />
          </CampoForm>
          <CampoForm
            label="Tipo de processo"
            htmlFor="typeId"
            required
            helper={tipo && !tipo.temRoteiro ? "Este tipo ainda não tem roteiro publicado. Configure antes de abrir." : tipo ? `${tipo.prazo} · ${tipo.etapas} etapas` : undefined}
          >
            <Select id="typeId" name="typeId" value={tipoId} onChange={(e) => trocarTipo(e.target.value)}>
              <option value="" disabled>
                Escolha…
              </option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} — {t.prazo}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CamposDoProcesso prefixo="guiada" responsaveis={responsaveis} valores={{ titulo: "", responsavelId: responsavelPadrao, prioridade: "NORMAL", prazoCombinado: "" }} />
        </Card>

        {/* Passo 2 */}
        <Card className={`${passo === 1 ? "flex" : "hidden"} flex-col gap-3 p-4`}>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-section font-semibold text-fg">O que o processo pede</h2>
            <p className="text-fs-2 text-fg-muted">Do roteiro de {tipo?.nome ?? "…"}. Marque o que já está com o escritório; o resto vai no pedido ao cliente.</p>
          </div>
          {porEtapa.length === 0 ? (
            <p className="text-fs-2 text-fg-muted">O roteiro deste tipo não tem checklist. Siga para o próximo passo.</p>
          ) : (
            porEtapa.map((g) => (
              <fieldset key={g.etapa} className="flex flex-col gap-1.5">
                <legend className="c41-rotulo mb-1">{g.etapa}</legend>
                {g.itens.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3">
                    <Checkbox
                      id={`ja-${i.id}`}
                      name="jaTemos"
                      value={i.id}
                      checked={jaTemos.has(i.id)}
                      onChange={() => alternar(i.id)}
                      label={
                        <span className="text-fs-2">
                          {i.rotulo}
                          {!i.obrigatorio && <span className="text-fg-muted"> · opcional</span>}
                        </span>
                      }
                    />
                    <Selo tom={jaTemos.has(i.id) ? "sucesso" : "atencao"}>{jaTemos.has(i.id) ? "já temos" : "pedir ao cliente"}</Selo>
                  </div>
                ))}
              </fieldset>
            ))
          )}
        </Card>

        {/* Passo 3 */}
        <Card className={`${passo === 2 ? "flex" : "hidden"} flex-col gap-3 p-4`}>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-section font-semibold text-fg">Pedido ao cliente</h2>
            <p className="text-fs-2 text-fg-muted">Vai na conversa do processo: o cliente vê no portal e é avisado por e-mail. Confira o texto antes de abrir.</p>
          </div>
          {faltam.length === 0 ? (
            <Aviso tom="neutro">Nada a pedir: o escritório já tem tudo o que o roteiro lista.</Aviso>
          ) : (
            <>
              <Checkbox id="pedir-ao-cliente" checked={pedirAoCliente} onChange={(e) => setPedirAoCliente(e.target.checked)} label="Mandar o pedido ao cliente ao abrir o processo" />
              <CampoForm label="Mensagem" htmlFor="pedido">
                <Textarea id="pedido" rows={9} value={pedido} onChange={(e) => setPedidoEditado(e.target.value)} disabled={!pedirAoCliente} maxLength={5000} />
              </CampoForm>
            </>
          )}
          <input type="hidden" name="pedirAoCliente" value={pedirAoCliente && faltam.length > 0 ? "1" : "0"} />
          <input type="hidden" name="pedido" value={pedirAoCliente && faltam.length > 0 ? pedido : ""} />
        </Card>

        {estado?.error && <Aviso>{estado.error}</Aviso>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => setPasso((p) => Math.max(0, p - 1))} disabled={passo === 0 || pendente}>
            ← Voltar
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {passo < 2 && passo > 0 && (
              <Button type="submit" variant="secondary" loading={pendente} loadingLabel="Abrindo…">
                Abrir sem pedir nada
              </Button>
            )}
            {passo < 2 ? (
              <Button type="button" onClick={() => setPasso((p) => p + 1)} disabled={!podeSeguir}>
                Continuar →
              </Button>
            ) : (
              <Button type="submit" loading={pendente} loadingLabel="Abrindo…">
                Abrir processo
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* O resumo, fixo ao lado */}
      <Card as="section" aria-labelledby="resumo-abertura" className="flex flex-col gap-2 p-4 xl:sticky xl:top-4">
        <h2 id="resumo-abertura" className="c41-rotulo">
          Resumo
        </h2>
        <p className="text-ui font-semibold text-fg">{tipo?.nome ?? "Escolha o tipo"}</p>
        {tipo && <p className="text-fs-2 text-fg-muted">{tipo.etapas} etapas · {tipo.prazo}</p>}
        <dl className="mt-1 flex flex-col divide-y divide-border-soft text-fs-2">
          <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-fg-secondary">Empresa</dt>
            <dd className="text-right text-fg">{empresaNome ?? <span className="text-fg-muted">a escolher</span>}</dd>
          </div>
          <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-fg-secondary">Já com o escritório</dt>
            <dd className="tabular-nums text-fg">{tipo ? `${jaTemos.size} de ${tipo.itens.length}` : "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-fg-secondary">A pedir</dt>
            <dd className={`tabular-nums ${faltam.length > 0 ? "font-semibold text-warning-fg" : "text-fg"}`}>{tipo ? faltam.length : "—"}</dd>
          </div>
        </dl>
      </Card>
    </form>
  );
}
