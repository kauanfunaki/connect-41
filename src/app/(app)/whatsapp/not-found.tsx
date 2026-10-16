import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PainelVazio } from "@/components/conversas/caixa/Caixa";

/**
 * Conversa que não existe (apagada, link velho, de outro escritório): o aviso
 * fica no painel da direita, e a lista ao lado continua (14/10/2026). No
 * celular, o painel ocupa a tela — o botão volta à lista.
 */
export default function ConversaNaoEncontrada() {
  return (
    <PainelVazio
      icone={<SearchX />}
      titulo="Conversa não encontrada"
      texto="Ela pode ter sido apagada, ou o link não é deste escritório. Escolha outra conversa na lista."
    >
      <Button href="/whatsapp" variant="secondary" size="sm" className="mt-2 lg:hidden">
        Voltar à lista
      </Button>
    </PainelVazio>
  );
}
