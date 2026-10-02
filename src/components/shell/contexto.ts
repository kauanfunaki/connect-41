import { COOKIE_SETOR_ATIVO, sectorHost } from "@/lib/auth/activeSector";

// Troca de setor e de escritório (tenant). Moravam no ContextSwitcher, o cartão
// embaixo da logo; desde 02/10/2026 a troca fica no menu do usuário, e o item
// do setor na lateral usa o mesmo caminho.
//
// Ficam FORA de componente de propósito: escrevem em `document.cookie` e
// `window.location`, e a regra de imutabilidade do compilador do React proíbe
// isso dentro do corpo do componente.

export const TODOS_OS_SETORES = "__todos__";
const UM_MES = 60 * 60 * 24 * 30;

// Quando há domínio-base configurado, cada setor tem endereço próprio
// (bpo.useconnect.com.br) e o HOST vence o cookie na resolução — então trocar
// de setor precisa TROCAR DE HOST, senão o clique não faz nada.
//
// O cookie continua sendo gravado mesmo assim: ele é a memória do último setor
// usado, para quem chega pelo endereço neutro. Por isso vai com `domain`, para
// atravessar os subdomínios.
function gravarSetor(code: string | null, dominio: string | null): void {
  const escopo = dominio ? `; domain=.${dominio}` : "";
  const valor = code ?? "";
  const idade = code ? UM_MES : 0;
  document.cookie = `${COOKIE_SETOR_ATIVO}=${valor}; path=/${escopo}; max-age=${idade}; samesite=lax`;
}

function destino(code: string | null, dominio: string | null, sufixo: string): string {
  if (!dominio) return "/home";
  return `${window.location.protocol}//${sectorHost(code, dominio, sufixo)}/home`;
}

/**
 * Domínio-base e sufixo vêm do layout (Server Component) por prop — NÃO de
 * `process.env` no cliente: `NEXT_PUBLIC_` é gravado no build, e o Dockerfile
 * builda sem essas variáveis.
 */
export function trocarTenant(tenantId: string, dominio: string | null, sufixo: string): void {
  document.cookie = `active_tenant_id=${tenantId}; path=/; max-age=${UM_MES}; samesite=lax`;
  // Trocar de escritório zera o setor: os códigos de setor são por tenant, e
  // manter o anterior levaria a um setor que pode não existir no destino.
  gravarSetor(null, dominio);
  window.location.href = destino(null, dominio, sufixo);
}

/** `TODOS_OS_SETORES` volta para "Todos os setores". */
export function trocarSetor(code: string, dominio: string | null, sufixo: string): void {
  const alvo = code === TODOS_OS_SETORES ? null : code;
  gravarSetor(alvo, dominio);
  window.location.href = destino(alvo, dominio, sufixo);
}
