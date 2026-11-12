// O e-mail diário de vencimentos do Societário (12/11/2026) — a parte do banco.
// As regras (o que entra e em que marco) estão em avisoDeVencimento.ts; o corpo
// do e-mail, em emailDeVencimento.ts.
//
// Roda no agendador dos alertas (src/lib/alerts.ts), que passa a cada 15
// minutos. Sai uma vez por dia, a partir das 7h de Brasília, só com o que ainda
// não foi avisado naquele marco. O item só conta como avisado depois que o
// e-mail saiu para ao menos um endereço: com o SMTP fora do ar, ele volta na
// passada seguinte, e não se perde.

import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { formatCnpj } from "@/lib/format";
import { sendVencimentosDoSocietarioEmail, type ResultadoDoAviso } from "@/lib/email/sendMail";
import type { SituacaoDaCertidao, TipoDeCertidao } from "@/lib/certidoes/regras";
import { itensDasCertidoes, itensDasLicencas, lerEmails, ordenar, type ItemDoAviso } from "./avisoDeVencimento";
import { assuntoDoAviso, corpoDoAviso } from "./emailDeVencimento";

export const MODULO_DAS_LICENCAS = "societario_licencas";
export const MODULO_DAS_CERTIDOES = "societario_certidoes";
/** Hora de Brasília a partir da qual o e-mail do dia sai (o Radar mandava de manhã). */
export const HORA_DO_ENVIO = 7;

export type ConfiguracaoDoAviso = { ligado: boolean; emails: string[] };

export async function lerConfiguracaoDoAviso(tenantId: string): Promise<ConfiguracaoDoAviso | null> {
  const linha = await getPrisma().societarioAvisoPorEmail.findUnique({ where: { tenantId }, select: { ligado: true, emails: true } });
  if (!linha) return null;
  const emails = Array.isArray(linha.emails) ? linha.emails.filter((e): e is string => typeof e === "string") : [];
  return { ligado: linha.ligado, emails: lerEmails(emails.join("\n")).validos };
}

export async function salvarConfiguracaoDoAviso(tenantId: string, config: ConfiguracaoDoAviso): Promise<void> {
  await getPrisma().societarioAvisoPorEmail.upsert({
    where: { tenantId },
    create: { tenantId, ligado: config.ligado, emails: config.emails },
    update: { ligado: config.ligado, emails: config.emails },
  });
}

/** Tudo o que está na janela de aviso hoje, já avisado ou não, na ordem do e-mail. */
export async function itensNaJanela(tenantId: string, hoje: string): Promise<ItemDoAviso[]> {
  const prisma = getPrisma();
  const [licencas, comCertidoes] = await Promise.all([
    prisma.license.findMany({
      where: { tenantId, revokedAt: null, expiresAt: { not: null }, company: { status: "ACTIVE" } },
      select: {
        id: true,
        kind: true,
        number: true,
        expiresAt: true,
        company: { select: { name: true, displayName: true, cnpj: true } },
      },
    }),
    isModuleEnabled(tenantId, MODULO_DAS_CERTIDOES),
  ]);

  const itens = itensDasLicencas(
    licencas.map((l) => ({
      id: l.id,
      empresa: nomeExibicao(l.company),
      cnpj: l.company.cnpj ? formatCnpj(l.company.cnpj) : null,
      tipo: l.kind,
      numero: l.number,
      venceEm: saoPauloParts(l.expiresAt!).dateKey,
    })),
    hoje
  );

  if (comCertidoes) {
    // A certidão que vale é a mais nova de cada empresa e tipo, como na tela de
    // Certidões; a que não saiu não substitui a anterior.
    const certidoes = await prisma.certidao.findMany({
      where: { tenantId, situacao: { not: "NAO_SAIU" }, company: { status: "ACTIVE" } },
      select: {
        id: true,
        companyId: true,
        tipo: true,
        situacao: true,
        validaAte: true,
        vistaEm: true,
        company: { select: { name: true, displayName: true, cnpj: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const vistas = new Set<string>();
    const queValem = certidoes.filter((c) => {
      const k = `${c.companyId}:${c.tipo}`;
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
    itens.push(
      ...itensDasCertidoes(
        queValem.map((c) => ({
          id: c.id,
          empresa: nomeExibicao(c.company),
          cnpj: c.company.cnpj ? formatCnpj(c.company.cnpj) : null,
          tipo: c.tipo as TipoDeCertidao,
          situacao: c.situacao as SituacaoDaCertidao,
          validaAte: c.validaAte,
          vista: !!c.vistaEm,
        })),
        hoje
      )
    );
  }
  return ordenar(itens);
}

function linkDaTela(): string {
  return `${(process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "")}/licencas`;
}

async function enviar(tenantId: string, para: string[], itens: ItemDoAviso[], hoje: string, previa: boolean): Promise<ResultadoDoAviso> {
  return sendVencimentosDoSocietarioEmail({
    tenantId,
    para,
    assunto: assuntoDoAviso(itens, previa),
    corpoHtml: corpoDoAviso(itens, { hoje, linkDaTela: linkDaTela(), previa }),
  });
}

/**
 * A passada do agendador. Devolve quantos itens saíram no e-mail (0 quando não
 * era hora, não havia o que avisar ou o envio falhou).
 *
 * A trava do dia (`VENC_EMAIL:DIA:<dia>`) impede que duas passadas próximas
 * mandem o mesmo e-mail; quando nada sai, ela é solta, e a próxima passada
 * tenta de novo.
 */
export async function enviarVencimentosDoDia(tenantId: string, today: Date, agora: Date = new Date()): Promise<number> {
  const { hour, dateKey: hoje } = saoPauloParts(agora);
  if (hour < HORA_DO_ENVIO) return 0;
  if (!(await isModuleEnabled(tenantId, MODULO_DAS_LICENCAS))) return 0;
  const config = await lerConfiguracaoDoAviso(tenantId);
  if (!config?.ligado || config.emails.length === 0) return 0;

  const prisma = getPrisma();
  const trava = `VENC_EMAIL:DIA:${hoje}`;
  if (await prisma.alertDispatch.findFirst({ where: { tenantId, alertKey: trava }, select: { id: true } })) return 0;
  try {
    await prisma.alertDispatch.create({ data: { tenantId, alertKey: trava, sentOn: today } });
  } catch {
    return 0; // outra passada pegou a trava
  }
  const soltar = () => prisma.alertDispatch.deleteMany({ where: { tenantId, alertKey: trava } });

  try {
    const naJanela = await itensNaJanela(tenantId, hoje);
    if (naJanela.length === 0) return 0;
    const jaAvisados = new Set(
      (
        await prisma.alertDispatch.findMany({
          where: { tenantId, alertKey: { in: naJanela.map((i) => i.chave) } },
          select: { alertKey: true },
        })
      ).map((d) => d.alertKey)
    );
    const novos = naJanela.filter((i) => !jaAvisados.has(i.chave));
    if (novos.length === 0) return 0;

    const r = await enviar(tenantId, config.emails, novos, hoje, false);
    if (r.enviados === 0) {
      await soltar();
      return 0;
    }
    await prisma.alertDispatch.createMany({
      data: novos.map((i) => ({ tenantId, alertKey: i.chave, sentOn: today })),
      skipDuplicates: true,
    });
    return novos.length;
  } catch (err) {
    await soltar();
    throw err;
  }
}

/**
 * O "Enviar teste" da tela: manda agora, para a lista salva, tudo o que está na
 * janela hoje — já avisado ou não — e não marca nada. Serve para conferir o
 * SMTP e a lista sem esperar o dia seguinte.
 */
export async function enviarTesteDoAviso(
  tenantId: string,
  agora: Date = new Date()
): Promise<{ erro: string } | (ResultadoDoAviso & { itens: number })> {
  const config = await lerConfiguracaoDoAviso(tenantId);
  if (!config || config.emails.length === 0) return { erro: "Salve ao menos um e-mail antes de enviar o teste." };
  const hoje = saoPauloParts(agora).dateKey;
  const itens = await itensNaJanela(tenantId, hoje);
  if (itens.length === 0) return { erro: "Nada está na janela de aviso hoje: não há o que mandar no teste." };
  const r = await enviar(tenantId, config.emails, itens, hoje, true);
  return { ...r, itens: itens.length };
}
