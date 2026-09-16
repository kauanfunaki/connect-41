// Ligar a conversa do WhatsApp à candidatura — as regras puras.
//
// ─── Por que telefone não basta ─────────────────────────────────────────────
//
// O telefone vem do formulário de `/carreiras`, digitado pelo candidato. Um
// dígito errado aponta para o número de outra pessoa, e ligar a conversa só por
// ele faria o robô contar a essa outra pessoa a vaga, a empresa e a etapa de
// quem se inscreveu. Até 15/09 a regra era "vínculo é de gente" por isso.
//
// A decisão do Kauan em 16/09 é o meio-termo que escala: o telefone **sugere**
// (e só quando aponta para uma pessoa só), e o candidato **confirma** dizendo o
// nome completo. Quem recebeu o número por engano não sabe o nome de quem se
// inscreveu; quem se inscreveu sabe. E o robô nunca diz o nome que procura.
//
// ─── Por que só duas tentativas ─────────────────────────────────────────────
//
// Nome é pergunta com resposta adivinhável por quem conhece a pessoa. Duas
// tentativas cobrem erro de digitação; mais que isso vira jogo de adivinhar, e
// a conversa segue sem vínculo — a pessoa do time ainda pode ligar à mão.

/** Nomes informados que não conferiram antes de desistir. */
export const MAX_TENTATIVAS_DO_NOME = 2;

/** Uma resposta de nome maior que isto não é um nome — é outra mensagem. */
const MAX_CARACTERES_DO_NOME = 120;

export const PERGUNTA_DO_NOME =
  "Encontrei uma inscrição ligada a este número. Para eu consultar com segurança, me diga o seu nome completo, do jeito que você escreveu na inscrição.";

export const PEDIR_NOME_DE_NOVO =
  "Não consegui confirmar esse nome junto a este número. Pode escrever o seu nome completo, do jeito que está na inscrição?";

export const NOME_NAO_CONFIRMADO =
  "Não consegui confirmar a inscrição por aqui, então não vou mostrar dados de processo nesta conversa. Posso te mostrar as vagas abertas, ou você pode pedir para falar com uma pessoa do time.";

/**
 * O que vai na frente da mensagem do candidato quando o nome acabou de
 * conferir: sem isto o agente leria "Maria Silva" como a pergunta e responderia
 * ao nome, e não ao que a pessoa perguntou antes.
 */
export const NOTA_DE_VINCULO_CONFIRMADO =
  "[O candidato acabou de confirmar a identidade informando o nome abaixo. Agradeça em poucas palavras e responda o que ele perguntou antes, consultando as ferramentas.]\n";

// ─── Telefone ────────────────────────────────────────────────────────────────

/**
 * As formas locais (DDD + número) em que um telefone brasileiro pode estar.
 *
 * O WhatsApp de linhas antigas costuma chegar **sem o nono dígito**
 * (`554199998888`), enquanto o candidato digita com ele (`(41) 99999-8888`) — e
 * o contrário também acontece. Por isso um celular vira duas formas, e dois
 * telefones conferem quando têm alguma forma em comum.
 *
 * Número que não parece brasileiro devolve lista vazia: comparar literal seria
 * palpite, e palpite aqui é justamente o que a confirmação por nome evita.
 */
export function formasLocaisDoTelefone(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let d = raw.replace(/\D/g, "");
  // Discagem com zero na frente: "041 99999-8888".
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);

  if (d.length === 11 && d[2] === "9") {
    return [d, d.slice(0, 2) + d.slice(3)];
  }
  if (d.length === 10) {
    // Só celular (6 a 9 depois do DDD) ganha a forma com o nono dígito; fixo não.
    return /[6-9]/.test(d[2]!) ? [d, `${d.slice(0, 2)}9${d.slice(2)}`] : [d];
  }
  return [];
}

export function telefonesConferem(a: string | null | undefined, b: string | null | undefined): boolean {
  const formasDeB = new Set(formasLocaisDoTelefone(b));
  return formasLocaisDoTelefone(a).some((f) => formasDeB.has(f));
}

// ─── Nome ────────────────────────────────────────────────────────────────────

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "d"]);

/** O que as pessoas escrevem antes do nome: "oi, meu nome é…", "sou a…". */
const ABERTURAS = new Set(["oi", "ola", "bom", "boa", "dia", "tarde", "noite", "meu", "nome", "eh", "me", "chamo", "sou", "eu", "o", "a"]);

function palavras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p !== "" && !PARTICULAS.has(p));
}

/**
 * O nome informado confere com o do cadastro?
 *
 * Confere quando o primeiro nome é igual e **todos** os outros nomes informados
 * estão no cadastro, sem acento, maiúscula nem partícula. Assim "Maria Silva"
 * confere com "Maria Aparecida da Silva" — ninguém escreve o nome inteiro no
 * WhatsApp —, mas "Maria Souza" não.
 *
 * Só o primeiro nome não basta quando o cadastro tem sobrenome: é a resposta
 * mais fácil de adivinhar.
 */
export function nomeConfere(informado: string, cadastrado: string): boolean {
  if (informado.length > MAX_CARACTERES_DO_NOME) return false;

  const ditas = palavras(informado);
  while (ditas.length > 0 && ABERTURAS.has(ditas[0]!)) ditas.shift();
  const doCadastro = palavras(cadastrado);

  if (ditas.length === 0 || doCadastro.length === 0) return false;
  if (ditas[0] !== doCadastro[0]) return false;

  const resto = ditas.slice(1);
  if (resto.length === 0) return doCadastro.length === 1;
  return resto.every((p) => doCadastro.includes(p));
}
