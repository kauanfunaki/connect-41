// Demonstração do BPO e das telas gerais, numa empresa fictícia dentro da
// produção — para a apresentação ao setor (15/10/2026).
//
// Quem roda é o Kauan, na pasta principal (o `.env` aponta para a produção),
// de preferência no dia da apresentação: tudo é relativo a hoje ("vence hoje",
// "venceu há 5 dias"), e de um dia para o outro a história envelhece. Para
// refazer, limpar e aplicar de novo.
//
//   npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --usuario <e-mail>             # simulação: só mostra
//   npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --usuario <e-mail> --ensaio    # grava e desfaz: prova que passa
//   npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --usuario <e-mail> --aplicar   # grava de verdade
//
//   npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --limpar             # simulação da limpeza
//   npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --limpar --ensaio    # apaga e desfaz: prova que não trava
//   npx tsx --env-file=.env scripts/dados-de-demonstracao.ts --limpar --aplicar   # limpa de verdade
//
// `--usuario` é quem apresenta: o que é "meu" nas telas (Meu dia, cards,
// solicitações, reuniões, notificações) cai nele. Sem a opção, o primeiro
// ADMIN ativo do escritório. Um segundo administrador, se houver, figura como
// quem lançou as contas em aprovação — quem lança não aprova, e sem ele a tela
// esconde os botões de decidir.
//
// O que entra, e por quê: ver src/lib/demonstracao/bpo/plano.ts. O que impede
// aviso a alguém: ver src/lib/demonstracao/bpo/gravar.ts e
// src/lib/demonstracao/marca.ts (os avisos automáticos deixam as empresas
// "[demo]" de fora).
//
// ─── A limpeza ──────────────────────────────────────────────────────────────
//
// Tira tudo o que é de demonstração no escritório, numa transação só (ou sai
// tudo, ou nada):
// - as pendências de teste criadas à mão em cliente real (título "teste");
// - o Recrutamento fictício (`scripts/demo-recrutamento-41.ts`) — ver
//   src/lib/demonstracao/recrutamento/limpeza.ts;
// - a demonstração do BPO e qualquer outra empresa "[demo]" (a "Transportes
//   Modelo", de antes de 15/10, também), pelo plano da exclusão de empresa do
//   Connect — ver src/lib/demonstracao/bpo/limpeza.ts;
// - por fim, os acessos do portal, as empresas, os grupos de cliente e as
//   categorias do plano do escritório com o prefixo "[demo]".
//
// Os arquivos que alguém enviar às pastas durante a apresentação ficam no disco
// do servidor (o script roda em outra máquina); a simulação diz quantos são.
// Para não sobrar nada, apague-os pela tela dos Arquivos antes de limpar.

import { getPrisma } from "../src/lib/prisma";
import type { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { encryptSecret } from "../src/lib/crypto";
import { alvoDaLimpeza, limparRecrutamentoDaDemo, previaDaLimpeza, type PreviaDaLimpeza } from "../src/lib/demonstracao/recrutamento/limpeza";
import { alvoDaLimpezaDoBpo, limparBpoDaDemo, previaDaLimpezaDoBpo, type PreviaDaLimpezaDoBpo } from "../src/lib/demonstracao/bpo/limpeza";
import { conferirAntesDeCriar, gravarDemonstracaoDoBpo } from "../src/lib/demonstracao/bpo/gravar";
import { MARCA, SETOR, SLUG_DO_TENANT, contagemDoPlano, montarDemonstracaoDoBpo, situacoesDoPlano } from "../src/lib/demonstracao/bpo/plano";

const aplicar = process.argv.includes("--aplicar");
const limpar = process.argv.includes("--limpar");
const ensaio = process.argv.includes("--ensaio");
const ENSAIO_DA_LIMPEZA = "ensaio: tudo seria apagado sem erro; a transação foi desfeita";
const ENSAIO_DA_GRAVACAO = "ensaio: tudo seria gravado sem erro; a transação foi desfeita";
const TRANSACAO = { maxWait: 15_000, timeout: 300_000 } as const;

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

// ─── Limpeza ────────────────────────────────────────────────────────────────

/**
 * Pendências de teste criadas à mão em cliente real — a "teste" da BLD
 * (24/09) aparecia no portal do cliente. Título exatamente "teste", sem
 * diferença de caixa; a simulação lista cada uma antes de apagar.
 */
async function pendenciasDeTeste(p: Pick<Prisma.TransactionClient, "clientRequest">, tenantId: string) {
  const candidatas = await p.clientRequest.findMany({
    where: { tenantId, company: { NOT: { name: { startsWith: MARCA } } } },
    select: { id: true, title: true, status: true, createdAt: true, company: { select: { name: true } } },
  });
  return candidatas.filter((c) => c.title.trim().toLowerCase() === "teste");
}

/**
 * Apaga tudo o que é de demonstração, numa transação só. `soEnsaio` chega até
 * o fim e lança, para o banco desfazer — prova que nenhuma ligação trava.
 */
async function limparDemo(
  p: PrismaClient,
  tenantId: string,
  soEnsaio = false
): Promise<{ feito: string[]; recrutamento: PreviaDaLimpeza | null; bpo: PreviaDaLimpezaDoBpo | null }> {
  const feito: string[] = [];
  let recrutamento: PreviaDaLimpeza | null = null;
  let bpo: PreviaDaLimpezaDoBpo | null = null;
  const conta = (r: { count: number }, o_que: string) => {
    if (r.count > 0) feito.push(`${r.count} ${o_que}`);
  };

  await p.$transaction(async (tx) => {
    const testes = await pendenciasDeTeste(tx, tenantId);
    // Mensagens, lembretes e respostas da pendência vão junto (onDelete: Cascade).
    if (testes.length > 0) {
      conta(await tx.clientRequest.deleteMany({ where: { id: { in: testes.map((x) => x.id) } } }), "pendências de teste em cliente real");
    }

    // Recrutamento fictício (14/10): antes de tudo que é da empresa — vaga com
    // candidatura trava a exclusão da empresa.
    const rec = await limparRecrutamentoDaDemo(tx, tenantId);
    recrutamento = rec.previa;
    feito.push(...rec.feito.map((f) => `${f} (Recrutamento)`));

    // BPO e as demais empresas "[demo]", pelo plano da exclusão de empresa.
    const daDemo = await limparBpoDaDemo(tx, tenantId);
    bpo = daDemo.previa;
    feito.push(...daDemo.feito.map((f) => `${f} (BPO)`));

    const comMarca = { tenantId, name: { startsWith: MARCA } };
    // As ligações do acesso com as empresas vão junto (cascata).
    conta(await tx.portalUser.deleteMany({ where: comMarca }), "acessos do portal");
    // As filiais apontam para a matriz com SET NULL: saem juntas.
    conta(await tx.company.deleteMany({ where: comMarca }), "empresas");
    conta(await tx.clientGroup.deleteMany({ where: comMarca }), "grupos de cliente");
    // As categorias "[demo]" do plano do escritório, da demonstração de antes de 15/10.
    conta(await tx.financeCategory.deleteMany({ where: { ...comMarca, companyId: null } }), "categorias do plano do escritório");
    if (soEnsaio) throw new Error(ENSAIO_DA_LIMPEZA);
  }, TRANSACAO);
  return { feito, recrutamento, bpo };
}

/** O Recrutamento fictício na simulação e no fim da limpeza: números e quem de verdade se candidatou. */
function imprimirRecrutamento(r: PreviaDaLimpeza, jaApagado: boolean) {
  console.log(`\n  Recrutamento fictício${r.empresas.length > 0 ? ` — empresas: ${r.empresas.join(", ")}` : ""}`);
  const comAlgo = r.contagens.filter((c) => c.quantidade > 0);
  console.log(comAlgo.length > 0 ? `  ${comAlgo.map((c) => `${c.quantidade} ${c.rotulo}`).join(", ")}` : "  nada do Recrutamento fictício");
  if (r.candidaturasDeFora.length > 0) {
    console.log(
      `\n  ${r.candidaturasDeFora.length} candidatura(s) de gente de verdade em vaga fictícia — ${jaApagado ? "saiu" : "sai"} a candidatura, a pessoa fica no banco de talentos. Avise:`
    );
    for (const c of r.candidaturasDeFora) {
      const contato = [c.email, c.telefone].filter(Boolean).join(" · ") || "sem contato";
      console.log(`    - ${c.pessoa} (${contato}) · "${c.vaga}" · ${c.empresa} · ${c.origem ?? "sem origem"} · ${c.criadaEm.toISOString().slice(0, 10)}`);
    }
  } else {
    console.log("  nenhuma candidatura de gente de verdade nas vagas fictícias");
  }
  if (r.testesDeForaApagados > 0) {
    console.log(`  ${r.testesDeForaApagados} teste(s) do questionário fictício mandado(s) a gente de verdade ${jaApagado ? "saíram" : "saem"} junto`);
  }
  if (r.testesDeForaDesligados > 0) {
    console.log(`  ${r.testesDeForaDesligados} teste(s) de gente de verdade ${jaApagado ? "ficaram" : "ficam"} na ficha da pessoa, sem a candidatura`);
  }
  if (r.pessoasDeForaNasEmpresas.length > 0) {
    console.log(
      `  ${r.pessoasDeForaNasEmpresas.length} pessoa(s) não fictícia(s) cadastrada(s) nas empresas da demonstração ${jaApagado ? "ficaram" : "ficam"}, sem empresa: ${r.pessoasDeForaNasEmpresas.join(", ")}`
    );
  }
}

/** A demonstração do BPO (e as outras empresas "[demo]") na simulação e no fim da limpeza. */
function imprimirBpo(r: PreviaDaLimpezaDoBpo) {
  console.log(`\n  BPO e telas gerais${r.empresas.length > 0 ? ` — empresas: ${r.empresas.join(", ")}` : ""}`);
  const comAlgo = r.contagens.filter((c) => c.quantidade > 0);
  console.log(comAlgo.length > 0 ? `  ${comAlgo.map((c) => `${c.quantidade} ${c.rotulo}`).join(", ")}` : "  nada da demonstração do BPO");
  if (r.arquivosNoServidor > 0) {
    console.log(
      `  atenção: ${r.arquivosNoServidor} arquivo(s) enviado(s) às pastas da demonstração — a linha sai, o arquivo fica no disco do servidor (ninguém vê). Para não sobrar nada, apague-os pela tela dos Arquivos antes.`
    );
  }
}

/** O que a limpeza apagaria, sem apagar nada. */
async function simularLimpeza(p: PrismaClient, tenantId: string): Promise<void> {
  const comMarca = { tenantId, name: { startsWith: MARCA } };
  const [usuarios, empresas, grupos, categorias, testes] = await Promise.all([
    p.portalUser.count({ where: comMarca }),
    p.company.count({ where: comMarca }),
    p.clientGroup.count({ where: comMarca }),
    p.financeCategory.count({ where: { ...comMarca, companyId: null } }),
    pendenciasDeTeste(p, tenantId),
  ]);
  console.log("\n--- simulação da limpeza: nada foi apagado. O que sairia: ---");
  imprimirRecrutamento(await previaDaLimpeza(p, await alvoDaLimpeza(p, tenantId)), false);
  imprimirBpo(await previaDaLimpezaDoBpo(p, await alvoDaLimpezaDoBpo(p, tenantId)));
  console.log(`\n  no fim: ${empresas} empresas [demo], ${usuarios} acessos do portal, ${grupos} grupos de cliente, ${categorias} categorias [demo] do plano do escritório`);
  console.log(`  ${testes.length} pendências de teste em cliente real${testes.length > 0 ? ":" : ""}`);
  for (const x of testes) console.log(`    - "${x.title}" · ${x.company.name} · ${x.status} · criada em ${x.createdAt.toISOString().slice(0, 10)}`);
  console.log("\nPróximo passo: --limpar --ensaio (apaga e desfaz). Depois, --limpar --aplicar.\n");
}

// ─── Criação ────────────────────────────────────────────────────────────────

async function escolherPessoas(p: PrismaClient, tenantId: string) {
  const admins = await p.user.findMany({
    where: { tenantId, active: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });
  const pedido = argumento("--usuario");
  let apresentador: { id: string; name: string; role: string } | null = null;
  if (pedido) {
    const u = await p.user.findFirst({
      where: { tenantId, active: true, email: pedido.trim().toLowerCase() },
      select: { id: true, name: true, role: true, sectors: { select: { sectorCode: true } } },
    });
    if (!u) throw new Error(`--usuario ${pedido}: não é usuário ativo do escritório. Nada foi gravado.`);
    const veOBpo = u.role === "ADMIN" || u.role === "SUPER_ADMIN" || u.sectors.some((s) => s.sectorCode === SETOR);
    if (!veOBpo) throw new Error(`--usuario ${pedido}: não é do setor do BPO nem administrador — não veria as telas. Nada foi gravado.`);
    apresentador = u;
  } else {
    apresentador = admins.find((a) => a.role === "ADMIN") ?? admins[0] ?? null;
    if (!apresentador) throw new Error("O escritório não tem administrador ativo para apresentar. Use --usuario <e-mail>.");
  }
  const outro = admins.find((a) => a.id !== apresentador!.id && a.role === "ADMIN") ?? admins.find((a) => a.id !== apresentador!.id) ?? null;
  return { apresentador, outro, escolhidoPorPadrao: !pedido };
}

async function main() {
  if (aplicar && ensaio) throw new Error("Use --ensaio ou --aplicar, não os dois.");
  const p = getPrisma();
  const tenant = await p.tenant.findUnique({ where: { slug: SLUG_DO_TENANT }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`Escritório "${SLUG_DO_TENANT}" não encontrado — nada foi feito.`);
  console.log(`Escritório: ${tenant.name} (${SLUG_DO_TENANT})`);

  if (limpar) {
    if (ensaio) {
      try {
        await limparDemo(p, tenant.id, true);
      } catch (err) {
        const ok = err instanceof Error && err.message === ENSAIO_DA_LIMPEZA;
        console.log(ok ? `${ENSAIO_DA_LIMPEZA}.` : `ensaio falhou — nada foi apagado: ${err}`);
        if (!ok) process.exitCode = 1;
      }
      return;
    }
    if (!aplicar) {
      await simularLimpeza(p, tenant.id);
      return;
    }
    const { feito, recrutamento, bpo } = await limparDemo(p, tenant.id);
    console.log(feito.length === 0 ? "nada de demonstração para apagar." : `apagado: ${feito.join(", ")}.`);
    if (recrutamento) imprimirRecrutamento(recrutamento, true);
    if (bpo) imprimirBpo(bpo);
    return;
  }

  const { apresentador, outro, escolhidoPorPadrao } = await escolherPessoas(p, tenant.id);
  const agora = new Date();
  const plano = montarDemonstracaoDoBpo(agora);
  console.log(`Hoje: ${dataBr(plano.hoje)} — tudo é relativo a este dia.`);
  console.log(`Quem apresenta: ${apresentador.name} (${apresentador.role})${escolhidoPorPadrao ? " — o primeiro administrador; para outra pessoa, --usuario <e-mail>" : ""}`);
  console.log(
    outro
      ? `Quem lançou as contas em aprovação: ${outro.name}`
      : "Aviso: só há um administrador — as contas em aprovação figuram lançadas por quem apresenta, e a tela esconde os botões de decidir (quem lança não aprova)."
  );
  const cifrar = process.env.SECRETS_ENCRYPTION_KEY ? encryptSecret : null;
  if (!cifrar) console.log("Aviso: sem SECRETS_ENCRYPTION_KEY no .env — o cofre de senhas fica de fora (a chave tem de ser a da produção).");

  const conferencia = await conferirAntesDeCriar(p, tenant.id, plano);
  if (conferencia.jaExiste.length > 0) {
    console.log("\nA demonstração do BPO já está no escritório. Nada foi gravado — rodar de novo não duplica.");
    for (const x of conferencia.jaExiste.slice(0, 10)) console.log(`  - ${x}`);
    console.log("\nPara recriar (a história envelhece de um dia para o outro), limpe antes: --limpar --aplicar");
    return;
  }
  if (conferencia.conflitos.length > 0) {
    console.log("\nRecusado: há cadastro de verdade com um dado da demonstração. Nada foi gravado.");
    for (const x of conferencia.conflitos) console.log(`  - ${x}`);
    process.exitCode = 1;
    return;
  }

  const c = contagemDoPlano(plano);
  console.log(`\n--- ${aplicar ? "gravando" : ensaio ? "ensaio (grava e desfaz)" : "simulação: nada foi gravado"}. O que ${aplicar ? "entra" : "entraria"}: ---\n`);
  for (const linha of [
    `${c.empresas} empresas [demo]: ${plano.empresas.map((e) => e.displayName.replace(`${MARCA} `, "")).join(", ")} — matriz e duas filiais`,
    `1 acesso do portal (${plano.acessoDoPortal.email}, senha que ninguém conhece) ligado à matriz com as filiais, alçada de aprovação`,
    `${c.categorias} categorias, ${c.centros} centros de custo e ${c.contrapartes} contrapartes, todos de cada empresa (nada no plano do escritório; nenhuma contraparte com e-mail)`,
    `${c.contas} contas bancárias, ${c.extratos} extratos mensais, ${c.transacoes} transações (${c.conciliadas} conciliadas)`,
    `${c.lancamentos} lançamentos de ${plano.meses[0]} até dois meses à frente: ${c.pagos} pagos, ${c.emAberto} em aberto`,
    `aprovações, cobrança (acordo e contatos, régua desligada nas três empresas), orçamento ${plano.orcamentos[0]!.ano} aprovado da matriz`,
    `${c.pendencias} pedidos ao cliente, ${c.solicitacoes} solicitações do portal, 1 comunicado, conversa com o cliente`,
    `${c.emissoes} NFS-e no histórico (só estados finais; a integração do Omie da matriz entra sem chave, nada chama o Omie)`,
    `${cifrar ? c.senhas : 0} senhas no cofre (texto fictício, cifrado), 1 manual com ${c.paginasDoManual} páginas`,
    `${c.equipe} pessoas fictícias na equipe do BPO ("[demo]", contas inativas e sem senha), com cards em aberto — para o Meu time`,
    `quadro [demo] do BPO com ${c.cards} cards (subtarefas, checklist, comentários, horas), ${c.reunioes} reuniões (sem evento no Google), ${c.pastas} pastas nos Arquivos (sem arquivos), ${c.avisos} notificações para quem apresenta`,
  ])
    console.log(`  ${linha}`);
  console.log("\nAs situações do roteiro:");
  for (const s of situacoesDoPlano(plano)) console.log(`  - ${s}`);

  if (!aplicar && !ensaio) {
    console.log("\nPróximo passo: --ensaio (grava e desfaz). Depois, --aplicar.\n");
    return;
  }

  const pessoas = { apresentador: apresentador.id, outro: outro?.id ?? null };
  if (ensaio) {
    try {
      await p.$transaction(async (tx) => {
        await gravarDemonstracaoDoBpo(tx, tenant.id, plano, pessoas, agora, cifrar);
        throw new Error(ENSAIO_DA_GRAVACAO);
      }, TRANSACAO);
    } catch (err) {
      const ok = err instanceof Error && err.message === ENSAIO_DA_GRAVACAO;
      console.log(ok ? `\n${ENSAIO_DA_GRAVACAO}.\n` : `\nensaio falhou — nada foi gravado: ${err}\n`);
      if (!ok) process.exitCode = 1;
    }
    return;
  }

  const r = await p.$transaction(async (tx) => {
    // De novo, dentro da transação: outra execução pode ter gravado no meio tempo.
    const agoraConf = await conferirAntesDeCriar(tx, tenant.id, plano);
    if (agoraConf.jaExiste.length > 0 || agoraConf.conflitos.length > 0) {
      throw new Error("a demonstração (ou um dado dela) apareceu no escritório enquanto o script rodava — nada foi gravado.");
    }
    return gravarDemonstracaoDoBpo(tx, tenant.id, plano, pessoas, agora, cifrar);
  }, TRANSACAO);

  console.log(`\nPronto. A matriz: /empresas/${r.idDaMatriz}`);
  console.log(`Solicitações nº ${r.numerosDasSolicitacoes.join(", ")}${r.assuntoCriado ? " (num assunto [demo] inativo: o escritório não tinha assunto do BPO)" : ""}.`);
  console.log("Nas telas do BPO, escolha a empresa \"[demo] Padaria Pão de Ouro\" no seletor. O quadro está em Quadros › BPO.");
  console.log("Meu time: com o setor BPO ativo, Meu dia › Meu time mostra a carga da equipe fictícia.");
  // A tela só manda o link de senha por e-mail, e o e-mail do acesso é fictício: o caminho é trocar por um real só para receber o link.
  console.log("Para entrar no portal como o cliente: em Administração › Portal do cliente, edite o acesso [demo], troque o e-mail por um seu,");
  console.log("clique em Enviar link, defina a senha pelo e-mail e volte o e-mail para o fictício. A senha continua valendo.");
  console.log("\nNão edite as reuniões [demo] na Agenda: o evento no Google não existe, e a edição tentaria mexer nele.");
  console.log("\nPara tirar tudo depois da apresentação: --limpar (→ --ensaio → --aplicar).\n");
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
