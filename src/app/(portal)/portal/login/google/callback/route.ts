import { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { signPortalEscolha } from "@/lib/auth/jwt";
import { cookieDaSessaoDoPortal } from "@/lib/auth/sessaoDoPortal";
import {
  CAMINHO_DO_COOKIE_DA_ESCOLHA,
  COOKIE_DA_ESCOLHA,
  COOKIE_DO_ESTADO,
  MINUTOS_DA_ESCOLHA,
  configuracaoDoGoogleNoPortal,
  conferirRetornoDoGoogle,
  trocarCodigoDoGoogle,
  validarIdTokenDoGoogle,
  valorDoCookieDaEscolha,
} from "@/lib/auth/googleDoPortal";
import { contasAtivasDoPortal } from "@/app/(portal)/usuario";
import { OPCOES_DO_COOKIE, irPara, semEstado, voltarAoLogin } from "../respostas";

export const dynamic = "force-dynamic";

/**
 * A volta do Google — o redirect URI do login do portal (05/10/2026).
 *
 * Confere o `state`, troca o `code`, valida o `id_token` e procura o acesso de
 * portal ATIVO com o e-mail confirmado, pela regra do login por senha: um
 * acesso entra direto, com a MESMA sessão do login por senha; mais de um vai
 * para a escolha de cliente no login. Sem acesso, volta ao login com a
 * mensagem e o botão da ficha — não há cadastro automático.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const retorno = conferirRetornoDoGoogle({
    cookie: req.cookies.get(COOKIE_DO_ESTADO)?.value,
    state: p.get("state"),
    code: p.get("code"),
    erro: p.get("error"),
  });
  if (!retorno.ok) return semEstado(voltarAoLogin(retorno.motivo));

  const cfg = configuracaoDoGoogleNoPortal();
  if (!cfg) return semEstado(voltarAoLogin("indisponivel"));

  let email: string;
  try {
    const idToken = await trocarCodigoDoGoogle(retorno.code, cfg);
    ({ email } = await validarIdTokenDoGoogle(idToken, { clientId: cfg.clientId, nonce: retorno.nonce }));
  } catch (err) {
    // O detalhe fica no log; a pessoa vê só "não foi possível confirmar".
    console.error("[portal/login/google]", err instanceof Error ? err.message : err);
    return semEstado(voltarAoLogin("falhou"));
  }

  let contas: Awaited<ReturnType<typeof contasAtivasDoPortal>>;
  try {
    contas = await contasAtivasDoPortal(email);
  } catch (err) {
    console.error("[portal/login/google] contas", err);
    return semEstado(voltarAoLogin("falhou"));
  }
  if (contas.length === 0) return semEstado(voltarAoLogin("sem-acesso"));

  if (contas.length === 1) {
    const conta = contas[0]!;
    const sessao = cookieDaSessaoDoPortal(conta, retorno.lembrar);
    // Só registro: não poder gravar a hora do acesso não impede de entrar.
    await getPrisma()
      .portalUser.update({ where: { id: conta.id }, data: { lastLoginAt: new Date() } })
      .catch((err: unknown) => console.error("[portal/login/google] lastLoginAt", err));
    const res = semEstado(irPara("/portal"));
    res.cookies.set(sessao.name, sessao.value, sessao.options);
    return res;
  }

  // Mais de um cliente: o token de escolha (as contas liberadas pelo Google)
  // vai num cookie curto, e o login abre direto na escolha.
  const res = semEstado(irPara("/portal/login?google=escolher"));
  res.cookies.set(COOKIE_DA_ESCOLHA, valorDoCookieDaEscolha(signPortalEscolha(contas.map((c) => c.id)), retorno.lembrar), {
    ...OPCOES_DO_COOKIE,
    path: CAMINHO_DO_COOKIE_DA_ESCOLHA,
    maxAge: MINUTOS_DA_ESCOLHA * 60,
  });
  return res;
}
