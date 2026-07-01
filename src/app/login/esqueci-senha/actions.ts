"use server";

import { createHubAccessRequest } from "@/lib/hub";

export type EsqueciSenhaState = { error: string } | { success: true } | null;

export async function solicitarRedefinicaoSenha(
  _prev: EsqueciSenhaState,
  form: FormData
): Promise<EsqueciSenhaState> {
  const nome = (form.get("nome") as string)?.trim();
  const email = (form.get("email") as string)?.trim().toLowerCase();
  const mensagem = (form.get("mensagem") as string)?.trim();

  if (!nome) return { error: "Informe seu nome." };
  if (!email) return { error: "Informe seu e-mail." };

  const result = await createHubAccessRequest({
    tipo: "SENHA",
    nome,
    email,
    mensagem,
  });

  if (!result.ok) return { error: result.error };
  return { success: true };
}
