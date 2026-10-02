"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/Dropdown";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { TODOS_OS_SETORES, trocarSetor, trocarTenant } from "@/components/shell/contexto";

type Tenant = { id: string; name: string; logoUrl: string | null };
type Sector = { code: string; label: string; color: string };

type Props = {
  name: string;
  roleLabel: string;
  photoUrl: string | null;
  tenants: Tenant[];
  currentTenantId: string;
  /** Setores que a pessoa pode escolher. */
  sectors: Sector[];
  /** `null` = "Todos os setores". */
  activeSector: string | null;
  /** Domínio-base e sufixo do host de setor, do layout — ver `contexto.ts`. */
  appDomain: string | null;
  sectorHostSuffix: string;
};

// O menu do usuário (redesenho de 02/10/2026, pedido de 01/10):
// • botão e menu da mesma largura (220px); no celular o botão é só a foto;
// • a troca de setor e de escritório veio para cá — era o cartão embaixo da
//   logo, cujo lugar ficou com a busca;
// • saiu "Alterar foto", que já está em Configurações › Perfil;
// • cada seção só aparece para quem tem mais de uma opção.
export function ProfileMenu({
  name,
  roleLabel,
  photoUrl,
  tenants,
  currentTenantId,
  sectors,
  activeSector,
  appDomain,
  sectorHostSuffix,
}: Props) {
  const router = useRouter();
  const podeTrocarSetor = sectors.length > 1;
  const podeTrocarTenant = tenants.length > 1;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <Dropdown
      align="right"
      width={220}
      // O menu inteiro na tela, com o Sair à vista; quem rola é a lista de
      // setores, quando passa de seis.
      alturaMaxima="max-h-[calc(100vh-80px)]"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label="Menu do usuário"
          className={`flex items-center gap-2.5 h-[38px] pl-1 pr-1 sm:pr-2.5 sm:w-[220px] rounded-md bg-surface-hover border transition-colors ${
            open ? "border-border-strong" : "border-border hover:border-border-strong"
          }`}
        >
          <AvatarImage src={photoUrl} name={name} size={28} bordered={false} />
          <span className="hidden sm:block min-w-0 flex-1 text-left text-[14px] font-semibold text-fg truncate">{name}</span>
          <ChevronDown size={14} className="hidden sm:block flex-shrink-0 text-fg-muted" />
        </button>
      )}
    >
      <div className="flex items-center gap-3 p-1.5 pb-3 mb-1 border-b border-border">
        <AvatarImage src={photoUrl} name={name} size={38} bordered={false} />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-fg truncate">{name}</p>
          <p className="text-[12px] text-fg-muted truncate">{roleLabel}</p>
        </div>
      </div>

      {podeTrocarSetor && (
        <Secao rotulo="Setor">
          <ItemComMarca ativo={!activeSector} onClick={() => trocarSetor(TODOS_OS_SETORES, appDomain, sectorHostSuffix)}>
            Todos os setores
          </ItemComMarca>
          {sectors.map((s) => (
            <ItemComMarca
              key={s.code}
              ativo={s.code === activeSector}
              onClick={() => trocarSetor(s.code, appDomain, sectorHostSuffix)}
            >
              <span aria-hidden className="inline-block size-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="truncate">{s.label}</span>
            </ItemComMarca>
          ))}
        </Secao>
      )}

      {podeTrocarTenant && (
        <Secao rotulo="Escritório">
          {tenants.map((t) => (
            <ItemComMarca
              key={t.id}
              ativo={t.id === currentTenantId}
              onClick={() => t.id !== currentTenantId && trocarTenant(t.id, appDomain, sectorHostSuffix)}
            >
              <AvatarImage src={t.logoUrl} name={t.name} size={20} shape="lg" fontSize={10} />
              <span className="truncate">{t.name}</span>
            </ItemComMarca>
          ))}
        </Secao>
      )}

      {(podeTrocarSetor || podeTrocarTenant) && <DropdownSeparator />}
      <DropdownItem onClick={() => router.push("/configuracoes")}>Configurações do Perfil</DropdownItem>
      <DropdownSeparator />
      <DropdownItem danger onClick={handleLogout}>
        Sair
      </DropdownItem>
    </Dropdown>
  );
}

/** Rótulo em caixa alta e a lista embaixo — o desenho do painel do `FilterButton`. */
function Secao({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-2 pt-1 pb-1 text-[11px] font-semibold text-fg-muted uppercase tracking-[0.04em]">{rotulo}</p>
      {/* Com muitos setores, a lista rola em vez de esticar o menu. */}
      <div className="scroll-y max-h-[224px] overflow-y-auto">{children}</div>
    </div>
  );
}

function ItemComMarca({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={ativo ? "true" : undefined}
      className={`w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg text-[length:var(--fs-dropdown)] font-medium transition-colors ${
        ativo ? "text-fg" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
      }`}
    >
      <span className="min-w-0 flex-1 flex items-center gap-2">{children}</span>
      {ativo && <Check size={14} className="flex-shrink-0 text-brand" />}
    </button>
  );
}
