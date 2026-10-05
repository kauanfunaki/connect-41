"use server";

// A ficha "Quero ser cliente" do portal (05/10/2026): vira um lead no Comercial
// do escritório dono do portal.
//
// Formulário público, sem login e sem captcha. As defesas são as do portal de
// vagas: campo-armadilha e carimbo de tempo assinado (`avaliarEnvio`), e limite
// por IP em memória. Robô recebe o mesmo "recebemos" de uma pessoa e nada é
// gravado — dizer que foi recusado ensina o robô a ajustar. O formulário
// público do esqueci-a-senha, que tinha nome e mensagem livres, passou a
// receber propaganda em 01/10; é por isso que esta ficha nasce com as defesas.

import { headers } from "next/headers";
import { getPrisma } from "@/lib/prisma";
import { clientIp, hit } from "@/lib/rateLimit";
import { avaliarEnvio } from "@/lib/carreiras/antiRobo";
import { ORIGEM_FICHA_DO_PORTAL, validarFicha, type CampoDaFicha } from "@/lib/leads/regras";
import { avisarEquipeDoLead, escritorioDaFicha } from "@/lib/leads/servidor";

export type ResultadoDaFichaDoPortal =
  | { ok: true; primeiroNome: string }
  | { ok: false; erro: string; campo?: CampoDaFicha };

/** Fichas por IP por hora. Um escritório atrás de um IP só não manda mais que isso. */
const FICHAS_POR_HORA = 5;

function texto(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" ? v : null;
}

export async function enviarFichaDoPortal(form: FormData): Promise<ResultadoDaFichaDoPortal> {
  const veredicto = avaliarEnvio({ carimbo: texto(form.get("carimbo")), armadilha: texto(form.get("website")), agora: new Date() });
  if (veredicto === "robo") return { ok: true, primeiroNome: "" };
  if (veredicto === "carimbo_invalido") {
    return { ok: false, erro: "Esta página ficou aberta por muito tempo. Recarregue a página e envie de novo." };
  }

  const v = validarFicha({
    nome: form.get("nome"),
    email: form.get("email"),
    telefone: form.get("telefone"),
    empresa: form.get("empresa"),
    cnpj: form.get("cnpj"),
    mensagem: form.get("mensagem"),
    aceite: form.get("aceite"),
  });
  if (!v.ok) return { ok: false, erro: v.erro, campo: v.campo };

  // Depois da validação: quem errou um campo e corrigiu não gasta o limite.
  const ip = clientIp({ headers: await headers() });
  if (!hit(`portal-ficha:${ip}`, FICHAS_POR_HORA, 60 * 60_000).allowed) {
    return { ok: false, erro: "Recebemos várias fichas deste endereço em pouco tempo. Tente de novo daqui a uma hora." };
  }

  const escritorio = await escritorioDaFicha();
  if (!escritorio) return { ok: false, erro: "A ficha não está recebendo cadastros agora. Tente de novo mais tarde." };

  const { ficha } = v;
  let leadId: string;
  try {
    const lead = await getPrisma().lead.create({
      data: {
        tenantId: escritorio.tenantId,
        name: ficha.nome,
        email: ficha.email,
        phone: ficha.telefone,
        companyName: ficha.empresa,
        cnpj: ficha.cnpj,
        message: ficha.mensagem,
        source: ORIGEM_FICHA_DO_PORTAL,
        privacyAcceptedAt: new Date(),
      },
      select: { id: true },
    });
    leadId = lead.id;
  } catch (err) {
    console.error("[enviarFichaDoPortal]", err);
    return { ok: false, erro: "Não foi possível enviar agora. Tente de novo em alguns minutos." };
  }

  await avisarEquipeDoLead({
    tenantId: escritorio.tenantId,
    id: leadId,
    nome: ficha.nome,
    empresa: ficha.empresa,
    origem: ORIGEM_FICHA_DO_PORTAL,
  });

  return { ok: true, primeiroNome: ficha.nome.split(" ")[0] ?? "" };
}
