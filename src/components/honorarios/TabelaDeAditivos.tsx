"use client";

import { useState, type ReactNode } from "react";
import { Ban, Building2, CircleCheck, CircleX, Copy, Eye, FilePlus2, FileText, FolderPlus, PenLine, UserMinus } from "lucide-react";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { SlideOver } from "@/components/ui/SlideOver";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { ROTULO_ASSINATURA, ROTULO_CURTO_ADITIVO, ROTULO_DECIMO, ROTULO_STATUS_ADITIVO, TOM_STATUS_ADITIVO } from "@/lib/honorarios/rotulos";
import type { ArquivoResumo, EmpresaAditivo } from "@/lib/honorarios/servidor/auditAditivosService";
import type { SinalAssinatura } from "@/lib/honorarios/regras/auditAditivosClassificador";
import type { StatusAditivo } from "@/lib/honorarios/regras/auditAditivosStatus";
import { AvisoDistrato, linhasDoDistrato } from "./AvisoDistrato";
import { caminhoDaPasta, useCopiarCaminho } from "./CopiarCaminho";
import { IconeDoArquivo } from "./ArquivoDaPasta";
import {
  AcoesDaLinha,
  CLASSE_DA_TABELA,
  NomeQueAbre,
  PeDoPainel,
  SecaoDoPainel,
  SeloDaSituacao,
  SubtituloDoPainel,
  type AcaoPrincipal,
  type ItemDasAcoes,
} from "./PecasDaLista";

// Aba Aditivos no padrão da alternativa A (26/11/2026, melhoria-813): selo
// curto na Situação, colunas centralizadas e uma ação por linha — "Gerar
// termo" para quem está pendente, "Copiar caminho" para quem está em dia,
// "Vincular pasta" para quem não tem pasta — com o resto no ⋯. Antes a
// coluna empilhava um botão e um link. Os arquivos abrem num painel.

const ICONE_DO_STATUS: Record<StatusAditivo, ReactNode> = {
  SEM_VINCULO: <CircleX aria-hidden />,
  SEM_PASTA_CONTRATO: <CircleX aria-hidden />,
  SEM_ADITIVO: <CircleX aria-hidden />,
  SO_DOCX: <PenLine aria-hidden />,
  PDF_SEM_ASSINATURA: <PenLine aria-hidden />,
  ASSINADO_PELO_NOME: <CircleCheck aria-hidden />,
  ASSINADO_DIGITAL: <CircleCheck aria-hidden />,
  DISTRATO: <Ban aria-hidden />,
};

function Arquivos({ arquivos }: { arquivos: ArquivoResumo[] }) {
  if (!arquivos.length) return <p className="text-fg-muted">Nenhum.</p>;
  return (
    <ul className="space-y-1.5">
      {arquivos.map((a) => (
        <li key={`${a.nomePasta}/${a.caminhoRelativo}`} className="flex items-start gap-2">
          <IconeDoArquivo formato={a.formato} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-fg" title={a.caminhoRelativo}>
              {a.nome}
            </span>
            <span className="block text-micro text-fg-muted">
              {ROTULO_ASSINATURA[a.assinatura as SinalAssinatura] ?? a.assinatura}
              {a.icp && " (ICP-Brasil)"}
              {a.decimoTerceiro && " · 13º"} · {a.ano}
              {a.anoFonte === "data_do_arquivo" && " (data do arquivo)"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** As frases que explicavam a situação embaixo do selo: agora na dica e no painel. */
function notasDaSituacao(e: EmpresaAditivo, ano: number): string[] {
  const n: string[] = [];
  if (!e.emDia && e.ultimoAnoComAditivo && e.ultimoAnoComAditivo !== ano) n.push(`Último aditivo encontrado: ${e.ultimoAnoComAditivo}`);
  if (e.status === "SEM_ADITIVO" && e.decimoTerceiro) n.push(`Tem só o termo de 13º em ${ano}`);
  return n;
}

export function TabelaDeAditivos({ empresas, ano, raizUnc, filtrado }: { empresas: EmpresaAditivo[]; ano: number; raizUnc: string; filtrado: boolean }) {
  const [painel, setPainel] = useState<string | null>(null);
  const copiar = useCopiarCaminho();

  if (!empresas.length) {
    return (
      <div className="c41-sem-linhas">
        <EmptyState
          title={filtrado ? "Nenhuma empresa neste filtro" : "Nenhuma empresa ativa com CNPJ"}
          description={filtrado ? "Troque o filtro ou a busca acima para ver as outras." : undefined}
          icon={<FilePlus2 />}
        />
      </div>
    );
  }

  /** A ação principal e as outras, pela situação da empresa. */
  function acoes(e: EmpresaAditivo): { principal: AcaoPrincipal | null; outras: ItemDasAcoes[] } {
    const id = e.empresa.id;
    const alvo = caminhoDaPasta(raizUnc, e.pastas);
    // O termo aditivo em Word, com o cadastro da empresa (12/11/2026).
    const termo: AcaoPrincipal = { rotulo: "Gerar termo", icone: <FileText aria-hidden />, href: `/honorarios/termo/${id}` };
    const copia: AcaoPrincipal | null = alvo ? { rotulo: "Copiar caminho", icone: <Copy aria-hidden />, onClick: () => copiar(alvo.caminho), titulo: alvo.caminho } : null;
    const vincular: AcaoPrincipal = { rotulo: "Vincular pasta", icone: <FolderPlus aria-hidden />, href: "/honorarios/pastas?aba=empresas", titulo: "A empresa ainda não tem pasta na rede vinculada" };
    const principal = !e.pastas.length ? vincular : !e.emDia && e.status !== "DISTRATO" ? termo : (copia ?? termo);
    const todas = [termo, copia, e.pastas.length ? null : vincular].filter((a): a is AcaoPrincipal => !!a && a !== principal);
    return {
      principal,
      outras: todas.map((a) => ({ rotulo: a.rotulo, icone: a.icone, href: a.href, onClick: a.onClick })),
    };
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
              <th>13º</th>
              <th>Aditivos de {ano}</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => {
              const id = e.empresa.id;
              const nome = e.empresa.razaoSocial;
              const decimo = e.decimoTerceiro ? (e.decimoTerceiro.situacao as StatusAditivo) : null;
              const { principal, outras } = acoes(e);
              const dica = [
                ROTULO_STATUS_ADITIVO[e.status],
                ...notasDaSituacao(e, ano).map((n) => `• ${n}`),
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
                    <SeloDaSituacao tom={TOM_STATUS_ADITIVO[e.status]} icone={ICONE_DO_STATUS[e.status]} mais={e.exCliente ? 1 : 0} dica={dica}>
                      {ROTULO_CURTO_ADITIVO[e.status]}
                    </SeloDaSituacao>
                  </td>
                  <td>
                    {decimo ? (
                      <Selo tom={TOM_STATUS_ADITIVO[decimo]}>{ROTULO_DECIMO[decimo] ?? ROTULO_STATUS_ADITIVO[decimo]}</Selo>
                    ) : (
                      <span className="text-fg-muted">
                        —<span className="sr-only">Não tem termo de 13º</span>
                      </span>
                    )}
                  </td>
                  <td>{e.aditivosDoAno.length}</td>
                  <td>
                    <AcoesDaLinha
                      nome={nome}
                      principal={principal}
                      menu={[
                        ...outras,
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
        {aberta && <PainelDoAditivo e={aberta} ano={ano} {...acoes(aberta)} />}
      </SlideOver>
    </>
  );
}

function PainelDoAditivo({ e, ano, principal, outras }: { e: EmpresaAditivo; ano: number; principal: AcaoPrincipal | null; outras: ItemDasAcoes[] }) {
  const decimo = e.decimoTerceiro ? (e.decimoTerceiro.situacao as StatusAditivo) : null;
  const notas = notasDaSituacao(e, ano);
  const temDistrato = linhasDoDistrato(e.distrato).length > 0;
  // A segunda ação vai ao lado da principal; o resto, no ⋯.
  const [secundaria, ...resto] = outras;
  return (
    <>
      <SubtituloDoPainel partes={[e.empresa.cnpj, e.empresa.responsavel]} empresaId={e.empresa.id} />

      <SecaoDoPainel rotulo="Situação">
        <p className="flex flex-wrap items-center gap-2">
          <Selo tom={TOM_STATUS_ADITIVO[e.status]} className="gap-1 [&>svg]:size-3">
            {ICONE_DO_STATUS[e.status]}
            {ROTULO_STATUS_ADITIVO[e.status]}
          </Selo>
          {decimo && (
            <span>
              Termo de 13º: <strong className="font-medium text-fg">{ROTULO_DECIMO[decimo] ?? ROTULO_STATUS_ADITIVO[decimo]}</strong>
            </span>
          )}
        </p>
        {notas.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-fg-muted">
            {notas.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {e.exCliente && (
          <p className="mt-2 flex items-start gap-2 text-warning-fg">
            <UserMinus size={14} className="mt-0.5 shrink-0" aria-hidden />
            Também tem pasta em Ex Clientes (“{e.exCliente}”). Confira se ela ainda é cliente.
          </p>
        )}
      </SecaoDoPainel>

      {temDistrato && (
        <SecaoDoPainel rotulo="Distrato">
          <AvisoDistrato distrato={e.distrato} />
        </SecaoDoPainel>
      )}

      <SecaoDoPainel rotulo={`Aditivo anual de ${ano} (${e.aditivosDoAno.length})`}>
        <Arquivos arquivos={e.aditivosDoAno} />
      </SecaoDoPainel>

      {e.decimoTerceiro && (
        <SecaoDoPainel rotulo={`Termo de 13º de ${ano} (${e.decimoTerceiro.arquivos.length})`}>
          <Arquivos arquivos={e.decimoTerceiro.arquivos} />
        </SecaoDoPainel>
      )}

      {e.outrosAditivos.length > 0 && (
        <SecaoDoPainel rotulo="Aditivos de outros anos">
          <BlocoRecolhivel titulo="Arquivos de outros anos" resumo={e.outrosAditivos.length === 1 ? "1 arquivo" : `${e.outrosAditivos.length} arquivos`}>
            <Arquivos arquivos={e.outrosAditivos} />
          </BlocoRecolhivel>
        </SecaoDoPainel>
      )}

      <PeDoPainel
        nome={e.empresa.razaoSocial}
        menu={[...resto, { rotulo: "Abrir empresa", icone: <Building2 />, href: `/empresas/${e.empresa.id}` }]}
        secundaria={secundaria ? { rotulo: secundaria.rotulo, icone: secundaria.icone, href: secundaria.href, onClick: secundaria.onClick } : null}
        principal={principal}
      />
    </>
  );
}
