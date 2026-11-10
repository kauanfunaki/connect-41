// Quem vê, revela, edita, exclui e restringe uma senha do Repositório
// (10/11/2026, pedido do Kauan): a credencial pessoal ("só eu") e a do setor
// com exceções ("todos do setor, menos…").
//
// Puro, sem banco e sem next/headers: a tela (componente de cliente) importa
// os tipos e as opções daqui, e o Turbopack quebraria o `next build` se este
// arquivo puxasse o Prisma. A leitura do banco fica em `senhasServidor.ts` e
// nas actions de /senhas — que conferem TUDO de novo por estas regras, nunca
// pelo que a tela mandou.
//
// As regras, como o Kauan decidiu:
// - PESSOAL: só quem cadastrou vê a linha, revela, copia e edita. O
//   Administrador e o Super Admin veem que ela existe (título, dono e data,
//   nada de usuário, URL, notas ou senha), nunca revelam, e podem excluí-la —
//   a limpeza de quando alguém sai. O resto do setor nem sabe que ela existe.
// - SETOR: a regra de sempre (cofre por setor, 05/11/2026) — quem age no setor
//   vê e revela; quem coordena cadastra e edita; excluir é do administrador.
//   A coordenação pode marcar pessoas do setor que NÃO veem: elas não veem a
//   linha e revelar recusa. Administrador e Super Admin não podem ser
//   marcados (gerenciam tudo), nem quem cadastrou, nem quem está marcando.
// - Qualquer pessoa que usa o Repositório do setor cadastra uma pessoal; a do
//   setor continua com a coordenação.

import type { Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/context";
import { canActOnSector, canManageSector, isFullWrite, podeExcluir } from "@/lib/auth/papeis";

export type VisibilidadeDaSenha = "SETOR" | "PESSOAL";

/**
 * A escolha "Quem pode ver a senha" do formulário. RESTRITA é uma credencial
 * SETOR com pessoas marcadas — no banco são a mesma visibilidade.
 */
export type QuemVe = "SETOR" | "RESTRITA" | "PESSOAL";

const QUEM_VE: readonly QuemVe[] = ["SETOR", "RESTRITA", "PESSOAL"];

type Quem = Pick<AuthContext, "userId" | "role" | "sectors" | "subscriptionReadOnly">;

/** O que as regras leem de uma credencial. */
export type CredencialDaRegra = {
  sectorCode: string;
  visibility: VisibilidadeDaSenha;
  createdById: string;
  /** Os ids das pessoas marcadas em "todos do setor, menos…". */
  restritos: readonly string[];
};

/** Como a linha aparece na lista: inteira, ou só "existe" (admin × pessoal dos outros). */
export type VisaoDaLinha = "completa" | "existencia";

/**
 * A linha do banco no formato das regras. Sem a visibilidade (consulta que
 * não a escolheu), vale SETOR — o padrão da coluna e o de antes de 10/11.
 */
export function daLinhaDoBanco(c: {
  sectorCode: string;
  visibility?: VisibilidadeDaSenha | null;
  createdById: string;
  restrictions?: readonly { userId: string }[] | null;
}): CredencialDaRegra {
  return {
    sectorCode: c.sectorCode,
    visibility: c.visibility ?? "SETOR",
    createdById: c.createdById,
    restritos: (c.restrictions ?? []).map((r) => r.userId),
  };
}

export function eDono(ctx: Quem, c: Pick<CredencialDaRegra, "createdById">): boolean {
  return !!ctx.userId && c.createdById === ctx.userId;
}

/**
 * A pessoa está marcada em "menos…"? A marca só vale em credencial do setor e
 * nunca para o administrador: se alguém marcado virar administrador depois, a
 * linha antiga não o tranca para fora.
 */
export function estaRestrito(ctx: Quem, c: CredencialDaRegra): boolean {
  return c.visibility === "SETOR" && !isFullWrite(ctx.role) && !!ctx.userId && c.restritos.includes(ctx.userId);
}

/** Como a credencial aparece na lista para esta pessoa — `null`: não aparece. */
export function visaoNaLista(ctx: Quem, c: CredencialDaRegra): VisaoDaLinha | null {
  // Fora do setor da credencial, nada (cofre por setor, 05/11/2026). Também
  // barra o somente leitura e a assinatura vencida, como antes.
  if (!canActOnSector(ctx, c.sectorCode)) return null;
  if (c.visibility === "PESSOAL") {
    if (eDono(ctx, c)) return "completa";
    return isFullWrite(ctx.role) ? "existencia" : null;
  }
  return estaRestrito(ctx, c) ? null : "completa";
}

/** Revelar e copiar: só quem vê a linha inteira. */
export function podeRevelarCredencial(ctx: Quem, c: CredencialDaRegra): boolean {
  return visaoNaLista(ctx, c) === "completa";
}

export function podeEditarCredencial(ctx: Quem, c: CredencialDaRegra): boolean {
  if (visaoNaLista(ctx, c) !== "completa") return false;
  return c.visibility === "PESSOAL" ? eDono(ctx, c) : canManageSector(ctx, c.sectorCode);
}

/**
 * Excluir: do administrador (13/10/2026), inclusive a pessoal dos outros, sem
 * ver a senha. A pessoal também sai pelas mãos do próprio dono — é coisa da
 * pessoa, como as que o `podeExcluir` deixa de fora (notificação, conversa com
 * a IA). Quem está marcado em "menos…" não exclui o que não vê.
 */
export function podeExcluirCredencial(ctx: Quem, c: CredencialDaRegra): boolean {
  const visao = visaoNaLista(ctx, c);
  if (!visao) return false;
  if (c.visibility === "PESSOAL" && eDono(ctx, c)) return true;
  return podeExcluir(ctx) && canManageSector(ctx, c.sectorCode);
}

/** Marcar quem não vê: quem coordena o setor, numa credencial do setor que ele vê. */
export function podeRestringirCredencial(ctx: Quem, c: CredencialDaRegra): boolean {
  return c.visibility === "SETOR" && visaoNaLista(ctx, c) === "completa" && canManageSector(ctx, c.sectorCode);
}

export function visibilidadeDe(quemVe: QuemVe): VisibilidadeDaSenha {
  return quemVe === "PESSOAL" ? "PESSOAL" : "SETOR";
}

/** A escolha de agora de uma credencial. */
export function quemVeDe(c: CredencialDaRegra): QuemVe {
  if (c.visibility === "PESSOAL") return "PESSOAL";
  return c.restritos.length > 0 ? "RESTRITA" : "SETOR";
}

/** O valor do formulário, se for uma escolha conhecida. */
export function lerQuemVe(valor: unknown): QuemVe | null {
  return typeof valor === "string" && (QUEM_VE as readonly string[]).includes(valor) ? (valor as QuemVe) : null;
}

/**
 * As escolhas de "Quem pode ver a senha" ao cadastrar neste setor. A
 * coordenação tem as três; quem só usa o Repositório, a pessoal; fora do
 * setor, nenhuma (e "Nova credencial" nem aparece).
 */
export function opcoesAoCriar(ctx: Quem, setor: string): QuemVe[] {
  if (canManageSector(ctx, setor)) return ["SETOR", "RESTRITA", "PESSOAL"];
  if (canActOnSector(ctx, setor)) return ["PESSOAL"];
  return [];
}

/**
 * As escolhas ao editar. Mudar de visibilidade pede as duas pontas: levar
 * para "só eu" só quem cadastrou (senão a coordenação tiraria a senha do
 * setor para si); trazer a pessoal para o setor só o dono que coordena (senão
 * a pessoal viraria atalho para cadastrar senha do setor sem coordenar).
 */
export function opcoesAoEditar(ctx: Quem, c: CredencialDaRegra): QuemVe[] {
  if (!podeEditarCredencial(ctx, c)) return [];
  const coordena = canManageSector(ctx, c.sectorCode);
  const dono = eDono(ctx, c);
  if (c.visibility === "SETOR") return dono ? ["SETOR", "RESTRITA", "PESSOAL"] : ["SETOR", "RESTRITA"];
  return coordena ? ["SETOR", "RESTRITA", "PESSOAL"] : ["PESSOAL"];
}

/**
 * A frase de quando a edição é recusada, ou `null`. Para quem não vê a
 * credencial (a pessoal dos outros, a do setor em que está marcado), ela "não
 * existe": a recusa não pode contar que há uma senha ali.
 */
export function recusaDaEdicao(ctx: Quem, c: CredencialDaRegra): string | null {
  if (podeEditarCredencial(ctx, c)) return null;
  if (c.visibility === "PESSOAL") return visaoNaLista(ctx, c) ? "Só quem cadastrou edita uma credencial pessoal." : "Credencial não encontrada.";
  if (estaRestrito(ctx, c)) return "Credencial não encontrada.";
  return "Só a coordenação do setor pode editar credenciais.";
}

/** A frase de quando a troca de "Quem pode ver a senha" é recusada, ou `null`. */
export function recusaDeQuemVe(ctx: Quem, c: CredencialDaRegra, pedido: QuemVe): string | null {
  if (opcoesAoEditar(ctx, c).includes(pedido)) return null;
  if (pedido === "PESSOAL") return "Só quem cadastrou a credencial pode torná-la pessoal.";
  return "Só a coordenação do setor cadastra credenciais do setor: esta continua pessoal.";
}

/**
 * As pessoas que ficam de fora de verdade, a partir do que o formulário
 * mandou: só quem é elegível (ativo, do setor, usuário ou coordenador — a
 * consulta em `senhasServidor.ts`), sem quem cadastrou e sem quem está
 * marcando, sem repetição. O que sobra de fora (alguém que saiu do setor com
 * o formulário aberto) cai calado — a regra é a mesma do seletor da tela.
 */
export function restricoesValidas(
  pedidos: readonly string[],
  elegiveis: readonly string[],
  quem: { criadorId: string; quemMarcaId: string }
): string[] {
  const pode = new Set(elegiveis);
  const saida: string[] = [];
  for (const id of pedidos) {
    if (!id || !pode.has(id) || id === quem.criadorId || id === quem.quemMarcaId || saida.includes(id)) continue;
    saida.push(id);
  }
  return saida;
}

/**
 * O filtro das credenciais que a pessoa vê INTEIRAS no setor: as do setor em
 * que ela não está marcada, mais as pessoais dela. O administrador vê todas
 * as do setor (marca não vale para ele) e as pessoais dele.
 */
export function ondeDasCompletas(ctx: Quem & { tenantId: string }, setor: string): Prisma.BpoCredentialWhereInput {
  if (!canActOnSector(ctx, setor)) return { tenantId: ctx.tenantId, id: { in: [] } };
  const doSetor: Prisma.BpoCredentialWhereInput = isFullWrite(ctx.role)
    ? { visibility: "SETOR" }
    : { visibility: "SETOR", restrictions: { none: { userId: ctx.userId } } };
  return {
    tenantId: ctx.tenantId,
    sectorCode: setor,
    OR: [doSetor, { visibility: "PESSOAL", createdById: ctx.userId }],
  };
}

/**
 * O filtro das pessoais dos OUTROS que o administrador vê só como "existe".
 * `null` para quem não é administrador: a consulta nem roda. Quem consulta
 * por aqui escolhe só id, título, dono e data — nunca a senha cifrada,
 * usuário, URL ou notas.
 */
export function ondeDasSoExistencia(ctx: Quem & { tenantId: string }, setor: string): Prisma.BpoCredentialWhereInput | null {
  if (!isFullWrite(ctx.role) || !canActOnSector(ctx, setor)) return null;
  return { tenantId: ctx.tenantId, sectorCode: setor, visibility: "PESSOAL", createdById: { not: ctx.userId } };
}
