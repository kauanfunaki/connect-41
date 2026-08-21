"use client";

import { ChevronDown } from "lucide-react";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/Dropdown";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { COOKIE_SETOR_ATIVO, sectorHost } from "@/lib/auth/activeSector";

// Substitui o WorkspaceSwitcher. Antes o controle respondia só "em qual
// escritório estou"; agora responde "ONDE EU ESTOU", que são dois eixos:
// escritório (tenant) e setor (subworkspace).
//
// A saída errada seria dois botões lado a lado — ninguém descobriria qual
// deles resolve o problema que está tendo. Então é um controle só, hierárquico.
//
// Na prática ele renderiza PLANO para quase todo mundo: o cruzamento
// tenant × setor quase não acontece. Os casos reais são colaborador com um
// setor (vira rótulo, sem menu), colaborador com dois, e sócio/gerente com
// todos. Mais de um tenant é exceção nossa, de suporte a escritório que
// comprou o Connect — por isso o nível de tenant só aparece quando existe.

type Tenant = { id: string; name: string; logoUrl: string | null };
type Sector = { code: string; label: string; color: string };

type Props = {
  tenants: Tenant[];
  currentTenantId: string;
  /** Setores que esta pessoa pode escolher. Vazio = não há o que escolher. */
  sectors: Sector[];
  /** `null` = "Todos os setores". */
  activeSector: string | null;
  /**
   * Domínio-base e sufixo do host de setor, vindos do layout (Server
   * Component) — NÃO de `process.env` aqui.
   *
   * Ler env em componente de cliente exigiria prefixo `NEXT_PUBLIC_`, que é
   * gravado no bundle na hora do BUILD; o Dockerfile roda `npm run build` sem
   * essas variáveis, então o valor chegaria `undefined` no navegador mesmo
   * definido no ambiente. Por prop, o valor é o de runtime.
   */
  appDomain: string | null;
  sectorHostSuffix: string;
};

const TODOS = "__todos__";
const UM_MES = 60 * 60 * 24 * 30;

// Quando há domínio-base configurado, cada setor tem endereço próprio
// (bpo.useconnect.com.br) e o HOST vence o cookie na resolução — então trocar
// de setor precisa TROCAR DE HOST, senão o clique não faz nada.
//
// O cookie continua sendo gravado mesmo assim: ele é a memória do último setor
// usado, para quem chega pelo endereço neutro. Por isso vai com `domain`, para
// atravessar os subdomínios.
function gravarSetor(code: string | null, DOMINIO: string | null): void {
  const escopo = DOMINIO ? `; domain=.${DOMINIO}` : "";
  const valor = code ?? "";
  const idade = code ? UM_MES : 0;
  document.cookie = `${COOKIE_SETOR_ATIVO}=${valor}; path=/${escopo}; max-age=${idade}; samesite=lax`;
}

function destino(code: string | null, DOMINIO: string | null, SUFIXO: string): string {
  if (!DOMINIO) return "/home";
  return `${window.location.protocol}//${sectorHost(code, DOMINIO, SUFIXO)}/home`;
}

// Estas duas ficam FORA do componente de propósito: escrevem em
// `document.cookie` e `window.location`, e a regra de imutabilidade do
// compilador do React proíbe isso dentro do corpo do componente.
function trocarTenant(tenantId: string, dominio: string | null, sufixo: string): void {
  document.cookie = `active_tenant_id=${tenantId}; path=/; max-age=${UM_MES}; samesite=lax`;
  // Trocar de escritório zera o setor: os códigos de setor são por tenant, e
  // manter o anterior levaria a um setor que pode não existir no destino.
  gravarSetor(null, dominio);
  window.location.href = destino(null, dominio, sufixo);
}

function trocarSetor(code: string, dominio: string | null, sufixo: string): void {
  const alvo = code === TODOS ? null : code;
  gravarSetor(alvo, dominio);
  window.location.href = destino(alvo, dominio, sufixo);
}

export function ContextSwitcher({
  tenants,
  currentTenantId,
  sectors,
  activeSector,
  appDomain,
  sectorHostSuffix,
}: Props) {
  const tenantAtual = tenants.find((t) => t.id === currentTenantId);
  const nomeTenant = tenantAtual?.name ?? "—";
  const setorAtual = activeSector ? sectors.find((s) => s.code === activeSector) : null;

  const podeTrocarTenant = tenants.length > 1;
  // Com um setor só não há escolha — o controle é rótulo, não seletor. É o caso
  // da maioria, e é o que torna a mudança indolor para quem compra o Connect
  // com um setor só.
  const podeTrocarSetor = sectors.length > 1;
  const interativo = podeTrocarTenant || podeTrocarSetor;

  const legenda = setorAtual ? setorAtual.label : sectors.length > 0 ? "Todos os setores" : "Workspace";

  const conteudo = (
    <>
      <AvatarImage src={tenantAtual?.logoUrl ?? null} name={nomeTenant} size={32} shape="lg" fontSize={13} />
      <span className="min-w-0 flex-1 text-left leading-tight">
        <span className="flex items-center gap-1.5">
          {setorAtual && (
            <span
              aria-hidden
              className="inline-block size-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: setorAtual.color }}
            />
          )}
          <span className="block text-[length:var(--fs-micro)] font-semibold text-fg-muted uppercase tracking-wider truncate">
            {legenda}
          </span>
        </span>
        <span className="block text-[13px] font-medium text-fg truncate">{nomeTenant}</span>
      </span>
      {interativo && <ChevronDown size={14} className="text-fg-muted flex-shrink-0" />}
    </>
  );

  const classeCartao =
    "w-full flex items-center justify-center gap-2.5 px-2.5 py-2 rounded-lg bg-surface border border-border transition-colors";

  if (!interativo) {
    return (
      <div className="px-3 pt-3 pb-1">
        <div className={classeCartao}>{conteudo}</div>
      </div>
    );
  }

  return (
    <div className="px-3 pt-3 pb-1">
      <Dropdown
        width={230}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label="Trocar de contexto"
            className={`${classeCartao} hover:bg-surface-hover hover:border-border-strong ${
              open ? "border-border-strong bg-surface-hover" : ""
            }`}
          >
            {conteudo}
          </button>
        )}
      >
        {podeTrocarSetor && (
          <>
            <DropdownItem onClick={() => trocarSetor(TODOS, appDomain, sectorHostSuffix)}>
              <span className={!activeSector ? "text-brand font-semibold" : ""}>Todos os setores</span>
            </DropdownItem>
            {sectors.map((s) => (
              <DropdownItem key={s.code} onClick={() => trocarSetor(s.code, appDomain, sectorHostSuffix)}>
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden
                    className="inline-block size-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className={`truncate ${s.code === activeSector ? "text-brand font-semibold" : ""}`}>
                    {s.label}
                  </span>
                </span>
              </DropdownItem>
            ))}
          </>
        )}

        {podeTrocarSetor && podeTrocarTenant && <DropdownSeparator />}

        {podeTrocarTenant &&
          tenants.map((t) => (
            <DropdownItem key={t.id} onClick={() => t.id !== currentTenantId && trocarTenant(t.id, appDomain, sectorHostSuffix)}>
              <span className="flex items-center gap-2 min-w-0">
                <AvatarImage src={t.logoUrl} name={t.name} size={20} shape="lg" fontSize={10} />
                <span className={`truncate ${t.id === currentTenantId ? "text-brand font-semibold" : ""}`}>
                  {t.name}
                </span>
              </span>
            </DropdownItem>
          ))}
      </Dropdown>
    </div>
  );
}
