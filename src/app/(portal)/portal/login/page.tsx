import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { verifyPortalEscolha } from "@/lib/auth/jwt";
import { COOKIE_DA_ESCOLHA, configuracaoDoGoogleNoPortal, lerCookieDaEscolha, mensagemDoGoogle } from "@/lib/auth/googleDoPortal";
import { sessaoAtivaDoPortal } from "@/app/(portal)/usuario";
import { entrarNoPortal, type EstadoDoLogin } from "./actions";
import { PortalLoginForm } from "@/components/portal/PortalLoginForm";
import { MolduraDoPortal } from "@/components/portal/MolduraDoPortal";
import { escritorioDaFicha } from "@/lib/leads/servidor";

type EscolhaDoGoogle = Extract<NonNullable<EstadoDoLogin>, { escolher: unknown }>["escolher"];

/**
 * O Google achou o e-mail em mais de um cliente: a escolha chega num cookie
 * curto (o token não vai na URL). As opções são relidas aqui, só com os
 * acessos que continuam ativos.
 */
async function escolhaPendenteDoGoogle(): Promise<EscolhaDoGoogle | null> {
  const escolha = lerCookieDaEscolha((await cookies()).get(COOKIE_DA_ESCOLHA)?.value);
  if (!escolha) return null;
  const ids = verifyPortalEscolha(escolha.token);
  if (!ids || ids.length === 0) return null;
  const contas = await getPrisma().portalUser.findMany({
    where: { id: { in: ids }, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, tenant: { select: { name: true } }, clientGroup: { select: { name: true } } },
  });
  if (contas.length === 0) return null;
  return {
    token: escolha.token,
    lembrar: escolha.lembrar,
    opcoes: contas.map((c) => ({ id: c.id, escritorio: c.tenant.name, cliente: c.clientGroup.name })),
  };
}

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  // Já logado não vê a tela de login de novo. "Logado" é token válido de conta
  // ATIVA: com a área do cliente conferindo o mesmo, conta desativada cai aqui
  // e vê o login, em vez de ir e voltar entre as duas telas.
  if (await sessaoAtivaDoPortal()) redirect("/portal");

  const { google } = await searchParams;
  // O "Não possui conta?" só aparece com a ficha recebendo — botão para uma
  // ficha fora do ar é pior que botão nenhum.
  const [ficha, escolha] = await Promise.all([escritorioDaFicha(), google === "escolher" ? escolhaPendenteDoGoogle() : null]);
  const fichaDisponivel = ficha !== null;
  const aviso =
    google === "escolher"
      ? escolha
        ? null
        : mensagemDoGoogle("escolha-expirou", { fichaDisponivel })
      : mensagemDoGoogle(google, { fichaDisponivel });

  return (
    <MolduraDoPortal
      titulo="Bem-vindo de volta"
      subtitulo="Acompanhe a sua empresa com o escritório: documentos, pendências, aprovações e processos."
    >
      <PortalLoginForm
        action={entrarNoPortal}
        fichaDisponivel={fichaDisponivel}
        googleDisponivel={configuracaoDoGoogleNoPortal() !== null}
        avisoDoGoogle={aviso}
        escolhaDoGoogle={escolha}
      />
    </MolduraDoPortal>
  );
}
