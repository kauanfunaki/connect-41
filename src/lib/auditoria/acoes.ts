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
  // ── Cadastros ──────────────────────────────────────────────────────────────
  "company.create": c("criou a empresa"),
  "company.update": e("editou a empresa"),
  "company.delete": x("excluiu a empresa"),
  "person.create": c("criou a pessoa"),
  "person.update": e("editou a pessoa"),
  "person.delete": x("excluiu a pessoa"),
  "companyservice.create": c("adicionou um setor contratado"),
  "companyservice.assign": e("trocou o responsável de um setor contratado"),
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
  "autorizacoes.quem_recebe": e("mudou quem recebe as autorizações de acesso"),
  "autorizacoes.salvar": e("atualizou a autorização de acesso"),
  "autorizacoes.serpro": o("conferiu no Serpro a autorização de acesso"),
  "autorizacoes.serpro_lote": o("conferiu no Serpro as autorizações de acesso, em lote"),
  "autorizacoes.serpro_sitfis": o("pediu no Serpro a situação fiscal da empresa"),
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
  "financeiro.categoria.linha_da_dre": e("ligou a uma linha da DRE a categoria"),
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
  "process.aviso_orgao_aplicado": e("aplicou um aviso do órgão ao processo"),
  "societario.processo.situacao": e("mudou a situação do processo"),
  "societario.processo.mensagem": o("mandou uma mensagem no processo"),
  "societario.processo.documento": c("anexou documentos ao processo"),
  "societario.ia.varredura_aplicada": e("aplicou a varredura da IA"),
  "societario.ia.proposta_rejeitada": e("recusou uma proposta da IA"),
  "empresa.socio.importado_da_receita": c("importou da Receita os sócios da empresa"),
  "empresa.socio.importado_do_contrato": c("importou do contrato social os sócios da empresa"),
  "empresa.socio.saida": e("registrou a saída do sócio"),
  "license.create": c("cadastrou uma licença"),
  "license.update": e("editou uma licença"),
  "license.revoke": e("revogou uma licença"),
  "license.reactivate": e("reativou uma licença"),

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
  "sector.create": c("criou o setor"),
  "sector.update": e("editou o setor"),
  "sector.menu.show": e("mostrou uma tela no menu Geral do setor"),
  "sector.menu.hide": e("escondeu uma tela do menu Geral do setor"),
  "sector.menu.reset": e("voltou ao padrão o menu Geral do setor"),
  "module.enable": e("ligou o módulo"),
  "module.disable": e("desligou o módulo"),
  "module.transfer": e("passou para outro setor o módulo"),
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
  "tenant.update": e("editou os dados do escritório"),
  "tenant.agenda.update": e("mudou o horário da Agenda do escritório", { comNome: false }),
  "tenant.smtp.update": e("configurou o e-mail de envio", { comNome: false }),
  "tenant.chatwoot.update": e("configurou a conexão com o Chatwoot", { comNome: false }),
  "tenant.chatwoot.remove": x("removeu a conexão com o Chatwoot", { comNome: false }),
  "chatwoot.agent.linked": e("vinculou um atendente do Chatwoot a um usuário"),
  "chatwoot.sender.role": e("definiu o papel de um remetente do Chatwoot"),
  "integration.connect": c("conectou a conta das reuniões", { comNome: false }),
  "integration.disconnect": x("desconectou a conta das reuniões", { comNome: false }),
  "integration.save": e("salvou uma integração"),
  "integration.omie.conta": e("configurou a conta do Omie da empresa"),

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
  AccessAuthorization: "autorização de acesso",
  AccessAuthorizationGrantee: "quem recebe as autorizações",
  SerproMensagem: "mensagem da Caixa Postal",
  AgentConversation: "conversa com a Ceci",
  AgentProposal: "proposta da IA",
  AssessmentTemplate: "modelo de teste",
  BankAccount: "conta bancária",
  BankStatementImport: "extrato importado",
  BankTransaction: "movimento do extrato",
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
  Handoff: "transferência",
  Holiday: "feriado",
  Lead: "lead",
  License: "licença",
  Meeting: "reunião",
  OAuthAccount: "conta das reuniões",
  OmieEmissao: "emissão de NFS-e",
  Person: "pessoa",
  PipelineItem: "atividade",
  PortalApprovalLimit: "alçada de aprovação",
  PortalTelaBloqueada: "tela do portal",
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
  | "cadastros"
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
  cadastros: { rotulo: "Cadastros", cor: "#0891B2" },
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
  ["company.", "cadastros"],
  ["person.", "cadastros"],
  ["companyservice.", "cadastros"],
  ["clientGroup.", "cadastros"],
  ["branch.", "cadastros"],
  ["certificados.", "cadastros"],
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
  ["rescisao.", "configuracoes"],
  ["solicitacao_assunto.", "configuracoes"],
  ["tenant.", "configuracoes"],
  ["integration.", "configuracoes"],
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
