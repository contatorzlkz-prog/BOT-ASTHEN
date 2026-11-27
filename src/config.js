export const CONFIG = {
  brand: {
    color: '#2F6BFF'
  },
  support: {
    colors: {
      compras: '#3D82D8',
      servidor: '#C27A52',
      bugs: '#8A6CE8',
      denuncias: '#D45B5B',
      outros: '#768398',
      bug: '#D45B5B',
      hack: '#8A6CE8',
      duvida: '#3D82D8',
      geral: '#768398'
    },
    descriptions: {
      compras: 'Use este atendimento para dúvidas sobre compras, kits e pagamentos. Informe o produto ou pedido que deseja consultar. Não envie comprovantes em canais públicos.',
      servidor: 'Precisa de ajuda para entrar ou jogar no servidor? Explique o problema, informe seu nick e diga em qual situação aconteceu. A equipe vai orientar você.',
      bugs: 'Encontrou um erro no servidor? Descreva o que aconteceu, onde aconteceu e o que você esperava. Capturas de tela ajudam a equipe a investigar.',
      denuncias: 'Use este canal para relatar comportamento inadequado ou suspeitas de trapaça. Informe o nick envolvido, o horário e, se possível, envie provas.',
      outros: 'Use este atendimento para sugestões e assuntos que não se encaixam nas outras opções. Explique o que precisa e aguarde a equipe.',
      bug: 'Descreva o problema com contexto e, se possível, inclua uma captura de tela.',
      hack: 'Informe o jogador, o contexto e o que observou. Envie provas quando possível.',
      duvida: 'Conte qual é sua dúvida e explique o que está tentando fazer.',
      geral: 'Explique o motivo do contato e o tipo de ajuda que precisa.'
    }
  },
  shop: {
    maxKits: 25,
    closeDelaySeconds: 3,
    panelDescription: 'Abra o catálogo para consultar os kits disponíveis. Os detalhes, preços e estoque são carregados no momento da consulta.',
    catalogPrompt: 'Escolha um kit para consultar os detalhes. A compra só começa depois que você confirmar a prévia.',
    previewPrompt: 'Confira o kit selecionado. Sua identificação Minecraft cadastrada será usada automaticamente.',
    reviewDescription: 'Confira o kit, o preço e o jogador identificado. Confirme para abrir o ticket privado de pagamento.'
  },
  order: {
    title: 'Pedido de compra',
    description: 'Seu pedido foi criado e está aguardando a conferência da equipe. Faça o pagamento usando os dados abaixo e envie o comprovante neste canal. A equipe confirmará ou recusará o pedido após verificar o comprovante.',
    receiptInstructions: 'Envie a foto ou o arquivo do comprovante nesta conversa e aguarde a conferência da equipe.'
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
