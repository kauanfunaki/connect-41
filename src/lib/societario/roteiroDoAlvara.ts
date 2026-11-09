// O caminho alternativo da etapa do alvará: o PROCEC (09/11/2026).
//
// Pelo que o setor descreveu em 15/09, abertura, mudança de endereço e de
// atividades seguem as licenças dentro do site da Junta Comercial (Empresa
// Fácil), e a prefeitura integra o alvará sozinha. A exceção: quando o alvará
// não integra por erro na Junta, o setor abre o protocolo no PROCEC, pelo
// e-Cidadão de Curitiba. É manual, e continua manual.
//
// Por que vai na descrição da etapa, e não numa etapa ou item próprio:
// - etapa à parte obrigaria a concluir as duas quando o alvará não integra (a
//   de sempre não é opcional, e não tem "Não se aplica"), e cada conclusão de
//   etapa com órgão abre um protocolo: seriam dois para um pedido só;
// - item de checklist entra na abertura guiada como "pedir ao cliente" — o
//   pedido de documentos mandaria o cliente abrir protocolo no PROCEC.
// Na descrição, o caminho aparece dentro da própria etapa, e o número do
// protocolo do PROCEC é o que se digita ao concluí-la.

/** A etapa do roteiro do alvará em que a prefeitura recebe o pedido. */
export const ETAPA_DO_PROTOCOLO_DO_ALVARA = "Emissão da taxa / protocolo";

/** O código do tipo de processo do alvará (`ProcessType.code`). */
export const TIPO_DO_ALVARA = "alvara";

export const CAMINHO_DO_PROCEC =
  "Pela Junta Comercial (Empresa Fácil), a prefeitura integra o alvará sozinha. " +
  "Caminho alternativo, manual: se o alvará não integrar por erro na Junta, abra o protocolo no PROCEC, " +
  "pelo e-Cidadão de Curitiba, e registre o número dele aqui ao concluir a etapa.";

/** O teto de `ProcessTemplateStep.description` (VarChar(1000)). */
const TETO_DA_DESCRICAO = 1000;

/**
 * A descrição da etapa com o caminho do PROCEC, ou `null` quando ela já o tem
 * (rodar o script duas vezes não repete o texto). O que o escritório já tinha
 * escrito fica, e o caminho vem depois.
 */
export function descricaoComProcec(atual: string | null | undefined): string | null {
  const texto = (atual ?? "").trim();
  if (/PROCEC/i.test(texto)) return null;
  const nova = texto ? `${texto} ${CAMINHO_DO_PROCEC}` : CAMINHO_DO_PROCEC;
  if (nova.length > TETO_DA_DESCRICAO) {
    throw new Error(`A descrição passaria de ${TETO_DA_DESCRICAO} caracteres; ajuste à mão.`);
  }
  return nova;
}
