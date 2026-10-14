// Prévia do portal por empresa — SÓ LEITURA. Não grava nada.
//
//   npx tsx --env-file=.env scripts/previa-portal-por-empresa.ts            # resumo e o que muda
//   npx tsx --env-file=.env scripts/previa-portal-por-empresa.ts --todas    # também as contas que não mudam
//
// Rodar DEPOIS da entrada em produção (15/10) e ANTES de juntar o PR do portal
// por empresa (etapa 2 da saída do Cliente). Ordem: esta prévia → juntar →
// `npx prisma migrate deploy` → deploy.
//
// O que a migration `20261014210000_portal_por_empresa` vai fazer, e esta
// prévia mostra antes, escritório por escritório:
//
// 1. Cada acesso do portal deixa de ver "as empresas do cliente dele" e passa a
//    ver as empresas ligadas direto a ele: a migration liga TODAS as empresas
//    do cliente da conta, com "incluir filiais". Para cada conta:
//    empresas que vê hoje × empresas que verá depois.
//    - GANHA: filiais (em operação) de uma empresa do cliente que não estavam
//      no cliente — com "incluir filiais", elas passam a aparecer.
//    - PERDERIA: não pode acontecer. Se aparecer alguma, NÃO junte o PR e
//      avise: a regra precisa de ajuste antes.
// 2. Os comunicados antigos ficam com as empresas dos clientes que os
//    receberam (quantas linhas a migration cria).
// 3. O SPED fica com exatamente as raízes que sincroniza hoje (clientes ativos
//    com raiz de 8 caracteres) — a lista sai aqui.
//
// A conta "hoje × depois" usa as MESMAS funções que o Connect e a migration
// usam (`src/lib/portal/empresasDaConta.ts`, `src/lib/comunicados/regras.ts`,
// `src/lib/sped/raizesSincronizadas.ts`), e lê só tabelas que já existem antes
// da migration.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { nomeExibicao } from "../src/lib/companyName";
import { empresasPeloCliente, idsDasEmpresasDaConta, ligacoesDoPreenchimento } from "../src/lib/portal/empresasDaConta";
import { empresasDoComunicadoAntigo } from "../src/lib/comunicados/regras";
import { fotografiaDasRaizes, raizesPelosClientes } from "../src/lib/sped/raizesSincronizadas";

const todas = process.argv.includes("--todas");

type Empresa = {
  id: string;
  tenantId: string;
  name: string;
  displayName: string | null;
  parentCompanyId: string | null;
  status: "PROSPECT" | "ACTIVE" | "INACTIVE" | "CHURNED";
  clientGroupId: string | null;
};

const STATUS: Record<Empresa["status"], string> = { PROSPECT: "prospecto", ACTIVE: "ativa", INACTIVE: "inativa", CHURNED: "cancelada" };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  try {
    const [tenants, contas, empresas, clientes, comunicados, destinos] = await Promise.all([
      prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.portalUser.findMany({
        select: { id: true, tenantId: true, name: true, email: true, active: true, clientGroupId: true },
        orderBy: { name: "asc" },
      }),
      prisma.company.findMany({
        select: { id: true, tenantId: true, name: true, displayName: true, parentCompanyId: true, status: true, clientGroupId: true },
      }) as Promise<Empresa[]>,
      prisma.clientGroup.findMany({ select: { id: true, tenantId: true, name: true, cnpjRoot: true, active: true } }),
      prisma.clientAnnouncement.findMany({ select: { id: true, tenantId: true } }),
      prisma.clientAnnouncementGroup.findMany({ select: { announcementId: true, clientGroupId: true } }),
    ]);

    const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, nomeExibicao(e)]));
    const porId = new Map(empresas.map((e) => [e.id, e]));
    const nomeDoCliente = new Map(clientes.map((c) => [c.id, c.name]));
    const rotulo = (id: string) => {
      const e = porId.get(id);
      const situacao = e && e.status !== "ACTIVE" ? ` (${STATUS[e.status]})` : "";
      return `${nomeDaEmpresa.get(id) ?? id}${situacao}`;
    };

    let totalContas = 0;
    let contasQueGanham = 0;
    let contasQuePerdem = 0;
    let ligacoes = 0;
    let linhasDeComunicado = 0;

    console.log("\n=== PRÉVIA DO PORTAL POR EMPRESA (só leitura — nada foi gravado) ===");

    for (const t of tenants) {
      const daqui = contas.filter((c) => c.tenantId === t.id);
      const empresasDaqui = empresas.filter((e) => e.tenantId === t.id);
      const clientesDaqui = clientes.filter((c) => c.tenantId === t.id);
      const comunicadosDaqui = comunicados.filter((c) => c.tenantId === t.id);
      const raizes = fotografiaDasRaizes(clientesDaqui).map((r) => r.cnpjRaiz);
      if (daqui.length === 0 && comunicadosDaqui.length === 0 && raizes.length === 0) continue;

      console.log(`\n────────────────────────────────────────────────────────────────`);
      console.log(`ESCRITÓRIO: ${t.name}`);
      console.log(`  acessos do portal: ${daqui.length} (${daqui.filter((c) => c.active).length} ativos)`);

      for (const conta of daqui) {
        totalContas++;
        const novas = ligacoesDoPreenchimento(conta, empresas);
        ligacoes += novas.length;
        const hoje = empresasPeloCliente(conta, empresas);
        const depois = idsDasEmpresasDaConta(t.id, novas, empresasDaqui);
        const ganha = depois.filter((id) => !hoje.includes(id));
        const perde = hoje.filter((id) => !depois.includes(id));
        if (ganha.length) contasQueGanham++;
        if (perde.length) contasQuePerdem++;
        if (!todas && ganha.length === 0 && perde.length === 0) continue;

        const cliente = conta.clientGroupId ? (nomeDoCliente.get(conta.clientGroupId) ?? conta.clientGroupId) : "sem cliente";
        console.log(`\n  • ${conta.name} <${conta.email}>${conta.active ? "" : " — DESATIVADO"} · cliente ${cliente}`);
        console.log(`    hoje vê ${hoje.length} · depois verá ${depois.length}`);
        if (todas) for (const id of hoje) console.log(`      = ${rotulo(id)}`);
        for (const id of ganha) {
          const matriz = porId.get(id)?.parentCompanyId;
          console.log(`      + GANHA ${rotulo(id)}${matriz ? ` — filial de ${rotulo(matriz)}` : ""}`);
        }
        for (const id of perde) console.log(`      ! PERDERIA ${rotulo(id)}`);
      }

      const semEmpresa = daqui.filter((c) => empresasPeloCliente(c, empresas).length === 0);
      if (semEmpresa.length > 0) {
        console.log(`\n  Acessos que hoje não veem empresa nenhuma (continuam sem ver nada depois):`);
        for (const c of semEmpresa) console.log(`    - ${c.name} <${c.email}>${c.active ? "" : " — desativado"}`);
      }

      // Comunicados antigos: as empresas dos clientes que receberam.
      let linhasDaqui = 0;
      for (const c of comunicadosDaqui) {
        const grupos = destinos.filter((d) => d.announcementId === c.id).map((d) => d.clientGroupId);
        linhasDaqui += empresasDoComunicadoAntigo(t.id, grupos, empresas).length;
      }
      linhasDeComunicado += linhasDaqui;
      console.log(`\n  comunicados antigos: ${comunicadosDaqui.length} → ${linhasDaqui} destinatários por empresa`);

      // SPED: a fotografia é a regra de hoje.
      const hojeSped = raizesPelosClientes(clientesDaqui).sort();
      const depoisSped = [...raizes].sort();
      const iguais = hojeSped.length === depoisSped.length && hojeSped.every((r, i) => r === depoisSped[i]);
      console.log(`  SPED: ${depoisSped.length} raízes${iguais ? " (as mesmas de hoje)" : " — DIFERENTE DE HOJE, avise antes de juntar"}`);
      if (todas || !iguais) for (const r of depoisSped) console.log(`    ${r.slice(0, 2)}.${r.slice(2, 5)}.${r.slice(5, 8)}`);
    }

    console.log(`\n================================================================`);
    console.log(`acessos do portal          : ${totalContas}`);
    console.log(`ligações que a migration cria: ${ligacoes}`);
    console.log(`acessos que ganham empresa : ${contasQueGanham} (filiais em operação que não estavam no cliente)`);
    console.log(`acessos que perderiam      : ${contasQuePerdem}`);
    console.log(`destinatários de comunicado: ${linhasDeComunicado}`);
    console.log(
      contasQuePerdem === 0
        ? "\nNinguém perde empresa. Pode seguir: juntar o PR → migrate deploy → deploy."
        : "\nATENÇÃO: há acesso que perderia empresa. NÃO junte o PR — mande esta saída para revisão."
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
