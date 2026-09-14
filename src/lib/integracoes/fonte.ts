// De onde vem a credencial de uma integração que ainda tem fonte antiga.
//
// É o passo 4 de 5 da convergência (ver `scripts/converger-integracoes.ts`): os
// leitores de Chatwoot e SPED passam a preferir `TenantIntegration`, com as
// colunas antigas (ou o `.env`, no caso do SPED) como fallback.
//
// ─── O interruptor é o `enabled` ────────────────────────────────────────────
//
// O script criou as integrações **desligadas**. Se o leitor ignorasse o
// `enabled`, o Connect passaria a autenticar com a cópia no dia do deploy, sem
// ninguém ter conferido a vitrine — que é justamente o passo 3. Respeitando,
// ligar na vitrine é o ato que troca a fonte, cliente a cliente, e desligar
// devolve à fonte antiga. Reversível sem deploy.
//
// ─── Tudo ou nada, por grupo de campos ──────────────────────────────────────
//
// Nunca mistura: URL da integração com token antigo autentica contra um
// servidor com a chave de outro, e o 401 que sai disso não aponta para causa
// nenhuma. Ou o grupo inteiro vem da integração, ou vem inteiro da fonte antiga.

export type IntegracaoGravada = { enabled: boolean; config: Record<string, string> } | null;

export type EscolhaDeCredencial<K extends string> =
  | { fonte: "integracao"; valores: Record<K, string> }
  | {
      fonte: "legado";
      valores: Record<K, string>;
      /**
       * A integração estava ligada e não tinha os campos — config que não
       * decifrou, por exemplo. Cai na fonte antiga em vez de derrubar a
       * integração, mas o chamador precisa registrar: é o tipo de queda que,
       * silenciosa, faz alguém editar a vitrine sem efeito nenhum.
       */
      integracaoIncompleta: boolean;
    };

/**
 * Escolhe a fonte da credencial.
 *
 * `legado` é função, e não valor, para só ser lida quando for usada: a fonte
 * antiga do Chatwoot é texto cifrado, e decifrá-lo quando a integração já
 * respondeu seria arriscar uma exceção (chave trocada) por um dado descartado.
 */
export function escolherCredencial<K extends string>(
  integracao: IntegracaoGravada,
  campos: readonly K[],
  legado: () => Record<K, string> | null
): EscolhaDeCredencial<K> | null {
  if (integracao?.enabled) {
    const completa = campos.every((c) => (integracao.config[c] ?? "").trim() !== "");
    if (completa) {
      const valores = {} as Record<K, string>;
      for (const c of campos) valores[c] = integracao.config[c];
      return { fonte: "integracao", valores };
    }
    const antigo = legado();
    return antigo ? { fonte: "legado", valores: antigo, integracaoIncompleta: true } : null;
  }

  const antigo = legado();
  return antigo ? { fonte: "legado", valores: antigo, integracaoIncompleta: false } : null;
}
