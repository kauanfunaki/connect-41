// O tutorial do primeiro acesso (13/10/2026) — pedido do Kauan: "um tutorial
// para o primeiro acesso do usuário e do cliente (no portal), assim como
// fizemos no hub". O desenho é o do 41 Tech Hub (junho/2026): uma janela de
// passos, um conjunto de passos por papel, administrador pula sozinho, e quem
// terminou ou pulou não vê de novo — a marca fica no banco (`TutorialVisto`).
//
// Este arquivo é só regra e texto — sem banco, sem servidor —, para a tela, o
// servidor e os testes usarem o mesmo conteúdo. Quem lê o banco e monta as
// opções de cada pessoa é `servidor.ts`; quem grava é `vistos.ts`.
//
// Cada passo foi conferido no código como está hoje: o nome dos botões e das
// telas é o que a pessoa vê. Quando uma tela mudar, o passo muda junto — e, se
// a mudança for grande, sobe a versão do tutorial (abaixo) para ele abrir de
// novo uma vez.
//
// Texto para contador e para cliente de contador: frase curta, sem jargão,
// sem endereço de tela.

import type { UserRole } from "@/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/roles";
import { telasVisiveis } from "@/lib/portal/telas";

export type ChaveDoTutorial = "equipe" | "portal";

/**
 * A versão do conteúdo de cada tutorial. Subir o número faz o tutorial abrir
 * de novo, uma vez, para quem viu uma versão anterior — use quando o conteúdo
 * mudar de verdade (uma tela nova importante, um passo que deixou de valer),
 * não por ajuste de texto.
 */
export const VERSAO_DO_TUTORIAL: Readonly<Record<ChaveDoTutorial, number>> = {
  equipe: 1,
  portal: 1,
};

/** O desenho de cada passo. A tela troca a chave pelo ícone (`JanelaDoTutorial`). */
export type IconeDoTutorial =
  | "boas-vindas"
  | "menu"
  | "meu-dia"
  | "meu-time"
  | "busca"
  | "sino"
  | "ligia"
  | "gestor"
  | "ajuda"
  | "pronto"
  | "portal"
  | "solicitacao"
  | "conversa"
  | "pendencia"
  | "documentos"
  | "aprovacao"
  | "financeiro"
  | "processo"
  | "celular";

export type PassoDoTutorial = {
  chave: string;
  icone: IconeDoTutorial;
  /** A linha pequena acima do título — o nome do escritório, na boas-vindas. */
  selo?: string;
  titulo: string;
  texto: string;
  /** Dicas curtas embaixo do texto, uma por linha. */
  itens?: string[];
};

/** O tutorial pronto para a tela: tudo o que a janela mostra. */
export type Tutorial = {
  chave: ChaveDoTutorial;
  versao: number;
  /** "Tutorial para Colaborador" — o rodapé da janela. */
  rotulo: string;
  /** O botão do último passo. */
  botaoFinal: string;
  passos: PassoDoTutorial[];
};

/** O que a pessoa já fez com o tutorial, lido do banco. */
export type EstadoDoTutorial =
  | { tipo: "visto"; versao: number }
  | { tipo: "nunca" }
  /** O banco não respondeu — inclusive a tabela ainda não existir (deploy antes da migration). */
  | { tipo: "indisponivel" };

// ─── Quem vê ────────────────────────────────────────────────────────────────

/**
 * Administrador e Super Admin pulam o tutorial sozinhos, como no Hub: são
 * quem configura o Connect, e não quem chega nele. Podem rever pela Central
 * de ajuda, como todo mundo.
 */
export function pulaOTutorialSozinho(role: UserRole): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * O tutorial abre sozinho? Só para quem nunca viu ou viu uma versão anterior
 * do conteúdo. Banco fora do ar ou tabela que ainda não existe: não abre —
 * sem a marca, ele abriria em toda tela, e o tutorial nunca pode atrapalhar o
 * trabalho.
 */
export function abreSozinho(estado: EstadoDoTutorial, versaoAtual: number): boolean {
  if (estado.tipo === "indisponivel") return false;
  if (estado.tipo === "nunca") return true;
  return estado.versao < versaoAtual;
}

// ─── O tutorial da equipe ───────────────────────────────────────────────────

export type OpcoesDaEquipe = {
  role: UserRole;
  /** O nome do escritório, para a boas-vindas. */
  escritorio: string | null;
  /** Quantos setores aparecem no seletor — com mais de um, o passo do menu ensina a trocar. */
  setoresNoMenu: number;
  /** A Lígia atende o setor em que a pessoa está (ou algum dela, em "Todos os setores"). */
  ligia: boolean;
  /** O servidor tem as chaves do aviso no celular — sem elas, o passo não promete o que não existe. */
  avisosNoCelular: boolean;
};

/**
 * O Colaborador vê o básico; o Gestor de setor, o básico e o que só ele faz
 * (o time no Meu dia, transferências, campos e tags). Administrador que revê
 * pela ajuda ganha os passos do gestor — ele também faz tudo isso.
 */
export function ehTutorialDeGestor(role: UserRole): boolean {
  return role === "SECTOR_ADMIN" || role === "ADMIN" || role === "SUPER_ADMIN";
}

export function tutorialDaEquipe(o: OpcoesDaEquipe): Tutorial {
  const gestor = ehTutorialDeGestor(o.role);
  const passos: (PassoDoTutorial | null)[] = [
    {
      chave: "boas-vindas",
      icone: "boas-vindas",
      selo: o.escritorio?.trim() || undefined,
      titulo: "Boas-vindas ao Connect",
      texto:
        "Aqui fica o escritório inteiro, num lugar só: as empresas, as pessoas, o trabalho de cada setor e o que passa de um setor para o outro. Em poucos passos, mostramos o básico.",
    },
    {
      chave: "menu",
      icone: "menu",
      titulo: "O menu ao lado",
      texto: "O menu mostra o Início, as telas que servem a todos os setores e as telas do seu setor.",
      itens: [
        ...(o.setoresNoMenu > 1
          ? [
              "Você está em mais de um setor. Para trocar, clique no nome do setor, no alto da tela.",
              // No celular o nome some do botão do perfil: fica a foto (ou as iniciais).
              "No celular, toque na sua foto, no canto de cima, e em Trocar de setor.",
            ]
          : []),
        "No celular, o menu abre no botão de três linhas, no canto de cima.",
      ],
    },
    {
      chave: "meu-dia",
      icone: "meu-dia",
      titulo: "Início e Meu dia",
      texto:
        "O Início é a primeira tela: um resumo do seu trabalho e do escritório. O Meu dia, logo abaixo no menu, mostra o que é seu, do mais urgente para o menos urgente.",
      itens: [
        "Comece o expediente pela lista “Pede você agora”, no Meu dia: ela diz por onde começar.",
        "No botão Personalizar, você escolhe o que aparece no Início.",
      ],
    },
    gestor
      ? {
          chave: "meu-time",
          icone: "meu-time",
          titulo: "O trabalho do seu time",
          texto: "No Meu dia, troque para Meu time: você vê o que está com cada pessoa do setor.",
          itens: [
            "O que venceu, o que parou e o que está andando, pessoa por pessoa.",
            "O que ainda está sem responsável, para você distribuir.",
          ],
        }
      : null,
    {
      chave: "busca",
      icone: "busca",
      titulo: "Ache tudo com Ctrl+K",
      texto: "Aperte Ctrl+K, ou clique na busca, e digite parte do nome de uma tela, de uma empresa ou de uma pessoa.",
      itens: ["Não precisa de acento.", "Antes de você digitar, aparecem as últimas telas que você abriu."],
    },
    {
      chave: "avisos",
      icone: "sino",
      titulo: "Os avisos no sino",
      texto:
        "O sino, no alto da tela, avisa o que chegou para você: uma transferência, uma menção, a mensagem de um cliente, um prazo chegando.",
      itens: [
        "O número no sino é o que você ainda não leu.",
        ...(o.avisosNoCelular
          ? ["Para receber os avisos também no celular, clique no seu nome ou na sua foto, no canto de cima, e em Configurações do perfil."]
          : []),
      ],
    },
    o.ligia
      ? {
          chave: "ligia",
          icone: "ligia",
          titulo: "Conheça a Lígia",
          texto:
            "A Lígia é a inteligência artificial do seu setor. Ela fica no canto de baixo da tela, à direita: é só clicar e perguntar, como faria a um colega.",
          itens: [
            "Ela consulta o Connect com o mesmo acesso que você tem.",
            "Ela só lê: não muda nada sozinha.",
            "Quando ela sugere uma mudança, nada muda até você clicar em Aplicar.",
          ],
        }
      : null,
    gestor
      ? {
          chave: "gestor",
          icone: "gestor",
          titulo: "O que fica com o gestor",
          texto: "Algumas tarefas são só de quem coordena o setor:",
          itens: [
            "Passar um trabalho para outro setor, em Transferências.",
            "Criar campos extras e tags para o setor, na engrenagem, no alto da tela.",
            // Desde 13/10/2026 só o administrador exclui (`podeExcluir`). Para
            // o próprio administrador, que revê pela ajuda, a frase não vale.
            ...(o.role === "SECTOR_ADMIN" ? ["Excluir um registro fica com o administrador do escritório."] : []),
          ],
        }
      : null,
    {
      chave: "ajuda",
      icone: "ajuda",
      titulo: "A Central de ajuda",
      texto: "No botão ?, no alto da tela, ficam vídeos curtos e o passo a passo de cada tela.",
      itens: ["Numa tela que tem passo a passo, o ? abre direto a ajuda dela."],
    },
    {
      chave: "pronto",
      icone: "pronto",
      titulo: "Tudo pronto!",
      texto: "Agora é com você. Para ver este tutorial de novo, abra a Central de ajuda.",
    },
  ];

  return {
    chave: "equipe",
    versao: VERSAO_DO_TUTORIAL.equipe,
    rotulo: `Tutorial para ${ROLE_LABELS[o.role] ?? "Colaborador"}`,
    botaoFinal: "Começar a usar o Connect",
    passos: passos.filter((p): p is PassoDoTutorial => p !== null),
  };
}

// ─── O tutorial do portal ───────────────────────────────────────────────────

export type OpcoesDoPortal = {
  /** O nome do escritório, para a boas-vindas. */
  escritorio: string | null;
  /** Os módulos ligados no escritório — a mesma régua do menu do portal. */
  modulos: ReadonlySet<string>;
  /** O servidor tem as chaves do aviso no celular. */
  avisosNoCelular: boolean;
};

/** "A, B e C". */
function emLista(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

/**
 * Os passos seguem o menu do cliente (`telasVisiveis`): o tutorial nunca fala
 * de uma tela que ele não tem. O portal é de todos os setores, então o texto
 * fala de "a equipe" e de "o escritório", nunca de um setor.
 */
export function tutorialDoPortal(o: OpcoesDoPortal): Tutorial {
  const telas = new Set(telasVisiveis(o.modulos).map((t) => t.href));
  const tem = (href: string) => telas.has(href);
  const financeiro = telasVisiveis(o.modulos)
    .filter((t) => t.secao === "Financeiro")
    .map((t) => t.rotulo);
  const listaDoFinanceiro = `Em Financeiro, no menu, você acompanha: ${emLista(financeiro)}.`;

  const passos: (PassoDoTutorial | null)[] = [
    {
      chave: "boas-vindas",
      icone: "portal",
      selo: o.escritorio?.trim() || undefined,
      titulo: "Boas-vindas ao portal",
      texto:
        "Este é o seu canal com o escritório: o que você pede, o que a equipe precisa de você e os documentos das suas empresas, num lugar só.",
      itens: [
        "Ao entrar, você chega ao Início, que mostra o que espera por você.",
        "No celular, o menu abre no botão de três linhas, no canto de cima.",
      ],
    },
    tem("/portal/solicitacoes")
      ? {
          chave: "solicitacoes",
          icone: "solicitacao",
          titulo: "Peça o que precisar",
          texto:
            "Em Solicitações, clique em Nova solicitação, escolha o assunto e conte o que você precisa. Dá para anexar arquivos.",
          itens: ["Cada assunto mostra em quantos dias úteis a equipe responde.", "Você recebe um e-mail quando a equipe responder."],
        }
      : null,
    // Sem as solicitações, quem fala com a equipe é a Conversa (ver `ocultaCom` em telas.ts).
    tem("/portal/comunicacao")
      ? {
          chave: "conversa",
          icone: "conversa",
          titulo: "Fale com a equipe",
          texto: "Em Conversa, escolha a empresa, escreva a mensagem e, se quiser, anexe arquivos.",
          itens: ["A equipe é avisada na hora e responde ali mesmo."],
        }
      : null,
    tem("/portal/pendencias")
      ? {
          chave: "pendencias",
          icone: "pendencia",
          titulo: "O que a equipe precisa de você",
          texto:
            "Quando a equipe precisa de um documento ou de uma informação sua, o pedido aparece em Pendências e no Início.",
          itens: [
            "Abra o pedido, escreva a resposta, anexe os arquivos e clique em Enviar resposta.",
            "Se o prazo passar sem resposta, você recebe um lembrete.",
          ],
        }
      : null,
    {
      chave: "documentos",
      icone: "documentos",
      titulo: "Os seus documentos",
      texto: "Cada tipo de documento tem o seu lugar no menu.",
      itens: [
        "Documentos fiscais: as notas emitidas e recebidas pelas suas empresas.",
        ...(tem("/portal/envios") ? ["Documentos do escritório: o que o escritório mandou para você ler e, quando pedido, dar o aceite."] : []),
        ...(tem("/portal/arquivos")
          ? ["Arquivos: as pastas que o escritório compartilhou com você. Por ali você também manda os seus arquivos."]
          : []),
      ],
    },
    tem("/portal/aprovacoes")
      ? {
          chave: "aprovacoes",
          icone: "aprovacao",
          titulo: "Aprove os pagamentos",
          texto:
            "Em Aprovações ficam as contas que só são pagas depois do seu “pode pagar”. Aprove com um clique, ou reprove dizendo o motivo.",
          itens: financeiro.length > 0 ? [listaDoFinanceiro] : [],
        }
      : financeiro.length > 0
        ? {
            chave: "financeiro",
            icone: "financeiro",
            titulo: "O financeiro das suas empresas",
            texto: listaDoFinanceiro,
            itens: ["A equipe do escritório lança, e você consulta.", "Se algum número parecer errado, fale com a equipe."],
          }
        : null,
    tem("/portal/processos")
      ? {
          chave: "processos",
          icone: "processo",
          titulo: "Os processos das suas empresas",
          texto: "Em Processos, acompanhe etapa por etapa a abertura, as alterações, a baixa e as licenças das suas empresas.",
          itens: ["Em Exigências fica o que os órgãos pediram."],
        }
      : null,
    {
      chave: "celular",
      icone: "celular",
      titulo: "O portal no seu celular",
      texto: "Instale o portal e ele abre como um aplicativo, com um ícone na tela inicial.",
      itens: [
        "No Android: abra o portal no Chrome, toque no menu ⋮ e em Instalar app.",
        "No iPhone: abra o portal no Safari, toque em Compartilhar e em Adicionar à Tela de Início.",
        ...(o.avisosNoCelular
          ? ["Para ser avisado quando a equipe precisar de você, toque em Ativar no quadro “Notificações no navegador”, no fim do Início."]
          : []),
      ],
    },
    {
      chave: "pronto",
      icone: "pronto",
      titulo: "Tudo pronto!",
      texto: "Ficou alguma dúvida? Em Ajuda, no fim do menu, tem o passo a passo de cada tela. Este tutorial também fica lá.",
    },
  ];

  return {
    chave: "portal",
    versao: VERSAO_DO_TUTORIAL.portal,
    rotulo: "Tutorial para Cliente",
    botaoFinal: "Começar a usar o portal",
    passos: passos.filter((p): p is PassoDoTutorial => p !== null),
  };
}
