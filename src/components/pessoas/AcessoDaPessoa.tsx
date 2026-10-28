import { KeyRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { UsuarioForm } from "@/components/admin/UsuarioForm";
import { LigarContaExistente, DesligarConta } from "@/components/pessoas/LigarContaDaPessoa";
import { criarUsuario, atualizarUsuario } from "@/app/(app)/admin/usuarios/actions";
import { ligarContaDaPessoa } from "@/app/(app)/pessoas/[id]/acesso-actions";
import { getPrisma } from "@/lib/prisma";
import { isFullWrite, type AuthContext } from "@/lib/auth/context";
import { assignableRoles, ROLE_LABELS, ROLE_OPTIONS } from "@/lib/roles";
import { getSectorMaps } from "@/lib/sectors";
import { canAddUser } from "@/lib/subscriptions";
import { abaDeAcesso, contasLivres } from "@/lib/pessoas/acessoDaPessoa";

const TITULO = "text-section font-semibold text-fg mb-1";

/**
 * A aba Acesso da ficha do colaborador interno (lote 8, 28/10/2026 — Pessoa e
 * Usuário juntos, decisão do Kauan nas perguntas do lote 7). Quem administra os
 * usuários cria a conta aqui, já ligada à pessoa, ou liga uma que já existe, e
 * troca papel, setores e senha no mesmo formulário de Configurações › Usuários.
 * Quem não administra vê só qual é a conta. Usuários continua sendo a lista
 * de papéis, assentos e Chatwoot.
 */
export async function AcessoDaPessoa({
  ctx,
  pessoa,
}: {
  ctx: AuthContext;
  pessoa: { id: string; name: string; email: string | null; linkedUserId: string | null };
}) {
  const prisma = getPrisma();
  const administra = isFullWrite(ctx.role);
  const conta = pessoa.linkedUserId
    ? await prisma.user.findFirst({ where: { id: pessoa.linkedUserId, tenantId: ctx.tenantId }, include: { sectors: true } })
    : null;

  if (!administra) {
    return (
      <Card className="p-5">
        <h2 className={TITULO}>Conta de acesso</h2>
        <p className="text-body text-fg break-words mt-3">{conta ? `${conta.name} (${conta.email})` : "Sem conta de acesso ao Connect."}</p>
        <p className="text-helper text-fg-muted mt-2">Quem cria e muda o acesso é a administração do escritório.</p>
      </Card>
    );
  }

  const { options: sectorOptions, labels } = await getSectorMaps(ctx.tenantId);
  const voltar = abaDeAcesso(pessoa.id);
  const permitidos = assignableRoles(ctx.role);

  if (conta) {
    // Super Admin só se edita por outro Super Admin (a mesma regra de Usuários).
    const podeEditar = !(conta.role === "SUPER_ADMIN" && ctx.role !== "SUPER_ADMIN");
    return (
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className={TITULO}>Conta de acesso</h2>
              <p className="text-body text-fg break-words">
                {conta.email} · {ROLE_LABELS[conta.role]}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant={conta.active ? "success" : "neutral"}>{conta.active ? "Ativa" : "Desativada"}</Badge>
                {conta.sectors.map((s) => (
                  <Badge key={s.sectorCode} variant="neutral">
                    {labels[s.sectorCode] ?? s.sectorCode}
                  </Badge>
                ))}
              </div>
            </div>
            <DesligarConta personId={pessoa.id} ligar={ligarContaDaPessoa} />
          </div>
        </Card>
        <Card className="p-5">
          {podeEditar ? (
            <UsuarioForm
              key={conta.id}
              action={atualizarUsuario}
              cancelHref={voltar}
              roleOptions={ROLE_OPTIONS.filter((r) => permitidos.includes(r.value) || r.value === conta.role)}
              sectorOptions={sectorOptions}
              isSelf={conta.id === ctx.userId}
              defaultValues={{
                id: conta.id,
                name: conta.name,
                email: conta.email,
                role: conta.role,
                active: conta.active,
                sectors: conta.sectors.map((s) => s.sectorCode),
              }}
              extras={{ voltarPara: voltar }}
            />
          ) : (
            <Aviso tom="info">Esta conta é de Super Admin: só outro Super Admin muda o acesso dela.</Aviso>
          )}
        </Card>
      </div>
    );
  }

  const [vagas, contas, ligadas] = await Promise.all([
    canAddUser(ctx.tenantId),
    prisma.user.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.person.findMany({ where: { tenantId: ctx.tenantId, linkedUserId: { not: null } }, select: { linkedUserId: true } }),
  ]);
  const livres = contasLivres(contas, new Set(ligadas.map((p) => p.linkedUserId!)));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className={TITULO}>Criar o acesso</h2>
        <p className="text-helper text-fg-muted mb-5">
          {pessoa.name} ainda não entra no Connect. A conta nasce ligada a esta ficha e aparece também em Configurações › Usuários.
        </p>
        {vagas.allowed ? (
          <UsuarioForm
            action={criarUsuario}
            cancelHref={voltar}
            roleOptions={ROLE_OPTIONS.filter((r) => permitidos.includes(r.value))}
            sectorOptions={sectorOptions}
            defaultValues={{ name: pessoa.name, email: pessoa.email ?? "" }}
            extras={{ personId: pessoa.id, voltarPara: voltar }}
          />
        ) : (
          <Aviso tom="atencao">
            <p className="text-fg">{vagas.reason}</p>
          </Aviso>
        )}
      </Card>
      {livres.length > 0 && (
        <Card className="p-5">
          <h2 className={TITULO}>Ou ligar a uma conta que já existe</h2>
          <p className="text-helper text-fg-muted mb-4">Para quem já entrava no Connect antes de ganhar a ficha. A lista traz só as contas sem pessoa.</p>
          <LigarContaExistente personId={pessoa.id} contas={livres.map((c) => ({ id: c.id, nome: c.name, email: c.email }))} ligar={ligarContaDaPessoa} />
        </Card>
      )}
      <Button href="/admin/usuarios" variant="ghost" size="sm">
        <KeyRound size={14} />
        Ver todos em Configurações › Usuários
      </Button>
    </div>
  );
}
