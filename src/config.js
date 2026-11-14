export const CONFIG = {
  brand: {
    color: '#2F6BFF'
  },
  support: {
    colors: {
      bug: '#D45B5B',
      hack: '#8A6CE8',
      duvida: '#3D82D8',
      geral: '#768398'
    },
    descriptions: {
      bug: 'Descreva o problema com o máximo de contexto possível. Informe em qual situação aconteceu, o que você esperava que acontecesse e o que ocorreu de fato. Se souber, explique os passos para reproduzir o erro. Capturas de tela, vídeos curtos e mensagens de erro ajudam a equipe a entender e corrigir o problema.',
      hack: 'Use este atendimento para encaminhar uma suspeita de trapaça ou comportamento abusivo. Informe o nome do jogador, onde e quando aconteceu e o que você observou. Anexe gravações ou capturas de tela quando tiver. A equipe analisará as informações com cuidado; evite expor acusações ou dados pessoais em canais públicos.',
      duvida: 'Conte qual é a sua dúvida e explique o que você está tentando fazer. Inclua o contexto necessário para que a equipe consiga orientar você sem precisar pedir as mesmas informações várias vezes. A conversa ficará visível somente para você e para a equipe autorizada.',
      geral: 'Explique o motivo do contato e o tipo de ajuda que precisa. Este espaço serve para assuntos que não se encaixam nas outras opções. Envie os detalhes em uma única mensagem, quando possível, e aguarde a resposta da equipe neste canal privado.'
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
