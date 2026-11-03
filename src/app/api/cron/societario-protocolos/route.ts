import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import {
  observadorPara,
  decidir,
  type ProtocoloParaVerificar,
} from "@/lib/societario/observador";
import { aplicarDecisaoDoProtocolo, anotarFalhaDoProtocolo } from "@/lib/societario/observadorServidor";

export const dynamic = "force-dynamic";

// O observador de protocolo do Societário.
//
// Percorre os protocolos pendentes, pergunta ao leitor do órgão o que o site
// diz, e aplica. Mesmo padrão das outras rotas de cron: token de serviço, e
// `/api/cron/` já está em PUBLIC_PATHS no proxy.
//
// ─── Não há leitor de órgão registrado ainda ─────────────────────────────────
//
// `OBSERVADORES` nasce vazio (ver src/lib/societario/observador.ts). Enquanto
// estiver assim, esta rota roda, não acha nada para verificar, e devolve 200
// dizendo isso — que é o comportamento correto e honesto. A alternativa seria
// inventar um leitor sem ter lido a página do órgão, e marcar processo como
// deferido sem ser é o pior defeito possível aqui.

type Resultado = {
  verificados: number;
  deferidos: number;
  exigencias: number;
  seguemPendentes: number;
  pulados: number;
  falhas: number;
};

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SERVICE_TOKEN;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const prisma = getPrisma();
  const resultado: Resultado = {
    verificados: 0,
    deferidos: 0,
    exigencias: 0,
    seguemPendentes: 0,
    pulados: 0,
    falhas: 0,
  };

  try {
    const pendentes = await prisma.processProtocol.findMany({
      where: { outcome: "PENDENTE" },
      select: {
        id: true,
        tenantId: true,
        processId: true,
        stepId: true,
        outcome: true,
        number: true,
        organ: { select: { acronym: true, trackingUrl: true } },
      },
      // Teto por execução, como no cron do SPED: uma rodada que não termina é
      // pior que uma rodada curta, porque não dá para saber de onde retomar.
      take: 200,
    });

    for (const p of pendentes) {
      const dados: ProtocoloParaVerificar = {
        id: p.id,
        outcome: p.outcome,
        numero: p.number,
        trackingUrl: p.organ.trackingUrl,
        siglaDoOrgao: p.organ.acronym,
      };

      const observador = observadorPara(dados.siglaDoOrgao);
      // Sem leitor ou sem URL não é falha: é órgão que ainda não foi
      // automatizado, e o setor continua conferindo à mão como sempre fez.
      if (!observador || !dados.trackingUrl) {
        resultado.pulados += 1;
        continue;
      }

      try {
        const leitura = await observador({ numero: dados.numero, trackingUrl: dados.trackingUrl });
        const decisao = decidir(dados, leitura);
        resultado.verificados += 1;
        const feito = await aplicarDecisaoDoProtocolo({ id: p.id, tenantId: p.tenantId, stepId: p.stepId }, decisao);
        if (feito === "pulado") resultado.pulados += 1;
        else if (feito === "segue_pendente") resultado.seguemPendentes += 1;
        else if (feito === "deferido") resultado.deferidos += 1;
        else resultado.exigencias += 1;
      } catch (err) {
        // A falha é deste protocolo, não da rodada: um órgão fora do ar não
        // pode impedir a verificação dos outros.
        const mensagem = err instanceof Error ? err.message : "falha desconhecida";
        await anotarFalhaDoProtocolo(p.id, mensagem);
        resultado.falhas += 1;
      }
    }

    if (resultado.verificados === 0 && resultado.pulados > 0) {
      // Falha fechada e **avisada** — o 200 mudo do SPED custou três dias em
      // 10/09. O scheduler segue verde, e o log diz o que está acontecendo.
      console.warn(
        `[cron/societario-protocolos] ${resultado.pulados} protocolo(s) pendente(s) e nenhum leitor de órgão registrado`
      );
    }

    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("[cron/societario-protocolos]", err);
    return NextResponse.json({ ok: false, error: "Falha ao verificar protocolos" }, { status: 500 });
  }
}
