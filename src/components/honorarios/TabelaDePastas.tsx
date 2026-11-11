"use client";

import { Fragment, useState } from "react";
import { BadgeCheck, Folder, FolderTree, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import type { PastaAuditada } from "@/lib/honorarios/servidor/auditSyncService";
import { mudarVinculoDaPasta } from "@/app/(app)/honorarios/actions";
import { useAcao } from "./useAcao";

const pct = (s: number) => `${Math.round(s * 100)}% parecido`;

export function TabelaDePastas({ pastas, empresas, podeAgir }: { pastas: PastaAuditada[]; empresas: Opcao[]; podeAgir: boolean }) {
  const { rodando, rodar } = useAcao();
  const [escolhendo, setEscolhendoPasta] = useState<string | null>(null);
  const [escolhida, setEscolhida] = useState("");
  const setEscolhendo = (nome: string | null) => {
    setEscolhida("");
    setEscolhendoPasta(nome);
  };

  if (!pastas.length) {
    return <EmptyState title="Nenhuma pasta neste filtro" description="Troque o filtro ou a busca acima para ver as outras." icon={<FolderTree />} />;
  }

  const vincular = (nomePasta: string, companyId: string) =>
    rodar(() => mudarVinculoDaPasta({ acao: "vincular", nomePasta, companyId }), () => setEscolhendo(null));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px]">
        <thead>
          <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left">
            <th className="py-2 pr-3 font-medium">Pasta na rede</th>
            <th className="py-2 pr-3 font-medium text-right">Arquivos</th>
            <th className="py-2 pr-3 font-medium">Empresa</th>
            <th className="py-2 font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pastas.map((p) => {
            const v = p.vinculo;
            return (
              <Fragment key={p.nomePasta}>
                <tr className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
                  <td className="py-2.5 pr-3 max-w-[320px]">
                    <span className="font-semibold text-fg break-words">{p.nomePasta}</span>
                    {p.subpastasContrato.length > 0 ? (
                      <ul className="mt-0.5 space-y-0.5">
                        {p.subpastasContrato.map((s) => (
                          <li key={s} className="flex items-center gap-1 text-micro text-fg-muted">
                            <Folder size={12} aria-hidden /> {s}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="block text-micro text-warning-fg">Sem subpasta de contrato</span>
                    )}
                    {p.erro && <span className="block text-micro text-danger">Erro ao ler: {p.erro}</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{p.arquivos}</td>
                  <td className="py-2.5 pr-3 max-w-[360px]">
                    {v?.tipo === "ignorado" ? (
                      <Selo tom="neutro">Ignorada (não é cliente)</Selo>
                    ) : v && !v.empresa ? (
                      <span className="text-label text-warning-fg">A empresa vinculada não existe mais no cadastro. Escolha outra.</span>
                    ) : v?.empresa ? (
                      <div>
                        <span className="font-semibold text-fg">{v.empresa.razaoSocial}</span>
                        <span className="block text-micro text-fg-muted tabular-nums">{v.empresa.cnpj}</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {v.tipo === "auto" ? (
                            <Selo tom="marca">
                              <Zap size={12} aria-hidden /> Automático
                            </Selo>
                          ) : (
                            <Selo tom="sucesso">
                              <BadgeCheck size={12} aria-hidden /> Confirmado
                            </Selo>
                          )}
                          {v.empresa.inativo && <Selo tom="atencao">Empresa inativa</Selo>}
                        </div>
                      </div>
                    ) : p.sugestoes.length === 0 ? (
                      <span className="text-label text-fg-muted">Nenhuma empresa parecida.</span>
                    ) : (
                      <div>
                        <p className="text-micro uppercase tracking-wide text-fg-muted">Sugestões</p>
                        <ul className="mt-1 space-y-1.5">
                          {p.sugestoes.map((s) => (
                            <li key={s.id} className="flex items-start justify-between gap-2">
                              <span className="min-w-0">
                                <span className="block text-label text-fg">{s.razaoSocial}</span>
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
                      </div>
                    )}
                  </td>
                  <td className="py-2.5">
                    {podeAgir && (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {v?.tipo === "auto" && v.empresa && (
                          <Button variant="secondary" size="xs" disabled={rodando} onClick={() => vincular(p.nomePasta, v.empresa!.id)}>
                            Confirmar
                          </Button>
                        )}
                        {v?.tipo !== "ignorado" && (
                          <Button variant="ghost" size="xs" disabled={rodando} onClick={() => setEscolhendo(escolhendo === p.nomePasta ? null : p.nomePasta)} aria-expanded={escolhendo === p.nomePasta}>
                            {v ? "Trocar" : "Escolher empresa"}
                          </Button>
                        )}
                        {(!v || v.tipo === "auto") && (
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={rodando}
                            title="Para pastas que não são de cliente (SCANNER, CERTIFICADOS…)"
                            onClick={() => rodar(() => mudarVinculoDaPasta({ acao: "ignorar", nomePasta: p.nomePasta }))}
                          >
                            Ignorar
                          </Button>
                        )}
                        {(v?.tipo === "confirmado" || v?.tipo === "ignorado") && (
                          <Button variant="ghost" size="xs" disabled={rodando} onClick={() => rodar(() => mudarVinculoDaPasta({ acao: "desfazer", nomePasta: p.nomePasta }))}>
                            Desfazer
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                {escolhendo === p.nomePasta && (
                  <tr className="border-b border-border-soft bg-surface-2/50">
                    <td colSpan={4} className="py-3 pr-3">
                      <p className="mb-1 text-label font-medium text-fg">Empresa da pasta “{p.nomePasta}”</p>
                      <div className="flex max-w-xl flex-wrap items-center gap-2">
                        <div className="min-w-[280px] flex-1">
                          <SearchableSelect
                            name="empresa"
                            options={empresas}
                            placeholder="Razão social ou CNPJ"
                            aria-label={`Empresa da pasta ${p.nomePasta}`}
                            onChange={setEscolhida}
                          />
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setEscolhendo(null)}>
                          Cancelar
                        </Button>
                        <Button size="sm" disabled={!escolhida || rodando} onClick={() => escolhida && vincular(p.nomePasta, escolhida)}>
                          Vincular
                        </Button>
                      </div>
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
