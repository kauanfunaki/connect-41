"use client";

import { useState, type ReactNode } from "react";
import { Ban, Building2, CircleCheck, CircleX, Copy, Eye, FileSignature, FolderPlus, Hourglass, PenLine, TriangleAlert, UserMinus } from "lucide-react";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { SlideOver } from "@/components/ui/SlideOver";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { ROTULO_MOTIVO_CONTRATO, ROTULO_STATUS_CONTRATO, rotuloCurtoDoContrato, TOM_STATUS_CONTRATO } from "@/lib/honorarios/rotulos";
import type { StatusContrato } from "@/lib/honorarios/regras/auditContratosStatus";
import type { ArquivoContratoResumo, EmpresaContrato } from "@/lib/honorarios/servidor/auditContratosService";
import { AvisoDistrato, linhasDoDistrato } from "./AvisoDistrato";
import { caminhoDaPasta, useCopiarCaminho } from "./CopiarCaminho";
import { IconeDoArquivo } from "./ArquivoDaPasta";
import { AcoesDaLinha, CLASSE_DA_TABELA, NomeQueAbre, PeDoPainel, SecaoDoPainel, SeloDaSituacao, SubtituloDoPainel, type AcaoPrincipal } from "./PecasDaLista";

// Aba Contratos no padrão da alternativa A (26/11/2026, melhoria-813): selo
// curto na Situação (o motivo vai na dica e no painel), o nome do contrato
// numa linha só, cortado, e uma ação por linha — "Copiar caminho" ou
// "Vincular pasta", agora os dois como botão — com o ⋯. O detalhe (candidatos,
// descartados e a renomeação sugerida) abre num painel, cada um na sua seção.

function sufixos(a: ArquivoContratoResumo): string[] {
  const s: string[] = [];
  if (a.assinatura.digital) s.push("assinatura digital");
  else if (a.assinatura.peloNome) s.push("assinado pelo nome");
  if (a.formato === "pdf" && !a.assinatura.tecnicaLida) s.push("conteúdo não analisado");
  if (a.icp) s.push("ICP-Brasil");
  if (a.antigo) s.push("antigo");
  if (a.motivoExclusao) s.push(a.motivoExclusao);
  return s;
}

const ICONE_DO_STATUS: Record<StatusContrato, ReactNode> = {
  NAO_LOCALIZADO: <CircleX aria-hidden />,
  MINUTA: <PenLine aria-hidden />,
  AGUARDANDO_ASSINATURA: <Hourglass aria-hidden />,
  REVISAR: <TriangleAlert aria-hidden />,
  ASSINADO: <CircleCheck aria-hidden />,
  DISTRATO: <Ban aria-hidden />,
};

const LINK_DO_VINCULO = "/honorarios/pastas?aba=empresas";

/** A ação de pasta da empresa: copiar o caminho, ou vincular a pasta quando não há. */
function acaoDaPasta(e: EmpresaContrato, raizUnc: string, copiar: (c: string) => void): AcaoPrincipal | null {
  if (!e.pastas.length) return { rotulo: "Vincular pasta", icone: <FolderPlus aria-hidden />, href: LINK_DO_VINCULO, titulo: "A empresa ainda não tem pasta na rede vinculada" };
  const alvo = caminhoDaPasta(raizUnc, e.pastas);
  if (!alvo) return null;
  return { rotulo: "Copiar caminho", icone: <Copy aria-hidden />, onClick: () => copiar(alvo.caminho), titulo: alvo.caminho };
}

export function TabelaDeContratos({ empresas, raizUnc, filtrado }: { empresas: EmpresaContrato[]; raizUnc: string; filtrado: boolean }) {
  const [painel, setPainel] = useState<string | null>(null);
  const copiar = useCopiarCaminho();

  if (!empresas.length) {
    return (
      <div className="c41-sem-linhas">
        <EmptyState
          title={filtrado ? "Nenhuma empresa neste filtro" : "Nenhuma empresa ativa com CNPJ"}
          description={filtrado ? "Troque o filtro ou a busca acima para ver as outras." : undefined}
          icon={<FileSignature />}
        />
      </div>
    );
  }

  const aberta = empresas.find((e) => e.empresa.id === painel) ?? null;

  return (
    <>
      <div className={CLASSE_DA_TABELA}>
        <table className="w-full min-w-[820px]">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Situação</th>
              <th>Contrato escolhido</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => {
              const id = e.empresa.id;
              const nome = e.empresa.razaoSocial;
              const dica = [
                `${ROTULO_STATUS_CONTRATO[e.status]}: ${ROTULO_MOTIVO_CONTRATO[e.motivo]}`,
                ...e.warnings.map((w) => `• ${w}`),
                ...(e.exCliente ? [`• Também tem pasta em Ex Clientes (“${e.exCliente}”)`] : []),
                ...linhasDoDistrato(e.distrato).map((l) => `• ${l}`),
              ].join("\n");
              return (
                <tr key={id}>
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
                  <td>
                    <SeloDaSituacao
                      tom={TOM_STATUS_CONTRATO[e.status]}
                      icone={ICONE_DO_STATUS[e.status]}
                      mais={e.warnings.length + (e.exCliente ? 1 : 0)}
                      dica={dica}
                    >
                      {rotuloCurtoDoContrato(e.status, e.motivo)}
                    </SeloDaSituacao>
                  </td>
                  <td>
                    {e.contratoPrincipal ? (
                      <span className="inline-block max-w-[16rem] truncate align-bottom text-fg-secondary" title={e.contratoPrincipal.caminhoRelativo}>
                        {e.contratoPrincipal.nome}
                      </span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                  <td>
                    <AcoesDaLinha
                      nome={nome}
                      principal={acaoDaPasta(e, raizUnc, copiar)}
                      menu={[
                        { rotulo: "Ver detalhes", icone: <Eye />, onClick: () => setPainel(id) },
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

      <SlideOver open={!!aberta} onClose={() => setPainel(null)} title={aberta?.empresa.razaoSocial} width="max-w-lg">
        {aberta && <PainelDoContrato e={aberta} acao={acaoDaPasta(aberta, raizUnc, copiar)} />}
      </SlideOver>
    </>
  );
}

function Arquivos({ arquivos, escolhido }: { arquivos: ArquivoContratoResumo[]; escolhido?: string }) {
  if (!arquivos.length) return <p className="text-fg-muted">Nenhum.</p>;
  return (
    <ul className="space-y-1.5">
      {arquivos.map((a) => {
        const s = sufixos(a);
        return (
          <li key={`${a.nomePasta}/${a.caminhoRelativo}`} className="flex items-start gap-2">
            <IconeDoArquivo formato={a.formato} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-fg" title={a.caminhoRelativo}>
                  {a.nome}
                </span>
                {escolhido === a.caminhoRelativo && <Selo tom="marca">Escolhido</Selo>}
              </span>
              {s.length > 0 && <span className="block text-micro text-fg-muted">{s.join(" · ")}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function PainelDoContrato({ e, acao }: { e: EmpresaContrato; acao: AcaoPrincipal | null }) {
  const temDistrato = linhasDoDistrato(e.distrato).length > 0;
  return (
    <>
      <SubtituloDoPainel partes={[e.empresa.cnpj, e.empresa.responsavel]} empresaId={e.empresa.id} />

      <SecaoDoPainel rotulo="Situação">
        <p className="flex flex-wrap items-center gap-2">
          <Selo tom={TOM_STATUS_CONTRATO[e.status]} className="gap-1 [&>svg]:size-3">
            {ICONE_DO_STATUS[e.status]}
            {ROTULO_STATUS_CONTRATO[e.status]}
          </Selo>
          <span>{ROTULO_MOTIVO_CONTRATO[e.motivo]}</span>
        </p>
        {e.exCliente && (
          <p className="mt-2 flex items-start gap-2 text-warning-fg">
            <UserMinus size={14} className="mt-0.5 shrink-0" aria-hidden />
            Também tem pasta em Ex Clientes (“{e.exCliente}”). Confira se ela ainda é cliente.
          </p>
        )}
      </SecaoDoPainel>

      {e.warnings.length > 0 && (
        <SecaoDoPainel rotulo={`Pontos de atenção (${e.warnings.length})`}>
          <ul className="space-y-1">
            {e.warnings.map((w) => (
              <li key={w} className="flex items-start gap-2 text-warning-fg">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden /> {w}
              </li>
            ))}
          </ul>
        </SecaoDoPainel>
      )}

      {temDistrato && (
        <SecaoDoPainel rotulo="Distrato">
          <AvisoDistrato distrato={e.distrato} />
        </SecaoDoPainel>
      )}

      <SecaoDoPainel rotulo={`Contratos candidatos (${e.contratos.length})`}>
        <Arquivos arquivos={e.contratos} escolhido={e.contratoPrincipal?.caminhoRelativo} />
      </SecaoDoPainel>

      {e.descartados.length > 0 && (
        <SecaoDoPainel rotulo="Descartados pela classificação">
          <BlocoRecolhivel titulo="Documentos descartados" resumo={e.descartados.length === 1 ? "1 arquivo" : `${e.descartados.length} arquivos`}>
            <Arquivos arquivos={e.descartados} />
          </BlocoRecolhivel>
        </SecaoDoPainel>
      )}

      {e.renomeacao?.recomendado && (
        <SecaoDoPainel rotulo="Renomeação sugerida">
          <p className="text-fg-muted">Só sugestão: nada é renomeado pelo Connect.</p>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-fg-muted">De</dt>
            <dd className="break-words text-fg">{e.renomeacao.caminhoOriginal}</dd>
            <dt className="text-fg-muted">Para</dt>
            <dd className="break-words text-fg">{e.renomeacao.caminhoDestino}</dd>
          </dl>
        </SecaoDoPainel>
      )}

      <PeDoPainel nome={e.empresa.razaoSocial} menu={[{ rotulo: "Abrir empresa", icone: <Building2 />, href: `/empresas/${e.empresa.id}` }]} principal={acao} />
    </>
  );
}
