"use client";

import { useState } from "react";
import { BadgeCheck, Ban, Building2, CircleSlash, CircleX, Eye, EyeOff, Folder, FolderTree, Link2, Undo2, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { SlideOver } from "@/components/ui/SlideOver";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import type { PastaAuditada } from "@/lib/honorarios/servidor/auditSyncService";
import { mudarVinculoDaPasta } from "@/app/(app)/honorarios/actions";
import { useAcao } from "./useAcao";
import {
  AcoesDaLinha,
  CLASSE_DA_TABELA,
  NomeQueAbre,
  PeDoPainel,
  SecaoDoPainel,
  SeloDaSituacao,
  type AcaoPrincipal,
  type ItemDasAcoes,
} from "./PecasDaLista";

// Subaba "Pastas na rede" no padrão da alternativa A (26/11/2026,
// melhoria-813): o vínculo num selo, a empresa (ou a melhor sugestão) numa
// coluna e uma ação por linha — Confirmar, Vincular à sugestão ou Escolher
// empresa — com o resto no ⋯. Antes havia botão "Vincular" dentro da célula
// das sugestões e até três botões na coluna de ações, e escolher a empresa
// abria uma linha embaixo; agora a escolha e as sugestões ficam no painel.

const pct = (s: number) => `${Math.round(s * 100)}% parecido`;

function SeloDoVinculo({ p }: { p: PastaAuditada }) {
  const v = p.vinculo;
  const dica = p.erro ? `Erro ao ler a pasta: ${p.erro}` : undefined;
  const mais = p.erro ? 1 : 0;
  if (v?.tipo === "ignorado")
    return (
      <SeloDaSituacao tom="neutro" icone={<EyeOff aria-hidden />} mais={mais} dica={dica ?? "Ignorada: não é pasta de cliente"}>
        Ignorada
      </SeloDaSituacao>
    );
  if (v && !v.empresa)
    return (
      <SeloDaSituacao tom="perigo" icone={<CircleX aria-hidden />} mais={mais} dica={dica ?? "A empresa vinculada não existe mais no cadastro. Escolha outra."}>
        Empresa removida
      </SeloDaSituacao>
    );
  if (v?.empresa) {
    const inativa = v.empresa.inativo;
    const dicaV = [v.tipo === "auto" ? "Vínculo automático: confirme se está certo" : "Vínculo confirmado", inativa && "• Empresa inativa", p.erro && `• Erro ao ler a pasta: ${p.erro}`]
      .filter(Boolean)
      .join("\n");
    return v.tipo === "auto" ? (
      <SeloDaSituacao tom="marca" icone={<Zap aria-hidden />} mais={mais + (inativa ? 1 : 0)} dica={dicaV}>
        Automático
      </SeloDaSituacao>
    ) : (
      <SeloDaSituacao tom="sucesso" icone={<BadgeCheck aria-hidden />} mais={mais + (inativa ? 1 : 0)} dica={dicaV}>
        Confirmado
      </SeloDaSituacao>
    );
  }
  return (
    <SeloDaSituacao tom="atencao" icone={<CircleSlash aria-hidden />} mais={mais} dica={dica ?? (p.sugestoes.length ? "Sem vínculo: há sugestões no painel" : "Sem vínculo e nenhuma empresa parecida")}>
      Sem vínculo
    </SeloDaSituacao>
  );
}

export function TabelaDePastas({ pastas, empresas, podeAgir }: { pastas: PastaAuditada[]; empresas: Opcao[]; podeAgir: boolean }) {
  const { rodando, rodar } = useAcao();
  const [painel, setPainel] = useState<string | null>(null);
  const [escolhida, setEscolhida] = useState("");

  if (!pastas.length) {
    return (
      <div className="c41-sem-linhas">
        <EmptyState title="Nenhuma pasta neste filtro" description="Troque o filtro ou a busca acima para ver as outras." icon={<FolderTree />} />
      </div>
    );
  }

  const abrir = (nome: string) => {
    setEscolhida("");
    setPainel(nome);
  };
  const vincular = (nomePasta: string, companyId: string) => rodar(() => mudarVinculoDaPasta({ acao: "vincular", nomePasta, companyId }), () => setEscolhida(""));

  /** A ação principal e as outras, com a mesma regra de antes para cada botão. */
  function acoes(p: PastaAuditada): { principal: AcaoPrincipal | null; menu: (ItemDasAcoes | false | null)[] } {
    const v = p.vinculo;
    const nome = p.nomePasta;
    const detalhes: ItemDasAcoes = { rotulo: "Ver detalhes", icone: <Eye />, onClick: () => abrir(nome) };
    const abrirEmpresa: ItemDasAcoes | false = !!v?.empresa && { rotulo: "Abrir empresa", icone: <Building2 />, href: `/empresas/${v.empresa.id}` };
    if (!podeAgir) return { principal: { rotulo: "Detalhes", onClick: () => abrir(nome) }, menu: [abrirEmpresa] };

    const confirmar: AcaoPrincipal | null =
      v?.tipo === "auto" && v.empresa ? { rotulo: "Confirmar", icone: <BadgeCheck aria-hidden />, disabled: rodando, onClick: () => vincular(nome, v.empresa!.id) } : null;
    const sugestao = !v ? p.sugestoes[0] : undefined;
    const vincularSugestao: AcaoPrincipal | null = sugestao
      ? { rotulo: "Vincular", icone: <Link2 aria-hidden />, disabled: rodando, titulo: `Vincular a ${sugestao.razaoSocial}`, onClick: () => vincular(nome, sugestao.id) }
      : null;
    const escolher: AcaoPrincipal | null = v?.tipo !== "ignorado" ? { rotulo: v ? "Trocar empresa" : "Escolher empresa", disabled: rodando, onClick: () => abrir(nome) } : null;
    const ignorar: ItemDasAcoes | false = (!v || v.tipo === "auto") && {
      rotulo: "Ignorar a pasta",
      icone: <Ban />,
      disabled: rodando,
      descricao: "Para pastas que não são de cliente (SCANNER, CERTIFICADOS…)",
      onClick: () => rodar(() => mudarVinculoDaPasta({ acao: "ignorar", nomePasta: nome })),
    };
    const desfazer: ItemDasAcoes | false = (v?.tipo === "confirmado" || v?.tipo === "ignorado") && {
      rotulo: "Desfazer",
      icone: <Undo2 />,
      danger: true,
      disabled: rodando,
      onClick: () => rodar(() => mudarVinculoDaPasta({ acao: "desfazer", nomePasta: nome })),
    };
    const principal = confirmar ?? vincularSugestao ?? escolher ?? { rotulo: "Detalhes", onClick: () => abrir(nome) };
    return {
      principal,
      menu: [
        escolher && escolher !== principal && { rotulo: escolher.rotulo, icone: <Building2 />, onClick: escolher.onClick, disabled: rodando },
        ignorar,
        desfazer,
        principal.rotulo !== "Detalhes" && detalhes,
        abrirEmpresa,
      ],
    };
  }

  const aberta = pastas.find((p) => p.nomePasta === painel) ?? null;

  return (
    <>
      <div className={CLASSE_DA_TABELA}>
        <table className="w-full min-w-[860px]">
          <thead>
            <tr>
              <th>Pasta na rede</th>
              <th>Arquivos</th>
              <th>Vínculo</th>
              <th>Empresa</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {pastas.map((p) => {
              const v = p.vinculo;
              const { principal, menu } = acoes(p);
              const sugestao = !v ? p.sugestoes[0] : undefined;
              return (
                <tr key={p.nomePasta}>
                  <td>
                    <NomeQueAbre
                      nome={p.nomePasta}
                      aberto={painel === p.nomePasta}
                      aoAbrir={() => abrir(p.nomePasta)}
                      sub={
                        p.subpastasContrato.length > 0 ? (
                          <span className="inline-flex items-center gap-1" title={p.subpastasContrato.join("\n")}>
                            <Folder size={12} aria-hidden /> {p.subpastasContrato[0]}
                            {p.subpastasContrato.length > 1 && ` +${p.subpastasContrato.length - 1}`}
                          </span>
                        ) : (
                          <span className="text-warning-fg">Sem subpasta de contrato</span>
                        )
                      }
                    />
                  </td>
                  <td>{p.arquivos}</td>
                  <td>
                    <SeloDoVinculo p={p} />
                  </td>
                  <td>
                    {v?.empresa ? (
                      <>
                        <span className="inline-block max-w-[16rem] truncate align-bottom text-fg" title={v.empresa.razaoSocial}>
                          {v.empresa.razaoSocial}
                        </span>
                        <span className="block text-micro text-fg-muted tabular-nums">{v.empresa.cnpj}</span>
                      </>
                    ) : sugestao ? (
                      <>
                        <span className="inline-block max-w-[16rem] truncate align-bottom text-fg-secondary" title={sugestao.razaoSocial}>
                          {sugestao.razaoSocial}
                        </span>
                        <span className="block text-micro text-fg-muted tabular-nums">
                          sugestão · {pct(sugestao.similaridade)}
                          {sugestao.filialConfere && <span className="text-success-fg"> · filial confere</span>}
                          {p.sugestoes.length > 1 && ` · +${p.sugestoes.length - 1}`}
                        </span>
                      </>
                    ) : (
                      <span className="text-fg-muted">{v ? "—" : "Nenhuma parecida"}</span>
                    )}
                  </td>
                  <td>
                    <AcoesDaLinha nome={p.nomePasta} principal={principal} menu={menu} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SlideOver open={!!aberta} onClose={() => setPainel(null)} title={aberta?.nomePasta} width="max-w-lg">
        {aberta && (
          <PainelDaPasta
            p={aberta}
            empresas={empresas}
            podeAgir={podeAgir}
            rodando={rodando}
            escolhida={escolhida}
            aoEscolher={setEscolhida}
            vincular={vincular}
            acoes={acoes(aberta)}
          />
        )}
      </SlideOver>
    </>
  );
}

function PainelDaPasta({
  p,
  empresas,
  podeAgir,
  rodando,
  escolhida,
  aoEscolher,
  vincular,
  acoes,
}: {
  p: PastaAuditada;
  empresas: Opcao[];
  podeAgir: boolean;
  rodando: boolean;
  escolhida: string;
  aoEscolher: (id: string) => void;
  vincular: (nomePasta: string, companyId: string) => void;
  acoes: { principal: AcaoPrincipal | null; menu: (ItemDasAcoes | false | null)[] };
}) {
  const v = p.vinculo;
  // No pé fica o que decide o vínculo; a escolha da empresa já está no corpo.
  const principal = acoes.principal?.rotulo === "Confirmar" ? acoes.principal : null;
  const menu = acoes.menu.filter((i) => i && (i.rotulo === "Ignorar a pasta" || i.rotulo === "Desfazer" || i.rotulo === "Abrir empresa"));
  return (
    <>
      <p className="-mt-1 mb-4 text-label text-fg-muted tabular-nums">{p.arquivos === 1 ? "1 arquivo" : `${p.arquivos} arquivos`}</p>

      <SecaoDoPainel rotulo="Subpastas de contrato">
        {p.subpastasContrato.length > 0 ? (
          <ul className="space-y-0.5">
            {p.subpastasContrato.map((s) => (
              <li key={s} className="flex items-center gap-1.5 text-fg">
                <Folder size={13} className="text-fg-muted" aria-hidden /> {s}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-warning-fg">Sem subpasta de contrato.</p>
        )}
        {p.erro && <p className="mt-1.5 text-danger">Erro ao ler: {p.erro}</p>}
      </SecaoDoPainel>

      <SecaoDoPainel rotulo="Vínculo">
        {v?.tipo === "ignorado" ? (
          <Selo tom="neutro">Ignorada (não é cliente)</Selo>
        ) : v && !v.empresa ? (
          <p className="text-warning-fg">A empresa vinculada não existe mais no cadastro. Escolha outra.</p>
        ) : v?.empresa ? (
          <div>
            <span className="block font-medium text-fg">{v.empresa.razaoSocial}</span>
            <span className="block text-micro text-fg-muted tabular-nums">{v.empresa.cnpj}</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {v.tipo === "auto" ? (
                <Selo tom="marca" className="gap-1">
                  <Zap size={12} aria-hidden /> Automático
                </Selo>
              ) : (
                <Selo tom="sucesso" className="gap-1">
                  <BadgeCheck size={12} aria-hidden /> Confirmado
                </Selo>
              )}
              {v.empresa.inativo && <Selo tom="atencao">Empresa inativa</Selo>}
            </div>
          </div>
        ) : (
          <p className="text-fg-muted">Sem vínculo.</p>
        )}
      </SecaoDoPainel>

      {!v && (
        <SecaoDoPainel rotulo={`Sugestões (${p.sugestoes.length})`}>
          {p.sugestoes.length === 0 ? (
            <p className="text-fg-muted">Nenhuma empresa parecida.</p>
          ) : (
            <ul className="space-y-2">
              {p.sugestoes.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-fg">{s.razaoSocial}</span>
                    <span className="block text-micro text-fg-muted tabular-nums">
                      {s.cnpj} · {pct(s.similaridade)}
                      {s.filialConfere && <span className="text-success-fg"> · filial confere</span>}
                    </span>
                  </span>
                  {podeAgir && (
                    <Button variant="secondary" size="xs" disabled={rodando} onClick={() => vincular(p.nomePasta, s.id)} aria-label={`Vincular a ${s.razaoSocial}`}>
                      Vincular
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SecaoDoPainel>
      )}

      {podeAgir && v?.tipo !== "ignorado" && (
        <SecaoDoPainel rotulo={v ? "Trocar empresa" : "Escolher empresa"}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[240px] flex-1">
              <SearchableSelect
                key={p.nomePasta}
                name="empresa"
                options={empresas}
                placeholder="Razão social ou CNPJ"
                aria-label={`Empresa da pasta ${p.nomePasta}`}
                onChange={aoEscolher}
              />
            </div>
            <Button size="sm" disabled={!escolhida || rodando} onClick={() => escolhida && vincular(p.nomePasta, escolhida)}>
              {rodando ? "Vinculando…" : "Vincular"}
            </Button>
          </div>
        </SecaoDoPainel>
      )}

      <PeDoPainel nome={p.nomePasta} menu={menu} principal={principal} />
    </>
  );
}
