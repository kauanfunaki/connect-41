"use client";

import { useState } from "react";
import { Check, LayoutGrid, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { normalizar } from "@/lib/buscaDeTelas";
import { TODOS_OS_SETORES, trocarSetor, trocarTenant } from "@/components/shell/contexto";

type Tenant = { id: string; name: string; logoUrl: string | null };
type Sector = { code: string; label: string; color: string };

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
      title="Trocar de setor ou escritório"
      maxWidth="max-w-2xl"
      desfocar
    >
      <div className="flex flex-col gap-6">
        {sectors.length > 1 && (
          <section aria-labelledby="troca-setor" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="troca-setor" className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
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
                      <span className="inline-flex size-8 items-center justify-center rounded-md" style={{ backgroundColor: `${s.color}22` }}>
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      </span>
                    }
                    titulo={s.label}
                  />
                </li>
              ))}
            </ul>
            {termo && setores.length === 0 && <p className="text-[13px] text-fg-muted">Nenhum setor com esse nome.</p>}
          </section>
        )}

        {tenants.length > 1 && (
          <section aria-labelledby="troca-escritorio" className="flex flex-col gap-3">
            <h3 id="troca-escritorio" className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
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
            <p className="text-[12px] text-fg-muted">Trocar de escritório volta para todos os setores.</p>
          </section>
        )}
      </div>
    </Modal>
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
      className={`w-full h-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
        ativo ? "border-brand bg-brand/5" : "border-border bg-surface hover:border-border-strong hover:bg-surface-hover"
      }`}
    >
      {marca}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-fg">{titulo}</span>
        {(detalhe || ocupado) && <span className="block truncate text-[11.5px] text-fg-muted">{ocupado ? "Trocando…" : detalhe}</span>}
      </span>
      {ativo && <Check size={15} className="flex-shrink-0 text-brand" />}
    </button>
  );
}
