// Órgãos e roteiros do setor Societário, como dado.
//
//   npx tsx --env-file=.env scripts/seed-societario.ts            # dry-run
//   npx tsx --env-file=.env scripts/seed-societario.ts --aplicar
//
// O conteúdo sai do fluxograma que o setor montou (docs/fluxos/societario.html):
// as etapas estão na ordem e com o vocabulário dele.
//
// ─── Isto é padrão, não verdade ──────────────────────────────────────────────
//
// Roda por tenant e grava dado editável. Outro escritório tem outra sequência,
// outros órgãos e outro prazo — e vai alterar tudo isto pela tela, sem tocar em
// código. É o que separa "o Connect da 41" de um produto.
//
// ─── O que este arquivo prova ────────────────────────────────────────────────
//
// Constituição e Alteração Contratual têm o **mesmo roteiro**, etapa por etapa,
// e diferem só no nome e no prazo. Elas estão declaradas aqui compartilhando a
// mesma lista (`ROTEIRO_REGISTRO`) — se em algum momento uma delas precisar de
// caso especial no código, o motor está errado e é hora de voltar ao desenho.
//
// Idempotente: procura por código antes de criar, e não recria template que já
// existe. Rodar duas vezes não duplica nada.

import { getPrisma } from "../src/lib/prisma";
import type { ProcessActor } from "../src/generated/prisma/enums";

const aplicar = process.argv.includes("--aplicar");

// ─── Órgãos ──────────────────────────────────────────────────────────────────
//
// Seis, e é por isso que órgão é tabela: o fluxo da Baixa introduz a prefeitura
// e o do alvará traz mais três. Enum com "Junta" e "Receita" morreria no
// terceiro processo.
const ORGAOS = [
  { name: "Junta Comercial", acronym: "JUCEPAR" },
  { name: "Receita Federal", acronym: "RFB" },
  { name: "Prefeitura", acronym: "PM" },
  { name: "Corpo de Bombeiros", acronym: "CB" },
  { name: "Meio Ambiente", acronym: "MA" },
  { name: "Vigilância Sanitária", acronym: "VISA" },
];

type EtapaSeed = {
  label: string;
  description?: string;
  actor: ProcessActor;
  organ?: string;
  position: number;
  parallelGroup?: string;
  optional?: boolean;
  items?: string[];
};

// ─── O roteiro de registro ───────────────────────────────────────────────────
//
// Serve Constituição e Alteração Contratual sem uma linha de diferença. A
// etapa 6 é onde o robô observador entra: hoje alguém abre o site do órgão todo
// dia para saber se saiu.
const ROTEIRO_REGISTRO: EtapaSeed[] = [
  { position: 1, label: "Reunir documentação", actor: "PESSOA" },
  { position: 2, label: "Viabilidade", actor: "INTEGRACAO", organ: "Junta Comercial" },
  { position: 3, label: "Elaboração da minuta", actor: "PESSOA" },
  { position: 4, label: "Sistemas da Junta", actor: "INTEGRACAO", organ: "Junta Comercial" },
  { position: 5, label: "Sistemas da Receita", actor: "INTEGRACAO", organ: "Receita Federal" },
  {
    position: 6,
    label: "Acompanhamento do registro",
    description:
      "O desfecho não é digitado aqui: ele vem do protocolo. Deferido segue para a etapa 7; exigência devolve o processo para ajuste e reapresentação, e a volta fica contada.",
    actor: "ROBO",
    organ: "Junta Comercial",
  },
  { position: 7, label: "Licenciamentos, cadastros, senhas e vínculos", actor: "PESSOA" },
  { position: 8, label: "Procurações Receita Federal", actor: "PESSOA" },
  { position: 9, label: "Cadastro e comunicação interna", actor: "PESSOA" },
  { position: 10, label: "Envio de documentação ao cliente", actor: "ROBO" },
];

const ROTEIRO_BAIXA: EtapaSeed[] = [
  { position: 1, label: "Reunir documentação", actor: "PESSOA" },
  {
    position: 2,
    label: "Levantamento de débitos",
    description: "Exclusiva da baixa, e forte candidata a robô.",
    actor: "ROBO",
  },
  { position: 3, label: "Elaboração da minuta", actor: "PESSOA" },
  { position: 4, label: "Sistemas da Junta", actor: "INTEGRACAO", organ: "Junta Comercial" },
  { position: 5, label: "Sistemas da Receita", actor: "INTEGRACAO", organ: "Receita Federal" },
  { position: 6, label: "Acompanhamento do registro", actor: "ROBO", organ: "Junta Comercial" },
  { position: 7, label: "Baixa municipal na Prefeitura", actor: "INTEGRACAO", organ: "Prefeitura" },
  { position: 8, label: "Cadastro e comunicação interna", actor: "PESSOA" },
  { position: 9, label: "Envio de documentação ao cliente", actor: "ROBO" },
];

// ─── O alvará ────────────────────────────────────────────────────────────────
//
// As três licenças dividem a posição 4: correm ao mesmo tempo, independentes, e
// nem toda empresa precisa das três — por isso `optional`. É o caso que uma
// lista ordenada não expressa, e o motor resolve sem caso especial.
const ROTEIRO_ALVARA: EtapaSeed[] = [
  { position: 1, label: "Reunir informações da empresa, atividade e imóvel", actor: "PESSOA" },
  { position: 2, label: "Emissão da taxa / protocolo", actor: "INTEGRACAO", organ: "Prefeitura" },
  { position: 3, label: "Qual licença é necessária?", actor: "PESSOA" },
  {
    position: 4,
    parallelGroup: "Licenças",
    optional: true,
    label: "Corpo de Bombeiros",
    actor: "INTEGRACAO",
    organ: "Corpo de Bombeiros",
    items: [
      "Análise de risco",
      "Documentação e exigências técnicas",
      "Vistoria, quando aplicável",
      "Emissão / regularização",
    ],
  },
  {
    position: 4,
    parallelGroup: "Licenças",
    optional: true,
    label: "Meio Ambiente",
    actor: "INTEGRACAO",
    organ: "Meio Ambiente",
    items: [
      "Análise da atividade e impacto",
      "Protocolos e documentos específicos",
      "Exigências complementares",
      "Licença / declaração ambiental",
    ],
  },
  {
    position: 4,
    parallelGroup: "Licenças",
    optional: true,
    label: "Vigilância Sanitária",
    actor: "INTEGRACAO",
    organ: "Vigilância Sanitária",
    items: [
      "Documentação do estabelecimento",
      "Responsável técnico, quando aplicável",
      "Vistoria e adequações",
      "Liberação sanitária",
    ],
  },
  { position: 5, label: "Acompanhamento até deferimento", actor: "ROBO" },
  { position: 6, label: "Cadastro / comunicação interna", actor: "PESSOA" },
  { position: 7, label: "Envio ao cliente", actor: "ROBO" },
];

const TIPOS = [
  {
    code: "constituicao",
    name: "Constituição",
    expectedDaysMin: 4,
    expectedDaysMax: 7,
    variableFlow: false,
    roteiro: ROTEIRO_REGISTRO,
  },
  {
    code: "alteracao_contratual",
    name: "Alteração Contratual",
    description:
      "Endereço, nome empresarial, sócios, atividades e CNAEs, capital social, cláusulas e administração.",
    expectedDaysMin: 7,
    expectedDaysMax: 15,
    variableFlow: false,
    // A mesma lista da Constituição. Nenhuma diferença, de propósito.
    roteiro: ROTEIRO_REGISTRO,
  },
  {
    code: "baixa",
    name: "Baixa",
    expectedDaysMin: 5,
    expectedDaysMax: 5,
    variableFlow: false,
    roteiro: ROTEIRO_BAIXA,
  },
  {
    code: "alvara",
    name: "Alvará de Funcionamento e Licenças",
    description: "Processo moroso e de fluxo variável. Cada licença tem particularidades próprias.",
    expectedDaysMin: null,
    expectedDaysMax: null,
    // O setor declara sem prazo médio — a tela não deve prometer previsão.
    variableFlow: true,
    roteiro: ROTEIRO_ALVARA,
  },
];

async function main() {
  const prisma = getPrisma();
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`${tenants.length} tenant(s)\n`);

  for (const tenant of tenants) {
    console.log(`── ${tenant.name}`);

    // ---- órgãos ----
    const organIdPorNome = new Map<string, string>();
    for (const o of ORGAOS) {
      const existente = await prisma.processOrgan.findUnique({
        where: { tenantId_name: { tenantId: tenant.id, name: o.name } },
        select: { id: true },
      });
      if (existente) {
        organIdPorNome.set(o.name, existente.id);
        console.log(`   órgão  ${o.name} — já existe`);
        continue;
      }
      if (!aplicar) {
        console.log(`   órgão  ${o.name} — criaria`);
        continue;
      }
      const criado = await prisma.processOrgan.create({
        data: { tenantId: tenant.id, name: o.name, acronym: o.acronym },
        select: { id: true },
      });
      organIdPorNome.set(o.name, criado.id);
      console.log(`   órgão  ${o.name} — criado`);
    }

    // ---- tipos e roteiros ----
    for (const t of TIPOS) {
      const tipoExistente = await prisma.processType.findUnique({
        where: { tenantId_code: { tenantId: tenant.id, code: t.code } },
        select: { id: true },
      });

      if (tipoExistente) {
        console.log(`   tipo   ${t.name} — já existe, roteiro não recriado`);
        continue;
      }
      if (!aplicar) {
        console.log(`   tipo   ${t.name} — criaria com ${t.roteiro.length} etapas`);
        continue;
      }

      // Tipo, template v1 e etapas numa transação: template publicado sem
      // etapa nenhuma seria oferecido na tela e abriria processo vazio.
      await prisma.$transaction(
        async (tx) => {
          const tipo = await tx.processType.create({
            data: {
              tenantId: tenant.id,
              code: t.code,
              name: t.name,
              description: t.description ?? null,
              expectedDaysMin: t.expectedDaysMin,
              expectedDaysMax: t.expectedDaysMax,
              variableFlow: t.variableFlow,
            },
            select: { id: true },
          });

          const template = await tx.processTemplate.create({
            data: { tenantId: tenant.id, typeId: tipo.id, version: 1, published: true },
            select: { id: true },
          });

          for (const etapa of t.roteiro) {
            const passo = await tx.processTemplateStep.create({
              data: {
                tenantId: tenant.id,
                templateId: template.id,
                position: etapa.position,
                label: etapa.label,
                description: etapa.description ?? null,
                parallelGroup: etapa.parallelGroup ?? null,
                expectedActor: etapa.actor,
                organId: etapa.organ ? organIdPorNome.get(etapa.organ) ?? null : null,
                optional: etapa.optional ?? false,
              },
              select: { id: true },
            });

            for (const [i, item] of (etapa.items ?? []).entries()) {
              await tx.processTemplateChecklistItem.create({
                data: {
                  tenantId: tenant.id,
                  stepId: passo.id,
                  position: i + 1,
                  label: item,
                },
              });
            }
          }
        },
        // A latência até o banco já estourou os 5s padrão num script deste
        // repositório antes; aqui são dezenas de inserções.
        { timeout: 60_000, maxWait: 30_000 }
      );
      console.log(`   tipo   ${t.name} — criado com ${t.roteiro.length} etapas`);
    }
    console.log("");
  }

  if (!aplicar) {
    console.log("dry-run — nada foi gravado. Rode com --aplicar.");
  }
}

main();
