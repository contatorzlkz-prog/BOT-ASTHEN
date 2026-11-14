export const CONFIG = {
  brand: {
    color: '#2F6BFF'
  },
  support: {
    colors: {
      compras: '#3D82D8',
      licencas: '#C27A52',
      bugs: '#8A6CE8',
      parcerias: '#3D9A79',
      marketing: '#D49B42',
      // Compatibilidade com tickets e painéis antigos.
      bug: '#D45B5B',
      hack: '#8A6CE8',
      duvida: '#3D82D8',
      geral: '#768398'
    },
    descriptions: {
      compras: 'Informações sobre produtos, pedidos e formas de pagamento. Explique qual plano ou compra deseja consultar para que a equipe possa orientar você.',
      licencas: 'Ajuda técnica com ativação de licenças, configuração, versões e permissões. Informe o produto, a plataforma e o que aconteceu.',
      bugs: 'Envie logs, capturas de tela ou detalhes sobre falhas. Descreva o que estava fazendo quando o problema apareceu.',
      parcerias: 'Canal para propostas comerciais, afiliações e parcerias. Apresente seu projeto e a proposta de colaboração.',
      marketing: 'Atendimento para contratação de serviços e pedidos de orçamento. Conte qual serviço procura e os detalhes principais.',
      bug: 'Descreva o problema com contexto, o que esperava que acontecesse e o que ocorreu. Capturas de tela e mensagens de erro ajudam a equipe.',
      hack: 'Use este atendimento para encaminhar suspeitas de trapaça ou comportamento abusivo. Informe o jogador, o contexto e o que observou.',
      duvida: 'Conte qual é sua dúvida e explique o que está tentando fazer. Inclua o contexto necessário para a equipe orientar você.',
      geral: 'Explique o motivo do contato e o tipo de ajuda que precisa. Este espaço serve para assuntos que não se encaixam nas outras opções.'
    }
  },
  shop: {
    maxKits: 25,
    closeDelaySeconds: 3,
    panelDescription: 'Escolha um kit para ver a prévia com imagem, preço e descrição. Você poderá trocar de produto antes de confirmar. Depois, informe seu nick Java e confirme o pedido para abrir o ticket privado de pagamento.',
    catalogPrompt: 'Selecione um kit para abrir a prévia. Você poderá trocar de kit antes de continuar.',
    previewPrompt: 'Confira a imagem, o nome, o preço e a descrição. Confirme o kit para informar seu nick do Minecraft Java.',
    reviewDescription: 'Confira o kit e o nick Java. O ticket privado de pagamento só será criado depois da confirmação final. Você ainda pode trocar o kit, editar o nick ou cancelar sem abrir um pedido.'
  },
  order: {
    title: 'Pedido de compra',
    description: 'Seu pedido foi criado e está aguardando a conferência da equipe. Faça o pagamento usando os dados abaixo e envie o comprovante neste canal. A equipe confirmará ou recusará o pedido após verificar o comprovante.',
    receiptInstructions: 'Anexe a imagem ou o arquivo do comprovante nesta conversa. Não envie dados bancários ou senhas. Depois, aguarde a análise da equipe.'
  },
  pix: {
    title: 'Pagamento via Pix',
    missingTitle: 'Pagamento ainda não configurado',
    missingDescription: 'A loja ainda não cadastrou uma chave Pix. Não faça pagamentos até que a equipe publique os dados oficiais.'
  },
  tickets: {
    closeDelaySeconds: 3
  }
};

export function hexToInt(hex, fallback = 0x2F6BFF) {
  const clean = String(hex ?? '').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(clean) ? Number.parseInt(clean, 16) : fallback;
}
