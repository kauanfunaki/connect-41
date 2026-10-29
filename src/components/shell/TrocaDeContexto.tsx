"use client";

import { useState, useTransition } from "react";
import { Check, Crosshair, LayoutGrid, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { EscolherEmpresaDoFoco } from "@/components/empresas/FaixaDoFoco";
import { pararDeTrabalharNaEmpresa } from "@/app/(app)/foco-actions";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { normalizar } from "@/lib/buscaDeTelas";
import { TODOS_OS_SETORES, trocarSetor, trocarTenant } from "@/components/shell/contexto";

type Tenant = { id: string; name: string; logoUrl: string | null };
type Sector = { code: string; label: string; color: string };

/** A empresa em foco, para a janela: `null` quando a pessoa não usa o foco. */
export type FocoDaTroca = { atual: { companyId: string; nome: string } | null } | null;

/** A partir de quantos setores aparece a busca. */
const SETORES_PARA_BUSCAR = 8;

/**
 * Trocar de setor ou de escritório numa janela no centro, com o fundo
 * desfocado (pedido de 02/10/2026): no menu do perfil, as duas listas — a de
 * setores com rolagem — deixavam o menu poluído. Abre pelo menu do perfil e
 * pelo "escritório · setor" do cabeçalho.
 *
 * A troca é a mesma de antes (`contexto.ts`): grava o cookie e recarrega no
 * destino. Trocar de escritório zera o setor.
 *
 * Desde 29/10/2026 também escolhe a empresa do foco ("Trabalhar numa
 * empresa"), que antes só começava na ficha da empresa. Com isso a janela abre
 * também para quem tem um setor e um escritório só — o caso de quase todo
 * mundo do BPO.
 */
export function TrocaDeContexto({
  open,
  onClose,
  tenants,
  currentTenantId,
  sectors,
  activeSector,
  appDomain,
  sectorHostSuffix,
  foco = null,
}: {
  open: boolean;
  onClose: () => void;
  tenants: Tenant[];
  currentTenantId: string;
  sectors: Sector[];
  /** `null` = "Todos os setores". */
  activeSector: string | null;
  appDomain: string | null;
  sectorHostSuffix: string;
  foco?: FocoDaTroca;
}) {
  const [busca, setBusca] = useState("");
  const [trocando, setTrocando] = useState<string | null>(null);
  const termo = normalizar(busca.trim());
  const setores = termo ? sectors.filter((s) => normalizar(s.label).includes(termo)) : sectors;

  function irParaSetor(code: string) {
    setTrocando(code);
    trocarSetor(code, appDomain, sectorHostSuffix);
  }
  function irParaEscritorio(id: string) {
    if (id === currentTenantId) return;
    setTrocando(id);
    trocarTenant(id, appDomain, sectorHostSuffix);
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setBusca("");
        onClose();
      }}
      title={sectors.length > 1 || tenants.length > 1 ? (foco ? "Trocar de setor, escritório ou empresa" : "Trocar de setor ou escritório") : "Trabalhar numa empresa"}
      maxWidth="max-w-2xl"
      desfocar
    >
      <div className="flex flex-col gap-6">
        {foco && <EmpresaDoFoco foco={foco} onPronto={onClose} />}

        {sectors.length > 1 && (
          <section aria-labelledby="troca-setor" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="troca-setor" className="c41-rotulo">
                Setor
              </h3>
              {sectors.length > SETORES_PARA_BUSCAR && (
                <Input
                  compact
                  autoFocus
                  icon={<Search size={14} />}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar setor…"
                  aria-label="Buscar setor"
                  className="w-full sm:w-56"
                />
              )}
            </div>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {!termo && (
                <li>
                  <Opcao
                    ativo={activeSector === null}
                    ocupado={trocando === TODOS_OS_SETORES}
                    onClick={() => irParaSetor(TODOS_OS_SETORES)}
                    marca={
                      <span className="inline-flex size-8 items-center justify-center rounded-md bg-surface-hover text-fg-secondary">
                        <LayoutGrid size={16} />
                      </span>
                    }
                    titulo="Todos os setores"
                    detalhe="Visão geral"
                  />
                </li>
              )}
              {setores.map((s) => (
                <li key={s.code}>
                  <Opcao
                    ativo={s.code === activeSector}
                    ocupado={trocando === s.code}
                    onClick={() => irParaSetor(s.code)}
                    marca={
                      <span className="inline-flex size-8 items-center justify-center rounded-md" style={{ backgroundColor: `color-mix(in srgb, ${s.color} 13%, transparent)` }}>
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      </span>
                    }
                    titulo={s.label}
                  />
                </li>
              ))}
            </ul>
            {termo && setores.length === 0 && <p className="text-ui text-fg-muted">Nenhum setor com esse nome.</p>}
          </section>
        )}

        {tenants.length > 1 && (
          <section aria-labelledby="troca-escritorio" className="flex flex-col gap-3">
            <h3 id="troca-escritorio" className="c41-rotulo">
              Escritório
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tenants.map((t) => (
                <li key={t.id}>
                  <Opcao
                    ativo={t.id === currentTenantId}
                    ocupado={trocando === t.id}
                    onClick={() => irParaEscritorio(t.id)}
                    marca={<AvatarImage src={t.logoUrl} name={t.name} size={32} shape="lg" fontSize={12} />}
                    titulo={t.name}
                    detalhe={t.id === currentTenantId ? "Você está aqui" : undefined}
                  />
                </li>
              ))}
            </ul>
            <p className="text-fs-2 text-fg-muted">Trocar de escritório volta para todos os setores.</p>
          </section>
        )}
      </div>
    </Modal>
  );
}

/** A empresa do foco: a atual, com "Todas as empresas", e a busca para escolher outra. */
function EmpresaDoFoco({ foco, onPronto }: { foco: NonNullable<FocoDaTroca>; onPronto: () => void }) {
  const toast = useToast();
  const [saindo, sair] = useTransition();
  return (
    <section aria-labelledby="troca-empresa" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="troca-empresa" className="c41-rotulo">
          Empresa
        </h3>
        {foco.atual && (
          <Button
            variant="ghost"
            size="xs"
            loading={saindo}
            loadingLabel="Saindo…"
            onClick={() =>
              sair(async () => {
                await pararDeTrabalharNaEmpresa();
                onPronto();
                toast.success("As telas do BPO voltaram a mostrar todas as empresas.");
              })
            }
          >
            <LogOut size={13} aria-hidden />
            Todas as empresas
          </Button>
        )}
      </div>
      <p className="text-fs-2 text-fg-secondary">
        {foco.atual ? (
          <span className="inline-flex items-center gap-1.5">
            <Crosshair size={13} aria-hidden className="text-brand" />
            Trabalhando em <span className="font-semibold text-fg">{foco.atual.nome}</span>. Escolha outra abaixo.
          </span>
        ) : (
          "Escolha uma empresa e as telas do BPO passam a mostrar e gravar só ela, com a matriz e as filiais."
        )}
      </p>
      <EscolherEmpresaDoFoco atual={foco.atual?.companyId ?? null} onPronto={onPronto} />
    </section>
  );
}

function Opcao({
  ativo,
  ocupado,
  onClick,
  marca,
  titulo,
  detalhe,
}: {
  ativo: boolean;
  ocupado: boolean;
  onClick: () => void;
  marca: React.ReactNode;
  titulo: string;
  detalhe?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      aria-current={ativo ? "true" : undefined}
      className={`w-full h-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-[var(--c41-disabled-op)] ${
        ativo ? "border-brand bg-brand/5" : "border-border bg-surface hover:border-border-strong hover:bg-surface-hover"
      }`}
    >
      {marca}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui font-semibold text-fg">{titulo}</span>
        {(detalhe || ocupado) && <span className="block truncate text-micro text-fg-muted">{ocupado ? "Trocando…" : detalhe}</span>}
      </span>
      {ativo && <Check size={15} className="flex-shrink-0 text-brand" />}
    </button>
  );
}
