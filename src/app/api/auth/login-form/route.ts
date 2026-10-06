import { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { signEquipeEscolha } from "@/lib/auth/jwt";
import { hit, reset, clientIp } from "@/lib/rateLimit";
import {
  CAMINHO_DA_ESCOLHA_DA_EQUIPE,
  COOKIE_DA_ESCOLHA_DA_EQUIPE,
  MAX_CONTAS_POR_EMAIL,
  MINUTOS_DA_ESCOLHA_DA_EQUIPE,
  contasQueConferem,
  decidirEntrada,
  opcoesDoCookieDaEscolha,
  safeNext,
} from "@/lib/auth/entradaDaEquipe";
import { abrirSessaoDaEquipe, htmlRedirect, loginErrorRedirect } from "@/lib/auth/sessaoDaEquipe";

export const dynamic = "force-dynamic";

/**
 * Entrada da equipe (o formulário de `/login`).
 *
 * Desde 06/10/2026 a senha é conferida em TODAS as contas ativas com o e-mail,
 * e não só na primeira que o banco devolvia — o mesmo e-mail pode ter conta em
 * mais de um escritório (ver `entradaDaEquipe.ts`):
 *
 * - nenhuma confere → "E-mail ou senha incorretos.", como sempre;
 * - uma confere → entra direto, com a mesma sessão de antes;
 * - mais de uma → vai para a escolha do escritório (`/login/escritorio`), com
 *   as contas liberadas num token curto, em cookie httpOnly.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const email = (form.get("email") as string | null)?.toLowerCase().trim();
    const password = form.get("password") as string | null;
    const remember = form.get("remember") === "on";
    const next = safeNext(form.get("next") as string | null);

    if (!email || !password) {
      return loginErrorRedirect("preencha-os-campos", next);
    }

    // Rate limit por IP e por e-mail (o que estourar primeiro bloqueia). Evita
    // brute force / credential stuffing contra e-mails corporativos conhecidos.
    const ip = clientIp(req);
    if (!hit(`login-ip:${ip}`, 20).allowed || !hit(`login-email:${email}`, 5).allowed) {
      return loginErrorRedirect("muitas-tentativas", next);
    }

    const prisma = getPrisma();
    const contas = await prisma.user.findMany({
      where: { email, active: true },
      include: { sectors: true },
      orderBy: { createdAt: "asc" },
      take: MAX_CONTAS_POR_EMAIL,
    });

    const decisao = decidirEntrada(await contasQueConferem(password, contas));
    if (decisao.tipo === "recusar") {
      return loginErrorRedirect("credenciais-invalidas", next);
    }

    // Login OK — zera o contador do e-mail para não punir quem errou antes de acertar.
    reset(`login-email:${email}`);

    const theme = req.cookies.get("theme")?.value === "dark" ? "dark" : "light";

    if (decisao.tipo === "entrar") {
      return abrirSessaoDaEquipe(decisao.conta, { remember, next, theme });
    }

    // Mais de um escritório: a escolha leva só as contas cuja senha conferiu,
    // num cookie que o navegador manda apenas para a tela da escolha.
    const token = signEquipeEscolha({ contas: decisao.contas.map((c) => c.id), lembrar: remember, next });
    const res = htmlRedirect(CAMINHO_DA_ESCOLHA_DA_EQUIPE);
    res.cookies.set(COOKIE_DA_ESCOLHA_DA_EQUIPE, token, opcoesDoCookieDaEscolha(MINUTOS_DA_ESCOLHA_DA_EQUIPE * 60));
    return res;
  } catch (err) {
    console.error("[POST /api/auth/login-form]", err);
    return htmlRedirect("/login?error=erro-interno");
  }
}
