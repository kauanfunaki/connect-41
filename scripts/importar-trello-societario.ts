// Importa o quadro "PROCESSOS SOCIETÁRIOS" do Trello para os processos do
// Societário no Connect.
//
//   npx tsx --env-file=.env scripts/importar-trello-societario.ts --arquivo <export.json> --escritorio <slug>            (prévia)
//   npx tsx --env-file=.env scripts/importar-trello-societario.ts --arquivo <export.json> --escritorio <slug> --aplicar  (grava)
//
// Opções:
//   --concluidos        traz também a lista CONCLUÍDOS, como histórico
//   --arquivados        traz também a lista ARQUIVADO e os cartões arquivados no Trello
//   --prazos-vencidos   o `due` que já passou também vira prazo combinado
//   --titulo-do-cartao  o assunto do cartão vira o título do processo (o CLIENTE VÊ o título no portal)
//   --vinculos <arq>    resolve à mão o que a prévia não casou (formato em `lerVinculos`)
//   --listar            a prévia lista todos os cartões, um por linha
//
// Sem `--escritorio`, lista os escritórios. **Prévia é o padrão**: sem
// `--aplicar` só há SELECT. Quem roda contra a produção é o Kauan.
//
// Por que existe: o setor registra os processos no Trello, não no Connect — a
// fila, os relatórios e o portal do cliente estão vazios, e o setor começa a
// usar o Connect em 12/10. As regras estão em `src/lib/societario/importar-trello.ts`,
// com testes; aqui é só ler o banco, mostrar e gravar.
//
// ─── O que o Trello tem (export de 06/10/2026) ───────────────────────────────
//
// 358 cartões em 13 listas. Título no padrão "EMPRESA | Assunto (número)" em
// 346 deles; o número entre parênteses é a referência interna do setor, não
// protocolo de órgão. As 6 etiquetas só têm cor e nenhum cartão as usa — ficam
// de fora. Checklists (39) são o roteiro que cada analista copia do "MODELO
// CHECK LIST" e marca; comentários são o andamento ("protocolado", "aguardando
// assinatura do Edson") e trazem números de viabilidade, DBE e REDESIM
// misturados. O export só traz as 1000 últimas ações (10/09 a 06/10): comentário
// mais antigo fica no cartão. Membros: as duas analistas do setor e quem pediu.
//
// ─── Lista → etapa e situação ────────────────────────────────────────────────
//
//   INICIAR                          nenhuma etapa começada                        Em andamento
//   VERIFICAÇÕES INICIAIS            1ª etapa (reunir documentação)                Em andamento
//   VIABILIDADE                      etapa "Viabilidade"                           Em andamento
//   ELABORAÇÃO MINUTA                etapa da minuta                               Em andamento
//   MINUTA EM VALIDAÇÃO INTERNA      etapa da minuta                               Em andamento
//   VALIDAÇÃO DO CLIENTE             etapa da minuta                               Aguardando cliente ("Validação da minuta pelo cliente")
//   AGUARDANDO ASSINATURA            etapa seguinte à minuta                       Aguardando cliente ("Assinatura do cliente")
//   EM ANÁLISE COM ÓRGÃO             "Acompanhamento do registro" + protocolo      Aguardando o órgão (derivado do protocolo)
//                                    aguardando na Junta, sem número
//   DEMANDAS INTERNAS (APÓS REGISTRO) "Cadastro e comunicação interna"             Em andamento
//   LICENCIAMENTO                    "Licenciamentos, cadastros, senhas e vínculos" Em andamento
//                                    (no Alvará: as três licenças juntas)
//   CONCLUÍDOS                       todas feitas                                  Concluído — só com --concluidos
//   ARQUIVADO / cartão arquivado     onde parou                                    Cancelado ("Encerrado antes do acompanhamento
//   / lista arquivada                                                              pelo portal"), ou Concluído se o cartão estava
//                                                                                  marcado como feito — só com --arquivados
//
// Tudo antes da etapa atual conta como feito; a etapa é achada pelo rótulo no
// roteiro do tipo, porque cada tipo tem o seu (a Baixa não tem viabilidade, o
// Alvará não tem minuta). Etapa de órgão que ficou para trás é concluída SEM
// protocolo — inventar protocolo poria volta onde ninguém contou volta. O motivo
// de "aguardando cliente" é texto nosso: `statusReason` aparece no portal.
//
// LICENCIAMENTO é processo, não licença: os cartões de lá são Constituição,
// Alteração de Endereço, Abertura de Filial… que já registraram e estão tirando
// alvará, bombeiros, inscrições — é a etapa 7 do roteiro de registro. Licença
// (`License`) é o documento emitido, com validade; o Trello não tem número nem
// vencimento de licença em campo nenhum, então não nasce `License` daqui.
//
// ─── Título → tipo de processo ───────────────────────────────────────────────
//
// Pelo assunto (o que vem depois do "|"), e vale o ato escrito primeiro:
// Constituição/Abertura → Constituição; Abertura de Filial, Alteração (QSA,
// CNAE, endereço, nome), Inclusão de CNAE, Transformação, Integralização →
// Alteração Contratual; Baixa, Distrato Social → Baixa; Alvará, Licença,
// Licenciamento, Bombeiros, VISA, Ambiental, ANTT → Alvará e Licenças;
// Fusão/Cisão/Incorporação → Reorganização; Sucessão/Saída de sócio → Distrato
// e Sucessão. Reativação, Certidões, Enquadramento, Declarações MEI/DASN →
// Regularização. Senha, acesso, procuração, cadastros e vínculos — demandas que
// não são ato societário — também viram Regularização, contadas à parte na
// prévia (decisão pendente: tipo próprio?). Sem palavra conhecida → fica de fora.
//
// ─── Cartão → empresa, membro → responsável ──────────────────────────────────
//
// Empresa: CNPJ no título; senão nome igual depois de normalizar (sem acento,
// sem LTDA/ME/EPP/EIRELI/S.A., sem MATRIZ/FILIAL nn) contra razão social,
// apelido e fantasia; senão o nome do título (duas palavras ou mais) é o começo
// do nome de UMA raiz de CNPJ; senão CNPJ na descrição com a primeira palavra
// batendo. Na Constituição, só CNPJ e nome igual — o título é o nome da empresa
// nova. Matriz e filiais com o mesmo nome: vai a filial do número do título,
// senão a matriz. Dois CNPJs diferentes com o mesmo nome → sem empresa. Sem
// empresa não entra (`Process.companyId` é obrigatório) e aparece na prévia com
// o shortLink e as empresas parecidas, para o arquivo de vínculos. Nunca cria
// empresa: a constituição em andamento pede o cadastro feito pelo setor, que
// depois casa pelo nome (ou pelo CNPJ, quando sair).
//
// Membro → usuário pelo nome (ou pelo apelido, quando o cadastro é só "Ruli" e
// o Trello é "ruli_machado"/"Ruliane"); responsável é quem é do setor do
// Societário, e entre duas, a que não coordena (a coordenação confere).
//
// ─── Datas, prazo e prioridade ───────────────────────────────────────────────
//
// Início = criação do cartão (está no id). Conclusão = quando foi para
// CONCLUÍDOS, se o export tem; senão quando foi marcado como feito; senão a
// última atividade. `due` futuro vira prazo combinado; vencido fica só nas
// observações — senão o alerta da Gestão avisaria "prazo vencido" de junho no
// dia seguinte. "Urgente" no título → prioridade alta (o cliente não vê).
//
// ─── Onde vai o texto do Trello ──────────────────────────────────────────────
//
// SÓ em `Process.notes`: descrição, checklists, comentários, membros, número
// interno e o link do cartão. O portal não lê `notes`; a tela do processo
// mostra as observações fechadas, só para a equipe. O título fica vazio (o
// portal mostra o título), a conversa com o cliente não recebe nada, e a linha
// com senha, login ou código de acesso escrito no cartão é omitida. Anexos não
// são baixados — o link do cartão está nas observações.
//
// ─── Idempotência e gravação ─────────────────────────────────────────────────
//
// A primeira linha das observações tem o link do cartão (trello.com/c/<shortLink>),
// e a prévia pula todo cartão cujo link já está nas observações de algum
// processo do escritório. Não há coluna de referência externa em `Process`, e
// nenhuma tela edita `notes` hoje — por isso o link basta, sem migration. Grava
// em lotes de 25 cartões, cada lote numa transação (processo, etapas, checklist
// e protocolo juntos), conferindo o link de novo dentro da transação.
//
// Nada daqui avisa ninguém: não há e-mail ao cliente (só a conversa avisa), nem
// notificação à equipe na criação. O que vem depois é o comportamento normal:
// o alerta "parado" da Gestão conta a partir de hoje (o `updatedAt` nasce agora).

import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { getPrisma } from "../src/lib/prisma";
import { setorDoModulo } from "../src/lib/modules";
import {
  CODIGOS_DOS_TIPOS,
  DESCRICAO_DA_FASE,
  URL_DO_CARTAO,
  cartoesJaImportados,
  formatarData,
  indexarEmpresas,
  lerQuadro,
  lerVinculos,
  planejarImportacao,
  type CartaoDeFora,
  type CodigoDoTipo,
  type Grupo,
  type ModeloDoTipo,
  type ProcessoPlanejado,
  type UsuarioParaCasar,
  type Vinculo,
} from "../src/lib/societario/importar-trello";

const MODULO = "societario_processos";
const LOTE = 25;

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const tem = (nome: string) => process.argv.includes(nome);

const log = (...partes: unknown[]) => console.log(...partes);

function conta<T>(itens: T[], chave: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const i of itens) m.set(chave(i), (m.get(chave(i)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);

const ROTULO_DO_GRUPO: Record<Grupo, string> = { aberto: "abertos", concluido: "concluídos", arquivado: "arquivados" };

const ROTULO_DO_CASAMENTO: Record<ProcessoPlanejado["casamento"], string> = {
  cnpj: "CNPJ no título",
  nome: "nome igual",
  prefixo: "começo do nome",
  cnpj_da_descricao: "CNPJ na descrição",
  vinculo: "arquivo de vínculos",
};

const ROTULO_DO_STATUS: Record<string, string> = {
  EM_ANDAMENTO: "em andamento",
  AGUARDANDO_CLIENTE: "aguardando cliente",
  AGUARDANDO_ORGAO: "aguardando o órgão",
  CONCLUIDO: "concluído",
  CANCELADO: "cancelado",
};

async function main() {
  const arquivo = argumento("--arquivo");
  const slug = argumento("--escritorio");
  const aplicar = tem("--aplicar");
  const opcoes = {
    concluidos: tem("--concluidos"),
    arquivados: tem("--arquivados"),
    prazosVencidos: tem("--prazos-vencidos"),
    tituloDoCartao: tem("--titulo-do-cartao"),
    agora: new Date(),
  };

  if (!arquivo) {
    console.error("Uso: npx tsx --env-file=.env scripts/importar-trello-societario.ts --arquivo <export.json> --escritorio <slug> [--aplicar]");
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(arquivo)) throw new Error(`Arquivo não encontrado: ${arquivo}`);

  const p = getPrisma();
  if (!slug) {
    const tenants = await p.tenant.findMany({ select: { slug: true, name: true }, orderBy: { name: "asc" } });
    log("Informe --escritorio <slug>. Escritórios:");
    for (const t of tenants) log(`  ${t.slug}  (${t.name})`);
    return;
  }
  const tenant = await p.tenant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`Escritório "${slug}" não encontrado.`);

  const quadro = lerQuadro(JSON.parse(fs.readFileSync(arquivo, "utf8")));

  let vinculos = new Map<string, Vinculo>();
  const arquivoDeVinculos = argumento("--vinculos");
  if (arquivoDeVinculos) {
    const lido = lerVinculos(fs.readFileSync(arquivoDeVinculos, "utf8"));
    if (lido.erros.length > 0) throw new Error(`Arquivo de vínculos com erro:\n  ${lido.erros.join("\n  ")}`);
    vinculos = lido.vinculos;
  }

  // ---- o escritório, só leitura ----
  const setor = (await setorDoModulo(tenant.id, MODULO)) ?? "societario";
  const [empresas, usuarios, tipos, jaNoConnect, totalDeProcessos] = await Promise.all([
    p.company.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, displayName: true, tradeName: true, cnpj: true, parentCompanyId: true },
    }),
    p.user.findMany({
      where: { tenantId: tenant.id, active: true },
      select: { id: true, name: true, email: true, role: true, sectors: { select: { sectorCode: true } } },
    }),
    p.processType.findMany({
      where: { tenantId: tenant.id, code: { in: [...CODIGOS_DOS_TIPOS] } },
      select: {
        id: true,
        code: true,
        name: true,
        templates: {
          where: { published: true },
          orderBy: { version: "desc" },
          take: 1,
          select: {
            id: true,
            version: true,
            steps: { select: { id: true, position: true, label: true, organId: true, items: { select: { id: true } } } },
          },
        },
      },
    }),
    p.process.findMany({ where: { tenantId: tenant.id, notes: { contains: "trello.com/c/" } }, select: { notes: true } }),
    p.process.count({ where: { tenantId: tenant.id } }),
  ]);

  const modelos = new Map<CodigoDoTipo, ModeloDoTipo>();
  const itensDaEtapa = new Map<string, string[]>();
  const versao = new Map<string, number>();
  for (const t of tipos) {
    const tpl = t.templates[0];
    if (!tpl || tpl.steps.length === 0) continue;
    modelos.set(t.code as CodigoDoTipo, {
      typeId: t.id,
      templateId: tpl.id,
      nome: t.name,
      roteiro: tpl.steps.map((s) => ({ id: s.id, position: s.position, label: s.label, organId: s.organId })),
    });
    versao.set(t.code, tpl.version);
    for (const s of tpl.steps) itensDaEtapa.set(s.id, s.items.map((i) => i.id));
  }

  const usuariosParaCasar: UsuarioParaCasar[] = usuarios.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    doSetor: u.sectors.some((s) => s.sectorCode === setor),
    // Quem não é usuário comum do setor coordena ou administra: confere, não executa.
    coordenador: u.role !== "SECTOR_USER",
  }));

  const plano = planejarImportacao(
    quadro,
    {
      empresas: indexarEmpresas(empresas),
      usuarios: usuariosParaCasar,
      modelos,
      jaImportados: cartoesJaImportados(jaNoConnect.map((x) => x.notes)),
      vinculos,
    },
    opcoes
  );

  imprimirPrevia({ arquivo, slug, tenantNome: tenant.name, setor, quadro, plano, opcoes, modelos, versao, empresas, usuarios: usuariosParaCasar, totalDeProcessos, aplicar });

  if (!aplicar) {
    log("\nNada foi gravado. Para gravar: acrescente --aplicar (com as mesmas opções).");
    return;
  }
  if (plano.processos.length === 0) {
    log("\nNada a gravar.");
    return;
  }

  // ---- gravação, em lotes ----
  let gravados = 0;
  let pulados = 0;
  for (let i = 0; i < plano.processos.length; i += LOTE) {
    const lote = plano.processos.slice(i, i + LOTE);
    const r = await p.$transaction(
      async (tx) => {
        // De novo, dentro da transação: outra rodada pode ter gravado no meio.
        const ja = cartoesJaImportados(
          (
            await tx.process.findMany({
              where: { tenantId: tenant.id, OR: lote.map((x) => ({ notes: { contains: URL_DO_CARTAO(x.cartao.shortLink) } })) },
              select: { notes: true },
            })
          ).map((x) => x.notes)
        );
        const novos = lote.filter((x) => !ja.has(x.cartao.shortLink));
        const dados = montarLinhas(tenant.id, novos, itensDaEtapa);
        if (dados.processos.length > 0) await tx.process.createMany({ data: dados.processos });
        if (dados.etapas.length > 0) await tx.processStep.createMany({ data: dados.etapas });
        if (dados.itens.length > 0) await tx.processChecklistItem.createMany({ data: dados.itens });
        if (dados.protocolos.length > 0) await tx.processProtocol.createMany({ data: dados.protocolos });
        return { gravados: novos.length, pulados: lote.length - novos.length };
      },
      // A latência até o banco já estourou os 5s padrão num script deste
      // repositório antes; aqui são quatro inserções em lote por transação.
      { timeout: 60_000, maxWait: 30_000 }
    );
    gravados += r.gravados;
    pulados += r.pulados;
    log(`  lote ${Math.floor(i / LOTE) + 1}: ${r.gravados} gravado(s)${r.pulados ? `, ${r.pulados} já estavam` : ""}`);
  }
  log(`\nPronto: ${gravados} processo(s) gravado(s)${pulados ? ` · ${pulados} já existiam` : ""}.`);
}

type Linhas = {
  processos: {
    id: string;
    tenantId: string;
    companyId: string;
    typeId: string;
    templateId: string;
    status: ProcessoPlanejado["status"];
    startedAt: Date;
    concludedAt: Date | null;
    ownerUserId: string | null;
    title: string | null;
    priority: ProcessoPlanejado["prioridade"];
    statusReason: string | null;
    statusChangedAt: Date | null;
    dueAt: Date | null;
    notes: string;
  }[];
  etapas: {
    id: string;
    tenantId: string;
    processId: string;
    templateStepId: string;
    status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "DISPENSADA";
    startedAt: Date | null;
    doneAt: Date | null;
  }[];
  itens: { id: string; tenantId: string; stepId: string; templateItemId: string; done: boolean; doneAt: Date | null }[];
  protocolos: {
    id: string;
    tenantId: string;
    processId: string;
    stepId: string;
    organId: string;
    attempt: number;
    number: null;
    submittedAt: Date;
    outcome: "PENDENTE";
  }[];
};

/**
 * As linhas de um lote. Ids gerados aqui, para etapa, item e protocolo
 * apontarem para o processo sem ida e volta ao banco — são quatro `createMany`
 * por lote em vez de dezenas de `create`.
 *
 * Etapa feita ganha data (a conclusão, ou quando o cartão entrou na lista):
 * a IA do setor lê o checklist por `doneAt`, não por `done`. Quem executou fica
 * nulo — não se sabe, e o relatório de produtividade não credita ninguém por
 * etapa importada.
 */
function montarLinhas(tenantId: string, lote: ProcessoPlanejado[], itensDaEtapa: Map<string, string[]>): Linhas {
  const l: Linhas = { processos: [], etapas: [], itens: [], protocolos: [] };
  for (const x of lote) {
    const processId = randomUUID();
    l.processos.push({
      id: processId,
      tenantId,
      companyId: x.empresaId,
      typeId: x.modelo.typeId,
      templateId: x.modelo.templateId,
      status: x.status,
      startedAt: x.startedAt,
      concludedAt: x.concludedAt,
      ownerUserId: x.responsavelId,
      title: x.titulo,
      priority: x.prioridade,
      statusReason: x.motivo,
      statusChangedAt: x.statusChangedAt,
      dueAt: x.dueAt,
      notes: x.notas,
    });
    const feitaEm = x.concludedAt ?? x.desde;
    for (const passo of x.modelo.roteiro) {
      const status = x.etapas.status.get(passo.id) ?? "PENDENTE";
      const stepId = randomUUID();
      const feita = status === "CONCLUIDA";
      l.etapas.push({
        id: stepId,
        tenantId,
        processId,
        templateStepId: passo.id,
        status,
        startedAt: status === "EM_ANDAMENTO" ? x.desde : null,
        doneAt: feita ? feitaEm : null,
      });
      for (const templateItemId of itensDaEtapa.get(passo.id) ?? []) {
        l.itens.push({ id: randomUUID(), tenantId, stepId, templateItemId, done: feita, doneAt: feita ? feitaEm : null });
      }
      if (x.etapas.protocolo?.templateStepId === passo.id) {
        l.protocolos.push({
          id: randomUUID(),
          tenantId,
          processId,
          stepId,
          organId: x.etapas.protocolo.organId,
          attempt: 1,
          number: null,
          submittedAt: x.desde,
          outcome: "PENDENTE",
        });
      }
    }
  }
  return l;
}

// ─── A prévia ────────────────────────────────────────────────────────────────

type DadosDaPrevia = {
  arquivo: string;
  slug: string;
  tenantNome: string;
  setor: string;
  quadro: ReturnType<typeof lerQuadro>;
  plano: ReturnType<typeof planejarImportacao>;
  opcoes: { concluidos: boolean; arquivados: boolean; prazosVencidos: boolean; tituloDoCartao: boolean };
  modelos: Map<CodigoDoTipo, ModeloDoTipo>;
  versao: Map<string, number>;
  empresas: { id: string; name: string; displayName: string | null; cnpj: string | null }[];
  usuarios: UsuarioParaCasar[];
  totalDeProcessos: number;
  aplicar: boolean;
};

function imprimirPrevia(d: DadosDaPrevia) {
  const { plano, quadro, opcoes } = d;
  const empresaPorId = new Map(d.empresas.map((e) => [e.id, e]));
  const nomeDaEmpresa = (id: string) => {
    const e = empresaPorId.get(id);
    return e ? `${e.displayName?.trim() || e.name}${e.cnpj ? ` · ${e.cnpj}` : ""}` : id;
  };
  const linhaDoCartao = (c: { cartao: { shortLink: string; name: string }; lista: string }) =>
    `[${c.cartao.shortLink}] ${c.lista} · "${c.cartao.name.replace(/\s+/g, " ").trim()}"`;

  const datas = [...quadro.comentarios.map((c) => c.data), ...quadro.movimentos.map((m) => m.data)].sort();
  log(`\n=== IMPORTAÇÃO DO TRELLO → SOCIETÁRIO ${d.aplicar ? "(APLICANDO)" : "(PRÉVIA — nada é gravado)"} ===`);
  log(`arquivo      : ${d.arquivo}`);
  log(
    `quadro       : ${quadro.nome} · ${quadro.cartoes.length} cartões · ${quadro.listas.length} listas` +
      (datas.length ? ` · histórico do export de ${formatarData(new Date(datas[0]))} a ${formatarData(new Date(datas[datas.length - 1]))}` : "")
  );
  log(`escritório   : ${d.tenantNome} (${d.slug}) · setor do Societário: ${d.setor} · ${d.totalDeProcessos} processo(s) já no Connect`);
  log(
    `opções       : concluídos ${opcoes.concluidos ? "ENTRAM" : "fora (--concluidos)"} · arquivados ${opcoes.arquivados ? "ENTRAM" : "fora (--arquivados)"} · ` +
      `prazo vencido ${opcoes.prazosVencidos ? "vira prazo" : "só nas observações (--prazos-vencidos)"} · título ${opcoes.tituloDoCartao ? "= assunto do cartão (o cliente vê)" : "vazio (--titulo-do-cartao)"}`
  );

  const faltando = CODIGOS_DOS_TIPOS.filter((c) => !d.modelos.has(c));
  log(
    `roteiros     : ${[...d.modelos.entries()].map(([c, m]) => `${m.nome} v${d.versao.get(c)} (${m.roteiro.length} etapas)`).join(" · ") || "nenhum"}` +
      (faltando.length ? `\n               SEM roteiro publicado: ${faltando.join(", ")} — rode scripts/seed-societario.ts` : "")
  );

  // ---- por grupo ----
  const deFora = plano.fora;
  const processosDoQuadro = [
    ...plano.processos.map((x) => ({ grupo: x.grupo as Grupo, tipo: true, empresa: true, entra: true })),
    ...deFora
      .filter((f) => f.grupo !== null)
      .map((f) => ({ grupo: f.grupo as Grupo, tipo: !!f.tipo, empresa: !!f.empresaId, entra: false })),
  ];
  log("\nCartões que são processo, por grupo (fora: modelos, testes, já importados):");
  log("                 total   com tipo   com empresa   entram");
  for (const g of ["aberto", "concluido", "arquivado"] as Grupo[]) {
    const doGrupo = processosDoQuadro.filter((x) => x.grupo === g);
    const comTipo = doGrupo.filter((x) => x.tipo).length;
    const comEmpresa = doGrupo.filter((x) => x.empresa).length;
    const entram = doGrupo.filter((x) => x.entra).length;
    log(
      `  ${ROTULO_DO_GRUPO[g].padEnd(13)} ${String(doGrupo.length).padStart(5)}   ${String(comTipo).padStart(8)}   ` +
        `${`${comEmpresa} (${pct(comEmpresa, doGrupo.length)})`.padStart(11)}   ${String(entram).padStart(6)}`
    );
  }

  // ---- por lista ----
  const entram = plano.processos;
  log("\nPor lista do Trello → como entra no Connect (só os que entram):");
  // A situação como a fila mostra: com protocolo pendente é "aguardando o
  // órgão", que sai do protocolo e não do `status` gravado.
  const porLista = conta(
    entram,
    (x) => `${x.lista}|${x.grupo === "arquivado" ? "ARQUIVADO" : x.fase}|${x.etapas.protocolo ? "AGUARDANDO_ORGAO" : x.status}`
  );
  for (const [chave, n] of porLista.sort((a, b) => a[0].localeCompare(b[0]))) {
    const [lista, fase, status] = chave.split("|");
    log(`  ${lista.padEnd(36)} ${String(n).padStart(4)}  → ${DESCRICAO_DA_FASE[fase as keyof typeof DESCRICAO_DA_FASE]} · ${ROTULO_DO_STATUS[status] ?? status}`);
  }
  const comProtocolo = entram.filter((x) => x.etapas.protocolo).length;
  const aproximadas = entram.filter((x) => x.etapas.aproximada);
  if (comProtocolo) log(`  protocolos aguardando o órgão (sem número — preencher no processo): ${comProtocolo}`);
  if (aproximadas.length) log(`  etapa aproximada (o roteiro do tipo não tem a etapa da lista — ficou na 1ª): ${aproximadas.length}`);

  // ---- por tipo ----
  log("\nPor tipo (os que entram):");
  for (const [tipo, n] of conta(entram, (x) => x.modelo.nome)) log(`  ${tipo.padEnd(36)} ${String(n).padStart(4)}`);
  const avulsas = entram.filter((x) => x.tipo.avulsa).length;
  if (avulsas) log(`  … das Regularizações, ${avulsas} são demandas avulsas (senha, acesso, procuração, cadastro)`);

  // ---- empresas ----
  log("\nEmpresas (os que entram):");
  for (const [como, n] of conta(entram, (x) => ROTULO_DO_CASAMENTO[x.casamento])) log(`  ${como.padEnd(36)} ${String(n).padStart(4)}`);
  const semEmpresa = deFora.filter((f) => f.motivo === "sem_empresa");
  log(`  sem empresa (ficam de fora)          ${String(semEmpresa.length).padStart(4)}`);

  // ---- membros ----
  log("\nMembros do Trello → usuários do Connect:");
  for (const m of d.plano.membros) {
    const u = m.usuario;
    log(
      `  ${m.membro.fullName.padEnd(36)} ${String(m.cartoes).padStart(4)} cartões → ` +
        (u ? `${u.name}${u.doSetor ? (u.coordenador ? " (coordena/administra — responsável só sem outra pessoa do setor no cartão)" : " (do setor)") : " (fora do setor — não vira responsável)"}` : "não casou")
    );
  }
  const comResponsavel = entram.filter((x) => x.responsavelId).length;
  const porResponsavel = conta(
    entram.filter((x) => x.responsavelId),
    (x) => d.usuarios.find((u) => u.id === x.responsavelId)?.name ?? "?"
  );
  log(`  responsável: ${comResponsavel} com (${porResponsavel.map(([n, q]) => `${n} ${q}`).join(" · ")}) · ${entram.length - comResponsavel} sem`);

  // ---- prazos e prioridade ----
  const comPrazo = entram.filter((x) => x.dueAt).length;
  const vencidos = entram.filter((x) => x.prazoVencido).length;
  log(`\nPrazo combinado: ${comPrazo} com prazo · ${vencidos} prazo(s) vencido(s) do Trello ficaram só nas observações`);
  log(`Prioridade alta ("urgente" no título): ${entram.filter((x) => x.prioridade === "ALTA").length}`);

  // ---- listas para conferir ----
  const paraConferir = entram.filter((x) => x.casamento === "prefixo" || x.casamento === "cnpj_da_descricao");
  if (paraConferir.length) {
    log(`\nCasadas pelo começo do nome ou pelo CNPJ da descrição — CONFIRA (${paraConferir.length}):`);
    for (const x of paraConferir) log(`  ${linhaDoCartao(x)}\n      → ${nomeDaEmpresa(x.empresaId)} (${ROTULO_DO_CASAMENTO[x.casamento]})`);
  }

  const relevantes = (f: CartaoDeFora) =>
    f.grupo === "aberto" || (f.grupo === "concluido" && opcoes.concluidos) || (f.grupo === "arquivado" && opcoes.arquivados);
  const semEmpresaRelevantes = semEmpresa.filter(relevantes);
  if (semEmpresaRelevantes.length) {
    log(`\nSem empresa — NÃO entram (${semEmpresaRelevantes.length}). Resolva no cadastro ou no arquivo --vinculos (<shortLink>;<cnpj>):`);
    for (const f of semEmpresaRelevantes) {
      log(`  ${linhaDoCartao(f)} — ${f.detalhe}`);
      // Sugestão, não casamento: quem confirma escreve a linha no arquivo de vínculos.
      for (const id of f.sugestoes) log(`      parecida: ${nomeDaEmpresa(id)}`);
    }
  }
  const semTipo = deFora.filter((f) => f.motivo === "sem_tipo" && relevantes(f));
  if (semTipo.length) {
    log(`\nSem tipo identificado — NÃO entram (${semTipo.length}). No arquivo --vinculos: <shortLink>;;<tipo>`);
    for (const f of semTipo) log(`  ${linhaDoCartao(f)}`);
  }
  const semRoteiro = deFora.filter((f) => f.motivo === "tipo_sem_roteiro" && relevantes(f));
  if (semRoteiro.length) log(`\nTipo sem roteiro publicado no escritório: ${semRoteiro.length} (${conta(semRoteiro, (f) => f.detalhe ?? "").map(([t, n]) => `${t} ${n}`).join(", ")})`);

  const MOTIVOS: Partial<Record<CartaoDeFora["motivo"], string>> = {
    modelo: "modelo de checklist",
    teste: "teste / erro",
    vinculo_ignorar: "ignorados no arquivo de vínculos",
    ja_importado: "já importados antes",
    lista_desconhecida: "lista que não sei mapear",
    concluido: "concluídos (fora sem --concluidos)",
    arquivado: "arquivados (fora sem --arquivados)",
  };
  log("\nOutros de fora:");
  for (const [motivo, rotulo] of Object.entries(MOTIVOS)) {
    const n = deFora.filter((f) => f.motivo === motivo).length;
    if (n) log(`  ${rotulo!.padEnd(40)} ${String(n).padStart(4)}`);
  }

  if (tem("--listar")) {
    log("\nTodos os cartões:");
    for (const x of entram) {
      log(
        `  ENTRA  ${linhaDoCartao(x)}\n         ${x.modelo.nome} · ${DESCRICAO_DA_FASE[x.grupo === "arquivado" ? "ARQUIVADO" : x.fase]}` +
          `${x.etapas.aproximada ? " (etapa aproximada)" : ""} · ${nomeDaEmpresa(x.empresaId)}`
      );
    }
    for (const f of deFora) log(`  FORA   ${linhaDoCartao(f)} — ${MOTIVOS[f.motivo] ?? f.motivo}${f.detalhe ? `: ${f.detalhe}` : ""}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => getPrisma().$disconnect());
