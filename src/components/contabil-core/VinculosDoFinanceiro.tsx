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
import { informado } from "@/lib/contabil-core/conciliacao/telaDaRevisao";
import { NOMES_DAS_FONTES, PARES_DE_COMPARACAO, nomeDaComparacao, vinculosAtivosDoFinanceiro } from "@/lib/contabil-core/conciliacao/telaDoFinanceiro";
import type { AnaliseFinanceiro, VinculoFinanceiro } from "@/lib/contabil-core/conciliacao/financeiroTipos";

// As conferências registradas numa análise do financeiro (Bloco B, Fase B4, 12/11/2026): porte do
// `FinanceiroVinculos.tsx` do Contábil Core. A mais recente primeiro; cada uma mostra o par de
// documentos, os movimentos de cada lado, os totais, a diferença, a observação e, se foi desfeita, quem
// desfez, quando e por quê. Desfazer pede o motivo e não apaga o registro.

const quando = (iso: string | null) => (iso ? formatInstantDateTime(new Date(iso)) : "Não informado");

type Props = {
  analise: AnaliseFinanceiro;
  ocupado: boolean;
  /** Quem só consulta o módulo não vê o botão de desfazer. */
  podeDesfazer: boolean;
  onDesfazer: (vinculo: VinculoFinanceiro, motivo: string) => void;
};

export function VinculosDoFinanceiro({ analise, ocupado, podeDesfazer, onDesfazer }: Props) {
  const base = useId();
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const linhas = new Map(analise.linhas.map((l) => [l.id, l]));
  const fontes = new Map(analise.fontes.map((f) => [f.id, f.nomeArquivo]));
  const ativas = vinculosAtivosDoFinanceiro(analise.vinculos).length;

  const lado = (titulo: string, ids: string[]) => (
    <div className="flex min-w-0 flex-col gap-2">
      <h4 className="text-micro font-medium uppercase tracking-wide text-fg-muted">
        {titulo} ({ids.length})
      </h4>
      <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto pr-1">
        {ids.map((id) => {
          const l = linhas.get(id);
          return (
            <li key={id} className="rounded-md bg-surface-2 p-2">
              {l ? (
                <>
                  <p className="tabular-nums">
                    {dataBr(l.data)} · {moeda(l.valor)}
                  </p>
                  <p className="break-words">{informado(l.historico)}</p>
                  <p className="text-micro text-fg-muted break-words">
                    {fontes.get(l.fonteId) ?? "Arquivo não informado"} · {l.referencia}
                  </p>
                </>
              ) : (
                <span className="text-warning-fg">Referência indisponível nesta análise.</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${base}-titulo`}>
      <h2 id={`${base}-titulo`} className="text-base font-semibold">
        Conferências registradas ({plural(ativas, "ativa", "ativas")})
      </h2>
      {analise.vinculos.length === 0 && (
        <p className="text-sm text-fg-muted">Nenhuma conferência registrada. Escolha os movimentos nos dois painéis para registrar a primeira relação.</p>
      )}
      <ul className="flex flex-col gap-2">
        {[...analise.vinculos].reverse().map((v) => {
          const ativa = v.estado === "ATIVO";
          const par = PARES_DE_COMPARACAO[v.tipoComparacao];
          return (
            <li key={v.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
              <Accordion
                classeDoCabecalho="w-full text-left"
                titulo={
                  <span className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Selo tom={ativa ? "marca" : "neutro"}>{ativa ? "Registrada" : "Desfeita"}</Selo>
                      <span className="break-words">{par ? nomeDaComparacao(v.tipoComparacao) : v.tipoComparacao}</span>
                      <span className="tabular-nums whitespace-nowrap">{moeda(v.totalFinanceiro)}</span>
                      <span className={`tabular-nums whitespace-nowrap ${valorZerado(v.diferenca) ? "" : "font-semibold text-warning-fg"}`}>Diferença {moeda(v.diferenca)}</span>
                    </span>
                    <span className="text-micro text-fg-muted">
                      {quando(v.criadoEm)} · por {informado(v.responsavel)}
                    </span>
                  </span>
                }
              >
                <div className="mt-3 flex flex-col gap-3">
                  <p className="tabular-nums">
                    {par ? NOMES_DAS_FONTES[par.base] : "Base"}: {moeda(v.totalFinanceiro)} · {par ? NOMES_DAS_FONTES[par.origem] : "Comparação"}: {moeda(v.totalComparacao)}
                  </p>
                  <p className="whitespace-pre-wrap break-words">
                    <span className="text-fg-muted">Observação: </span>
                    {v.observacao.trim() || "Sem observação."}
                  </p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {lado(par ? NOMES_DAS_FONTES[par.base] : "Base", v.financeiroIds)}
                    {lado(par ? NOMES_DAS_FONTES[par.origem] : "Comparação", v.comparacaoIds)}
                  </div>

                  {!ativa ? (
                    <p className="text-micro text-fg-muted break-words">
                      Desfeita por {informado(v.desfeitoPor)} em {quando(v.desfeitoEm)}. Motivo: {informado(v.motivoDesfazer)}
                    </p>
                  ) : !podeDesfazer ? null : desfazendo === v.id ? (
                    <div className="flex flex-col gap-2 rounded-md border border-warning/40 p-3">
                      <CampoForm
                        label="Motivo para desfazer a conferência"
                        htmlFor={`${base}-motivo-${v.id}`}
                        required
                        helper="Os movimentos voltam a ficar disponíveis nesta comparação. O registro e o motivo continuam no histórico, e nenhum lançamento muda."
                      >
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
