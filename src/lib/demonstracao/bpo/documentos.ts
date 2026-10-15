// CNPJs da demonstração do BPO (15/10/2026).
//
// Mesma ideia dos do Recrutamento (`../recrutamento/documentos.ts`): números
// que não confundem com cadastro de verdade, com os dígitos verificadores
// certos, para o Connect aceitar em qualquer tela.
//
// - **Padaria (matriz e filiais): raiz 41.000.010**, ordens 0001, 0002 e 0003.
//   A matriz e as filiais precisam da mesma raiz e de ordens diferentes — é
//   como o Connect reconhece a família —, então aqui não dá para usar a ordem
//   0000. O script confere, antes de gravar, que nenhum destes já existe no
//   escritório; as raízes que o SPED sincroniza são uma fotografia fixa
//   (`src/lib/sped/raizesSincronizadas.ts`), e empresa nova não entra nela.
// - **Contrapartes: raiz 41.000.2NN com a ordem 0000**, que nunca é emitida.
//   Ficam fora da faixa do Recrutamento (41.000.00N).

/** Os dois dígitos verificadores de um CNPJ a partir dos 12 primeiros. */
function digitosDoCnpj(base12: string): string {
  const dv = (parcial: string) => {
    const pesos = parcial.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < parcial.length; i++) soma += Number(parcial[i]) * pesos[i]!;
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(base12);
  return `${d1}${dv(base12 + d1)}`;
}

/** CNPJ completo (só dígitos) a partir da raiz de 8 e da ordem de 4. */
export function cnpjComDigitos(raiz: string, ordem: string): string {
  if (!/^\d{8}$/.test(raiz) || !/^\d{4}$/.test(ordem)) throw new Error(`CNPJ fictício malformado: ${raiz}/${ordem}`);
  return raiz + ordem + digitosDoCnpj(raiz + ordem);
}

export const RAIZ_DA_PADARIA = "41000010";

/** Matriz = 1, filiais = 2, 3… */
export function cnpjDaPadaria(ordem: number): string {
  if (!Number.isInteger(ordem) || ordem < 1 || ordem > 9) throw new Error(`Ordem fora da faixa: ${ordem}`);
  return cnpjComDigitos(RAIZ_DA_PADARIA, `000${ordem}`);
}

/** A n-ésima contraparte (1 a 99): 41.000.2NN/0000-DV. */
export function cnpjDeContraparte(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error(`Contraparte fora da faixa: ${n}`);
  return cnpjComDigitos(`410002${String(n).padStart(2, "0")}`, "0000");
}

/** "41000010000180" → "41.000.010/0001-80". */
export function cnpjFormatado(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/** O domínio de todo e-mail fictício: `.invalido` não é domínio de topo, nada chega a ninguém. */
export const DOMINIO_FICTICIO = "@exemplo.invalido";
