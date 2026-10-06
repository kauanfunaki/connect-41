import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyEquipeEscolha } from "@/lib/auth/jwt";
import {
  CAMINHO_DA_ESCOLHA_DA_EQUIPE,
  COOKIE_DA_ESCOLHA_DA_EQUIPE,
  conferirEscolha,
  opcoesDoCookieDaEscolha,
} from "@/lib/auth/entradaDaEquipe";
import { abrirSessaoDaEquipe, htmlRedirect, loginErrorRedirect } from "@/lib/auth/sessaoDaEquipe";

export const dynamic = "force-dynamic";

// A escolha já foi usada (ou não vale mais): o cookie sai na mesma resposta.
function semEscolha(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE_DA_ESCOLHA_DA_EQUIPE, "", opcoesDoCookieDaEscolha(0));
  return res;
}

/**
 * O segundo passo da entrada quando o e-mail tem conta em mais de um
 * escritório (06/10/2026): a pessoa escolheu um na tela `/login/escritorio`.
 *
 * Mora sob o caminho da escolha de propósito — é o único jeito de o cookie de
 * caminho restrito chegar aqui. A senha não volta: o token do cookie carrega as
 * contas que ela já liberou, e só uma delas é aceita.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const token = req.cookies.get(COOKIE_DA_ESCOLHA_DA_EQUIPE)?.value;
    const escolha = conferirEscolha(token ? verifyEquipeEscolha(token) : null, String(form.get("conta") ?? ""));

    if (!escolha.ok) {
      if (escolha.motivo === "expirou") return semEscolha(loginErrorRedirect("escolha-expirou", null));
      // Id fora do token: a lista continua valendo, volta para ela.
      return htmlRedirect(`${CAMINHO_DA_ESCOLHA_DA_EQUIPE}?erro=fora-da-lista`);
    }

    const conta = await getPrisma().user.findFirst({
      where: { id: escolha.contaId, active: true },
      include: { sectors: true },
    });
    // Desativada entre os dois passos: não entra, com a mensagem de sempre.
    if (!conta) return semEscolha(loginErrorRedirect("credenciais-invalidas", escolha.next));

    const theme = req.cookies.get("theme")?.value === "dark" ? "dark" : "light";
    return semEscolha(await abrirSessaoDaEquipe(conta, { remember: escolha.lembrar, next: escolha.next, theme }));
  } catch (err) {
    console.error("[POST /login/escritorio/entrar]", err);
    return htmlRedirect("/login?error=erro-interno");
  }
}
