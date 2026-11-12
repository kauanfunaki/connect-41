"use server";

// O envio dos eventos do mês pelo cliente, sem login (12/11/2026, DP 2 fase 2).
// A prova de acesso é o token do link: aberto, não vencido, competência ainda
// aberta. Token inexistente é limitado por IP, como na admissão.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { hit, clientIp } from "@/lib/rateLimit";
import { lerNumero } from "@/lib/dp2/entrada";
import { lerHoras } from "@/lib/dp2/importacaoDeEventos";
import type { EstadoDoDp2 } from "@/components/dp2/Formulario";
import { pedidoValido, rubricasDoLink } from "./dados";

export async function enviarEventosDoMesAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const token = String(fd.get("token") ?? "");
  const ip = clientIp({ headers: await headers() });
  const limite = hit(`eventos-do-mes:${ip}`, 30, 10 * 60_000);
  if (!limite.allowed) return { ok: false, texto: "Muitas tentativas. Espere alguns minutos e tente de novo." };

  const pedido = await pedidoValido(token);
  if (!pedido.ok) return { ok: false, texto: pedido.motivo };
  const { p } = pedido;
  const prisma = getPrisma();
  const semEventos = fd.get("semEventos") === "1";
  const observacao = String(fd.get("observacao") ?? "").trim().slice(0, 2000) || null;

  const [pessoas, rubricas] = await Promise.all([
    prisma.person.findMany({
      where: { tenantId: p.tenantId, currentCompanyId: p.competencia.companyId, isInternal: false, dp2Vinculo: { isNot: null } },
      select: { id: true },
    }),
    rubricasDoLink(p.tenantId),
  ]);
  const idsDasPessoas = new Set(pessoas.map((x) => x.id));
  const porId = new Map(rubricas.map((r) => [r.id, r]));

  const eventos: { personId: string; rubricaId: string; quantidade: number | null; valor: number | null }[] = [];
  const erros: string[] = [];
  if (!semEventos) {
    for (const [chave, bruto] of fd.entries()) {
      if (!chave.startsWith("q:") || typeof bruto !== "string" || !bruto.trim()) continue;
      const [, personId, rubricaId] = chave.split(":");
      const r = porId.get(rubricaId);
      if (!r || !idsDasPessoas.has(personId)) continue;
      const porQuantidade = r.lancamento !== "VALOR";
      const n = porQuantidade ? lerHoras(bruto) : lerNumero(bruto);
      if (n === null || n < 0) {
        erros.push(`"${bruto}" em ${r.nome} não é um número.`);
        continue;
      }
      if (n === 0) continue;
      eventos.push({ personId, rubricaId, quantidade: porQuantidade ? n : null, valor: porQuantidade ? null : n });
    }
    if (erros.length) return { ok: false, texto: erros.slice(0, 3).join(" ") };
    if (eventos.length === 0 && !observacao) return { ok: false, texto: "Preencha ao menos um campo, ou use “Não houve eventos neste mês”." };
  }

  await prisma.$transaction([
    // Mandar de novo pelo mesmo link troca o que o cliente tinha mandado antes.
    prisma.dp2Evento.deleteMany({ where: { tenantId: p.tenantId, competenciaId: p.competenciaId, origem: "CLIENTE" } }),
    prisma.dp2Evento.createMany({
      data: eventos.map((e) => ({ tenantId: p.tenantId, competenciaId: p.competenciaId, ...e, origem: "CLIENTE", observacao: "Informado pelo cliente" })),
    }),
    prisma.dp2PedidoDeEventos.update({ where: { id: p.id }, data: { situacao: "RESPONDIDO", respondidoEm: new Date(), semEventos, observacao } }),
    ...(p.competencia.situacao === "CALCULADA" ? [prisma.dp2Competencia.update({ where: { id: p.competenciaId }, data: { situacao: "ABERTA" } })] : []),
  ]);
  revalidatePath(`/dp2/competencia/${p.competenciaId}`);
  redirect(`/eventos-do-mes/${token}?enviado=1`);
}
