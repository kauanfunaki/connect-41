"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronRight, FilePlus2 } from "lucide-react";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { ROTULO_ASSINATURA, ROTULO_DECIMO, ROTULO_STATUS_ADITIVO, TOM_STATUS_ADITIVO } from "@/lib/honorarios/rotulos";
import type { ArquivoResumo, EmpresaAditivo } from "@/lib/honorarios/servidor/auditAditivosService";
import type { SinalAssinatura } from "@/lib/honorarios/regras/auditAditivosClassificador";
import type { StatusAditivo } from "@/lib/honorarios/regras/auditAditivosStatus";
import { AvisoDistrato } from "./AvisoDistrato";
import { CopiarCaminho } from "./CopiarCaminho";
import { IconeDoArquivo, ListaDeArquivos } from "./ArquivoDaPasta";

function Arquivo({ a }: { a: ArquivoResumo }) {
  return (
    <li className="flex items-start gap-1.5 text-fg-secondary">
      <IconeDoArquivo formato={a.formato} />
      <span className="min-w-0 break-words">
        {a.caminhoRelativo} · {ROTULO_ASSINATURA[a.assinatura as SinalAssinatura] ?? a.assinatura}
        {a.icp && " (ICP-Brasil)"}
        {a.decimoTerceiro && " · 13º"} · {a.ano}
        {a.anoFonte === "data_do_arquivo" && " (data do arquivo)"}
      </span>
    </li>
  );
}

export function TabelaDeAditivos({ empresas, ano, raizUnc, filtrado }: { empresas: EmpresaAditivo[]; ano: number; raizUnc: string; filtrado: boolean }) {
  const [aberta, setAberta] = useState<string | null>(null);

  if (!empresas.length) {
    return (
      <EmptyState
        title={filtrado ? "Nenhuma empresa neste filtro" : "Nenhuma empresa ativa com CNPJ"}
        description={filtrado ? "Troque o filtro ou a busca acima para ver as outras." : undefined}
        icon={<FilePlus2 />}
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
            <th className="py-2 pr-3 font-medium">13º</th>
            <th className="py-2 pr-3 font-medium text-right">Aditivos de {ano}</th>
            <th className="py-2 font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {empresas.map((e) => {
            const id = e.empresa.id;
            const temDetalhe = e.aditivosDoAno.length > 0 || e.outrosAditivos.length > 0 || (e.decimoTerceiro?.arquivos.length ?? 0) > 0;
            const expandida = aberta === id;
            const decimo = e.decimoTerceiro ? (e.decimoTerceiro.situacao as StatusAditivo) : null;
            return (
              <Fragment key={id}>
                <tr className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
                  <td className="py-2.5">
                    {temDetalhe && (
                      <button
                        type="button"
                        onClick={() => setAberta(expandida ? null : id)}
                        aria-expanded={expandida}
                        aria-label={`${expandida ? "Esconder" : "Ver"} arquivos de ${e.empresa.razaoSocial}`}
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
                    <Selo tom={TOM_STATUS_ADITIVO[e.status]}>{ROTULO_STATUS_ADITIVO[e.status]}</Selo>
                    {!e.emDia && e.ultimoAnoComAditivo && e.ultimoAnoComAditivo !== ano && (
                      <span className="mt-0.5 block text-micro text-fg-muted">Último aditivo encontrado: {e.ultimoAnoComAditivo}</span>
                    )}
                    {e.status === "SEM_ADITIVO" && e.decimoTerceiro && (
                      <span className="mt-0.5 block text-micro text-fg-muted">Tem só o termo de 13º em {ano}</span>
                    )}
                    <AvisoDistrato distrato={e.distrato} />
                  </td>
                  <td className="py-2.5 pr-3">
                    {decimo ? (
                      <Selo tom={TOM_STATUS_ADITIVO[decimo]}>{ROTULO_DECIMO[decimo] ?? ROTULO_STATUS_ADITIVO[decimo]}</Selo>
                    ) : (
                      <span className="text-fg-muted">
                        —<span className="sr-only">Não tem termo de 13º</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{e.aditivosDoAno.length}</td>
                  <td className="py-2.5 text-right">
                    {e.pastas.length > 0 ? (
                      <CopiarCaminho raizUnc={raizUnc} pastas={e.pastas} />
                    ) : (
                      <Link href="/honorarios/pastas?aba=empresas" className="text-label text-brand hover:underline">
                        Vincular pasta
                      </Link>
                    )}
                    {/* O termo aditivo em Word, com o cadastro da empresa (12/11/2026). */}
                    <Link href={`/honorarios/termo/${id}`} className="mt-1 block text-label text-brand hover:underline">
                      Gerar termo
                    </Link>
                  </td>
                </tr>
                {expandida && (
                  <tr className="border-b border-border-soft bg-surface-2/50">
                    <td />
                    <td colSpan={5} className="space-y-3 py-3 pr-3 text-label">
                      <ListaDeArquivos titulo={`Aditivo anual de ${ano}`} vazia={e.aditivosDoAno.length === 0}>
                        {e.aditivosDoAno.map((a) => (
                          <Arquivo key={`${a.nomePasta}/${a.caminhoRelativo}`} a={a} />
                        ))}
                      </ListaDeArquivos>
                      {e.decimoTerceiro && (
                        <ListaDeArquivos titulo={`Termo de 13º de ${ano}`} vazia={e.decimoTerceiro.arquivos.length === 0}>
                          {e.decimoTerceiro.arquivos.map((a) => (
                            <Arquivo key={`${a.nomePasta}/${a.caminhoRelativo}`} a={a} />
                          ))}
                        </ListaDeArquivos>
                      )}
                      {e.outrosAditivos.length > 0 && (
                        <ListaDeArquivos titulo="Aditivos de outros anos" vazia={false} esmaecida>
                          {e.outrosAditivos.map((a) => (
                            <Arquivo key={`${a.nomePasta}/${a.caminhoRelativo}`} a={a} />
                          ))}
                        </ListaDeArquivos>
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
