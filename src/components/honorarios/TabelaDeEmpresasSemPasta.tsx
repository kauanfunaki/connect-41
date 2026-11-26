"use client";

import { useId, useState } from "react";
import { Building2, CircleSlash, Eye, Folder, FolderX, Link2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { SlideOver } from "@/components/ui/SlideOver";
import { dataCurta } from "@/lib/honorarios/rotulos";
import type { EmpresaSemPasta } from "@/lib/honorarios/servidor/auditSyncService";
import { mudarMarcaSemPasta, mudarVinculoDaPasta } from "@/app/(app)/honorarios/actions";
import { useAcao } from "./useAcao";
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

// Subaba "Empresas sem pasta" no padrão da alternativa A (26/11/2026,
// melhoria-813): a melhor pasta parecida numa coluna e uma ação por linha —
// Vincular à sugestão, Marcar sem pasta ou Desmarcar — com o resto no ⋯. O
// motivo de "sem pasta" e as outras sugestões ficam no painel; antes, marcar
// abria uma linha embaixo e cada sugestão tinha o seu botão na célula.

const pct = (s: number) => `${Math.round(s * 100)}% parecido`;

export function TabelaDeEmpresasSemPasta({ empresas, marcadas, podeAgir }: { empresas: EmpresaSemPasta[]; marcadas: boolean; podeAgir: boolean }) {
  const { rodando, rodar } = useAcao();
  const [painel, setPainel] = useState<string | null>(null);

  if (!empresas.length) {
    return (
      <div className="c41-sem-linhas">
        <EmptyState title={marcadas ? "Nenhuma empresa marcada como sem pasta" : "Nenhuma empresa sem pasta neste filtro"} icon={<Building2 />} />
      </div>
    );
  }

  function acoes(e: EmpresaSemPasta): { principal: AcaoPrincipal | null; menu: (ItemDasAcoes | false | null)[] } {
    const detalhes: ItemDasAcoes = { rotulo: "Ver detalhes", icone: <Eye />, onClick: () => setPainel(e.id) };
    const abrirEmpresa: ItemDasAcoes = { rotulo: "Abrir empresa", icone: <Building2 />, href: `/empresas/${e.id}` };
    if (!podeAgir) return { principal: { rotulo: "Detalhes", onClick: () => setPainel(e.id) }, menu: [abrirEmpresa] };
    if (e.marcada) {
      return {
        principal: {
          rotulo: "Desmarcar",
          icone: <Undo2 aria-hidden />,
          disabled: rodando,
          titulo: "Volta a empresa para a auditoria",
          onClick: () => rodar(() => mudarMarcaSemPasta({ acao: "desmarcar", companyId: e.id })),
        },
        menu: [detalhes, abrirEmpresa],
      };
    }
    const s = e.sugestoesDePasta[0];
    const marcar: AcaoPrincipal = {
      rotulo: "Marcar sem pasta",
      icone: <FolderX aria-hidden />,
      titulo: "A empresa não tem pasta na rede de propósito: sai da auditoria",
      onClick: () => setPainel(e.id),
    };
    if (s) {
      return {
        principal: {
          rotulo: "Vincular",
          icone: <Link2 aria-hidden />,
          disabled: rodando,
          titulo: `Vincular à pasta ${s.nomePasta}`,
          onClick: () => rodar(() => mudarVinculoDaPasta({ acao: "vincular", nomePasta: s.nomePasta, companyId: e.id })),
        },
        menu: [{ rotulo: marcar.rotulo, icone: <FolderX />, onClick: marcar.onClick }, detalhes, abrirEmpresa],
      };
    }
    return { principal: marcar, menu: [detalhes, abrirEmpresa] };
  }

  const aberta = empresas.find((e) => e.id === painel) ?? null;

  return (
    <>
      <div className={CLASSE_DA_TABELA}>
        <table className="w-full min-w-[760px]">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>{marcadas ? "Motivo" : "Pasta parecida"}</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => {
              const { principal, menu } = acoes(e);
              const s = e.sugestoesDePasta[0];
              return (
                <tr key={e.id}>
                  <td>
                    <NomeQueAbre
                      nome={e.razaoSocial}
                      aberto={painel === e.id}
                      aoAbrir={() => setPainel(e.id)}
                      sub={
                        <>
                          {e.cnpj}
                          {e.responsavel && ` · ${e.responsavel}`}
                        </>
                      }
                    />
                  </td>
                  <td>
                    {e.marcada ? (
                      <>
                        <SeloDaSituacao tom="neutro" icone={<CircleSlash aria-hidden />} dica={e.marcadoEm ? `Marcada em ${dataCurta(e.marcadoEm)}` : undefined}>
                          Sem pasta
                        </SeloDaSituacao>
                        <span className="block max-w-[20rem] truncate text-micro text-fg-muted" title={e.motivo ?? undefined}>
                          {e.motivo ?? "Sem motivo informado"}
                        </span>
                      </>
                    ) : s ? (
                      <>
                        <span className="inline-flex max-w-[20rem] items-center gap-1 text-fg" title={s.nomePasta}>
                          <Folder size={13} className="shrink-0 text-fg-muted" aria-hidden />
                          <span className="truncate">{s.nomePasta}</span>
                        </span>
                        <span className="block text-micro text-fg-muted">
                          {pct(s.similaridade)}
                          {s.filialConfere && <span className="text-success-fg"> · filial confere</span>}
                          {e.sugestoesDePasta.length > 1 && ` · +${e.sugestoesDePasta.length - 1}`}
                        </span>
                      </>
                    ) : (
                      <span className="text-fg-muted">Nenhuma pasta livre parecida</span>
                    )}
                  </td>
                  <td>
                    <AcoesDaLinha nome={e.razaoSocial} principal={principal} menu={menu} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SlideOver open={!!aberta} onClose={() => setPainel(null)} title={aberta?.razaoSocial} width="max-w-lg">
        {aberta && <PainelDaEmpresaSemPasta key={aberta.id} e={aberta} podeAgir={podeAgir} rodando={rodando} rodar={rodar} />}
      </SlideOver>
    </>
  );
}

function PainelDaEmpresaSemPasta({
  e,
  podeAgir,
  rodando,
  rodar,
}: {
  e: EmpresaSemPasta;
  podeAgir: boolean;
  rodando: boolean;
  rodar: ReturnType<typeof useAcao>["rodar"];
}) {
  const ids = useId();
  const [motivo, setMotivo] = useState("");
  return (
    <>
      <SubtituloDoPainel partes={[e.cnpj, e.responsavel]} empresaId={e.id} />

      {e.marcada ? (
        <SecaoDoPainel rotulo="Sem pasta, fora da auditoria">
          <p className="text-fg">{e.motivo ?? "Sem motivo informado"}</p>
          {e.marcadoEm && <p className="mt-0.5 text-micro text-fg-muted">Marcada em {dataCurta(e.marcadoEm)}</p>}
        </SecaoDoPainel>
      ) : (
        <>
          <SecaoDoPainel rotulo={`Pastas parecidas (${e.sugestoesDePasta.length})`}>
            {e.sugestoesDePasta.length === 0 ? (
              <p className="text-fg-muted">Nenhuma pasta livre parecida.</p>
            ) : (
              <ul className="space-y-2">
                {e.sugestoesDePasta.map((s) => (
                  <li key={s.nomePasta} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 text-fg">
                        <Folder size={13} className="shrink-0 text-fg-muted" aria-hidden /> <span className="break-words">{s.nomePasta}</span>
                      </span>
                      <span className="block text-micro text-fg-muted">
                        {pct(s.similaridade)}
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
          </SecaoDoPainel>

          {podeAgir && (
            <SecaoDoPainel rotulo="Marcar sem pasta">
              <form
                className="flex flex-col gap-2"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  rodar(() => mudarMarcaSemPasta({ acao: "marcar", companyId: e.id, motivo: motivo.trim() || undefined }));
                }}
              >
                <p className="text-fg-muted">A empresa não tem pasta na rede de propósito: sai da auditoria de contratos e aditivos.</p>
                <label htmlFor={`${ids}-motivo`} className="text-label font-medium text-fg">
                  Motivo (opcional)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[220px] flex-1">
                    <Input
                      id={`${ids}-motivo`}
                      maxLength={300}
                      placeholder="Ex.: MEI, contrato fica com o cliente"
                      value={motivo}
                      onChange={(ev) => setMotivo(ev.target.value)}
                    />
                  </div>
                  <Button type="submit" size="sm" disabled={rodando}>
                    {rodando ? "Marcando…" : "Marcar"}
                  </Button>
                </div>
              </form>
            </SecaoDoPainel>
          )}
        </>
      )}

      <PeDoPainel
        nome={e.razaoSocial}
        menu={[{ rotulo: "Abrir empresa", icone: <Building2 />, href: `/empresas/${e.id}` }]}
        principal={
          podeAgir && e.marcada
            ? {
                rotulo: "Desmarcar",
                disabled: rodando,
                titulo: "Volta a empresa para a auditoria",
                onClick: () => rodar(() => mudarMarcaSemPasta({ acao: "desmarcar", companyId: e.id })),
              }
            : null
        }
      />
    </>
  );
}
