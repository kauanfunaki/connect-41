// O que cada código de ação da auditoria quer dizer, em português — a frase da
// linha do tempo (/admin/auditoria), o tipo para os botões "Criou / Editou /
// Excluiu" e a área do Connect de onde a ação veio.
//
// Até 14/10/2026 só 52 dos ~250 códigos tinham nome; o resto aparecia cru na
// tela ("financeiro.entry.reversed"). O teste `acoes.test.ts` varre o código
// atrás de todo `logAudit({ action })` e falha se um código novo não estiver
// aqui — ação nova pede a frase junto.
//
// Puro, sem banco.

/** O que a ação fez com o cadastro — os botões de filtro da tela. "outro" só aparece em "Tudo". */
export type TipoDaAcao = "criou" | "editou" | "excluiu" | "outro";

export type DescricaoDaAcao = {
  tipo: TipoDaAcao;
  /**
   * O verbo com o que vem antes do nome do cadastro: "editou o documento
   * fiscal" + " NF-e 4.512". Quem fez vem antes, na tela.
   */
  frase: string;
  /** `false`: o nome do cadastro não entra na frase (a pessoa mexeu na própria conta). */
  comNome?: boolean;
  /** A chave dos detalhes que guarda o nome, quando não é `nome`/`name`/`title`/`label`. */
  chaveDoNome?: string;
};

const c = (frase: string, extra: Partial<DescricaoDaAcao> = {}): DescricaoDaAcao => ({ tipo: "criou", frase, ...extra });
const e = (frase: string, extra: Partial<DescricaoDaAcao> = {}): DescricaoDaAcao => ({ tipo: "editou", frase, ...extra });
const x = (frase: string, extra: Partial<DescricaoDaAcao> = {}): DescricaoDaAcao => ({ tipo: "excluiu", frase, ...extra });
const o = (frase: string, extra: Partial<DescricaoDaAcao> = {}): DescricaoDaAcao => ({ tipo: "outro", frase, ...extra });

export const ACOES: Readonly<Record<string, DescricaoDaAcao>> = {
  "github.pause": e("pausou a sincronização do GitHub"),
  "github.resume": e("retomou a sincronização do GitHub"),
  "github.disconnect": e("desconectou a conta do GitHub"),
  "github.discover": o("atualizou a lista de repositórios do GitHub"),
  "github.track": e("passou a acompanhar um usuário do GitHub"),
  "github.untrack": e("deixou de acompanhar um usuário do GitHub"),
  "github.credentials": e("configurou as credenciais do OAuth App do GitHub"),
  "github.settings": e("configurou os repositórios monitorados do GitHub"),
  "github.full_sync": o("forçou a atualização completa do histórico do GitHub"),
  "github.account_link": o("vinculou a própria conta do GitHub"),
  "github.account_unlink": o("desvinculou a própria conta do GitHub"),
  "helpdesk.created": c("abriu o chamado"),
  "helpdesk.updated": e("atualizou o chamado"),
  "helpdesk.access": e("configurou os setores solicitantes dos chamados"),
  "helpdesk.category": e("configurou a categoria de chamados"),
  "helpdesk.sla": e("configurou a política de SLA dos chamados"),
  "tech_interno.item.create": c("criou o item do controle interno do Tech"),
  "tech_interno.item.update": e("editou o item do controle interno do Tech"),
  "tech_interno.item.status": e("mudou a situação do item do controle interno do Tech"),
  "tech_interno.item.comment": e("comentou no item do controle interno do Tech"),
  "helpdesk.ai_fallback": e("configurou a IA alternativa dos chamados"),
  "ops.aviso_fechado": e("fechou o aviso de erro do robô no Ops Center"),
  // ── Cadastros ──────────────────────────────────────────────────────────────
  "company.create": c("criou a empresa"),
  "company.update": e("editou a empresa"),
  "company.ie_situacao": e("registrou a situação da inscrição estadual da empresa"),
  "company.delete": x("excluiu a empresa"),
  "person.create": c("criou a pessoa"),
  "person.update": e("editou a pessoa"),
  "person.delete": x("excluiu a pessoa"),
  // A conta de acesso da pessoa, pela aba Acesso da ficha (lote 8, 28/10/2026).
  "person.link_user": e("ligou a conta de acesso da pessoa"),
  "person.unlink_user": e("desligou a conta de acesso da pessoa"),
  "companyservice.create": c("adicionou um setor contratado"),
  "companyservice.assign": e("trocou o responsável de um setor contratado"),
  // A tela Clientes saiu em 15/10/2026 (etapa 3 da saída do Cliente): as
  // ações ficam aqui para o histórico continuar legível.
  "clientGroup.create": c("criou o cliente"),
  "clientGroup.update": e("editou o cliente"),
  "clientGroup.activate": e("reativou o cliente"),
  "clientGroup.deactivate": e("desativou o cliente"),
  "clientGroup.delete": x("excluiu o cliente"),
  "clientGroup.companies.linked": e("vinculou empresas ao cliente", { chaveDoNome: "cliente" }),
  "clientGroup.companies.unlinked": e("desvinculou uma empresa do cliente", { chaveDoNome: "cliente" }),
  "branch.create": c("criou a filial"),
  "branch.update": e("editou a filial"),
  "certificados.importar": c("importou certificados digitais"),

  // ── Fiscal ─────────────────────────────────────────────────────────────────
  "fiscal.document.uploaded": c("enviou o documento fiscal"),
  "fiscal.document.edit": e("editou o documento fiscal"),
  "fiscal.document.destination": e("mudou o destino do documento fiscal"),
  "fiscal.document.delete": x("excluiu o documento fiscal"),
  // O motor SPED operado pelo Connect (22/10/2026, API-CONNECT §8.2).
  "fiscal.sped.execucao.solicitada": c("pediu ao motor SPED a execução"),
  "fiscal.sped.execucao.cancelada": e("cancelou no motor SPED a execução"),
  "fiscal.sped.execucao.destravada": e("destravou no motor SPED a execução"),
  "fiscal.sped.arquivo.regerado": c("pediu ao motor SPED uma nova geração do arquivo"),
  "fiscal.sped.arquivo.validado": o("pediu ao motor SPED a validação do arquivo"),
  "fiscal.sped.arquivo.entregue": e("registrou no motor SPED a entrega do arquivo"),
  "fiscal.sped.estabelecimento.editado": e("editou no motor SPED o estabelecimento"),
  "fiscal.sped.decisao.gravada": e("gravou no motor SPED a decisão"),
  "fiscal.sped.decisao.apagada": x("apagou no motor SPED a decisão"),
  "fiscal.sped.decisao.criada": c("lançou no motor SPED a decisão"),
  // As escritas das telas fiscais (23/10/2026, API-CONNECT §13).
  "fiscal.sped.cobertura.apurada": c("pediu ao motor SPED a apuração da cobertura, na execução"),
  "fiscal.sped.quarentena.resolvida": e("resolveu no motor SPED o rejeitado da quarentena"),
  "fiscal.sped.quarentena.reaberta": e("reabriu no motor SPED o rejeitado da quarentena"),
  "fiscal.sped.documentos.enviados": c("enviou documentos ao motor SPED, na"),
  "fiscal.sped.pagamento.decidido": e("decidiu no motor SPED o pagamento"),
  "fiscal.sped.pagamento.corrigido": e("corrigiu no motor SPED o pagamento"),
  "fiscal.sped.contrato.informado": e("informou no motor SPED o contrato de aluguel de"),
  "fiscal.sped.cte.apurado": o("apurou no motor SPED o CT-e do arquivo"),
  "fiscal.sped.simulacao.gravada": e("gravou no motor SPED a simulação"),
  "fiscal.sped.simulacao.apagada": x("apagou no motor SPED a simulação"),
  "fiscal.sped.combustivel.apurado": o("apurou no motor SPED o combustível de"),
  "fiscal.sped.omie.conferido": c("conferiu no motor SPED o relatório do Omie"),
  "fiscal.sped.conferencia.decidida": e("decidiu no motor SPED o documento da conferência"),
  "fiscal.sped.confronto.enviado": c("confrontou no motor SPED a planilha do BPO"),
  // As lacunas fechadas (23/10/2026, API-CONNECT §14).
  "fiscal.sped.regime.definido": e("corrigiu no motor SPED o regime do prestador"),
  "fiscal.sped.regime.apagado": x("apagou no motor SPED a correção de regime do prestador"),
  "fiscal.sped.quarentena.reprocessada": c("pediu ao motor SPED o reprocessamento da quarentena, na execução"),
  "fiscal.sped.pagamentos_apoio.importados": c("importou no motor SPED os pagamentos de apoio"),
  "fiscal.sped.faturas_bpo.importadas": c("importou no motor SPED as faturas do BPO da planilha"),
  "fiscal.sped.upload.criado": c("abriu no motor SPED o envio em partes"),
  "fiscal.sped.upload.concluido": c("concluiu no motor SPED o envio em partes, na"),
  "fiscal.sped.upload.cancelado": x("cancelou no motor SPED o envio em partes"),
  "autorizacoes.quem_recebe": e("mudou quem recebe as autorizações de acesso"),
  "autorizacoes.salvar": e("atualizou a autorização de acesso"),
  "autorizacoes.serpro": o("conferiu no Serpro a autorização de acesso"),
  "autorizacoes.serpro_lote": o("conferiu no Serpro as autorizações de acesso, em lote"),
  "autorizacoes.serpro_sitfis": o("pediu no Serpro a situação fiscal da empresa"),
  "autorizacoes.serpro_guia": o("emitiu no Serpro uma guia federal da empresa"),
  "autorizacoes.serpro_ccmei": o("emitiu no Serpro o certificado de MEI da empresa"),
  "autorizacoes.guia_paga": e("marcou a guia como paga"),
  "autorizacoes.guia_reaberta": e("desmarcou a guia como paga"),
  "autorizacoes.serpro_caixa_postal": o("abriu uma mensagem da Caixa Postal da Receita, dando ciência"),

  // ── BPO ────────────────────────────────────────────────────────────────────
  "financeiro.entry.created_manual": c("criou o lançamento"),
  "financeiro.entry.created_from_document": c("lançou um documento fiscal, criando o lançamento"),
  "financeiro.entry.created_from_bank_transaction": c("criou a partir do extrato o lançamento"),
  "financeiro.entry.imported_csv": c("importou de uma planilha lançamentos da empresa"),
  "financeiro.entry.cancelled_manual": e("cancelou o lançamento"),
  "financeiro.entry.reversed": e("estornou o lançamento"),
  "finance.pay": e("deu baixa no lançamento"),
  "finance.unpay": e("desfez a baixa do lançamento"),
  "finance.review": e("conferiu o lançamento"),
  "finance.cost_center_set": e("trocou o centro de custo do lançamento"),
  "finance.edit": e("editou o lançamento"),
  "finance.advance": c("registrou o adiantamento"),
  "finance.advance_undone": e("desfez o adiantamento"),
  "finance.card_created": c("cadastrou o cartão de crédito"),
  "finance.card_updated": e("editou o cartão de crédito"),
  "finance.attachment_added": e("anexou um arquivo ao lançamento"),
  "finance.attachment_removed": e("tirou um anexo do lançamento"),
  "financeiro.approval.sent": o("mandou para a aprovação do cliente o lançamento"),
  "financeiro.approval.resent": o("reenviou para a aprovação do cliente o lançamento"),
  "financeiro.approval.approved": e("aprovou o lançamento"),
  "financeiro.approval.rejected": e("reprovou o lançamento"),
  "financeiro.approval_limit.saved": e("salvou a alçada de aprovação"),
  "financeiro.approval_limit.deactivated": e("desligou a alçada de aprovação"),
  "financeiro.approval_limit.reactivated": e("religou a alçada de aprovação"),
  "financeiro.bank_account.created": c("cadastrou a conta bancária"),
  "financeiro.bank_account.updated": e("editou a conta bancária"),
  "financeiro.bank_account.deactivated": e("desativou a conta bancária"),
  "financeiro.bank_account.reactivated": e("reativou a conta bancária"),
  "financeiro.bank_statement.imported": c("importou um extrato bancário"),
  "financeiro.bank_transaction.reconciled": e("conciliou um movimento do extrato"),
  "financeiro.bank_transaction.unreconciled": e("desfez a conciliação de um movimento do extrato"),
  "financeiro.transfer.created": c("registrou como transferência entre contas um movimento do extrato"),
  "financeiro.bank_transaction.ignored": e("ignorou um movimento do extrato"),
  "financeiro.bank_transaction.reopened": e("reabriu um movimento do extrato"),
  // Exportação para a Domínio (fila do BPO, 21/10).
  "financeiro.dominio.exported": o("exportou para a Domínio as baixas da empresa"),
  "financeiro.dominio.depara_saved": e("atualizou o de-para da Domínio da empresa"),
  // De-para e lançamentos do Contábil, e o SPED Contribuições pedido de lá (29/10/2026).
  "contabil.regra.salva": e("gravou a regra do de-para contábil do fornecedor"),
  "contabil.regra.desconsiderada": e("deixou fora da contabilidade"),
  "contabil.regra.removida": x("removeu a regra do de-para contábil de"),
  "contabil.modelos.salvos": e("atualizou as contas fixas do Contábil", { comNome: false }),
  "contabil.plano.carregado": o("carregou o plano de contas da Domínio", { chaveDoNome: "arquivo" }),
  "contabil.sped.contribuicoes.solicitada": c("pediu ao motor SPED o EFD Contribuições"),
  "contabil.regra.reativada": e("reativou a regra do de-para contábil"),
  "contabil.regras.importadas": e("importou regras do de-para contábil", { comNome: false }),
  "contabil.sugestoes.confirmadas": e("confirmou sugestões de contas do Contábil", { comNome: false }),
  "contabil.cfop.salvo": e("atualizou a sugestão de débito por CFOP", { comNome: false }),
  "contabil.cfop.removido": x("removeu a sugestão de débito por CFOP", { comNome: false }),
  "contabil.sped.execucao.cancelada": e("cancelou o pedido de Contribuições"),
  "contabil.sped.execucao.destravada": e("destravou o pedido de Contribuições"),
  "contabil.sped.arquivo.regerado": c("pediu nova geração do EFD Contribuições"),
  "contabil.sped.arquivo.validado": o("pediu a validação do EFD Contribuições"),
  "contabil.sped.arquivo.entregue": e("registrou a entrega do EFD Contribuições"),
  "contabil.sped.decisao.gravada": e("gravou uma decisão de Contribuições"),
  "contabil.sped.decisao.apagada": x("apagou uma decisão de Contribuições"),
  "contabil.sped.decisao.criada": c("lançou um ajuste de Contribuições"),
  "contabil.sped.pagamento.decidido": e("decidiu um pagamento de apoio de Contribuições"),
  "contabil.sped.pagamento.corrigido": e("corrigiu um pagamento de apoio de Contribuições"),
  "contabil.sped.contrato.informado": e("informou o contrato de aluguel de Contribuições"),
  "contabil.sped.cte.apurado": o("apurou CT-e para o fechamento de Contribuições"),
  "contabil.sped.pagamentos_apoio.importados": c("importou pagamentos de apoio de Contribuições"),
  "contabil.sped.faturas_bpo.importadas": c("importou faturas do BPO para Contribuições"),
  // Regras de conciliação (fila do BPO, 21/10).
  "financeiro.bank_rule.created": c("criou a regra de conciliação"),
  "financeiro.bank_rule.updated": e("editou a regra de conciliação"),
  "financeiro.bank_rule.paused": e("pausou a regra de conciliação"),
  "financeiro.bank_rule.resumed": e("retomou a regra de conciliação"),
  "financeiro.bank_rule.deleted": x("excluiu a regra de conciliação"),
  "financeiro.bank_rule.applied": e("aplicou às linhas pendentes do extrato a regra de conciliação"),
  "financeiro.bank_rule.undone": e("desfez o que uma regra de conciliação lançou"),
  "financeiro.entry.created_by_bank_rule": c("lançou pela regra de conciliação o lançamento"),
  "financeiro.entry.created_by_recurrence": c("criou as próximas contas da repetição"),
  // Mudar a série daqui em diante (22/10/2026): o aluguel reajustado.
  "financeiro.entry.series_changed": e("mudou, desta conta em diante, a série do lançamento"),
  "financeiro.categoria.linha_da_dre": e("ligou a uma linha da DRE a categoria"),
  // Juros e multa pelo atraso (22/10/2026).
  "financeiro.encargos.empresa_salvos": e("salvou a regra de juros e multa pelo atraso da empresa"),
  "financeiro.categoria_da_empresa.criada": c("criou a categoria"),
  "financeiro.categoria_da_empresa.alterada": e("editou a categoria"),
  "financeiro.categoria_padrao.escondida": e("escondeu da empresa uma categoria do plano padrão"),
  "financeiro.categoria_padrao.mostrada": e("voltou a mostrar para a empresa uma categoria do plano padrão"),
  "financeiro.client_request.created": c("abriu a pendência ao cliente"),
  "financeiro.client_request.replied": o("respondeu a pendência ao cliente"),
  "financeiro.client_request.resolved": e("resolveu a pendência ao cliente"),
  "financeiro.client_request.reopened": e("reabriu a pendência ao cliente"),
  "financeiro.client_request.cancelled": e("cancelou a pendência ao cliente"),
  "financeiro.collection.contact": o("registrou um contato de cobrança do lançamento"),
  "financeiro.collection.owner": e("trocou o responsável pela cobrança do lançamento"),
  "financeiro.collection.agreement_created": c("fez um acordo de cobrança"),
  "financeiro.collection.agreement_broken": e("marcou como quebrado um acordo de cobrança"),
  "financeiro.collection.agreement_undone": e("desfez um acordo de cobrança"),
  "financeiro.collection.loss": e("lançou como perda o lançamento"),
  "financeiro.collection.loss_reverted": e("desfez a perda do lançamento"),
  "financeiro.collection.reminder_config": e("configurou a régua de lembretes de cobrança"),
  "financeiro.collection.reminder_opt_in": e("voltou a mandar lembretes de cobrança para a empresa"),
  "financeiro.collection.reminder_opt_out": e("parou os lembretes de cobrança para a empresa"),
  "financeiro.company_message.sent": o("mandou uma mensagem para a empresa"),
  "financeiro.cost_center.created": c("criou o centro de custo"),
  "financeiro.cost_center.updated": e("editou o centro de custo"),
  "financeiro.project.created": c("criou o projeto"),
  "financeiro.project.updated": e("editou o projeto"),
  "financeiro.counterparty.created": c("cadastrou o fornecedor ou sacado"),
  "financeiro.counterparty.updated": e("editou o fornecedor ou sacado"),
  "financeCategory.create": c("criou a categoria"),
  "financeCategory.update": e("editou a categoria"),
  "financeCategory.activate": e("reativou a categoria"),
  "financeCategory.deactivate": e("desativou a categoria"),
  "financeCategory.plano_padrao": c("carregou o plano de contas padrão", { comNome: false }),
  "dre.import": c("importou de um arquivo a DRE da empresa"),
  "dre.map": e("ligou uma categoria a uma linha da DRE da empresa"),
  "dre.unmap": e("desligou uma categoria da DRE da empresa"),
  // A troca do modelo do DRE (21/10/2026), com o grupo de cada categoria em `classificacao`.
  "dre.modelo": e("trocou o modelo do DRE da empresa"),
  // Correção feita por script, com o "de → para" em `linhaDaDre` (14/10/2026).
  "dre.categoria.linha_corrigida": e("corrigiu a linha da DRE da categoria"),
  "dre.budget.created": c("criou o orçamento"),
  "dre.budget.saved": e("salvou o orçamento"),
  "dre.budget.approved": e("aprovou o orçamento"),
  "dre.budget.reopened": e("reabriu o orçamento"),
  "bpoCredential.create": c("cadastrou no repositório a senha"),
  "bpoCredential.update": e("editou no repositório a senha"),
  "bpoCredential.delete": x("excluiu do repositório a senha"),
  "integration.omie.financeiro": o("trouxe do Omie o financeiro da empresa"),
  "integration.omie.virada": o("virou do Omie para o Connect o financeiro da empresa"),
  "integration.omie.virada_desfeita": o("desfez a virada do Omie da empresa"),
  "integration.omie.nfse_emitir": c("emitiu pelo Omie uma NFS-e"),
  "integration.omie.nfse_cancelar": o("cancelou no Omie uma NFS-e"),

  // ── DP ─────────────────────────────────────────────────────────────────────
  "termination.check": e("marcou um item da conferência do desligamento"),

  // ── Recrutamento ───────────────────────────────────────────────────────────
  "vaga.acesso_recrutadores": e("mudou quem vê a vaga"),
  "vaga.requisitos": e("salvou os requisitos da triagem da vaga"),
  "candidatura.respostas": e("editou as respostas da candidatura de"),
  "ai.resumeExtract": o("preencheu com IA os dados do currículo de"),
  "assessmentTemplate.create": c("criou o modelo de teste"),
  "assessmentTemplate.update": e("editou o modelo de teste"),
  "assessmentTemplate.archive": e("arquivou o modelo de teste"),
  "assessmentTemplate.unarchive": e("reativou o modelo de teste"),
  "assessmentTemplate.delete": x("excluiu o modelo de teste"),
  "whatsapp.reply": o("respondeu uma conversa do WhatsApp"),
  "whatsapp.assign": e("assumiu uma conversa do WhatsApp"),
  "whatsapp.unassign": e("largou uma conversa do WhatsApp"),
  "whatsapp.transfer": e("passou para outra pessoa uma conversa do WhatsApp"),
  "whatsapp.returnToBot": e("devolveu ao robô uma conversa do WhatsApp"),
  "whatsapp.close": e("encerrou uma conversa do WhatsApp"),
  "whatsapp.link": e("ligou uma conversa do WhatsApp a uma candidatura"),
  "whatsapp.unlink": e("desligou uma conversa do WhatsApp da candidatura"),

  // ── Societário ─────────────────────────────────────────────────────────────
  "process.open": c("abriu o processo"),
  "process.update": e("editou o processo"),
  "process.protocol": e("registrou o protocolo do processo"),
  "process.requirement": e("registrou uma exigência no processo"),
  "process.robot_submit": o("mandou o robô protocolar o processo"),
  "process.fee_sent": o("enviou ao cliente a taxa do processo"),
  "process.fee_created": c("lançou uma taxa no processo"),
  "process.fee_paid": e("marcou a taxa do processo como paga"),
  "process.fee_unpaid": e("desmarcou o pagamento da taxa do processo"),
  "process.fee_deleted": x("excluiu uma taxa do processo"),
  "process.aviso_orgao_aplicado": e("aplicou um aviso do órgão ao processo"),
  "societario.processo.situacao": e("mudou a situação do processo"),
  "societario.processo.mensagem": o("mandou uma mensagem no processo"),
  "societario.processo.documento": c("anexou documentos ao processo"),
  "societario.robo.pedido": c("pediu ao robô a impressão do alvará"),
  "societario.robo.cancelada": o("tirou uma tarefa da fila do robô"),
  "societario.robo.aceite_alvara": o("teve o aceite de acessibilidade do alvará marcado pelo robô"),
  "societario.ia.varredura_aplicada": e("aplicou a varredura da IA"),
  "societario.ia.proposta_rejeitada": e("recusou uma proposta da IA"),
  "societario.cobranca_de_protocolo": e("mudou o prazo para cobrar o órgão do protocolo parado"),
  "societario.certidao_emitida": o("pediu uma certidão da empresa pela InfoSimples"),
  "societario.certidao_vista": e("marcou a certidão positiva como vista"),
  "empresa.socio.importado_da_receita": c("importou da Receita os sócios da empresa"),
  "empresa.socio.importado_do_contrato": c("importou do contrato social os sócios da empresa"),
  "empresa.socio.saida": e("registrou a saída do sócio"),
  "license.create": c("cadastrou uma licença"),
  "license.update": e("editou uma licença"),
  "license.revoke": e("revogou uma licença"),
  "license.reactivate": e("reativou uma licença"),
  "license.import_radar": c("trouxe as licenças do Radar Societário"),

  // ── Gestão e Comercial ─────────────────────────────────────────────────────
  "gestao.reatribuir": e("trocou o responsável de"),
  "gestao.limites": e("mudou os prazos de alerta do Painel de Gestão do setor"),
  "valora.parametros": e("mudou os parâmetros do Valora"),
  "valora.proposta.criar": c("criou uma proposta no Valora"),
  "valora.proposta.atualizar": e("editou uma proposta do Valora"),
  "lead.situacao": e("mudou a situação do lead"),
  "lead.responsavel": e("trocou o responsável do lead"),
  "lead.observacoes": e("editou as observações do lead"),
  "lead.excluido": x("excluiu o lead"),

  // ── Arquivos ───────────────────────────────────────────────────────────────
  "drive.folder_create": c("criou a pasta"),
  "drive.folder_rename": e("renomeou a pasta"),
  "drive.folder_sector": e("trocou o setor da pasta"),
  "drive.folder_move": e("moveu a pasta"),
  "drive.folder_share": e("compartilhou com o cliente a pasta"),
  "drive.folder_unshare": e("deixou de compartilhar com o cliente a pasta"),
  "drive.folder_notify": o("avisou o cliente sobre a pasta"),
  "drive.folder_delete": x("mandou para a lixeira a pasta"),
  "drive.folder_restore": e("tirou da lixeira a pasta"),
  "drive.file_upload": c("enviou o arquivo"),
  "drive.file_rename": e("renomeou o arquivo"),
  "drive.file_move": e("moveu o arquivo"),
  "drive.file_expiry": e("definiu o vencimento do arquivo"),
  "drive.file_delete": x("mandou para a lixeira o arquivo"),
  "drive.file_restore": e("tirou da lixeira o arquivo"),
  "drive.file_copy_from_module": c("guardou nos Arquivos uma cópia de documento, na pasta"),

  // ── Portal e solicitações ──────────────────────────────────────────────────
  "solicitacao.assumir": e("assumiu a solicitação"),
  "solicitacao.concluir": e("concluiu a solicitação"),
  "solicitacao.cancelar": e("cancelou a solicitação"),
  "solicitacao.reabrir": e("reabriu a solicitação"),
  "solicitacao.respondida": o("respondeu a solicitação"),
  "solicitacao.nota_interna": o("deixou uma nota interna na solicitação"),
  "solicitacao.encaminhada": e("encaminhou a outro setor a solicitação"),
  "clientDocument.create": c("criou o envio do documento"),
  "clientDocument.update": e("editou o envio do documento"),
  "clientDocument.delete": x("excluiu o envio do documento"),
  "clientDocument.publish": o("publicou no portal o documento"),
  "clientDocument.send": o("enviou ao cliente o documento"),
  "clientDocument.resend": o("reenviou ao cliente o documento"),
  // Envios agendados e lembrete de não lido (22/10/2026).
  "clientDocument.schedule": e("agendou o envio do documento"),
  "clientDocument.unschedule": e("cancelou o agendamento do envio do documento"),
  "clientDocument.scheduled_send": o("publicou na hora agendada o documento"),
  "clientDocument.scheduled_send_now": o("mandou já o envio agendado do documento"),
  "clientDocument.reminder": o("lembrou o cliente de abrir o documento"),
  "clientDocument.receipt": o("baixou o comprovante de leitura do documento"),
  // O padrão do escritório, em Administração › Portal do cliente › Envios (23/10/2026).
  "clientDocument.reminder_default": e("mudou o lembrete de não lido padrão dos envios", { comNome: false }),
  "comunicado.enviado": o("enviou um comunicado aos clientes"),
  "portal.user.created": c("deu acesso ao portal para"),
  "portal.user.updated": e("editou o acesso ao portal de"),
  "portal.user.enabled": e("reativou o acesso ao portal de"),
  "portal.user.disabled": e("desativou o acesso ao portal de"),
  // Até 14/10/2026, quando o acesso era de um Cliente: fica para o histórico.
  "portal.user.reassigned": e("passou para outro cliente o acesso ao portal de"),
  "portal.user.deleted": x("excluiu o acesso ao portal de"),
  // Portal por empresa (14/10/2026): uma linha por empresa ligada ou desligada.
  "portal.user.company.linked": e("ligou uma empresa ao acesso ao portal de"),
  "portal.user.company.unlinked": e("desligou uma empresa do acesso ao portal de"),
  "portal.user.company.filiais": e("mudou o “incluir filiais” do acesso ao portal de"),
  "portal.tela.liberada": e("liberou no portal a tela", { chaveDoNome: "tela" }),
  "portal.tela.bloqueada": e("bloqueou no portal a tela", { chaveDoNome: "tela" }),
  // A Ceci no portal, ligada por empresa (21/10/2026).
  "portal.ceci.ligada": e("ligou a Ceci no portal para a empresa", { chaveDoNome: "empresa" }),
  "portal.ceci.desligada": e("desligou a Ceci no portal para a empresa", { chaveDoNome: "empresa" }),

  // ── Conversas, transferências e agenda ─────────────────────────────────────
  "chatwoot.contact.linked": e("vinculou um contato do Chatwoot a um cadastro"),
  "chatwoot.contact.unlinked": e("desfez o vínculo de um contato do Chatwoot"),
  "chatwoot.conversation.excluded": e("mudou se uma conversa entra na avaliação dos atendimentos"),
  "handoff.create": c("abriu a transferência"),
  "handoff.accept": e("aceitou a transferência"),
  "handoff.reject": e("recusou a transferência"),
  "handoff.assign": e("definiu o responsável da transferência"),
  "handoff.sector.assign": e("definiu quem cuida da transferência no setor"),
  "handoff.sector.status": e("mudou a situação da transferência no setor"),
  "meeting.create": c("agendou a reunião"),
  "meeting.update": e("editou a reunião"),
  "meeting.delete": x("cancelou a reunião"),

  // ── IA ─────────────────────────────────────────────────────────────────────
  "ai.companySummary": o("gerou com IA o resumo da empresa"),
  "ia.chat.encaminhada": o("perguntou à Ceci, que encaminhou ao agente do setor"),
  "ia.chat.sem_ia": o("perguntou à Ceci sobre um assunto sem agente de IA"),
  "ia.chat.publico": e("mudou quem vê o chat da Ceci", { comNome: false }),
  "tenant.agent.update": e("configurou um agente de IA"),
  "tenant.agent.reset": e("voltou ao padrão um agente de IA"),
  "tenant.ai.update": e("configurou a chave da IA", { comNome: false }),
  "tenant.ai.remove": x("removeu a chave da IA", { comNome: false }),

  // ── Configurações ──────────────────────────────────────────────────────────
  "user.create": c("criou o usuário"),
  "user.update": e("editou o usuário"),
  "user.activate": e("ativou o usuário"),
  "user.deactivate": e("desativou o usuário"),
  "user.delete": x("excluiu o usuário"),
  "user.self_update": e("editou o próprio perfil", { comNome: false }),
  "user.password_change": e("trocou a própria senha", { comNome: false }),
  "user.agenda_update": e("mudou o próprio horário da Agenda", { comNome: false }),
  "user.paleta_update": e("mudou a própria paleta de cores", { comNome: false }),
  "sector.create": c("criou o setor"),
  "sector.update": e("editou o setor"),
  "sector.menu.show": e("mostrou uma tela no menu Geral do setor"),
  "sector.menu.hide": e("escondeu uma tela do menu Geral do setor"),
  "sector.menu.reset": e("voltou ao padrão o menu Geral do setor"),
  // Os Quadros do setor (28/10/2026): o coordenador bloqueia ou libera a criação e a edição pelos colaboradores.
  "sector.quadros.bloquear": e("bloqueou a criação de tarefas pelos colaboradores nos Quadros do setor"),
  "sector.quadros.liberar": e("liberou a criação de tarefas pelos colaboradores nos Quadros do setor"),
  "module.enable": e("ligou o módulo"),
  "module.disable": e("desligou o módulo"),
  "module.transfer": e("passou para outro setor o módulo"),
  "module.share": e("mostrou em mais um setor o módulo"),
  "module.unshare": e("tirou de um setor o módulo"),
  "tag.create": c("criou a tag"),
  "tag.update": e("editou a tag"),
  "tag.delete": x("excluiu a tag"),
  "customfield.create": c("criou o campo customizado"),
  "customfield.update": e("editou o campo customizado"),
  "customfield.reorder": e("reordenou os campos customizados"),
  "customfield.delete": x("excluiu o campo customizado"),
  "competency.create": c("criou a competência"),
  "competency.update": e("editou a competência"),
  "competency.delete": x("excluiu a competência"),
  "holiday.create": c("cadastrou o feriado"),
  "holiday.delete": x("excluiu o feriado"),
  "holiday.import": c("importou os feriados nacionais", { comNome: false }),
  "fieldPermission.grant": e("liberou um campo sensível para um papel"),
  "fieldPermission.revoke": e("tirou um campo sensível de um papel"),
  "recurringObligation.create": c("criou a obrigação recorrente"),
  "recurringObligation.enable": e("reativou a obrigação recorrente"),
  "recurringObligation.disable": e("pausou a obrigação recorrente"),
  "recurringObligation.delete": x("excluiu a obrigação recorrente"),
  // Obrigações por regime (22/10/2026): sem excluir — desligar tira as futuras abertas.
  "obrigacaoModelo.create": c("criou a obrigação por regime"),
  "obrigacaoModelo.update": e("editou a obrigação por regime"),
  "obrigacaoModelo.disable": e("desligou a obrigação por regime"),
  "obrigacaoModelo.enable": e("religou a obrigação por regime"),
  "rescisao.config.tenant.update": e("mudou o cálculo de rescisão padrão do escritório", { comNome: false }),
  "rescisao.config.empresa.update": e("mudou o cálculo de rescisão da empresa", { chaveDoNome: "company" }),
  "solicitacao_assunto.create": c("criou o assunto de solicitação", { chaveDoNome: "label" }),
  "solicitacao_assunto.update": e("editou o assunto de solicitação", { chaveDoNome: "label" }),
  "solicitacao_assunto.activate": e("reativou o assunto de solicitação", { chaveDoNome: "label" }),
  "solicitacao_assunto.deactivate": e("desativou o assunto de solicitação", { chaveDoNome: "label" }),
  "drive.template_create": c("criou no modelo de pastas a pasta"),
  "drive.template_update": e("editou no modelo de pastas a pasta"),
  "drive.template_enable": e("reativou no modelo de pastas a pasta"),
  "drive.template_disable": e("desativou no modelo de pastas a pasta"),
  // A pasta de rede ligada aos Arquivos, por empresa (21/10/2026).
  "drive.rede_ligada": e("ligou a pasta de rede nos Arquivos para a empresa", { chaveDoNome: "empresa" }),
  "drive.rede_desligada": e("desligou a pasta de rede nos Arquivos para a empresa", { chaveDoNome: "empresa" }),
  "tenant.update": e("editou os dados do escritório"),
  "tenant.agenda.update": e("mudou o horário da Agenda do escritório", { comNome: false }),
  "tenant.smtp.update": e("configurou o e-mail de envio", { comNome: false }),
  "tenant.aparencia.update": e("mudou a aparência do portal", { comNome: false }),
  "tenant.chatwoot.update": e("configurou a conexão com o Chatwoot", { comNome: false }),
  "tenant.chatwoot.remove": x("removeu a conexão com o Chatwoot", { comNome: false }),
  "chatwoot.agent.linked": e("vinculou um atendente do Chatwoot a um usuário"),
  "chatwoot.sender.role": e("definiu o papel de um remetente do Chatwoot"),
  "integration.connect": c("conectou a conta das reuniões", { comNome: false }),
  "integration.disconnect": x("desconectou a conta das reuniões", { comNome: false }),
  "integration.save": e("salvou uma integração"),
  "integration.webhook_url": e("apontou para o Connect o endereço dos avisos da integração"),
  "integration.omie.conta": e("configurou a conta do Omie da empresa"),
  "integration.serpro_termo": e("guardou o termo de autorização do Serpro", { comNome: false }),

  // ── Clientes e planos (só a 41 Tech) ───────────────────────────────────────
  "subscription.create": c("criou a assinatura do escritório", { comNome: false }),
  "subscription.update": e("editou a assinatura do escritório", { comNome: false }),
  "subscription_plan.create": c("criou o plano"),
  "subscription_plan.update": e("editou o plano"),
  "subscription_plan.update_modules": e("mudou os módulos do plano"),
  "subscription_plan.activate": e("reativou o plano"),
  "subscription_plan.deactivate": e("desativou o plano"),
  // Os três abaixo chegam com a reforma de Assinaturas, Planos e o site (PR
  // #192, 14/10/2026): ficam aqui antes para a trilha já nascer em português.
  "subscription_plan.site.update": e("mudou como o site mostra o plano"),
  "site.prices.show": e("passou a mostrar os preços no site", { comNome: false }),
  "site.prices.hide": e("escondeu os preços do site", { comNome: false }),
  // O cartão "Connect sob medida" da seção Planos do site (14/10/2026).
  "site.custom_card.show": e("passou a mostrar o cartão “Connect sob medida” no site", { comNome: false }),
  "site.custom_card.hide": e("escondeu do site o cartão “Connect sob medida”", { comNome: false }),
};

/** A descrição de um código; código fora do catálogo (de versão antiga) vira uma frase neutra. */
export function descricaoDaAcao(codigo: string): DescricaoDaAcao {
  return ACOES[codigo] ?? { tipo: tipoPeloVerbo(codigo), frase: `registrou “${codigo}” em` };
}

/** Para código fora do catálogo: o tipo pelo verbo do fim do código. */
function tipoPeloVerbo(codigo: string): TipoDaAcao {
  const fim = codigo.split(".").pop() ?? "";
  if (/(^|_)(create|created|criar|criada|criado|upload|import|importar)/.test(fim)) return "criou";
  if (/(^|_)(delete|deleted|excluido|excluida|remove)/.test(fim)) return "excluiu";
  if (/(^|_)(update|updated|edit|alterada|alterado|rename|move)/.test(fim)) return "editou";
  return "outro";
}

/** A frase curta do código, com a primeira letra maiúscula — para listas ("Editou o documento fiscal"). */
export function rotuloDaAcao(codigo: string): string {
  const f = ACOES[codigo]?.frase ?? codigo;
  return f.charAt(0).toUpperCase() + f.slice(1);
}

export const ROTULO_DO_TIPO: Record<Exclude<TipoDaAcao, "outro">, string> = {
  criou: "Criou",
  editou: "Editou",
  excluiu: "Excluiu",
};

/** Os códigos (de uma lista) que são de um tipo. */
export function codigosDoTipo(codigos: Iterable<string>, tipo: TipoDaAcao): string[] {
  return [...codigos].filter((c) => descricaoDaAcao(c).tipo === tipo);
}

// ─── Tipos de cadastro ───────────────────────────────────────────────────────

/**
 * O nome de cada `entityType` como o contador fala. Era o nome do sistema na
 * tela ("FinanceEntry", "DriveFolder").
 */
export const TIPOS_DE_CADASTRO: Readonly<Record<string, string>> = {
  HelpdeskTicket: "chamado",
  OpsEvent: "evento de robô do Ops Center",
  HelpdeskCategory: "categoria de chamados",
  HelpdeskSlaPolicy: "política de SLA dos chamados",
  TechInternalItem: "item do controle interno",
  AccessAuthorization: "autorização de acesso",
  AccessAuthorizationGrantee: "quem recebe as autorizações",
  SerproMensagem: "mensagem da Caixa Postal",
  SerproTermo: "termo de autorização do Serpro",
  AgentConversation: "conversa com a Ceci",
  AgentProposal: "proposta da IA",
  AssessmentTemplate: "modelo de teste",
  BankAccount: "conta bancária",
  BankStatementImport: "extrato importado",
  BankTransaction: "movimento do extrato",
  BankReconciliationRule: "regra de conciliação",
  FinanceRecurrence: "repetição",
  BankRuleApplication: "lançamento por regra de conciliação",
  BpoCredential: "senha do repositório",
  Branch: "filial",
  Budget: "orçamento",
  Candidatura: "candidatura",
  ChatwootAgentLink: "vínculo de atendente",
  ChatwootContactLink: "vínculo de contato",
  ChatwootConversation: "conversa do Chatwoot",
  ChatwootSenderRole: "remetente do Chatwoot",
  ClientAnnouncement: "comunicado",
  ClientDocument: "envio de documento",
  ClientGroup: "cliente",
  ClientRequest: "pendência ao cliente",
  CollectionAgreement: "acordo de cobrança",
  CollectionReminderConfig: "régua de lembretes",
  Company: "empresa",
  Guia: "guia",
  Certidao: "certidão",
  CompanyPartner: "sócio",
  CompanyRescisaoConfig: "cálculo de rescisão da empresa",
  CompanyService: "setor contratado",
  ConfiguracaoDoConnect: "configuração do Connect",
  Competency: "competência",
  CostCenter: "centro de custo",
  FinanceProject: "projeto",
  CustomField: "campo customizado",
  DigitalCertificate: "certificado digital",
  DriveFile: "arquivo",
  DriveFolder: "pasta",
  DriveTemplateFolder: "pasta do modelo",
  FieldPermission: "campo sensível",
  FinanceCategory: "categoria",
  FinanceCounterparty: "fornecedor ou sacado",
  FinanceEntry: "lançamento",
  FiscalDocument: "documento fiscal",
  SpedArquivo: "arquivo SPED",
  SpedDecisao: "decisão fiscal do SPED",
  SpedEstabelecimento: "estabelecimento do SPED",
  SpedExecucao: "execução do SPED",
  ContabilRegra: "regra do de-para contábil",
  ContabilCfopConta: "sugestão contábil de CFOP",
  ContabilModelo: "configuração do Contábil",
  SpedRejeitado: "rejeitado da quarentena do SPED",
  SpedImportacao: "importação do SPED",
  SpedPagamento: "pagamento de apoio do SPED",
  SpedContrato: "contrato de aluguel do SPED",
  SpedSimulacao: "simulação da prévia do SPED",
  SpedCombustivel: "apuração de combustível do SPED",
  SpedConferencia: "conferência do relatório do Omie",
  SpedConferenciaDocumento: "documento da conferência do Omie",
  SpedConfronto: "confronto da planilha do BPO",
  SpedPrestador: "prestador de NFS-e do SPED",
  SpedImportacaoApoio: "importação de apoio do SPED",
  SpedUpload: "envio em partes do SPED",
  Handoff: "transferência",
  Holiday: "feriado",
  Lead: "lead",
  License: "licença",
  RobotTask: "tarefa do robô",
  Meeting: "reunião",
  ModeloDeObrigacao: "obrigação por regime",
  OAuthAccount: "conta das reuniões",
  OmieEmissao: "emissão de NFS-e",
  Person: "pessoa",
  PipelineItem: "atividade",
  PortalApprovalLimit: "alçada de aprovação",
  PortalTelaBloqueada: "tela do portal",
  TenantEnviosConfig: "padrão dos envios",
  TenantSocietarioConfig: "configuração do Societário",
  PortalUser: "acesso ao portal",
  Process: "processo",
  RecurringObligation: "obrigação recorrente",
  Sector: "setor",
  ServiceRequest: "solicitação",
  ServiceRequestSubject: "assunto de solicitação",
  Subscription: "assinatura",
  SubscriptionPlan: "plano",
  Tag: "tag",
  Tenant: "escritório",
  TenantAgent: "agente de IA",
  TenantIntegration: "integração",
  TenantModule: "módulo",
  TenantRescisaoConfig: "cálculo de rescisão do escritório",
  Termination: "desligamento",
  User: "usuário",
  Vaga: "vaga",
  ValoraConfig: "parâmetros do Valora",
  ValoraProposta: "proposta do Valora",
  WhatsappThread: "conversa do WhatsApp",
};

export function nomeDoTipo(entityType: string | null | undefined): string | null {
  if (!entityType) return null;
  return TIPOS_DE_CADASTRO[entityType] ?? null;
}

// ─── Áreas ───────────────────────────────────────────────────────────────────

export type ChaveDaAreaDaAuditoria =
  | "chamados"
  | "tech"
  | "cadastros"
  | "contabil"
  | "fiscal"
  | "bpo"
  | "dp"
  | "recrutamento"
  | "societario"
  | "gestao"
  | "comercial"
  | "arquivos"
  | "portal"
  | "conversas"
  | "ia"
  | "configuracoes"
  | "planos"
  | "outros";

/** Rótulo e cor do ponto de cada área (a cor dos setores padrão, onde há setor). */
export const AREAS_DA_AUDITORIA: Readonly<Record<ChaveDaAreaDaAuditoria, { rotulo: string; cor: string }>> = {
  chamados: { rotulo: "Chamados", cor: "#2E6FB8" },
  tech: { rotulo: "Tech", cor: "#3B7BE8" },
  cadastros: { rotulo: "Cadastros", cor: "#0891B2" },
  contabil: { rotulo: "Contábil", cor: "#4F46E5" },
  fiscal: { rotulo: "Fiscal", cor: "#C5374B" },
  bpo: { rotulo: "BPO", cor: "#B7791F" },
  dp: { rotulo: "DP", cor: "#7C5CBF" },
  recrutamento: { rotulo: "Recrutamento", cor: "#1E8E5A" },
  societario: { rotulo: "Societário", cor: "#C8860D" },
  gestao: { rotulo: "Gestão", cor: "#4F46E5" },
  comercial: { rotulo: "Comercial", cor: "#E15A2B" },
  arquivos: { rotulo: "Arquivos", cor: "#2E6FB8" },
  portal: { rotulo: "Portal e solicitações", cor: "#0E9384" },
  conversas: { rotulo: "Conversas e agenda", cor: "#B8327A" },
  ia: { rotulo: "IA", cor: "#9333EA" },
  configuracoes: { rotulo: "Configurações", cor: "#586577" },
  planos: { rotulo: "Clientes e planos", cor: "#475569" },
  outros: { rotulo: "Outros", cor: "#94A3B8" },
};

/**
 * A área pelo começo do código (o mais longo que bate): tudo que começa com
 * "fiscal." é Fiscal, "drive." é Arquivos — com as exceções que moram nas
 * configurações ("drive.template_" é o Modelo de pastas).
 */
const AREA_POR_PREFIXO: ReadonlyArray<readonly [string, ChaveDaAreaDaAuditoria]> = [
  ["helpdesk.", "chamados"],
  ["tech_interno.", "tech"],
  ["ops.", "tech"],
  ["company.", "cadastros"],
  ["person.", "cadastros"],
  ["companyservice.", "cadastros"],
  ["clientGroup.", "cadastros"],
  ["branch.", "cadastros"],
  ["certificados.", "cadastros"],
  ["contabil.", "contabil"],
  ["fiscal.", "fiscal"],
  ["autorizacoes.", "fiscal"],
  ["financeiro.", "bpo"],
  ["finance.", "bpo"],
  ["financeCategory.", "bpo"],
  ["dre.", "bpo"],
  ["bpoCredential.", "bpo"],
  ["integration.omie.financeiro", "bpo"],
  ["integration.omie.virada", "bpo"],
  ["integration.omie.nfse_", "bpo"],
  ["termination.", "dp"],
  // As competências das avaliações de desempenho, desde 20/10/2026 dentro do
  // módulo do DP (eram das Configurações).
  ["competency.", "dp"],
  ["vaga.", "recrutamento"],
  ["candidatura.", "recrutamento"],
  ["assessmentTemplate.", "recrutamento"],
  ["whatsapp.", "recrutamento"],
  ["ai.resumeExtract", "recrutamento"],
  ["process.", "societario"],
  ["societario.", "societario"],
  ["empresa.socio.", "societario"],
  ["license.", "societario"],
  ["gestao.", "gestao"],
  ["valora.", "gestao"],
  ["lead.", "comercial"],
  ["drive.", "arquivos"],
  ["drive.template_", "configuracoes"],
  ["drive.rede_", "configuracoes"],
  ["solicitacao.", "portal"],
  ["clientDocument.", "portal"],
  ["comunicado.", "portal"],
  ["portal.", "portal"],
  ["chatwoot.", "conversas"],
  ["chatwoot.agent.", "configuracoes"],
  ["chatwoot.sender.", "configuracoes"],
  ["handoff.", "conversas"],
  ["meeting.", "conversas"],
  ["ai.", "ia"],
  ["ia.", "ia"],
  ["tenant.agent.", "ia"],
  ["tenant.ai.", "ia"],
  ["user.", "configuracoes"],
  ["sector.", "configuracoes"],
  ["module.", "configuracoes"],
  ["tag.", "configuracoes"],
  ["customfield.", "configuracoes"],
  ["holiday.", "configuracoes"],
  ["fieldPermission.", "configuracoes"],
  ["recurringObligation.", "configuracoes"],
  ["obrigacaoModelo.", "configuracoes"],
  ["rescisao.", "configuracoes"],
  ["solicitacao_assunto.", "configuracoes"],
  ["tenant.", "configuracoes"],
  ["integration.", "configuracoes"],
  ["github.", "configuracoes"],
  ["subscription.", "planos"],
  ["subscription_plan.", "planos"],
  ["site.", "planos"],
];

export function areaDaAcao(codigo: string): ChaveDaAreaDaAuditoria {
  let achada: ChaveDaAreaDaAuditoria = "outros";
  let tamanho = 0;
  for (const [prefixo, area] of AREA_POR_PREFIXO) {
    if (codigo.startsWith(prefixo) && prefixo.length > tamanho) {
      achada = area;
      tamanho = prefixo.length;
    }
  }
  return achada;
}

/** Os códigos (de uma lista) que são de uma área. */
export function codigosDaArea(codigos: Iterable<string>, area: ChaveDaAreaDaAuditoria): string[] {
  return [...codigos].filter((c) => areaDaAcao(c) === area);
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Os códigos cuja frase, área ou código batem com o que a pessoa digitou —
 * "estornou", "pasta", "fiscal". Sem acento e sem diferença de maiúscula.
 */
export function codigosQueBatemComABusca(texto: string, codigos: Iterable<string> = Object.keys(ACOES)): string[] {
  const q = semAcento(texto.trim());
  if (q.length < 2) return [];
  return [...codigos].filter((c) => {
    const d = descricaoDaAcao(c);
    return (
      semAcento(d.frase).includes(q) || semAcento(AREAS_DA_AUDITORIA[areaDaAcao(c)].rotulo).includes(q) || c.toLowerCase().includes(q)
    );
  });
}

/** Os tipos de cadastro cujo nome bate com a busca ("lançamento" → FinanceEntry). */
export function tiposQueBatemComABusca(texto: string): string[] {
  const q = semAcento(texto.trim());
  if (q.length < 2) return [];
  return Object.entries(TIPOS_DE_CADASTRO)
    .filter(([, nome]) => semAcento(nome).includes(q))
    .map(([tipo]) => tipo);
}
