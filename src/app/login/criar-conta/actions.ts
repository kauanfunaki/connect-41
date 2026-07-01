"use server";

import { createHubAccessRequest } from "@/lib/hub";

export type CriarContaState = { error: string } | { success: true } | null;

export async function solicitarAcesso(
  _prev: CriarContaState,
  form: FormData
): Promise<CriarContaState> {
  const nome = (form.get("nome") as string)?.trim();
  const email = (form.get("email") as string)?.trim().toLowerCase();
  const telefone = (form.get("telefone") as string)?.trim();
  const mensagem = (form.get("mensagem") as string)?.trim();

  if (!nome) return { error: "Informe seu nome." };
  if (!email) return { error: "Informe seu e-mail." };

  const result = await createHubAccessRequest({
    tipo: "ACESSO",
    nome,
    email,
    telefone,
    mensagem,
  });

  if (!result.ok) return { error: result.error };
  return { success: true };
}
