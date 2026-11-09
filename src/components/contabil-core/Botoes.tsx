"use client";

import { AcaoComMotivo, BotaoDeAcao } from "./Acoes";
import {
  cancelarClassificacaoAction,
  desfazerImportacaoAction,
  excluirContaAction,
  liberarParaAutomaticoAction,
  mudarAtivaDaAgenciaAction,
  mudarAtivaDaRegraAction,
} from "@/app/(app)/contabil-core/actions";

// Os botões de ação das tabelas do Contábil Core, já ligados às ações do servidor (a página é
// componente de servidor e não pode passar função para o navegador).

export function AlternarRegra({ empresaId, regraId, ativa }: { empresaId: string; regraId: string; ativa: boolean }) {
  return (
    <BotaoDeAcao
      rotulo={ativa ? "Desativar" : "Reativar"}
      variante="ghost"
      sucesso={ativa ? "Regra desativada: o NEO não a aplica mais." : "Regra reativada."}
      acao={() => mudarAtivaDaRegraAction(empresaId, regraId, !ativa)}
    />
  );
}

export function AlternarAgencia({ empresaId, agenciaId, ativa }: { empresaId: string; agenciaId: string; ativa: boolean }) {
  return (
    <BotaoDeAcao
      rotulo={ativa ? "Inativar" : "Reativar"}
      variante="ghost"
      sucesso={ativa ? "Conta inativada. O histórico continua." : "Conta reativada."}
      confirmar={
        ativa
          ? { titulo: "Inativar conta bancária?", texto: "Ela sai da exportação do Domínio (a menos que você inclua as inativas). O histórico de transações continua." }
          : undefined
      }
      acao={() => mudarAtivaDaAgenciaAction(empresaId, agenciaId, !ativa)}
    />
  );
}

export function ExcluirConta({ empresaId, contaId, codigo }: { empresaId: string; contaId: string; codigo: string }) {
  return (
    <BotaoDeAcao
      rotulo="Excluir"
      variante="ghost"
      sucesso={`Conta ${codigo} excluída.`}
      confirmar={{ titulo: `Excluir a conta ${codigo}?`, texto: "Só sai se nenhuma regra, contraparte, conta bancária, conta filha ou lançamento a usar.", destrutivo: true }}
      acao={() => excluirContaAction(empresaId, contaId)}
    />
  );
}

export function DesfazerImportacao({ empresaId, importacaoId, nome }: { empresaId: string; importacaoId: string; nome: string }) {
  return (
    <AcaoComMotivo
      rotulo="Desfazer"
      titulo={`Desfazer a importação de ${nome}?`}
      texto="As transações deste arquivo saem, e as que já estavam classificadas têm o lançamento cancelado antes. Depois o mesmo arquivo pode ser importado de novo."
      sucesso="Importação desfeita."
      acao={(motivo) => desfazerImportacaoAction(empresaId, importacaoId, motivo)}
    />
  );
}

export function CancelarClassificacao({ empresaId, transacaoId }: { empresaId: string; transacaoId: string }) {
  return (
    <AcaoComMotivo
      rotulo="Desfazer"
      titulo="Desfazer a classificação?"
      texto="O lançamento é cancelado e a transação volta para a fila do NEO, esperando decisão de uma pessoa (o automático não a reclassifica)."
      sucesso="Classificação desfeita. A transação voltou para a fila."
      acao={(motivo) => cancelarClassificacaoAction(empresaId, transacaoId, motivo)}
    />
  );
}

export function LiberarParaAutomatico({ empresaId, transacaoId }: { empresaId: string; transacaoId: string }) {
  return (
    <BotaoDeAcao
      rotulo="Devolver ao automático"
      variante="link"
      sucesso="A transação volta a ser classificada pelo NEO na próxima execução."
      acao={() => liberarParaAutomaticoAction(empresaId, transacaoId)}
    />
  );
}
