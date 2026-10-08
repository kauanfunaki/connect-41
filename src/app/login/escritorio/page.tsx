import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { verifyEquipeEscolha } from "@/lib/auth/jwt";
import { CAMINHO_DA_ESCOLHA_DA_EQUIPE, COOKIE_DA_ESCOLHA_DA_EQUIPE } from "@/lib/auth/entradaDaEquipe";
import { MolduraDaEquipe } from "@/components/login/MolduraDaEquipe";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { RadioGroup } from "@/components/ui/RadioGroup";

const ERROS: Record<string, string> = {
  "fora-da-lista": "Escolha um dos escritórios da lista.",
};

/**
 * As opções da escolha, relidas do banco a partir do token do cookie — só as
 * contas que continuam ativas. `null` quando o cookie não existe, venceu ou
 * foi adulterado.
 */
async function opcoesDaEscolha(): Promise<{ id: string; escritorio: string; logoUrl: string | null }[] | null> {
  const token = (await cookies()).get(COOKIE_DA_ESCOLHA_DA_EQUIPE)?.value;
  const escolha = token ? verifyEquipeEscolha(token) : null;
  if (!escolha || escolha.contas.length === 0) return null;
  const contas = await getPrisma().user.findMany({
    where: { id: { in: escolha.contas }, active: true },
    orderBy: { tenant: { name: "asc" } },
    select: { id: true, tenant: { select: { name: true, logoUrl: true } } },
  });
  if (contas.length === 0) return null;
  return contas.map((c) => ({ id: c.id, escritorio: c.tenant.name, logoUrl: c.tenant.logoUrl }));
}

/**
 * A escolha do escritório na entrada da equipe (06/10/2026).
 *
 * Chega aqui quem acertou a senha de mais de uma conta com o mesmo e-mail —
 * uma por escritório. No visual da entrada (`MolduraDaEquipe`), com o nome e a
 * logo de cada escritório, como na troca de escritório do menu. O envio vai
 * para `/login/escritorio/entrar`, que só aceita uma das contas do token.
 */
export default async function EscolherEscritorioPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const [{ erro }, opcoes] = await Promise.all([searchParams, opcoesDaEscolha()]);

  if (!opcoes) {
    return (
      <MolduraDaEquipe titulo="A escolha expirou" subtitulo="Entre de novo para escolher o escritório.">
        <Card className="p-6">
          <p className="text-ui text-fg-muted text-center leading-relaxed">
            Por segurança, a escolha do escritório vale por poucos minutos depois da senha.
          </p>
          <div className="mt-3 text-center">
            <Button href="/login" variant="secondary" size="sm">
              Entrar de novo
            </Button>
          </div>
        </Card>
      </MolduraDaEquipe>
    );
  }

  const mensagem = erro ? (ERROS[erro] ?? null) : null;

  return (
    <MolduraDaEquipe titulo="Escolha o escritório" subtitulo="Este e-mail tem acesso a mais de um escritório no Connect.">
      <Card className="p-6">
        <form method="POST" action={`${CAMINHO_DA_ESCOLHA_DA_EQUIPE}/entrar`} className="space-y-4">
          {/* O mesmo desenho da escolha de cliente do portal: cada opção é um
              alvo de ao menos 44px, com a bolinha e a logo centradas e a
              escolhida marcada na borda. */}
          <RadioGroup
            name="conta"
            legenda="Em qual escritório você quer entrar?"
            valorInicial={opcoes[0].id}
            opcoes={opcoes.map((o) => ({
              valor: o.id,
              rotulo: o.escritorio,
              icone: <AvatarImage src={o.logoUrl} name={o.escritorio} size={32} shape="lg" fontSize={12} />,
            }))}
          />

          {mensagem && (
            <Aviso>{mensagem}</Aviso>
          )}

          <Button type="submit" size="md" className="w-full mt-1">
            Entrar
          </Button>

          <div className="text-center">
            <Button href="/login" variant="ghost" size="sm">
              <ArrowLeft size={14} />
              Usar outro e-mail
            </Button>
          </div>
        </form>
      </Card>
    </MolduraDaEquipe>
  );
}
