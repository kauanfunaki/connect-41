// Comunicados da 41 aos clientes (01/10): para quem vai, a validação e o que a
// tela mostra da leitura. Funções puras, sem nada do servidor — o formulário,
// que roda no navegador, também lê daqui. Quem pode mandar fica em `acesso.ts`.

/**
 * Para quem vai:
 * - TODOS: todos os clientes ativos;
 * - SETOR: os clientes com serviço ativo no setor que comunica ("os clientes do DP");
 * - ESCOLHIDOS: os clientes marcados na lista.
 */
export type Publico = "TODOS" | "SETOR" | "ESCOLHIDOS";

export const PUBLICOS: { valor: Publico; rotulo: string; dica: string }[] = [
  { valor: "SETOR", rotulo: "Clientes do setor", dica: "Quem tem serviço ativo com o setor que comunica." },
  { valor: "ESCOLHIDOS", rotulo: "Clientes escolhidos", dica: "Marque os clientes na lista." },
  { valor: "TODOS", rotulo: "Todos os clientes", dica: "Todos os clientes ativos do escritório." },
];

export const LIMITE_DO_TITULO = 160;
export const LIMITE_DO_TEXTO = 10_000;

export type CamposDoComunicado = { titulo: string; texto: string; publico: Publico; setor: string; grupos: string[] };

export function validarComunicado(bruto: {
  titulo: string;
  texto: string;
  publico: string;
  setor: string;
  grupos: string[];
}): { ok: true; dados: CamposDoComunicado } | { ok: false; erro: string } {
  const titulo = bruto.titulo.trim();
  if (!titulo) return { ok: false, erro: "Dê um título ao comunicado." };
  if (titulo.length > LIMITE_DO_TITULO) return { ok: false, erro: "Título com no máximo 160 caracteres." };
  const texto = bruto.texto.trim();
  if (texto.length < 10) return { ok: false, erro: "Escreva o comunicado." };
  if (texto.length > LIMITE_DO_TEXTO) return { ok: false, erro: "Texto com no máximo 10.000 caracteres." };
  if (!PUBLICOS.some((p) => p.valor === bruto.publico)) return { ok: false, erro: "Escolha para quem vai." };
  const publico = bruto.publico as Publico;
  const setor = bruto.setor.trim();
  if (!setor) return { ok: false, erro: "Escolha o setor que comunica." };
  const grupos = Array.from(new Set(bruto.grupos.map((g) => g.trim()).filter(Boolean)));
  if (publico === "ESCOLHIDOS" && grupos.length === 0) return { ok: false, erro: "Marque ao menos um cliente." };
  return { ok: true, dados: { titulo, texto, publico, setor, grupos: publico === "ESCOLHIDOS" ? grupos : [] } };
}

export type LeituraDoGrupo = { grupoId: string; nome: string; leitores: { nome: string; em: Date }[] };

/** Quantos clientes (grupos) já têm alguém que leu — é o número que importa para quem mandou. */
export function resumoDaLeitura(grupos: LeituraDoGrupo[]): { clientes: number; leram: number } {
  return { clientes: grupos.length, leram: grupos.filter((g) => g.leitores.length > 0).length };
}
