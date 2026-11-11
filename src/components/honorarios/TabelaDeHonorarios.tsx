"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Camera, ChevronRight, CircleCheck, Dot, Banknote } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ALERTAS_INFORMATIVOS } from "@/lib/honorarios/regras/honorariosRegras";
import { fotoPendente } from "@/lib/honorarios/filtros";
import {
  dataCurta,
  dataHora,
  moeda,
  ROTULO_ALERTA,
  ROTULO_COMPARACAO,
  ROTULO_ESTADO_DO_TEXTO,
  ROTULO_SITUACAO,
  ROTULO_TIPO_DOCUMENTO,
  TOM_SITUACAO,
} from "@/lib/honorarios/rotulos";
import type { DocumentoResumo, EmpresaHonorario } from "@/lib/honorarios/servidor/honorariosService";
import { removerHonorarioInformado } from "@/app/(app)/honorarios/actions";
import { AvisoDistrato } from "./AvisoDistrato";
import { DialogoDoValor, DialogoAcessoriasCerto } from "./DialogosDoHonorario";

const tipoMinusculo = (d: DocumentoResumo) => ROTULO_TIPO_DOCUMENTO[d.tipo].toLowerCase();
const dataDoDoc = (d: DocumentoResumo) => dataCurta(d.data ?? d.modificadoEm);

/** De onde veio o valor, embaixo dele. */
function origemDoValor(e: EmpresaHonorario): string | null {
  if (e.manual) return e.manual.origem === "acessorias" ? `do Acessórias, confirmado por ${e.manual.informadoPor}` : `informado por ${e.manual.informadoPor}`;
  if (e.documento) {
    const adicional = e.documento.adicional ? ` · + ${moeda(e.documento.adicional)}/func.` : "";
    return `${tipoMinusculo(e.documento)} de ${dataDoDoc(e.documento)}${adicional}`;
  }
  return null;
}

const ehGrave = (a: EmpresaHonorario["alertas"][number]) => !ALERTAS_INFORMATIVOS.has(a);

export function TabelaDeHonorarios({ empresas, podeAgir, filtrado }: { empresas: EmpresaHonorario[]; podeAgir: boolean; filtrado: boolean }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<{ tipo: "valor" | "acessorias"; empresa: EmpresaHonorario } | null>(null);

  if (!empresas.length) {
    return filtrado ? (
      <EmptyState title="Nenhuma empresa neste filtro" description="Troque o filtro ou a busca acima para ver as outras." icon={<Banknote />} />
    ) : (
      <EmptyState title="Nenhuma empresa ativa com CNPJ" description="O honorário é procurado nas empresas ativas do cadastro, pelo vínculo da pasta." icon={<Banknote />} />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left">
              <th className="w-8 py-2" aria-label="Detalhes" />
              <th className="py-2 pr-3 font-medium">Empresa</th>
              <th className="py-2 pr-3 font-medium text-right">Honorário</th>
              <th className="py-2 pr-3 font-medium">Situação</th>
              <th className="py-2 pr-3 font-medium">No Acessórias</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => {
              const id = e.empresa.id;
              const expandida = aberta === id;
              const foto = fotoPendente(e);
              const comparacao = e.acessorias.comparacao;
              const podeConfirmarAcessorias = e.situacao !== "DISTRATO" && comparacao === "DIFERENTE" && (e.acessorias.valor ?? 0) >= 10;
              const alertas = e.alertas.filter((a) => !(foto && a === "mais_recente_digitalizado"));
              return (
                <Fragment key={id}>
                  <tr className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
                    <td className="py-2.5">
                      <button
                        type="button"
                        onClick={() => setAberta(expandida ? null : id)}
                        aria-expanded={expandida}
                        aria-label={`${expandida ? "Esconder" : "Ver"} documentos de ${e.empresa.razaoSocial}`}
                        className="grid h-7 w-7 place-items-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg"
                      >
                        <ChevronRight size={16} className={`transition-transform motion-reduce:transition-none ${expandida ? "rotate-90" : ""}`} aria-hidden />
                      </button>
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
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      <span className="font-semibold tabular-nums">{moeda(e.valor)}</span>
                      {origemDoValor(e) && <span className="block text-micro text-fg-muted">{origemDoValor(e)}</span>}
                    </td>
                    <td className="py-2.5 pr-3 max-w-[340px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Selo tom={TOM_SITUACAO[e.situacao]}>{ROTULO_SITUACAO[e.situacao]}</Selo>
                        {foto && e.fotoMaisRecente && (
                          <span
                            title={`${e.fotoMaisRecente.caminhoRelativo} (${dataDoDoc(e.fotoMaisRecente)}): o robô não lê foto nem PDF escaneado. Abra o arquivo e, se o valor for outro, use "Conferir valor".`}
                          >
                            <Selo tom="atencao">
                              <Camera size={12} aria-hidden /> Mais recente é foto
                            </Selo>
                          </span>
                        )}
                      </div>
                      <AvisoDistrato distrato={e.distrato} />
                      {alertas.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {alertas.map((a) => (
                            <li key={a} className={`flex items-start gap-1 text-micro ${ehGrave(a) ? "text-warning-fg" : "text-fg-muted"}`}>
                              {ehGrave(a) ? <AlertTriangle size={12} className="mt-px flex-shrink-0" aria-hidden /> : <Dot size={12} className="mt-px flex-shrink-0" aria-hidden />}
                              {ROTULO_ALERTA[a]}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <span className="tabular-nums">
                        {comparacao === "NAO_CONFERIDO" || comparacao === "NAO_ENCONTRADA" ? "—" : moeda(e.acessorias.valor)}
                      </span>
                      {ROTULO_COMPARACAO[comparacao] && (
                        <span className={`block text-micro ${comparacao === "DIFERENTE" ? "text-warning-fg" : "text-fg-muted"}`}>{ROTULO_COMPARACAO[comparacao]}</span>
                      )}
                      {e.ultimoEnvio && (
                        <span className="block text-micro text-fg-muted">
                          {e.ultimoEnvio.status === "ok" ? "Atualizado" : "Falhou"} em {dataCurta(e.ultimoEnvio.enviadoEm)} ({e.ultimoEnvio.conta})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {podeAgir && e.situacao !== "DISTRATO" && (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {podeConfirmarAcessorias && (
                            <Button
                              variant="ghost"
                              size="xs"
                              title="O valor do Acessórias está certo e o lido na pasta está errado"
                              onClick={() => setDialogo({ tipo: "acessorias", empresa: e })}
                            >
                              Acessórias está certo
                            </Button>
                          )}
                          <Button variant="secondary" size="xs" onClick={() => setDialogo({ tipo: "valor", empresa: e })}>
                            {e.manual ? "Alterar valor" : e.situacao === "CONFERIR" ? "Conferir valor" : "Informar valor"}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {expandida && (
                    <tr className="border-b border-border-soft bg-surface-2/50">
                      <td />
                      <td colSpan={5} className="py-3 pr-3">
                        <DetalhesDaEmpresa empresa={e} podeAgir={podeAgir} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialogo?.tipo === "valor" && <DialogoDoValor empresa={dialogo.empresa} aoFechar={() => setDialogo(null)} />}
      {dialogo?.tipo === "acessorias" && <DialogoAcessoriasCerto empresa={dialogo.empresa} aoFechar={() => setDialogo(null)} />}
    </>
  );
}

function DetalhesDaEmpresa({ empresa: e, podeAgir }: { empresa: EmpresaHonorario; podeAgir: boolean }) {
  const toast = useToast();
  const [removendo, iniciar] = useTransition();
  const foto = fotoPendente(e) ? e.fotoMaisRecente : null;

  function remover() {
    iniciar(async () => {
      const r = await removerHonorarioInformado(e.empresa.id);
      if (r.ok) toast.success(r.mensagem ?? "Valor informado removido.");
      else toast.error(r.erro);
    });
  }

  return (
    <div className="space-y-3 text-label">
      {e.manual && (
        <div>
          <p className="font-semibold text-fg">{e.manual.origem === "acessorias" ? "Valor do Acessórias, confirmado como certo" : "Valor informado"}</p>
          <p className="text-fg-secondary">
            {moeda(e.manual.valor)} · por {e.manual.informadoPor} em {dataHora(e.manual.informadoEm)}
            {e.manual.documento && ` · documento: ${e.manual.documento}`}
          </p>
          {e.manual.observacao && <p className="text-fg-muted">“{e.manual.observacao}”</p>}
          {podeAgir && (
            <Button variant="link" size="xs" className="mt-1 px-0" onClick={remover} disabled={removendo}>
              Remover e voltar ao valor lido
            </Button>
          )}
        </div>
      )}

      {e.documento?.trecho && (
        <div>
          <p className="font-semibold text-fg">Trecho lido em {e.documento.nome}</p>
          <blockquote className="mt-1 border-l-2 border-border-strong pl-3 text-fg-secondary">{e.documento.trecho}</blockquote>
        </div>
      )}

      {foto && e.documento && (
        <div className="rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-warning-fg">
          <p>O arquivo mais recente é foto ou PDF escaneado, e o robô não lê o valor dele.</p>
          <p className="mt-0.5">
            {foto.caminhoRelativo} ({dataCurta(foto.modificadoEm)}, data do arquivo). O valor acima ({moeda(e.valor)}) é do {tipoMinusculo(e.documento)} de{" "}
            {dataDoDoc(e.documento)}. Abra a foto e, se o valor for outro, use <strong>Conferir valor</strong>.
          </p>
        </div>
      )}

      <div>
        <p className="font-semibold text-fg">Documentos da pasta ({e.documentos.length})</p>
        {e.documentos.length === 0 ? (
          <p className="text-fg-muted">
            Nenhum documento.
            {e.situacao === "SEM_DOCUMENTO" && (
              <>
                {" "}
                <Link href="/honorarios/pastas?aba=empresas" className="text-brand hover:underline">
                  Conferir o vínculo da pasta
                </Link>
              </>
            )}
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {e.documentos.map((d) => {
              const usado = e.documento?.caminhoRelativo === d.caminhoRelativo && e.documento.nomePasta === d.nomePasta;
              const ehAFoto = foto?.caminhoRelativo === d.caminhoRelativo && foto.nomePasta === d.nomePasta;
              return (
                <li key={`${d.nomePasta}/${d.caminhoRelativo}`} className="flex items-start gap-1.5 text-fg-secondary">
                  {usado ? (
                    <CircleCheck size={14} className="mt-0.5 flex-shrink-0 text-success-fg" aria-label="Documento usado" />
                  ) : ehAFoto ? (
                    <Camera size={14} className="mt-0.5 flex-shrink-0 text-warning-fg" aria-label="Arquivo mais recente, foto: conferir" />
                  ) : (
                    <span className="w-3.5 flex-shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 break-words">
                    {d.caminhoRelativo} · {ROTULO_TIPO_DOCUMENTO[d.tipo]} · {dataDoDoc(d)}
                    {!d.data && " (arquivo)"} · {ROTULO_ESTADO_DO_TEXTO[d.estado]}
                    {d.minuta && " · minuta"}
                    {d.valor !== null && (
                      <>
                        {" "}
                        · <strong className="text-fg tabular-nums">{moeda(d.valor)}</strong>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
