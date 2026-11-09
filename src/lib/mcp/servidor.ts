import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ErroApi } from "@/lib/api-v1/erros";
import type { AtorDoToken } from "@/lib/tokens-pessoais/servidor";
import type { Escopo } from "@/lib/tokens-pessoais/regras";
import {
  listarParaApi, verParaApi, opcoesParaApi, criarParaApi, atualizarParaApi, mudarSituacaoParaApi,
  comentarParaApi, anexarParaApi, arquivoDoBase64, resumoParaApi,
} from "@/lib/tech-interno/api";

// O servidor MCP do Connect (05/11/2026, decisão D2): as mesmas ações da API
// do Controle interno como ferramentas para a IA (Claude Code, Codex, Cursor).
// Cada chamada chega com o token pessoal; a ferramenta só aparece se o token
// tem o escopo dela, e age com o acesso de hoje da pessoa dona do token.

export const VERSAO_DO_SERVIDOR_MCP = "1.2.0";

const INSTRUCOES = `Servidor do Connect para o Controle interno da equipe Tech: o registro de bugs, melhorias, novas funcionalidades, testes e migrações dos sistemas.
Tudo o que você faz aqui fica no histórico do item e na Auditoria com o nome da pessoa dona do token.
Como trabalhar:
- Antes de criar, procure com listar_itens (campo q) se o item já existe; se existir, comente ou atualize em vez de duplicar.
- Para saber o que já foi feito, o que está em andamento e o que está planejado num dia, semana, mês ou ano, use resumo_do_periodo em vez de ler item por item.
- Para preencher sistema, responsável ou "veio de", consulte ver_opcoes: use a "key" do sistema em systemKey e o "id" da pessoa em assigneeId ("me" é a própria pessoa do token).
- Para alterar, leia o item com ver_item e envie a "version" que veio nele: se outra pessoa mudou o item nesse meio-tempo, a gravação é recusada (conflict) e você deve ler de novo.
- Ao concluir um item que mudou código, informe o PR (prUrl) e o commit (commitSha) da mudança em mudar_situacao ou atualizar_item.
- Escreva título e descrição em português, como a equipe escreveria: o que acontece, onde, como reproduzir e o que se espera.`;

const TIPO = z.enum(["BUG", "IMPROVEMENT", "FEATURE", "TEST", "MIGRATION"]).describe("BUG = Bug; IMPROVEMENT = Melhoria (inclui redesign de tela); FEATURE = Nova funcionalidade; TEST = Teste; MIGRATION = Migração.");
const SITUACAO = z.enum(["PENDING", "IN_PROGRESS", "VALIDATION", "DONE", "CANCELED"]).describe("PENDING = Pendente; IN_PROGRESS = Em andamento; VALIDATION = Em validação; DONE = Concluído; CANCELED = Cancelado.");
const PRIORIDADE = z.number().int().min(0).max(3).describe("0 = Baixa, 1 = Média (padrão), 2 = Alta, 3 = Urgente.");
const ID = z.string().describe("O id do item (UUID), como veio de listar_itens ou ver_item.");
const VERSAO = z.number().int().min(0).describe("A version do item lida em ver_item. Recomendado: protege contra gravar por cima de outra pessoa. Sem ela, vale a versão atual.");

const entregaNoCodigo = {
  prUrl: z.string().max(500).nullable().optional().describe("O endereço do PR da mudança (https://github.com/...). Informe ao concluir. null limpa."),
  commitSha: z.string().max(64).nullable().optional().describe("O hash do commit da mudança (7 a 40 caracteres hexadecimais). Informe ao concluir. null limpa."),
};
const camposEditaveis = {
  description: z.string().max(10000).nullable().optional().describe("Descrição em texto: o que acontece, onde, passos para reproduzir, o esperado. null limpa."),
  priority: PRIORIDADE.optional(),
  systemKey: z.string().max(191).nullable().optional().describe("A key de um sistema do Orquestrador, de ver_opcoes (ex.: \"robo:...\", \"site:...\", \"app:...\"). null = sem sistema."),
  systemMode: z.enum(["NONE", "EXISTING", "NEW"]).optional().describe("NONE = sem sistema; EXISTING = um sistema do Orquestrador (use systemKey); NEW = um sistema que ainda não existe. Opcional: mandar systemKey já basta."),
  assigneeId: z.string().max(191).nullable().optional().describe("O id de uma pessoa de ver_opcoes, ou \"me\" para a pessoa dona do token. null = sem responsável."),
  dueDate: z.string().nullable().optional().describe("Prazo no formato AAAA-MM-DD. null limpa."),
  size: z.enum(["P", "M", "G"]).nullable().optional().describe("Tamanho combinado: P, M ou G. Só quem coordena a Tech define, e só enquanto o item está Pendente."),
  ...entregaNoCodigo,
  originItemId: z.string().max(191).nullable().optional().describe("\"Veio de\": o id de uma entrega concluída (ver recentDeliveries em ver_opcoes), quando o item nasce dela — por exemplo, um bug de algo já entregue."),
};

function resultado(dados: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(dados, null, 2) }] };
}
function falha(e: unknown): CallToolResult {
  if (e instanceof ErroApi) return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code: e.code, message: e.message } }) }] };
  console.error("[mcp] Falha na ferramenta", e instanceof Error ? e.name : "erro");
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code: "internal_error", message: "O Connect não conseguiu concluir a operação. Tente de novo em instantes." } }) }] };
}
const executar = async (fn: () => Promise<unknown>) => { try { return resultado(await fn()); } catch (e) { return falha(e); } };

export function criarServidorMcp(ator: AtorDoToken, base: string): McpServer {
  const server = new McpServer({ name: "connect", title: "Connect", version: VERSAO_DO_SERVIDOR_MCP }, { instructions: INSTRUCOES });
  const pode = (escopo: Escopo) => ator.escopos.includes(escopo);

  if (pode("controle-interno:ler")) {
    server.registerTool("listar_itens", {
      title: "Listar itens do Controle interno",
      description: "Lista os itens do Controle interno, 50 por página, do mais prioritário para o menos. Sem filtro de situação, traz só os em aberto (Pendente, Em andamento, Em validação). Use q para procurar pelo título ou pela descrição antes de criar um item novo.",
      inputSchema: {
        status: z.enum(["PENDING", "IN_PROGRESS", "VALIDATION", "DONE", "CANCELED", "OPEN", "ALL"]).optional().describe("Situação. OPEN (padrão) = em aberto; ALL = todas."),
        type: TIPO.optional(),
        priority: PRIORIDADE.optional(),
        system: z.string().max(191).optional().describe("A key de um sistema (de ver_opcoes), NONE (sem sistema) ou NEW (sistema novo)."),
        assignee: z.string().max(191).optional().describe("O id de uma pessoa, \"me\" (a dona do token) ou \"none\" (sem responsável)."),
        q: z.string().max(200).optional().describe("Busca no título e na descrição."),
        overdue: z.boolean().optional().describe("true = só os em aberto com prazo vencido."),
        page: z.number().int().min(1).optional().describe("Página, a partir de 1."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, args => executar(() => listarParaApi(ator, args, base)));

    server.registerTool("ver_item", {
      title: "Ver um item",
      description: "Mostra um item com todos os campos, a version atual, os comentários, o histórico de alterações e os anexos.",
      inputSchema: { id: ID },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, ({ id }) => executar(() => verParaApi(ator, id, base)));

    server.registerTool("resumo_do_periodo", {
      title: "Resumo do período",
      description: "O que foi concluído, o que está em andamento e o que está planejado no dia, na semana, no mês ou no ano, numa resposta só. Use para saber o que a equipe já fez num período, em vez de ler o histórico item a item. Concluídos e cancelados contam pela data da mudança de situação; em andamento é a foto de agora; planejados são os pendentes que entraram no período ou vencem nele.",
      inputSchema: {
        period: z.enum(["day", "week", "month", "year"]).optional().describe("day, week (segunda a domingo; padrão), month ou year."),
        date: z.string().optional().describe("Uma data dentro do período, AAAA-MM-DD. Padrão: hoje, em São Paulo."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, args => executar(() => resumoParaApi(ator, args, base)));

    server.registerTool("ver_opcoes", {
      title: "Ver as opções dos campos",
      description: "Os valores aceitos nos campos: tipos, situações, prioridades, tamanhos, os sistemas do Orquestrador (key para systemKey), as pessoas que podem ser responsáveis (id para assigneeId) e as entregas recentes (id para originItemId).",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, () => executar(() => opcoesParaApi(ator)));
  }

  if (pode("controle-interno:escrever")) {
    server.registerTool("criar_item", {
      title: "Criar um item",
      description: "Cria um item no Controle interno (bug, melhoria, nova funcionalidade, teste ou migração) e devolve o item criado, com o link para abrir no Connect. Procure antes com listar_itens para não duplicar.",
      inputSchema: {
        title: z.string().min(1).max(200).describe("Título curto e específico, em português."),
        type: TIPO,
        status: SITUACAO.optional().describe("Situação inicial. Padrão: PENDING."),
        ...camposEditaveis,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, args => executar(() => criarParaApi(ator, args, base)));

    server.registerTool("atualizar_item", {
      title: "Atualizar um item",
      description: "Altera os campos enviados de um item; os outros ficam como estão. Envie a version lida em ver_item. Cada alteração entra no histórico do item com o nome da pessoa dona do token.",
      inputSchema: {
        id: ID, version: VERSAO.optional(),
        title: z.string().min(1).max(200).optional(), type: TIPO.optional(), status: SITUACAO.optional(),
        ...camposEditaveis,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, ({ id, ...campos }) => executar(() => atualizarParaApi(ator, id, campos, base)));

    server.registerTool("mudar_situacao", {
      title: "Mudar a situação",
      description: "Move o item de situação (ex.: de Pendente para Em andamento, ou para Concluído ao terminar). Ao concluir, informe o PR e o commit da mudança. Envie a version lida em ver_item.",
      inputSchema: { id: ID, status: SITUACAO, version: VERSAO.optional(), ...entregaNoCodigo },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, ({ id, status, version, prUrl, commitSha }) => executar(() => mudarSituacaoParaApi(ator, id, { status, version, prUrl, commitSha }, base)));

    server.registerTool("comentar", {
      title: "Comentar num item",
      description: "Adiciona um comentário ao item: andamento, causa encontrada, o que foi feito, link do PR. Não muda a version do item.",
      inputSchema: { id: ID, body: z.string().min(1).max(5000).describe("O texto do comentário, até 5.000 caracteres.") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, ({ id, body }) => executar(() => comentarParaApi(ator, id, { body })));

    server.registerTool("anexar", {
      title: "Anexar um arquivo",
      description: "Anexa um arquivo ao item (print de tela, PDF, planilha, log em texto), até 10 MB, com o conteúdo em base64. Os tipos aceitos são os mesmos dos Arquivos do Connect, conferidos pelos bytes.",
      inputSchema: {
        id: ID,
        fileName: z.string().min(1).max(255).describe("Nome do arquivo com a extensão, ex.: erro-na-tela.png."),
        contentBase64: z.string().min(1).describe("O conteúdo do arquivo em base64."),
        mimeType: z.string().max(120).optional().describe("Tipo do arquivo, ex.: image/png. Opcional: o Connect confere pelos bytes."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, ({ id, fileName, contentBase64, mimeType }) => executar(() => anexarParaApi(ator, id, arquivoDoBase64(fileName, contentBase64, mimeType), base)));
  }
  return server;
}
