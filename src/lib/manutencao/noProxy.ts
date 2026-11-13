// Telas em manutenção (13/11/2026) — a lista que o proxy confere.
//
// O proxy não vai ao banco (ver src/proxy.ts): ele pergunta à rota
// `/api/manutencao/telas`, como já faz com o /api/auth/refresh, e guarda a
// resposta por escritório durante alguns segundos. Sem isso, toda abertura de
// tela de setor custaria uma ida ao servidor a mais.
//
// - Lista fresca (até `VALIDADE_MS`): usa a guardada.
// - Lista vencida: usa a guardada e busca a nova por trás — ninguém espera.
// - Primeira vez do escritório no processo: espera a busca, até `ESPERA_MS`.
// - Falha ou demora: segue com o que tinha (vazio na primeira vez) e tenta de
//   novo depois de `NOVA_TENTATIVA_MS`. A manutenção nunca derruba o Connect:
//   no pior caso, a tela abre como abria antes.
//
// Colocar ou tirar uma tela da manutenção leva até `VALIDADE_MS` para valer no
// proxy — a configuração avisa.

export const ROTA_DAS_TELAS_EM_MANUTENCAO = "/api/manutencao/telas";
export const VALIDADE_MS = 10_000;
export const ESPERA_MS = 1_500;
const NOVA_TENTATIVA_MS = 5_000;

const NENHUMA: ReadonlyMap<string, string> = new Map();

type Guardada = {
  /** Código da tela → id da manutenção (o "Abrir para testar" guarda o id). */
  codigos: ReadonlyMap<string, string>;
  /** Quando a lista deixa de valer (e a próxima abertura busca a nova). */
  venceEm: number;
  buscando: Promise<ReadonlyMap<string, string>> | null;
};

const porEscritorio = new Map<string, Guardada>();

function buscarDeNovo(tenantId: string, buscar: () => Promise<ReadonlyMap<string, string>>, agora: () => number): Promise<ReadonlyMap<string, string>> {
  const atual = porEscritorio.get(tenantId);
  if (atual?.buscando) return atual.buscando;
  const anteriores = atual?.codigos ?? NENHUMA;
  const busca = buscar().then(
    (codigos) => {
      porEscritorio.set(tenantId, { codigos, venceEm: agora() + VALIDADE_MS, buscando: null });
      return codigos;
    },
    (err) => {
      console.error("[manutencao] lista do proxy", err instanceof Error ? err.message : err);
      porEscritorio.set(tenantId, { codigos: anteriores, venceEm: agora() + NOVA_TENTATIVA_MS, buscando: null });
      return anteriores;
    },
  );
  porEscritorio.set(tenantId, { codigos: anteriores, venceEm: atual?.venceEm ?? 0, buscando: busca });
  return busca;
}

/**
 * As telas em manutenção do escritório (código → id da manutenção), pelo
 * cache do processo.
 * `buscar` é quem pergunta à rota (no proxy) — injetado para o teste.
 */
export async function telasEmManutencaoNoProxy(
  tenantId: string,
  buscar: () => Promise<ReadonlyMap<string, string>>,
  agora: () => number = Date.now,
): Promise<ReadonlyMap<string, string>> {
  const atual = porEscritorio.get(tenantId);
  if (atual && agora() < atual.venceEm) return atual.codigos;
  // Já teve uma resposta (ou uma falha): segue com ela enquanto a nova chega.
  // Sem resposta ainda (`venceEm` 0), espera a busca que está em andamento.
  if (atual && atual.venceEm > 0) {
    void buscarDeNovo(tenantId, buscar, agora);
    return atual.codigos;
  }
  return buscarDeNovo(tenantId, buscar, agora);
}

/** Para os testes: começa sem nada guardado. */
export function esquecerTelasEmManutencaoDoProxy(): void {
  porEscritorio.clear();
}
