"use client";

import { useState } from "react";
import { Check, LayoutGrid } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { TODOS_OS_SETORES, trocarSetor, trocarTenant } from "@/components/shell/contexto";
import { SECTOR_ICONS } from "@/components/shell/iconesDosSetores";

type Tenant = { id: string; name: string; logoUrl: string | null };
type Sector = { code: string; label: string; color: string };

/**
 * Trocar de setor ou de escritório numa janela no centro, com o fundo
 * desfocado (pedido de 02/10/2026): no menu do perfil, as duas listas — a de
 * setores com rolagem — deixavam o menu poluído. Abre pelo menu do perfil e
 * pelo "escritório · setor" do cabeçalho.
 *
 * A troca é a mesma de antes (`contexto.ts`): grava o cookie e recarrega no
 * destino. Trocar de escritório zera o setor.
 *
 * De 29/10 a 05/11/2026 também escolhia a empresa do foco. Saiu: a empresa se
 * escolhe só na faixa "Trabalhando em", acima das telas (pedido do Victor).
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
  const [trocando, setTrocando] = useState<string | null>(null);
  // Sem busca de setor (lote A de 03/11/2026): são poucos setores, todos à
  // vista em cartões.
  const setores = sectors;

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
      onClose={onClose}
      title="Trocar de setor ou escritório"
      maxWidth="max-w-2xl"
      desfocar
    >
      <div className="flex flex-col gap-6">
        {sectors.length > 1 && (
          <section aria-labelledby="troca-setor" className="flex flex-col gap-3">
            <h3 id="troca-setor" className="c41-rotulo">
              Setor
            </h3>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
              {setores.map((s) => (
                <li key={s.code}>
                  <Opcao
                    ativo={s.code === activeSector}
                    ocupado={trocando === s.code}
                    onClick={() => irParaSetor(s.code)}
                    // O ícone do setor, o mesmo do menu e do cabeçalho
                    // (30/10/2026), no lugar da bolinha de cor. Setor sem
                    // ícone próprio fica com a bolinha.
                    marca={
                      <span className="inline-flex size-8 items-center justify-center rounded-md bg-surface-hover text-fg-secondary">
                        {SECTOR_ICONS[s.code] ?? <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />}
                      </span>
                    }
                    titulo={s.label}
                  />
                </li>
              ))}
            </ul>
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
