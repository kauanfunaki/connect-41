"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  Ban,
  Banknote,
  Camera,
  CircleCheck,
  CircleSlash,
  Clock,
  CloudUpload,
  Eye,
  FileX,
  PenLine,
  ScanLine,
  TriangleAlert,
  UserMinus,
  Dot,
  Building2,
  ThumbsUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { SlideOver } from "@/components/ui/SlideOver";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { useToast } from "@/components/ui/Toast";
import { CascoDaTabela } from "@/components/shared/CascoDaTabela";
import { useSelecaoDasLinhas } from "@/components/shared/useSelecaoDasLinhas";
import { ALERTAS_INFORMATIVOS, type SituacaoHonorario } from "@/lib/honorarios/regras/honorariosRegras";
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
import { AvisoDistrato, linhasDoDistrato } from "./AvisoDistrato";
import { DialogoDoValor, DialogoAcessoriasCerto } from "./DialogosDoHonorario";
import { DialogoDeEnvio, DialogoDeLote } from "./DialogosDoAcessorias";
import {
  AcoesDaLinha,
  CLASSE_DA_TABELA,
  NomeQueAbre,
  PeDoPainel,
  SecaoDoPainel,
  SeloDaSituacao,
  SubtituloDoPainel,
  type AcaoPrincipal,
} from "./PecasDaLista";

// Aba Honorários no padrão da alternativa A (26/11/2026, melhoria-813): tabela
// `.c41-tabela`, Situação num selo só (o resto na dica e no painel), uma ação
// de largura fixa e o ⋯ por linha, a barra do lote no lugar da barra do casco
// e o detalhe da empresa num painel lateral, em seções. A regra de cada ação
// (quem pode, quando) é a mesma de antes; só mudou o lugar.

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

/** O que a pessoa pode fazer com o Acessórias nesta tela. */
export type EnvioNaTela = {
  /** Pode enviar (nível "gerir") e a integração está pronta. */
  podeEnviar: boolean;
  /** Envios travados por um envio que mexeu em outros campos, ou operação em andamento. */
  bloqueado: string | null;
  /** O lote só libera depois de um envio individual limpo. */
  loteLiberado: boolean;
};

/** Dá para atualizar no Acessórias: tem valor, não é distrato e está diferente (ou ninguém conferiu). */
export const podeAtualizar = (e: EmpresaHonorario) =>
  e.situacao !== "DISTRATO" && e.valor !== null && (e.acessorias.comparacao === "DIFERENTE" || e.acessorias.comparacao === "NAO_CONFERIDO");

const ICONE_DA_SITUACAO: Record<SituacaoHonorario, ReactNode> = {
  CONFERIR: <TriangleAlert aria-hidden />,
  DIGITALIZADO: <ScanLine aria-hidden />,
  SEM_VALOR: <CircleSlash aria-hidden />,
  AGUARDANDO_LEITURA: <Clock aria-hidden />,
  SEM_DOCUMENTO: <FileX aria-hidden />,
  LIDO: <CircleCheck aria-hidden />,
  MANUAL: <PenLine aria-hidden />,
  DISTRATO: <Ban aria-hidden />,
};

const TOM_DA_COMPARACAO: Record<EmpresaHonorario["acessorias"]["comparacao"], TomDoSelo> = {
  DIFERENTE: "atencao",
  IGUAL: "sucesso",
  NAO_ENCONTRADA: "neutro",
  NAO_CONFERIDO: "neutro",
  SEM_VALOR_NO_APP: "neutro",
};

type Ponto = { texto: string; grave: boolean; icone: ReactNode };

/** O que pede atenção na empresa, do mais grave ao informativo — a dica do selo e a seção do painel. */
function pontosDeAtencao(e: EmpresaHonorario): Ponto[] {
  const foto = fotoPendente(e);
  const pontos: Ponto[] = [];
  if (foto) pontos.push({ texto: "O arquivo mais recente é foto ou escaneado: confira o valor nele", grave: true, icone: <Camera size={14} aria-hidden /> });
  for (const a of e.alertas) {
    if (foto && a === "mais_recente_digitalizado") continue;
    const grave = !ALERTAS_INFORMATIVOS.has(a);
    pontos.push({ texto: ROTULO_ALERTA[a], grave, icone: grave ? <TriangleAlert size={14} aria-hidden /> : <Dot size={14} aria-hidden /> });
  }
  if (e.exCliente) pontos.push({ texto: `Também tem pasta em Ex Clientes (“${e.exCliente}”)`, grave: true, icone: <UserMinus size={14} aria-hidden /> });
  return pontos.sort((a, b) => Number(b.grave) - Number(a.grave));
}

/** O selo da linha: a situação, ou "Foto" quando o arquivo mais recente é foto; +N graves e a dica com tudo. */
function SeloDoHonorario({ e }: { e: EmpresaHonorario }) {
  const foto = fotoPendente(e);
  const pontos = pontosDeAtencao(e);
  const graves = pontos.filter((p) => p.grave).length - (foto ? 1 : 0);
  const situacao = e.manual?.origem === "acessorias" ? "Vale o do Acessórias" : ROTULO_SITUACAO[e.situacao];
  const dica = [`Situação: ${situacao}`, ...pontos.map((p) => `• ${p.texto}`), ...linhasDoDistrato(e.distrato).map((l) => `• ${l}`)].join("\n");
  if (foto) {
    return (
      <SeloDaSituacao tom="atencao" icone={<Camera aria-hidden />} mais={graves} dica={dica}>
        Foto
      </SeloDaSituacao>
    );
  }
  return (
    <SeloDaSituacao tom={TOM_SITUACAO[e.situacao]} icone={ICONE_DA_SITUACAO[e.situacao]} mais={graves} dica={dica}>
      {e.manual?.origem === "acessorias" ? "Do Acessórias" : ROTULO_SITUACAO[e.situacao]}
    </SeloDaSituacao>
  );
}

type Dialogo = { tipo: "valor" | "acessorias" | "enviar"; empresa: EmpresaHonorario; doPainel: boolean };

/** As ações de uma empresa, com a mesma regra na linha e no pé do painel. */
function acoesDaEmpresa(e: EmpresaHonorario, podeAgir: boolean, envio: EnvioNaTela) {
  const comparacao = e.acessorias.comparacao;
  const podeValor = podeAgir && e.situacao !== "DISTRATO";
  const podeEnviarEsta = podeValor && envio.podeEnviar && podeAtualizar(e);
  const confirmaAcessorias = podeValor && comparacao === "DIFERENTE" && (e.acessorias.valor ?? 0) >= 10;
  // Lido ou informado e diferente do Acessórias: o que falta é atualizar lá.
  const atualizarPrimeiro = podeEnviarEsta && (e.situacao === "LIDO" || e.situacao === "MANUAL");
  const rotuloDoValor = e.manual ? "Alterar valor" : e.situacao === "CONFERIR" ? "Conferir valor" : "Informar valor";
  return { podeValor, podeEnviarEsta, confirmaAcessorias, atualizarPrimeiro, rotuloDoValor };
}

export function TabelaDeHonorarios({
  empresas,
  podeAgir,
  filtrado,
  envio = { podeEnviar: false, bloqueado: null, loteLiberado: false },
  barra,
}: {
  empresas: EmpresaHonorario[];
  podeAgir: boolean;
  filtrado: boolean;
  envio?: EnvioNaTela;
  /** A barra do casco quando nada está marcado: contagem, total, fora, busca e Filtros. */
  barra: { contagem?: ReactNode; total?: ReactNode; fora?: ReactNode; busca?: ReactNode; filtros?: ReactNode };
}) {
  const [painel, setPainel] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [lote, setLote] = useState(false);
  const selecionaveis = envio.podeEnviar ? empresas.filter(podeAtualizar) : [];
  const [selecionadas, setSelecionadas] = useSelecaoDasLinhas(selecionaveis.map((e) => e.empresa.id));
  const escolhidas = selecionaveis.filter((e) => selecionadas.has(e.empresa.id));
  const comCaixa = selecionaveis.length > 0;
  const alternar = (id: string) =>
    setSelecionadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todas = comCaixa && escolhidas.length === selecionaveis.length;
  const marcarTodas = () => setSelecionadas(todas ? new Set() : new Set(selecionaveis.map((e) => e.empresa.id)));
  const limpar = () => setSelecionadas(new Set());

  // A janela aberta do painel fecha o painel (dois diálogos disputariam o Tab)
  // e o reabre ao fechar, na mesma empresa.
  const abrirDialogo = (tipo: Dialogo["tipo"], empresa: EmpresaHonorario, doPainel = false) => {
    setPainel(null);
    setDialogo({ tipo, empresa, doPainel });
  };
  const fecharDialogo = () => {
    if (dialogo?.doPainel) setPainel(dialogo.empresa.empresa.id);
    setDialogo(null);
  };

  const diferentes = selecionaveis.filter((e) => e.acessorias.comparacao === "DIFERENTE");
  const semPendencia = selecionaveis.filter((e) => e.situacao === "LIDO" || e.situacao === "MANUAL");
  const motivoDoLote = envio.bloqueado ?? (!envio.loteLiberado ? "Libera depois do primeiro envio de uma empresa só, conferido no Acessórias" : undefined);

  const barraDoLote = escolhidas.length > 0 && (
    <>
      <span className="inline-flex items-center gap-2.5">
        <Checkbox checked onChange={limpar} aria-label="Desmarcar todas" />
        <span aria-live="polite" className="font-semibold text-fg">
          {escolhidas.length} {escolhidas.length === 1 ? "selecionada" : "selecionadas"}
        </span>
      </span>
      <Button variant="ghost" size="xs" onClick={limpar}>
        Limpar
      </Button>
      {(diferentes.length > 0 || semPendencia.length > 0) && (
        <>
          <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
          <span className="text-fg-muted">Selecionar:</span>
          {diferentes.length > 0 && (
            <Button
              variant="ghost"
              size="xs"
              title="Todas as empresas desta página cujo honorário está diferente no Acessórias"
              onClick={() => setSelecionadas(new Set(diferentes.map((e) => e.empresa.id)))}
            >
              Diferentes ({diferentes.length})
            </Button>
          )}
          {semPendencia.length > 0 && (
            <Button
              variant="ghost"
              size="xs"
              title="As empresas desta página com o valor lido sem pendência ou informado à mão"
              onClick={() => setSelecionadas(new Set(semPendencia.map((e) => e.empresa.id)))}
            >
              Sem pendência ({semPendencia.length})
            </Button>
          )}
        </>
      )}
      <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-2">
        {!envio.loteLiberado && !envio.bloqueado && <span className="text-micro text-fg-muted">Libera depois de um envio individual</span>}
        <Button size="sm" disabled={!!envio.bloqueado || !envio.loteLiberado} title={motivoDoLote} onClick={() => setLote(true)}>
          <CloudUpload size={14} aria-hidden />
          Atualizar {escolhidas.length} no Acessórias
        </Button>
      </span>
    </>
  );

  const aberta = empresas.find((e) => e.empresa.id === painel) ?? null;

  return (
    <>
      <CascoDaTabela {...barra} lote={barraDoLote || undefined}>
        {!empresas.length ? (
          <div className="c41-sem-linhas">
            {filtrado ? (
              <EmptyState title="Nenhuma empresa neste filtro" description="Troque o filtro ou a busca acima para ver as outras." icon={<Banknote />} />
            ) : (
              <EmptyState title="Nenhuma empresa ativa com CNPJ" description="O honorário é procurado nas empresas ativas do cadastro, pelo vínculo da pasta." icon={<Banknote />} />
            )}
          </div>
        ) : (
          <div className={CLASSE_DA_TABELA}>
            <table className="w-full min-w-[920px]">
              <thead>
                <tr>
                  {comCaixa && (
                    <th className="w-11">
                      <Checkbox checked={todas} onChange={marcarTodas} aria-label="Selecionar todas as que dá para atualizar nesta página" />
                    </th>
                  )}
                  <th>Empresa</th>
                  <th>Honorário</th>
                  <th>Situação</th>
                  <th>No Acessórias</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => {
                  const id = e.empresa.id;
                  const marcada = selecionadas.has(id) && podeAtualizar(e);
                  const comparacao = e.acessorias.comparacao;
                  const a = acoesDaEmpresa(e, podeAgir, envio);
                  const nome = e.empresa.razaoSocial;
                  const valor: AcaoPrincipal = { rotulo: a.rotuloDoValor, onClick: () => abrirDialogo("valor", e) };
                  const atualizar: AcaoPrincipal = {
                    rotulo: "Atualizar",
                    onClick: () => abrirDialogo("enviar", e),
                    disabled: !!envio.bloqueado,
                    titulo: envio.bloqueado ?? "Atualiza o honorário desta empresa no Acessórias",
                  };
                  const principal: AcaoPrincipal = a.atualizarPrimeiro ? atualizar : a.podeValor ? valor : { rotulo: "Detalhes", onClick: () => setPainel(id) };
                  const origem = origemDoValor(e);
                  return (
                    <tr key={id} className={marcada ? "bg-selected-bg" : undefined}>
                      {comCaixa && (
                        <td>
                          <Checkbox
                            checked={marcada}
                            disabled={!podeAtualizar(e)}
                            onChange={() => alternar(id)}
                            title={podeAtualizar(e) ? undefined : "Sem valor diferente para enviar ao Acessórias"}
                            aria-label={`Selecionar ${nome} para o envio em lote`}
                          />
                        </td>
                      )}
                      <td>
                        <NomeQueAbre
                          nome={nome}
                          aberto={painel === id}
                          aoAbrir={() => setPainel(id)}
                          sub={
                            <>
                              {e.empresa.cnpj}
                              {e.empresa.responsavel && ` · ${e.empresa.responsavel}`}
                            </>
                          }
                        />
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="font-semibold">{moeda(e.valor)}</span>
                        {origem && (
                          <span className="block max-w-[14rem] truncate text-micro text-fg-muted" title={origem}>
                            {origem}
                          </span>
                        )}
                      </td>
                      <td>
                        <SeloDoHonorario e={e} />
                      </td>
                      <td
                        className="whitespace-nowrap"
                        title={
                          e.ultimoEnvio
                            ? `${e.ultimoEnvio.status === "ok" ? "Atualizado" : "Falhou"} em ${dataCurta(e.ultimoEnvio.enviadoEm)} (${e.ultimoEnvio.conta})`
                            : undefined
                        }
                      >
                        <span>{comparacao === "NAO_CONFERIDO" || comparacao === "NAO_ENCONTRADA" ? "—" : moeda(e.acessorias.valor)}</span>
                        {ROTULO_COMPARACAO[comparacao] && (
                          <span className={`block text-micro ${comparacao === "DIFERENTE" ? "font-medium text-warning-fg" : "text-fg-muted"}`}>{ROTULO_COMPARACAO[comparacao]}</span>
                        )}
                      </td>
                      <td>
                        <AcoesDaLinha
                          nome={nome}
                          principal={principal}
                          menu={[
                            a.confirmaAcessorias && {
                              rotulo: "Acessórias está certo",
                              icone: <ThumbsUp />,
                              onClick: () => abrirDialogo("acessorias", e),
                            },
                            a.podeEnviarEsta &&
                              !a.atualizarPrimeiro && {
                                rotulo: "Atualizar no Acessórias",
                                icone: <CloudUpload />,
                                onClick: () => abrirDialogo("enviar", e),
                                disabled: !!envio.bloqueado,
                                descricao: envio.bloqueado ?? undefined,
                              },
                            a.atualizarPrimeiro && { rotulo: a.rotuloDoValor, icone: <PenLine />, onClick: () => abrirDialogo("valor", e) },
                            principal.rotulo !== "Detalhes" && { rotulo: "Ver detalhes", icone: <Eye />, onClick: () => setPainel(id) },
                            { rotulo: "Abrir empresa", icone: <Building2 />, href: `/empresas/${id}` },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CascoDaTabela>

      <SlideOver open={!!aberta} onClose={() => setPainel(null)} title={aberta?.empresa.razaoSocial} width="max-w-lg">
        {aberta && (
          <PainelDoHonorario
            e={aberta}
            podeAgir={podeAgir}
            envio={envio}
            aoAbrirDialogo={(tipo) => abrirDialogo(tipo, aberta, true)}
          />
        )}
      </SlideOver>

      {dialogo?.tipo === "valor" && <DialogoDoValor empresa={dialogo.empresa} aoFechar={fecharDialogo} />}
      {dialogo?.tipo === "acessorias" && <DialogoAcessoriasCerto empresa={dialogo.empresa} aoFechar={fecharDialogo} />}
      {dialogo?.tipo === "enviar" && <DialogoDeEnvio empresa={dialogo.empresa} aoFechar={fecharDialogo} />}
      {lote && (
        <DialogoDeLote
          empresas={escolhidas}
          aoFechar={() => setLote(false)}
          aoEnviar={() => {
            setLote(false);
            limpar();
          }}
        />
      )}
    </>
  );
}

/** O detalhe da empresa, em seções: valor, pontos de atenção, distrato, Acessórias e documentos da pasta. */
function PainelDoHonorario({
  e,
  podeAgir,
  envio,
  aoAbrirDialogo,
}: {
  e: EmpresaHonorario;
  podeAgir: boolean;
  envio: EnvioNaTela;
  aoAbrirDialogo: (tipo: Dialogo["tipo"]) => void;
}) {
  const toast = useToast();
  const [removendo, iniciar] = useTransition();
  const foto = fotoPendente(e) ? e.fotoMaisRecente : null;
  const pontos = pontosDeAtencao(e);
  const a = acoesDaEmpresa(e, podeAgir, envio);
  const comparacao = e.acessorias.comparacao;
  const temDistrato = linhasDoDistrato(e.distrato).length > 0;

  function remover() {
    iniciar(async () => {
      const r = await removerHonorarioInformado(e.empresa.id);
      if (r.ok) toast.success(r.mensagem ?? "Valor informado removido.");
      else toast.error(r.erro);
    });
  }

  return (
    <>
      <SubtituloDoPainel partes={[e.empresa.cnpj, e.empresa.responsavel]} empresaId={e.empresa.id} />

      <SecaoDoPainel rotulo="Valor">
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="text-section font-semibold text-fg tabular-nums">{moeda(e.valor)}</span>
          {origemDoValor(e) && <span className="text-micro text-fg-muted">{origemDoValor(e)}</span>}
        </p>
        {e.manual && (
          <div className="mt-2">
            <p className="font-medium text-fg">{e.manual.origem === "acessorias" ? "Valor do Acessórias, confirmado como certo" : "Valor informado"}</p>
            <p>
              {moeda(e.manual.valor)} · por {e.manual.informadoPor} em {dataHora(e.manual.informadoEm)}
              {e.manual.documento && ` · documento: ${e.manual.documento}`}
            </p>
            {e.manual.observacao && <p className="text-fg-muted">“{e.manual.observacao}”</p>}
            {podeAgir && (
              <Button variant="link" size="xs" className="mt-1 px-0" onClick={remover} disabled={removendo}>
                {removendo ? "Removendo…" : "Remover e voltar ao valor lido"}
              </Button>
            )}
          </div>
        )}
        {e.documento?.trecho && (
          <BlocoRecolhivel className="mt-3" titulo="Trecho lido" resumo={e.documento.nome}>
            <blockquote className="border-l-2 border-border-strong pl-3 text-fg-secondary">{e.documento.trecho}</blockquote>
          </BlocoRecolhivel>
        )}
      </SecaoDoPainel>

      {(pontos.length > 0 || foto) && (
        <SecaoDoPainel rotulo={`Pontos de atenção (${pontos.length})`}>
          <ul className="space-y-1.5">
            {pontos.map((p) => (
              <li key={p.texto} className={`flex items-start gap-2 ${p.grave ? "text-warning-fg" : "text-fg-muted"}`}>
                <span className="mt-0.5 shrink-0">{p.icone}</span>
                <span>{p.texto}</span>
              </li>
            ))}
          </ul>
          {foto && e.documento && (
            <p className="mt-2 rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-warning-fg">
              {foto.caminhoRelativo} ({dataCurta(foto.modificadoEm)}, data do arquivo). O valor acima ({moeda(e.valor)}) é do {tipoMinusculo(e.documento)} de{" "}
              {dataDoDoc(e.documento)}. Abra a foto e, se o valor for outro, use <strong>Conferir valor</strong>.
            </p>
          )}
        </SecaoDoPainel>
      )}

      {temDistrato && (
        <SecaoDoPainel rotulo="Distrato">
          <AvisoDistrato distrato={e.distrato} />
        </SecaoDoPainel>
      )}

      <SecaoDoPainel rotulo="No Acessórias">
        <p className="flex flex-wrap items-center gap-2">
          <strong className="text-ui text-fg tabular-nums">
            {comparacao === "NAO_CONFERIDO" || comparacao === "NAO_ENCONTRADA" ? "—" : moeda(e.acessorias.valor)}
          </strong>
          {ROTULO_COMPARACAO[comparacao] && <Selo tom={TOM_DA_COMPARACAO[comparacao]}>{ROTULO_COMPARACAO[comparacao]}</Selo>}
        </p>
        {e.ultimoEnvio && (
          <p className={`mt-1 text-micro ${e.ultimoEnvio.status === "ok" ? "text-fg-muted" : "text-danger"}`}>
            {e.ultimoEnvio.status === "ok" ? "Atualizado" : "Falhou"} em {dataCurta(e.ultimoEnvio.enviadoEm)} ({e.ultimoEnvio.conta})
            {e.ultimoEnvio.status !== "ok" && e.ultimoEnvio.erro && `: ${e.ultimoEnvio.erro}`}
          </p>
        )}
      </SecaoDoPainel>

      <SecaoDoPainel rotulo={`Documentos da pasta (${e.documentos.length})`}>
        {e.documentos.length === 0 ? (
          <p className="text-fg-muted">
            Nenhum documento.
            {e.situacao === "SEM_DOCUMENTO" && (
              <>
                {" "}
                <Link href="/honorarios/pastas?aba=empresas" className="font-medium text-brand hover:underline">
                  Conferir o vínculo da pasta
                </Link>
              </>
            )}
          </p>
        ) : (
          <table className="w-full table-fixed text-label">
            <colgroup>
              <col className="w-6" />
              <col />
              <col className="w-24" />
              <col className="w-24" />
            </colgroup>
            <thead>
              <tr className="text-left">
                <th className="pb-1">
                  <span className="sr-only">Uso</span>
                </th>
                <th className="c41-rotulo pb-1">Arquivo</th>
                <th className="c41-rotulo pb-1">Data</th>
                <th className="c41-rotulo pb-1 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {e.documentos.map((d) => {
                const usado = e.documento?.caminhoRelativo === d.caminhoRelativo && e.documento.nomePasta === d.nomePasta;
                const ehAFoto = foto?.caminhoRelativo === d.caminhoRelativo && foto.nomePasta === d.nomePasta;
                return (
                  <tr key={`${d.nomePasta}/${d.caminhoRelativo}`} className="border-t border-border-soft align-top">
                    <td className="py-1.5">
                      {usado ? (
                        <CircleCheck size={14} className="text-success-fg" aria-label="Documento usado" />
                      ) : ehAFoto ? (
                        <Camera size={14} className="text-warning-fg" aria-label="Arquivo mais recente, foto: conferir" />
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2">
                      <span className="block truncate text-fg" title={d.caminhoRelativo}>
                        {d.nome}
                      </span>
                      <span className="block text-micro text-fg-muted">
                        {ROTULO_TIPO_DOCUMENTO[d.tipo]} · {ROTULO_ESTADO_DO_TEXTO[d.estado]}
                        {d.minuta && " · minuta"}
                      </span>
                    </td>
                    <td className="py-1.5 tabular-nums" title={d.data ? undefined : "Sem data no texto: é a data do arquivo"}>
                      {dataDoDoc(d)}
                      {!d.data && <span className="block text-micro text-fg-muted">do arquivo</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {d.valor !== null ? <strong className="text-fg">{moeda(d.valor)}</strong> : <span className="text-fg-muted">{ehAFoto ? "foto" : "—"}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SecaoDoPainel>

      <PeDoPainel
        nome={e.empresa.razaoSocial}
        menu={[
          a.confirmaAcessorias && { rotulo: "Acessórias está certo", icone: <ThumbsUp />, onClick: () => aoAbrirDialogo("acessorias") },
          { rotulo: "Abrir empresa", icone: <Building2 />, href: `/empresas/${e.empresa.id}` },
        ]}
        secundaria={
          a.podeEnviarEsta
            ? {
                rotulo: "Atualizar no Acessórias",
                onClick: () => aoAbrirDialogo("enviar"),
                disabled: !!envio.bloqueado,
                titulo: envio.bloqueado ?? "Atualiza o honorário desta empresa no Acessórias",
              }
            : null
        }
        principal={a.podeValor ? { rotulo: a.rotuloDoValor, onClick: () => aoAbrirDialogo("valor") } : null}
      />
    </>
  );
}

