// Traz Chatwoot e SPED para a forma de `TenantIntegration`.
//
//   npx tsx --env-file=.env scripts/converger-integracoes.ts            # dry-run
//   npx tsx --env-file=.env scripts/converger-integracoes.ts --aplicar
//
// ── O que ele faz, e o que NÃO faz ──────────────────────────────────────────
//
// **Copia. Não move.** Cria a linha em `TenantIntegration` com as credenciais,
// e aponta `ChatwootConnection.integrationId` / `SpedSyncState.integrationId`
// para ela. As colunas antigas **continuam sendo a fonte** que o código lê.
//
// Isso é deliberado. Converger de uma vez — criar a linha nova, religar os
// leitores e apagar as colunas velhas no mesmo passo — é como se derruba a
// autenticação de uma integração que está no ar, sem caminho de volta. Aqui
// cada passo é reversível:
//
//   1. migration `20260912020000` acrescenta a coluna, nula. Nada muda.
//   2. este script preenche. Nada ainda lê de lá.
//   3. alguém confere as linhas na tela de integrações.
//   4. só então os leitores passam a preferir a integração, com fallback.
//   5. e só depois as colunas antigas saem.
//
// Rodar este script duas vezes é seguro: ele pula o que já tem `integrationId`.
//
// ── Por que o cofre do BPO não está aqui ────────────────────────────────────
//
// `BpoCredential` não é integração. É cofre de senha que **pessoa lê**, com
// registro de quem olhou (`BpoCredentialView`), na tela `/bpo-senhas`. O
// Connect não autentica nada com ele. Trazê-lo para `TenantIntegration`
// misturaria "o app fala com este sistema" com "guarde esta senha para alguém
// usar" — e a diferença entre os dois é exatamente quem pode ver o segredo.

import { getPrisma } from "../src/lib/prisma";
import { encryptSecret, decryptSecret } from "../src/lib/crypto";

const aplicar = process.argv.includes("--aplicar");

type Plano = {
  tenantId: string;
  code: string;
  instanceKey: string;
  label: string | null;
  config: Record<string, string>;
  /** Linhas que vão apontar para esta integração. */
  chatwootIds: string[];
  spedIds: string[];
  /** Campos obrigatórios que não deu para preencher. */
  faltando: string[];
};

async function main() {
  const prisma = getPrisma();
  const planos: Plano[] = [];

  // ─── Chatwoot: uma integração por conta ───────────────────────────────────
  //
  // O `accountId` vira `instanceKey`, porque é exatamente o que ele significa:
  // um cliente pode ter mais de uma conta do Chatwoot, uma por setor, e o
  // schema já dizia isso no comentário do unique.
  const conexoes = await prisma.chatwootConnection.findMany({
    where: { integrationId: null },
    select: {
      id: true,
      tenantId: true,
      baseUrl: true,
      accountId: true,
      apiTokenEnc: true,
      webhookSecretEnc: true,
      active: true,
    },
  });

  for (const c of conexoes) {
    let apiToken = "";
    let webhookSecret = "";
    const faltando: string[] = [];
    try {
      apiToken = decryptSecret(c.apiTokenEnc);
    } catch {
      // Segredo que não decifra é chave de criptografia trocada, e copiar o
      // texto cifrado para a linha nova só levaria o problema junto.
      faltando.push("Token de acesso (não decifrou)");
    }
    try {
      webhookSecret = decryptSecret(c.webhookSecretEnc);
    } catch {
      faltando.push("Segredo do webhook (não decifrou)");
    }

    planos.push({
      tenantId: c.tenantId,
      code: "chatwoot",
      instanceKey: c.accountId,
      label: `Conta ${c.accountId}`,
      config: { baseUrl: c.baseUrl, accountId: c.accountId, apiToken, webhookSecret },
      chatwootIds: [c.id],
      spedIds: [],
      faltando,
    });
  }

  // ─── SPED: uma integração por tenant ──────────────────────────────────────
  //
  // Diferente do Chatwoot, aqui **não há credencial no banco**: ela vive no
  // `.env` do servidor, que é o bloqueio de produtização registrado desde
  // 10/09 — a chave é de quem hospeda, e a conta também. Este script é onde
  // ela passa a ser por cliente.
  //
  // Sem a env, a integração é criada mesmo assim, **desligada e incompleta**,
  // com os campos faltando nomeados. É melhor que não criar: a tela passa a
  // mostrar "SPED, falta o token", que é acionável, em vez de não mostrar nada.
  const estados = await prisma.spedSyncState.findMany({
    where: { integrationId: null },
    select: { id: true, tenantId: true },
  });

  const spedPorTenant = new Map<string, string[]>();
  for (const e of estados) {
    const lista = spedPorTenant.get(e.tenantId) ?? [];
    lista.push(e.id);
    spedPorTenant.set(e.tenantId, lista);
  }

  // Os nomes vêm de `src/lib/sped/client.ts`, que é quem os lê hoje. Escrevi
  // outros de memória na primeira versão e o dry-run acusou "falta o token"
  // num ambiente que tinha os dois — o tipo de erro que faz alguém sair
  // procurando uma env que já estava lá.
  const baseUrl = process.env.SPED_API_URL?.replace(/\/+$/, "") ?? "";
  const serviceToken = process.env.SPED_API_TOKEN ?? "";

  for (const [tenantId, ids] of spedPorTenant) {
    const faltando: string[] = [];
    if (!baseUrl) faltando.push("URL do SPED");
    if (!serviceToken) faltando.push("Token de serviço");
    planos.push({
      tenantId,
      code: "sped",
      instanceKey: "default",
      label: null,
      config: { baseUrl, serviceToken },
      chatwootIds: [],
      spedIds: ids,
      faltando,
    });
  }

  // ─── Relatório ────────────────────────────────────────────────────────────
  console.log(aplicar ? "APLICANDO\n" : "DRY-RUN — nada será gravado\n");
  if (planos.length === 0) {
    console.log("Nada a convergir: todas as linhas já apontam para uma integração.");
    return;
  }

  for (const p of planos) {
    const alvo = p.chatwootIds.length + p.spedIds.length;
    console.log(
      `  ${p.code.padEnd(10)} tenant ${p.tenantId.slice(0, 8)} · instância "${p.instanceKey}" · ${alvo} linha(s)` +
        (p.faltando.length > 0 ? `  ⚠ falta: ${p.faltando.join(", ")}` : "")
    );
  }
  console.log(`\n${planos.length} integração(ões) a criar ou reaproveitar.`);
  const incompletas = planos.filter((p) => p.faltando.length > 0).length;
  if (incompletas > 0) {
    console.log(
      `${incompletas} nascerão DESLIGADAS e incompletas — alguém precisa completar em Integrações.`
    );
  }

  if (!aplicar) {
    console.log("\nRode com --aplicar para gravar.");
    return;
  }

  // ─── Gravação ─────────────────────────────────────────────────────────────
  let criadas = 0;
  let religadas = 0;

  for (const p of planos) {
    await prisma.$transaction(
      async (tx) => {
        // `upsert` pelo unique (tenant, código, instância): rodar duas vezes
        // não cria duplicata, e uma integração que já existia é reaproveitada
        // em vez de sobrescrita — quem já configurou à mão não perde o que fez.
        const existente = await tx.tenantIntegration.findUnique({
          where: {
            tenantId_integrationCode_instanceKey: {
              tenantId: p.tenantId,
              integrationCode: p.code,
              instanceKey: p.instanceKey,
            },
          },
          select: { id: true },
        });

        let integrationId: string;
        if (existente) {
          integrationId = existente.id;
        } else {
          const nova = await tx.tenantIntegration.create({
            data: {
              tenantId: p.tenantId,
              integrationCode: p.code,
              instanceKey: p.instanceKey,
              label: p.label,
              // Nasce desligada mesmo quando a origem estava ativa: ligar é
              // ato deliberado, e enquanto os leitores não migrarem, ligar aqui
              // não faz nada além de sugerir que faz.
              enabled: false,
              configEnc: encryptSecret(JSON.stringify(p.config)),
            },
            select: { id: true },
          });
          integrationId = nova.id;
          criadas++;
        }

        if (p.chatwootIds.length > 0) {
          await tx.chatwootConnection.updateMany({
            where: { id: { in: p.chatwootIds } },
            data: { integrationId },
          });
        }
        if (p.spedIds.length > 0) {
          await tx.spedSyncState.updateMany({
            where: { id: { in: p.spedIds } },
            data: { integrationId },
          });
        }
        religadas += p.chatwootIds.length + p.spedIds.length;
      },
      { timeout: 60_000, maxWait: 30_000 }
    );
  }

  console.log(`\nCriadas ${criadas} integração(ões); ${religadas} linha(s) religada(s).`);
  console.log(
    "As colunas antigas continuam sendo a fonte. Confira em /admin/integracoes antes do passo seguinte."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
