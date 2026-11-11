import { vi } from "vitest";
import { ErroApi } from "@/lib/api-v1/erros";
import type { Escopo } from "@/lib/tokens-pessoais/regras";

// O que as rotas e o MCP precisam nos testes: um autenticador que entende dois
// tokens de mentira e um item completo, como o detalheItem devolve.

export const ID_ITEM = "11111111-2222-4333-8444-555555555555";
/** O id curto do mesmo item (10/11/2026): o bug número 7 do escritório. */
export const ID_CURTO = "bug-7";
export const LEITOR = `c41_${"0a".repeat(32)}`;
export const ESCRITOR = `c41_${"0b".repeat(32)}`;

export function atorDe(escopos: Escopo[]) {
  return {
    userId: "pessoa-1", tenantId: "esc-a", homeTenantId: "esc-a", role: "SECTOR_USER" as const, sectors: ["tech"],
    subscriptionReadOnly: false, canSelfRegularizeSubscription: false, activeSector: null,
    via: { tokenId: "tok-1", tokenName: "Claude Code" }, escopos,
  };
}

/** Imita `autenticarTokenPessoal`: sem cabeçalho → 401; sem o escopo → 403. */
export const autenticarFalso = vi.fn(async (request: Request, escopo?: Escopo) => {
  const h = request.headers.get("authorization");
  const escopos: Escopo[] | null = h === `Bearer ${ESCRITOR}` ? ["controle-interno:ler", "controle-interno:escrever"] : h === `Bearer ${LEITOR}` ? ["controle-interno:ler"] : null;
  if (!h) throw new ErroApi("unauthenticated", "Envie o token.");
  if (!escopos) throw new ErroApi("invalid_token", "Token inválido.");
  if (escopo && !escopos.includes(escopo)) throw new ErroApi("insufficient_scope", "Sem escopo.");
  return atorDe(escopos);
});

export const CRITERIO_FALSO = "CRITÉRIO DE ACEITE (10/11/2026)\nMudança: PR fictício.\nAprovado quando:\n- A busca acha pelo CNPJ com e sem máscara.\n- A lista mostra o CNPJ.";

export function itemFalso(sobre: Record<string, unknown> = {}) {
  const quando = new Date("2026-11-05T15:00:00Z");
  return {
    id: ID_ITEM, number: 7, tenantId: "esc-a", title: "Busca de empresas não acha pelo CNPJ", description: "Passos fictícios.",
    acceptanceCriteria: CRITERIO_FALSO,
    type: "BUG", priority: 2, status: "PENDING", systemMode: "EXISTING",
    toolId: null, opsWatcherSlug: null, opsSiteId: "site-1", opsAppId: null,
    assigneeId: "pessoa-1", dueDate: new Date("2026-11-20T00:00:00Z"), size: null, originItemId: null, version: 3,
    createdAt: quando, updatedAt: quando,
    tool: null, opsWatcher: null, opsSite: { name: "Site fictício", isActive: true }, opsApp: null,
    assignee: { name: "Pessoa fictícia", active: true }, originItem: null,
    comments: [{ id: "c-1", authorName: "Pessoa fictícia", body: "Comentário fictício.", createdAt: quando }],
    changes: [{ version: 3, authorName: "Pessoa fictícia", createdAt: quando, changes: [{ field: "Título", before: null, after: "x" }] }],
    attachments: [],
    // A marca do ponto 2 é de um texto que já foi reescrito: não vale mais.
    acceptanceChecks: [
      { section: "aprovado", position: 1, text: "A busca acha pelo CNPJ com e sem máscara.", checkedByName: "Pessoa fictícia", createdAt: quando },
      { section: "aprovado", position: 2, text: "Texto antigo do ponto.", checkedByName: "Pessoa fictícia", createdAt: quando },
      // O "Conferir" do PR (11/11/2026) conferiu o merge.
      { section: "auto", position: 1, text: "pr", checkedByName: "Pessoa fictícia", createdAt: quando },
    ],
    ...sobre,
  };
}
