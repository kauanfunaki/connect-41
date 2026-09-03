// Repontua as avaliações de atendimento com a régua de dois segmentos.
//
//   npx tsx --env-file=.env scripts/repontuar-avaliacoes.ts                    # dry-run
//   npx tsx --env-file=.env scripts/repontuar-avaliacoes.ts --aplicar
//   npx tsx --env-file=.env scripts/repontuar-avaliacoes.ts --aplicar --limite 50
//   npx tsx --env-file=.env scripts/repontuar-avaliacoes.ts --aplicar --tudo
//
// ─── Rode `carregar-historico-chatwoot.ts` ANTES ─────────────────────────────
//
// O cache guarda só as 20 mensagens mais recentes de cada conversa, e a
// abertura — onde a recepção faz a triagem — é justamente o que se perde.
// Repontuar antes de completar o histórico dá nota de escrita sobre metade do
// texto e faz a triagem sumir de 39% dos atendimentos. Como cada conversa custa
// IA, refazer depois é pagar duas vezes.
//
// **Dry-run é o padrão** e aqui isso importa mais do que de costume: cada
// segmento custa UMA chamada de IA (a nota de escrita), e a maioria dos
// atendimentos tem dois. O dry-run imprime a conta antes de você gastá-la.
//
// ─── Por que repontuar ───────────────────────────────────────────────────────
//
// As avaliações antigas medem a conversa inteira com uma régua só: a recepção
// carregava o SLA de um setor que demorou dois dias, e o setor herdava a
// saudação de quem nunca tratou nada. Decidido em 2026-09-03 repontuar todas em
// vez de conviver com duas réguas na mesma tela — média de coisas medidas
// diferente não quer dizer nada.
//
// ─── Retomável ───────────────────────────────────────────────────────────────
//
// Considera repontuada a conversa cujas avaliações têm todas `handlerLabel`
// preenchido — coisa que a régua antiga nunca gravava. Interrompeu no meio?
// Rode de novo: ele continua de onde parou, sem repetir chamada de IA já paga.
//
// Também recolhe conversa resolvida **sem avaliação nenhuma**, o que inclui as
// 25 que a primeira versão deste script apagou em 2026-09-03 ao remover a
// avaliação antiga antes de conseguir gravar a nova.
//
// **Interromper com Ctrl+C é seguro.** Cada conversa é gravada por inteiro antes
// de ele passar para a próxima, e nada é apagado sem substituto — o pior caso é
// perder a conversa que estava no meio, que a próxima rodada refaz.
//
// Conversa sem mensagem em cache faz o script buscá-las na API do Chatwoot antes
// de avaliar. É chamada de rede: espere alguns segundos nesses casos, e o log
// avisa quando é isso que está acontecendo.
//
// ─── Onde rodar ──────────────────────────────────────────────────────────────
//
// **Da máquina local, com o `SECRETS_ENCRYPTION_KEY` de produção no `.env`.**
//
// A chave de IA do tenant está cifrada em `TenantAiConfig.apiKeyEnc`, e
// decifrar exige a mesma chave que cifrou. Com outra, toda conversa falha em
// `decipher.final()` com "unable to authenticate data".
//
// Não adianta rodar no container: o estágio `runner` do Dockerfile copia só
// `public` e `.next/standalone` — não tem `scripts/`, nem `tsx`, nem
// `node_modules`. Produção roda o app, não a caixa de ferramentas.
//
// O banco já é o de produção pelo `DATABASE_URL` do `.env` local, com a
// guarda do `prisma.config.ts` conferindo que é mesmo o `connect41`. O que
// falta é só a chave.
//
// ─── A trava ─────────────────────────────────────────────────────────────────
//
// Recusa rodar se nenhum agente estiver marcado como recepção. Sem isso, a
// barreira nunca aparece, tudo vira TRATATIVA, e o resultado seria a régua
// antiga com nome novo — pior que não rodar, porque pareceria feito.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const aplicar = process.argv.includes("--aplicar");
// Refaz até o que já foi repontuado. Existe por causa do histórico truncado:
// quem foi avaliado antes de `carregar-historico-chatwoot.ts` rodar foi
// pontuado sobre metade do texto, e a triagem dessas conversas nem apareceu.
const tudo = process.argv.includes("--tudo");
const iLimite = process.argv.indexOf("--limite");
const limite = iLimite !== -1 ? Number(process.argv[iLimite + 1]) : Infinity;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  // Import tardio: `evaluateConversation` puxa `@/lib/prisma`, que resolve o
  // seu próprio client a partir do mesmo DATABASE_URL. Carregar depois de
  // validar a env evita erro obscuro de inicialização.
  const { evaluateConversation, papeisDosAgentes } = await import("../src/lib/chatwoot/evaluation");

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    const papeis = await papeisDosAgentes(tenant.id);

    const conversas = await prisma.chatwootConversation.findMany({
      // Conversa excluída por SUPER_ADMIN não entra: repontuá-la só gastaria
      // IA para produzir uma nota que o motor apaga em seguida.
      where: { tenantId: tenant.id, resolvedAt: { not: null }, excludedFromEvaluation: false },
      select: { id: true, evaluations: { select: { handlerLabel: true } } },
      orderBy: { resolvedAt: "desc" },
    });
    if (conversas.length === 0) continue;

    // Duas situações entram: a régua antiga (avaliação com `handlerLabel` nulo)
    // e a conversa resolvida SEM avaliação nenhuma.
    //
    // A segunda passou a entrar depois de 2026-09-03, quando uma versão deste
    // script apagou a avaliação de 25 conversas antes de tentar recriá-la e a
    // recriação falhou. Filtrar por `evaluations: { some: {} }`, como antes,
    // deixaria justamente essas 25 de fora — invisíveis para a única ferramenta
    // capaz de trazê-las de volta.
    const reguaAntiga = conversas.filter(
      (c) => c.evaluations.length > 0 && c.evaluations.some((e) => e.handlerLabel === null)
    );
    const semAvaliacao = conversas.filter((c) => c.evaluations.length === 0);
    const jaFeitas = conversas.filter(
      (c) => c.evaluations.length > 0 && c.evaluations.every((e) => e.handlerLabel !== null)
    );
    const pendentes = tudo
      ? [...reguaAntiga, ...semAvaliacao, ...jaFeitas]
      : [...reguaAntiga, ...semAvaliacao];

    console.log(`\n=== ${tenant.name} ===`);
    console.log(`  resolvidas: ${conversas.length}`);
    console.log(
      `  a repontuar: ${pendentes.length} (${reguaAntiga.length} na régua antiga, ` +
        `${semAvaliacao.length} sem avaliação` +
        (tudo ? `, ${jaFeitas.length} refeitas por --tudo` : "") +
        ")"
    );
    if (!tudo && jaFeitas.length > 0) {
      console.log(`  (${jaFeitas.length} já repontuadas ficam de fora — use --tudo para refazê-las)`);
    }
    console.log(`  recepção marcada: ${papeis.recepcao.length ? papeis.recepcao.join(", ") : "NENHUMA"}`);
    console.log(`  automação marcada: ${papeis.automacao.length ? papeis.automacao.join(", ") : "nenhuma"}`);

    if (pendentes.length === 0) {
      console.log("  nada a fazer.");
      continue;
    }

    if (papeis.recepcao.length === 0) {
      console.log("  ! PULADO — marque a recepção em /admin/atendentes antes.");
      console.log("    Sem isso todo atendimento viraria TRATATIVA e a separação não existiria.");
      continue;
    }

    const alvo = pendentes.slice(0, limite === Infinity ? undefined : limite);
    console.log(`  vai repontuar ${alvo.length} conversa(s) — estimativa de ~${alvo.length * 2} chamadas de IA`);

    if (!aplicar) continue;

    let ok = 0;
    let falhou = 0;
    let seguidas = 0;

    for (const [i, c] of alvo.entries()) {
      // Conversa sem mensagem em cache faz `ensureMessagesLoaded` ir buscar na
      // API do Chatwoot — chamada de rede, ordem de segundos, às vezes mais.
      // Dizer isso ANTES evita que uma espera legítima pareça travamento.
      const emCache = await prisma.chatwootMessage.count({ where: { conversationId: c.id } });
      const prefixo = `  [${i + 1}/${alvo.length}] ${c.id.slice(0, 8)}`;
      process.stdout.write(`${prefixo}${emCache === 0 ? " (buscando mensagens no Chatwoot)" : ""} ... `);
      const t0 = Date.now();

      try {
        // **Nada é apagado antes de existir o substituto.**
        //
        // A primeira versão fazia `deleteMany` e só então avaliava, para limpar
        // a linha da régua antiga. Quando a avaliação falhou — chave de
        // criptografia errada, nenhuma chamada de IA chegou a sair —, as 25
        // conversas da leva ficaram sem avaliação nenhuma. Apagar primeiro
        // transforma qualquer falha em perda de dado.
        //
        // E era desnecessário: `evaluateConversation` faz upsert por
        // (conversa, segmento) e, no fim, apaga os segmentos que não escreveu
        // nesta rodada. A linha TRATATIVA da régua antiga é sobrescrita quando
        // ainda existe tratativa, e removida quando não existe mais — só que
        // depois de a nova estar gravada.
        await evaluateConversation(tenant.id, c.id, papeis);
        ok += 1;
        seguidas = 0;
        console.log(`ok (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log("FALHOU");
        console.error(`  ! ${c.id}: ${msg}`);
        falhou += 1;
        seguidas += 1;

        // Erro de decriptação não é falha de uma conversa: é ambiente errado.
        // A chave de IA do tenant está cifrada no banco, e decifrar com um
        // SECRETS_ENCRYPTION_KEY diferente do de produção falha em TODAS. Sem
        // esta parada, o script varre 696 conversas repetindo o mesmo erro.
        if (/unable to authenticate data|unsupported state|SECRETS_ENCRYPTION_KEY/i.test(msg)) {
          console.error("\n  PARADO: isto é a chave de criptografia, não a conversa.");
          console.error("  A chave de IA do tenant está cifrada no banco e o");
          console.error("  SECRETS_ENCRYPTION_KEY deste ambiente não a decifra.");
          console.error("  Copie o SECRETS_ENCRYPTION_KEY de produção (EasyPanel) para o .env");
          console.error("  local e rode de novo. Nada foi apagado — a avaliação antiga segue lá.");
          break;
        }
        if (seguidas >= 3) {
          console.error("\n  PARADO: 3 falhas seguidas — algo sistêmico, não caso a caso.");
          break;
        }
      }
    }
    console.log(`  repontuadas: ${ok} · falhas: ${falhou}`);
  }

  if (!aplicar) {
    console.log("\n--- dry-run, nada foi escrito. Rode com --aplicar para repontuar. ---");
  }
  await prisma.$disconnect();
}

main();
