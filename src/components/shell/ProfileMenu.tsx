"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftRight, ChevronDown, LogOut, UserRound } from "lucide-react";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/Dropdown";
import { AvatarImage } from "@/components/shared/AvatarImage";

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
  /** Abre a janela de troca de setor e escritório (`TrocaDeContexto`). */
  onTrocar: () => void;
};

// O menu do usuário (redesenho de 02/10/2026, pedido de 01/10):
// • menu de 220px; no celular o botão é só a foto (desde 20/10 o botão tem o
//   tamanho do nome — ver abaixo);
// • a troca de setor e de escritório veio para cá — era o cartão embaixo da
//   logo, cujo lugar ficou com a busca (e na tarde de 02/10 virou janela
//   própria — ver abaixo);
// • saiu "Alterar foto", que já está em Configurações › Perfil;
// • cada seção só aparece para quem tem mais de uma opção.
// Desde 02/10/2026 (pedido do Kauan: o menu ficava poluído com as duas listas),
// setor e escritório saem do menu: um item só, com o lugar atual embaixo, abre
// a janela de troca no centro da tela.
//
// Ajustes de 15/10 (escolha 10D, "a menor mudança", 20/10/2026):
// • o botão fica do tamanho do nome — com 220px fixos sobrava um vão à direita
//   em nome curto;
// • a troca de setor sai do menu no computador, onde ela já tem o botão no
//   cabeçalho, ao lado do recolher; no celular o cabeçalho não tem esse botão,
//   e ela continua aqui;
// • "Configurações do perfil" vira "Sua conta" (o nome da tela que abre), com
//   ícone, como o Sair — a engrenagem do topo é que leva às do escritório.
export function ProfileMenu({ name, roleLabel, photoUrl, tenants, currentTenantId, sectors, activeSector, onTrocar }: Props) {
  const router = useRouter();
  const podeTrocarSetor = sectors.length > 1;
  const podeTrocarTenant = tenants.length > 1;
  const setorAtual = sectors.find((s) => s.code === activeSector) ?? null;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <Dropdown
      align="right"
      width={220}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label="Menu do usuário"
          className={`flex items-center gap-2.5 h-[38px] pl-1 pr-1 sm:pr-2.5 sm:max-w-[260px] rounded-md bg-surface-hover border transition-colors ${
            open ? "border-border-strong" : "border-border hover:border-border-strong"
          }`}
        >
          <AvatarImage src={photoUrl} name={name} size={28} bordered={false} />
          <span className="hidden sm:block min-w-0 flex-1 text-left text-label font-semibold text-fg truncate">{name}</span>
          <ChevronDown size={14} className="hidden sm:block flex-shrink-0 text-fg-muted" />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="flex items-center gap-3 p-1.5 pb-3 mb-1 border-b border-border">
            <AvatarImage src={photoUrl} name={name} size={38} bordered={false} />
            <div className="min-w-0">
              <p className="text-label font-semibold text-fg truncate">{name}</p>
              <p className="text-fs-2 text-fg-muted truncate">{roleLabel}</p>
            </div>
          </div>

          {(podeTrocarSetor || podeTrocarTenant) && (
            <div className="lg:hidden">
              <DropdownItem
                onClick={() => {
                  // Fecha o menu antes: a janela abre por cima, sem o menu atrás.
                  close();
                  onTrocar();
                }}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <ArrowLeftRight size={15} className="flex-shrink-0 text-fg-muted" />
                  <span className="min-w-0">
                    <span className="block">{podeTrocarTenant ? "Trocar setor ou escritório" : "Trocar de setor"}</span>
                    <span className="flex items-center gap-1.5 text-micro font-normal text-fg-muted truncate">
                      {podeTrocarTenant && <span className="truncate">{tenants.find((t) => t.id === currentTenantId)?.name}</span>}
                      {podeTrocarTenant && <span aria-hidden>·</span>}
                      {setorAtual && (
                        <span aria-hidden className="inline-block size-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: setorAtual.color }} />
                      )}
                      <span className="truncate">{setorAtual?.label ?? "Todos os setores"}</span>
                    </span>
                  </span>
                </span>
              </DropdownItem>
              <DropdownSeparator />
            </div>
          )}

          <DropdownItem onClick={() => router.push("/configuracoes")}>
            <span className="flex items-center gap-2.5">
              <UserRound size={15} className="flex-shrink-0 text-fg-muted" />
              Sua conta
            </span>
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem danger onClick={handleLogout}>
            <span className="flex items-center gap-2.5">
              <LogOut size={15} className="flex-shrink-0" />
              Sair
            </span>
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}
