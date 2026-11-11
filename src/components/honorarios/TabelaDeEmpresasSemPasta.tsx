"use client";

import { Fragment, useId, useState } from "react";
import Link from "next/link";
import { Building2, Folder } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { dataCurta } from "@/lib/honorarios/rotulos";
import type { EmpresaSemPasta } from "@/lib/honorarios/servidor/auditSyncService";
import { mudarMarcaSemPasta, mudarVinculoDaPasta } from "@/app/(app)/honorarios/actions";
import { useAcao } from "./useAcao";

export function TabelaDeEmpresasSemPasta({ empresas, marcadas, podeAgir }: { empresas: EmpresaSemPasta[]; marcadas: boolean; podeAgir: boolean }) {
  const { rodando, rodar } = useAcao();
  const [marcando, setMarcando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const ids = useId();

  if (!empresas.length) {
    return (
      <EmptyState
        title={marcadas ? "Nenhuma empresa marcada como sem pasta" : "Nenhuma empresa sem pasta neste filtro"}
        icon={<Building2 />}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left">
            <th className="py-2 pr-3 font-medium">Empresa</th>
            <th className="py-2 pr-3 font-medium">{marcadas ? "Motivo" : "Pastas parecidas"}</th>
            <th className="py-2 font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {empresas.map((e) => (
            <Fragment key={e.id}>
              <tr className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
                <td className="py-2.5 pr-3">
                  <Link href={`/empresas/${e.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                    {e.razaoSocial}
                  </Link>
                  <span className="block text-micro text-fg-muted tabular-nums">
                    {e.cnpj}
                    {e.responsavel && ` · ${e.responsavel}`}
                  </span>
                </td>
                <td className="py-2.5 pr-3 max-w-[420px]">
                  {e.marcada ? (
                    <div>
                      <Selo tom="neutro">Sem pasta (fora da auditoria)</Selo>
                      <span className="mt-0.5 block text-label text-fg-secondary">{e.motivo ?? "Sem motivo informado"}</span>
                      {e.marcadoEm && <span className="block text-micro text-fg-muted">Marcada em {dataCurta(e.marcadoEm)}</span>}
                    </div>
                  ) : e.sugestoesDePasta.length === 0 ? (
                    <span className="text-label text-fg-muted">Nenhuma pasta livre parecida.</span>
                  ) : (
                    <ul className="space-y-1.5">
                      {e.sugestoesDePasta.map((s) => (
                        <li key={s.nomePasta} className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="flex items-center gap-1 text-label text-fg">
                              <Folder size={13} className="flex-shrink-0 text-fg-muted" aria-hidden /> <span className="break-words">{s.nomePasta}</span>
                            </span>
                            <span className="block text-micro text-fg-muted">
                              {Math.round(s.similaridade * 100)}% parecido
                              {s.filialConfere && <span className="text-success-fg"> · filial confere</span>}
                            </span>
                          </span>
                          {podeAgir && (
                            <Button
                              variant="secondary"
                              size="xs"
                              disabled={rodando}
                              aria-label={`Vincular ${e.razaoSocial} à pasta ${s.nomePasta}`}
                              onClick={() => rodar(() => mudarVinculoDaPasta({ acao: "vincular", nomePasta: s.nomePasta, companyId: e.id }))}
                            >
                              Vincular
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  {podeAgir &&
                    (e.marcada ? (
                      <Button variant="ghost" size="xs" disabled={rodando} onClick={() => rodar(() => mudarMarcaSemPasta({ acao: "desmarcar", companyId: e.id }))}>
                        Desmarcar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={rodando}
                        title="A empresa não tem pasta na rede de propósito: sai da auditoria"
                        aria-expanded={marcando === e.id}
                        onClick={() => {
                          setMotivo("");
                          setMarcando(marcando === e.id ? null : e.id);
                        }}
                      >
                        Marcar sem pasta
                      </Button>
                    ))}
                </td>
              </tr>
              {marcando === e.id && (
                <tr className="border-b border-border-soft bg-surface-2/50">
                  <td colSpan={3} className="py-3 pr-3">
                    <form
                      className="flex max-w-xl flex-wrap items-end gap-2"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        rodar(() => mudarMarcaSemPasta({ acao: "marcar", companyId: e.id, motivo: motivo.trim() || undefined }), () => setMarcando(null));
                      }}
                    >
                      <div className="min-w-[280px] flex-1">
                        <label htmlFor={`${ids}-${e.id}`} className="mb-1 block text-label font-medium text-fg">
                          Motivo (opcional)
                        </label>
                        <Input
                          id={`${ids}-${e.id}`}
                          maxLength={300}
                          placeholder="Ex.: MEI, contrato fica com o cliente"
                          value={motivo}
                          onChange={(ev) => setMotivo(ev.target.value)}
                          autoFocus
                        />
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setMarcando(null)}>
                        Cancelar
                      </Button>
                      <Button type="submit" size="sm" disabled={rodando}>
                        Marcar
                      </Button>
                    </form>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
