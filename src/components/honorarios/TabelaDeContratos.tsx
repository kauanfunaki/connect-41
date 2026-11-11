"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, FileSignature } from "lucide-react";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { ROTULO_MOTIVO_CONTRATO, ROTULO_STATUS_CONTRATO, TOM_STATUS_CONTRATO } from "@/lib/honorarios/rotulos";
import type { ArquivoContratoResumo, EmpresaContrato } from "@/lib/honorarios/servidor/auditContratosService";
import { AvisoDistrato } from "./AvisoDistrato";
import { CopiarCaminho } from "./CopiarCaminho";
import { IconeDoArquivo, ListaDeArquivos } from "./ArquivoDaPasta";

function sufixos(a: ArquivoContratoResumo): string {
  const s: string[] = [];
  if (a.assinatura.digital) s.push("assinatura digital");
  else if (a.assinatura.peloNome) s.push("assinado pelo nome");
  if (a.formato === "pdf" && !a.assinatura.tecnicaLida) s.push("conteúdo não analisado");
  if (a.icp) s.push("ICP-Brasil");
  if (a.antigo) s.push("antigo");
  if (a.motivoExclusao) s.push(a.motivoExclusao);
  return s.length ? ` · ${s.join(" · ")}` : "";
}

export function TabelaDeContratos({ empresas, raizUnc, filtrado }: { empresas: EmpresaContrato[]; raizUnc: string; filtrado: boolean }) {
  const [aberta, setAberta] = useState<string | null>(null);

  if (!empresas.length) {
    return (
      <EmptyState
        title={filtrado ? "Nenhuma empresa neste filtro" : "Nenhuma empresa ativa com CNPJ"}
        description={filtrado ? "Troque o filtro ou a busca acima para ver as outras." : undefined}
        icon={<FileSignature />}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px]">
        <thead>
          <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left">
            <th className="w-8 py-2"><span className="sr-only">Detalhes</span></th>
            <th className="py-2 pr-3 font-medium">Empresa</th>
            <th className="py-2 pr-3 font-medium">Situação</th>
            <th className="py-2 pr-3 font-medium">Contrato escolhido</th>
            <th className="py-2 font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {empresas.map((e) => {
            const id = e.empresa.id;
            const temDetalhe = e.contratos.length > 0 || e.descartados.length > 0 || e.warnings.length > 0;
            const expandida = aberta === id;
            return (
              <Fragment key={id}>
                <tr className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
                  <td className="py-2.5">
                    {temDetalhe && (
                      <button
                        type="button"
                        onClick={() => setAberta(expandida ? null : id)}
                        aria-expanded={expandida}
                        aria-label={`${expandida ? "Esconder" : "Ver"} detalhes de ${e.empresa.razaoSocial}`}
                        className="grid h-7 w-7 place-items-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg"
                      >
                        <ChevronRight size={16} className={`transition-transform motion-reduce:transition-none ${expandida ? "rotate-90" : ""}`} aria-hidden />
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Link href={`/empresas/${id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                      {e.empresa.razaoSocial}
                    </Link>
                    <span className="block text-micro text-fg-muted tabular-nums">
                      {e.empresa.cnpj}
                      {e.empresa.responsavel && ` · ${e.empresa.responsavel}`}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 max-w-[320px]">
                    <Selo tom={TOM_STATUS_CONTRATO[e.status]}>{ROTULO_STATUS_CONTRATO[e.status]}</Selo>
                    <span className="mt-0.5 block text-micro text-fg-muted">{ROTULO_MOTIVO_CONTRATO[e.motivo]}</span>
                    <AvisoDistrato distrato={e.distrato} />
                  </td>
                  <td className="py-2.5 pr-3 max-w-[320px] break-words text-fg-secondary">{e.contratoPrincipal?.nome ?? "—"}</td>
                  <td className="py-2.5 text-right">
                    {e.pastas.length > 0 ? (
                      <CopiarCaminho raizUnc={raizUnc} pastas={e.pastas} />
                    ) : (
                      <Link href="/honorarios/pastas?aba=empresas" className="text-label text-brand hover:underline">
                        Vincular pasta
                      </Link>
                    )}
                  </td>
                </tr>
                {expandida && (
                  <tr className="border-b border-border-soft bg-surface-2/50">
                    <td />
                    <td colSpan={4} className="space-y-3 py-3 pr-3 text-label">
                      {e.warnings.length > 0 && (
                        <ul className="space-y-0.5">
                          {e.warnings.map((w) => (
                            <li key={w} className="flex items-start gap-1 text-warning-fg">
                              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" aria-hidden /> {w}
                            </li>
                          ))}
                        </ul>
                      )}
                      <ListaDeArquivos titulo="Contratos candidatos" vazia={e.contratos.length === 0}>
                        {e.contratos.map((a) => (
                          <li key={`${a.nomePasta}/${a.caminhoRelativo}`} className="flex items-start gap-1.5 text-fg-secondary">
                            <IconeDoArquivo formato={a.formato} />
                            <span className="min-w-0 break-words">
                              {a.caminhoRelativo}
                              {e.contratoPrincipal?.caminhoRelativo === a.caminhoRelativo && <strong className="text-fg"> · escolhido</strong>}
                              {sufixos(a)}
                            </span>
                          </li>
                        ))}
                      </ListaDeArquivos>
                      {e.descartados.length > 0 && (
                        <ListaDeArquivos titulo="Documentos descartados pela classificação" vazia={false} esmaecida>
                          {e.descartados.map((a) => (
                            <li key={`${a.nomePasta}/${a.caminhoRelativo}`} className="flex items-start gap-1.5 text-fg-muted">
                              <IconeDoArquivo formato={a.formato} />
                              <span className="min-w-0 break-words">
                                {a.caminhoRelativo}
                                {sufixos(a)}
                              </span>
                            </li>
                          ))}
                        </ListaDeArquivos>
                      )}
                      {e.renomeacao?.recomendado && (
                        <p className="text-fg-muted">
                          <strong className="text-fg-secondary">Renomeação sugerida (só sugestão, nada é renomeado):</strong> {e.renomeacao.caminhoOriginal} →{" "}
                          {e.renomeacao.caminhoDestino}
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
