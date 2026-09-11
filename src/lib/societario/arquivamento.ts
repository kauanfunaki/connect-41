// A parte do trabalho de portal que não depende de portal nenhum.
//
// ─── Por que esta fatia existe separada ─────────────────────────────────────
//
// Dos seis procedimentos que o Societário documentou, o do Corpo de Bombeiros é
// o mais travado: exige código por e-mail **duas vezes no mesmo fluxo**, e o
// robô que o executa depende de credencial, caixa de correspondência e decisão
// de segurança que ainda não existem.
//
// Mas o documento do setor não termina no portal. Depois de emitir a taxa, ele
// manda:
//
//   1. salvar em `Societário › Prefeitura › Bombeiros › ano vigente`;
//   2. nomear `EMPRESA - Taxa Bombeiros 2026`;
//   3. enviar aos e-mails da empresa cadastrados no Acessórias.
//
// **Nada disso depende de autenticação em lugar nenhum.** É a única parte dos
// seis fluxos que dá para entregar hoje, e é trabalho manual repetido todo ano
// para cada cliente.
//
// ─── O que é regra, e por isso mora aqui ────────────────────────────────────
//
// Caminho e nome de arquivo são convenção do setor, e convenção que vive em
// código é convenção que não diverge entre duas pessoas. O envio em si é ato
// para fora e mora na action, com confirmação.

/** Onde o documento é arquivado, como o setor escreve. */
export type Arquivamento = {
  /** Segmentos da pasta, do mais genérico ao mais específico. */
  pasta: string[];
  /** Nome do arquivo, sem extensão. */
  nome: string;
  /** Pasta e nome juntos, para mostrar na tela antes de confirmar. */
  caminho: string;
};

/**
 * Normaliza o nome da empresa para caber num nome de arquivo.
 *
 * Tira o que o Windows recusa (`\ / : * ? " < > |`) e colapsa espaço. **Não
 * tira acento**: o setor escreve "TRANSPORTES SÃO JOSÉ" e ver "SAO JOSE" na
 * pasta faria alguém achar que é outra empresa.
 */
export function nomeDeArquivoSeguro(texto: string): string {
  return texto
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type DadosDoArquivamento = {
  empresaNome: string;
  /** O ano vigente do documento — não o de hoje. Ver `arquivarTaxaDeBombeiros`. */
  ano: number;
  /** Como o setor chama o documento. Ex.: "Taxa Bombeiros". */
  tipo: string;
  /** O órgão, que é o penúltimo segmento da pasta. */
  orgao: string;
};

/**
 * O caminho e o nome, pela convenção do setor.
 *
 * `Societário › Prefeitura › <órgão> › <ano>` e `<EMPRESA> - <tipo> <ano>`.
 */
export function arquivar(d: DadosDoArquivamento): Arquivamento {
  const empresa = nomeDeArquivoSeguro(d.empresaNome).toUpperCase();
  const tipo = nomeDeArquivoSeguro(d.tipo);
  const pasta = ["Societário", "Prefeitura", nomeDeArquivoSeguro(d.orgao), String(d.ano)];
  const nome = `${empresa} - ${tipo} ${d.ano}`;
  return { pasta, nome, caminho: [...pasta, nome].join(" › ") };
}

/**
 * O ano de uma taxa.
 *
 * **É o ano do vencimento, não o de hoje.** Uma guia de 2026 emitida em
 * dezembro de 2025 pertence à pasta de 2026 — arquivá-la em 2025 é onde ela
 * some no ano seguinte, quando alguém for procurar a taxa daquele exercício.
 *
 * Sem vencimento, cai no ano de hoje, que é o melhor palpite disponível.
 */
export function anoDaTaxa(dueDate: Date | null, hoje: Date): number {
  const d = dueDate ?? hoje;
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(d);
  return Number(p.find((x) => x.type === "year")!.value);
}

// ─── Destinatários ───────────────────────────────────────────────────────────

export type ContatoDaEmpresa = { email: string | null; rotulo: string };

export type Destinatarios = {
  para: string[];
  /** Contatos descartados, com o motivo — a tela mostra antes de enviar. */
  descartados: { rotulo: string; motivo: string }[];
};

/** Aceita o que tem cara de e-mail. Não valida domínio: isso é do servidor. */
const PARECE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Para quem a taxa vai.
 *
 * ─── Por que os descartados são nomeados ────────────────────────────────────
 *
 * Um contato sem e-mail e um e-mail digitado errado produzem o mesmo resultado
 * — a pessoa não recebe — e só um deles é conserto de cadastro. Devolver a
 * lista com o motivo é o que permite a tela dizer "vai para 2 de 3, e o
 * terceiro está sem e-mail" antes de alguém clicar em enviar.
 *
 * Duplicata sai: mandar duas vezes para o mesmo endereço é o tipo de detalhe
 * que faz um cliente achar que o escritório não se organiza.
 */
export function destinatarios(contatos: ContatoDaEmpresa[]): Destinatarios {
  const para: string[] = [];
  const vistos = new Set<string>();
  const descartados: { rotulo: string; motivo: string }[] = [];

  for (const c of contatos) {
    const email = c.email?.trim() ?? "";
    if (!email) {
      descartados.push({ rotulo: c.rotulo, motivo: "sem e-mail cadastrado" });
      continue;
    }
    if (!PARECE_EMAIL.test(email)) {
      descartados.push({ rotulo: c.rotulo, motivo: `e-mail inválido: ${email}` });
      continue;
    }
    const chave = email.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    para.push(email);
  }

  return { para, descartados };
}

export type VereditoDeEnvio = { pode: true } | { pode: false; motivo: string };

/**
 * Dá para enviar agora?
 *
 * A recusa por "nenhum destinatário" existe porque o caminho contrário é pior
 * que silencioso: o SMTP aceita uma lista vazia sem reclamar em alguns
 * servidores, e aí a tela diz "enviado" sobre um e-mail que não foi a lugar
 * nenhum.
 */
export function podeEnviar(d: Destinatarios, temArquivo: boolean): VereditoDeEnvio {
  if (!temArquivo) return { pode: false, motivo: "Anexe a guia antes de enviar." };
  if (d.para.length === 0) {
    return {
      pode: false,
      motivo:
        d.descartados.length > 0
          ? "Nenhum contato desta empresa tem e-mail válido. Corrija o cadastro antes."
          : "Esta empresa não tem contato cadastrado.",
    };
  }
  return { pode: true };
}

/** O assunto do e-mail, na mesma convenção do nome do arquivo. */
export function assuntoDoEnvio(a: Arquivamento): string {
  return a.nome;
}
