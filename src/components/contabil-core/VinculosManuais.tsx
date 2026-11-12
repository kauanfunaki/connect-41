"use client";

import { useId, useState } from "react";
import { Undo2 } from "lucide-react";
import { Accordion } from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Selo } from "@/components/ui/Selo";
import { Textarea } from "@/components/ui/Textarea";
import { formatInstantDateTime } from "@/lib/format";
import { dataBr, moedaDoRelatorio as moeda, plural, valorZerado } from "@/lib/contabil-core/conciliacao/telaDaConciliacao";
import { informado, valorDoItem, vinculosAtivos } from "@/lib/contabil-core/conciliacao/telaDaRevisao";
import type { Revisao, VinculoRevisao } from "@/lib/contabil-core/conciliacao/revisaoTipos";

// As conferências registradas numa revisão (Bloco B, Fase B3, 12/11/2026): porte do `VinculosManuais.tsx`
// do Contábil Core. Cada uma mostra o extrato e o Razão que a compõem, a observação e, se foi desfeita,
// quem desfez, quando e por quê. Desfazer pede o motivo e não apaga o registro.

const quando = (iso: string | null) => (iso ? formatInstantDateTime(new Date(iso)) : "Não informado");

type Props = {
  revisao: Revisao;
  ocupado: boolean;
  /** Quem só consulta o módulo não vê o botão de desfazer. */
  podeDesfazer: boolean;
  onDesfazer: (vinculo: VinculoRevisao, motivo: string) => void;
};

export function VinculosManuais({ revisao, ocupado, podeDesfazer, onDesfazer }: Props) {
  const base = useId();
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const extrato = new Map(revisao.extrato.map((l) => [l.transacaoId, l]));
  const razao = new Map(revisao.linhasRazao.map((l) => [l.id, l]));
  const ativas = vinculosAtivos(revisao.vinculos).length;

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${base}-titulo`}>
      <h3 id={`${base}-titulo`} className="text-sm font-semibold">
        Conferências registradas ({plural(ativas, "ativa", "ativas")})
      </h3>
      {revisao.vinculos.length === 0 && <p className="text-sm text-fg-muted">Nenhuma composição manual registrada nesta análise.</p>}
      <ul className="flex flex-col gap-2">
        {revisao.vinculos.map((v) => {
          const ativa = v.estado === "ATIVO";
          return (
            <li key={v.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
              <Accordion
                classeDoCabecalho="w-full text-left"
                titulo={
                  <span className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Selo tom={ativa ? "marca" : "neutro"}>{ativa ? "Conferência manual" : "Desfeita"}</Selo>
                      <span>
                        {plural(v.extratoIds.length, "linha", "linhas")} do extrato · {plural(v.razaoItens.length, "lançamento", "lançamentos")} do Razão
                      </span>
                      <span className={`tabular-nums whitespace-nowrap ${valorZerado(v.diferenca) ? "" : "font-semibold text-warning-fg"}`}>
                        Diferença {moeda(v.diferenca)}
                      </span>
                    </span>
                    <span className="text-micro text-fg-muted">
                      {quando(v.criadoEm)} · por {informado(v.responsavel)}
                    </span>
                  </span>
                }
              >
                <div className="mt-3 flex flex-col gap-3">
                  <p className="tabular-nums">
                    Extrato: {moeda(v.totalExtrato)} · Razão: {moeda(v.totalRazao)}
                  </p>
                  <p className="whitespace-pre-wrap break-words">
                    <span className="text-fg-muted">Observação: </span>
                    {informado(v.observacao)}
                  </p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <h4 className="text-micro font-medium uppercase tracking-wide text-fg-muted">Extrato bancário</h4>
                      {v.extratoIds.map((id) => {
                        const l = extrato.get(id);
                        return l ? (
                          <div key={id} className="rounded-md bg-surface-2 p-2">
                            <p className="tabular-nums">
                              {dataBr(l.data)} · {moeda(l.valor)}
                            </p>
                            <p className="break-words">{informado(l.historico)}</p>
                            <p className="text-micro text-fg-muted break-words">
                              Favorecido: {informado(l.favorecido)} · Documento: {informado(l.documento)}
                            </p>
                          </div>
                        ) : (
                          <p key={id} className="text-warning-fg">
                            Lançamento do extrato indisponível nesta fonte.
                          </p>
                        );
                      })}
                    </div>
                    <div className="flex flex-col gap-2">
                      <h4 className="text-micro font-medium uppercase tracking-wide text-fg-muted">Razão contábil</h4>
                      {v.razaoItens.map((item) => {
                        const l = razao.get(item.linhaId);
                        return l ? (
                          <div key={item.linhaId} className="rounded-md bg-surface-2 p-2">
                            <p className="tabular-nums">
                              {dataBr(l.data)} · {item.dc === "D" ? "Débito" : "Crédito"} · {moeda(valorDoItem(l, item.dc))}
                            </p>
                            <p className="break-words">
                              {informado(l.contaCodigo)} · {informado(l.contaClassificacao)} · {informado(l.contaDescricao)}
                            </p>
                            <p className="break-words">{informado(l.historico)}</p>
                            <p className="text-micro text-fg-muted break-words">
                              Favorecido: {informado(l.favorecido)} · Documento: {informado(l.documento)} · Lote: {informado(l.lote)}
                            </p>
                          </div>
                        ) : (
                          <p key={item.linhaId} className="text-warning-fg">
                            Lançamento do Razão indisponível nesta fonte.
                          </p>
                        );
                      })}
                    </div>
                  </div>

                  {!ativa ? (
                    <p className="text-micro text-fg-muted">
                      Desfeita por {informado(v.desfeitoPor)} em {quando(v.desfeitoEm)}. Motivo: {informado(v.motivoDesfazer)}
                    </p>
                  ) : !podeDesfazer ? null : desfazendo === v.id ? (
                    <div className="flex flex-col gap-2 rounded-md border border-warning/40 p-3">
                      <CampoForm label="Motivo para desfazer a conferência" htmlFor={`${base}-motivo-${v.id}`} required helper="O registro e o motivo continuam no histórico da revisão.">
                        <Textarea
                          id={`${base}-motivo-${v.id}`}
                          rows={2}
                          maxLength={2000}
                          value={motivo}
                          disabled={ocupado}
                          autoFocus
                          onChange={(e) => setMotivo(e.target.value)}
                        />
                      </CampoForm>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" disabled={ocupado} onClick={() => setDesfazendo(null)}>
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={!motivo.trim()}
                          loading={ocupado}
                          loadingLabel="Desfazendo…"
                          onClick={() => onDesfazer(v, motivo.trim())}
                        >
                          Confirmar e desfazer
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={ocupado}
                        onClick={() => {
                          setMotivo("");
                          setDesfazendo(v.id);
                        }}
                      >
                        <Undo2 size={14} aria-hidden /> Desfazer conferência
                      </Button>
                    </div>
                  )}
                </div>
              </Accordion>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
