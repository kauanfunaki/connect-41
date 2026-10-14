// Dados fictícios do Recrutamento no escritório da 41 (tenant `41tech`), para
// ver e testar as telas novas com informação — decisão do Kauan em 14/10/2026.
// As vagas abertas aparecem também no 41 Carreiras (carreiras.useconnect.com.br).
//
// Quem roda é o Kauan, na pasta principal (o `.env` aponta para a produção),
// nesta ordem:
//
//   npx tsx --env-file=.env scripts/demo-recrutamento-41.ts             # simulação: só mostra
//   npx tsx --env-file=.env scripts/demo-recrutamento-41.ts --ensaio    # grava e desfaz: prova que passa
//   npx tsx --env-file=.env scripts/demo-recrutamento-41.ts --aplicar   # grava de verdade
//
// Opcional: `--autor <e-mail>` escolhe o administrador que figura como autor e
// responsável pelas vagas. Sem ele, o primeiro ADMIN ativo do escritório (ou,
// sem ADMIN, o primeiro SUPER_ADMIN).
//
// Para tirar tudo (15/10), a limpeza de sempre — ela já conhece estes dados:
//
//   npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --limpar             # simulação
//   npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --limpar --ensaio
//   npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --limpar --aplicar
//
// O que tem e o que não tem: ver src/lib/demonstracao/recrutamento/plano.ts.
// Rodar `--aplicar` duas vezes não duplica: com a demonstração já no
// escritório, o script para e avisa.

import { getPrisma } from "../src/lib/prisma";
import { conferirAntesDeCriar, gravarDemonstracao } from "../src/lib/demonstracao/recrutamento/gravar";
import { SITUACAO_DO_VINCULO } from "../src/lib/colaboradores/situacao";
import { SLUG_DO_TENANT, contagemDaDemonstracao, montarDemonstracao, type PlanoDaDemonstracao } from "../src/lib/demonstracao/recrutamento/plano";

const ENSAIO = "ensaio: tudo seria gravado sem erro; a transação foi desfeita";
const TRANSACAO = { maxWait: 15_000, timeout: 120_000 } as const;

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const dataBr = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

function resumo(plano: PlanoDaDemonstracao, comSegundo: boolean): string[] {
  const c = contagemDaDemonstracao(plano);
  const abertas = plano.vagas.filter((v) => v.isPublic && v.status === "ABERTA");
  const prazos = abertas.map((v) => v.applicationDeadline.getTime());
  const porEtapa = ["TRIAGEM", "ENTREVISTA", "TESTE", "PROPOSTA", "CONTRATADO"].map(
    (e) => `${e.charAt(0)}${e.slice(1).toLowerCase()} ${plano.candidaturas.filter((x) => x.stage === e).length}`
  );
  const status = (s: string) => plano.candidaturas.filter((x) => x.status === s).length;
  const entrevistas = comSegundo ? c.entrevistas : plano.entrevistas.filter((e) => e.avaliador === "principal").length;
  const testes = plano.testes;
  const situacoes = new Map<keyof typeof SITUACAO_DO_VINCULO, number>();
  for (const p of plano.pessoas) if (p.type === "COLABORADOR") situacoes.set(p.employmentStatus, (situacoes.get(p.employmentStatus) ?? 0) + 1);
  return [
    `${c.empresas} empresas [demo], cada uma com o seu grupo de cliente: ${plano.empresas.map((e) => e.tradeName).join(", ")}`,
    `${c.cargos} cargos nessas empresas`,
    `${c.vagas} vagas — ${c.vagasNoPortal} abertas e publicadas no 41 Carreiras (inscrições até ${dataBr(new Date(Math.min(...prazos)))} a ${dataBr(new Date(Math.max(...prazos)))}), ${c.vagas - c.vagasNoPortal} encerrada fora do portal`,
    `${c.versoesDeRequisitos} versões de requisitos (obrigatórios e desejáveis, com peso e cortes)`,
    `${c.candidatos} candidatos e ${c.candidaturas} candidaturas — ${porEtapa.join(", ")}; ${status("CONTRATADO")} contratados, ${status("REPROVADO")} reprovados, ${status("DESISTENTE")} desistente`,
    `${c.notas} notas da triagem: toda candidatura já nasce com nota, então a pontuação automática (IA) não pega nenhuma`,
    `${entrevistas} avaliações de entrevista${comSegundo ? "" : " (as de um segundo avaliador ficam de fora: só há um administrador)"}`,
    `1 questionário [demo] com ${c.perguntas} perguntas`,
    `${testes.length} testes: ${testes.filter((t) => t.status === "RESPONDIDO" && t.type === "DISC").length} DISC respondidos, ${testes.filter((t) => t.status === "RESPONDIDO" && t.type !== "DISC").length} questionários respondidos, ${testes.filter((t) => t.status === "PENDENTE" && t.expiresAt.getTime() > Date.now()).length} links pendentes (valem 7 dias), ${testes.filter((t) => t.status === "PENDENTE" && t.expiresAt.getTime() <= Date.now()).length} vencido`,
    `${c.colaboradores} colaboradores de clientes — ${[...situacoes].map(([s, q]) => `${q} ${SITUACAO_DO_VINCULO[s].rotulo.toLowerCase()}`).join(", ")}`,
    `${c.etiquetas} etiquetas [demo] do Recrutamento (uma delas marca toda pessoa fictícia)`,
    `e-mails só @exemplo.invalido, telefones (41) 90000-00xx, CPFs 000.410.0xx-xx e CNPJs 41.000.00x/0000-xx`,
    `sem currículo em arquivo (o bloco Currículo da ficha fica vazio), sem reunião, sem link de admissão, sem aviso a ninguém`,
  ];
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const ensaio = process.argv.includes("--ensaio");
  if (aplicar && ensaio) throw new Error("Use --ensaio ou --aplicar, não os dois.");

  const p = getPrisma();
  const tenant = await p.tenant.findUnique({ where: { slug: SLUG_DO_TENANT }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`Escritório "${SLUG_DO_TENANT}" não encontrado — nada foi gravado.`);

  // Autor e responsável: um administrador do escritório, escolhido pelo papel.
  const admins = await p.user.findMany({
    where: { tenantId: tenant.id, active: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });
  const pedido = argumento("--autor");
  const principal = pedido
    ? admins.find((a) => a.email.toLowerCase() === pedido.toLowerCase())
    : (admins.find((a) => a.role === "ADMIN") ?? admins[0]);
  if (!principal) {
    throw new Error(pedido ? `--autor ${pedido}: não é administrador ativo do escritório.` : "O escritório não tem administrador ativo para figurar como autor.");
  }
  const segundo = admins.find((a) => a.id !== principal.id) ?? null;

  const plano = montarDemonstracao(new Date());
  console.log(`Escritório: ${tenant.name} (${SLUG_DO_TENANT}) — hoje ${dataBr(new Date(`${plano.hoje}T12:00:00Z`))}`);
  console.log(`Autor e responsável pelas vagas: ${principal.name} (${principal.role})`);
  console.log(`Segundo avaliador de entrevista: ${segundo ? segundo.name : "nenhum"}`);

  const conferencia = await conferirAntesDeCriar(p, tenant.id, plano);
  if (conferencia.jaExiste.length > 0) {
    console.log("\nA demonstração do Recrutamento já está no escritório. Nada foi gravado — rodar de novo não duplica.");
    for (const x of conferencia.jaExiste.slice(0, 10)) console.log(`  - ${x}`);
    if (conferencia.jaExiste.length > 10) console.log(`  … e mais ${conferencia.jaExiste.length - 10}`);
    console.log("\nPara recriar, limpe antes: npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --limpar --aplicar");
    return;
  }
  if (conferencia.conflitos.length > 0) {
    console.log("\nRecusado: há cadastro de verdade com um dado da demonstração. Nada foi gravado.");
    for (const x of conferencia.conflitos) console.log(`  - ${x}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n--- ${aplicar ? "gravando" : ensaio ? "ensaio (grava e desfaz)" : "simulação: nada foi gravado"}. O que ${aplicar ? "entra" : "entraria"}: ---\n`);
  for (const linha of resumo(plano, !!segundo)) console.log(`  ${linha}`);

  if (!aplicar && !ensaio) {
    console.log("\nPróximo passo: --ensaio (grava e desfaz). Depois, --aplicar.\n");
    return;
  }

  const autores = { principal: principal.id, segundo: segundo?.id ?? null };

  if (ensaio) {
    try {
      await p.$transaction(async (tx) => {
        await gravarDemonstracao(tx, tenant.id, plano, autores);
        throw new Error(ENSAIO);
      }, TRANSACAO);
    } catch (err) {
      console.log(err instanceof Error && err.message === ENSAIO ? `\n${ENSAIO}.\n` : `\nensaio falhou — nada foi gravado: ${err}\n`);
      if (!(err instanceof Error && err.message === ENSAIO)) process.exitCode = 1;
    }
    return;
  }

  const r = await p.$transaction(async (tx) => {
    // De novo, dentro da transação: outra execução pode ter gravado no meio tempo.
    const agora = await conferirAntesDeCriar(tx, tenant.id, plano);
    if (agora.jaExiste.length > 0 || agora.conflitos.length > 0) {
      throw new Error("a demonstração (ou um dado dela) apareceu no escritório enquanto o script rodava — nada foi gravado.");
    }
    return gravarDemonstracao(tx, tenant.id, plano, autores);
  }, TRANSACAO);

  console.log(`\nPronto: ${r.vagas} vagas, ${r.candidatos} candidatos, ${r.candidaturas} candidaturas, ${r.colaboradores} colaboradores de clientes.`);
  console.log("\nVagas no Connect:");
  for (const v of r.idsDasVagas) console.log(`  /vagas/${v.id}  ${v.title}${v.isPublic ? "  (no 41 Carreiras)" : "  (encerrada)"}`);
  console.log("\nNo 41 Carreiras: carreiras.useconnect.com.br — as vagas abertas já aparecem na lista.");
  console.log("Colaboradores de clientes: escolha uma das empresas [demo] no seletor.");
  console.log("\nPara tirar (15/10): npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --limpar (→ --ensaio → --aplicar)\n");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPrisma().$disconnect();
    } catch {
      // sem DATABASE_URL não houve conexão; o erro já foi mostrado
    }
  });
