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
    panelDescription: 'Bem-vindo à loja. Consulte os kits disponíveis e escolha o que deseja adquirir. Ao iniciar uma compra, você seleciona o produto, informa seu nick do Minecraft e revisa os dados antes de confirmar. Nenhum pedido é aberto enquanto você não confirmar as informações.',
    catalogPrompt: 'Selecione o kit que deseja comprar. Depois, informe seu nick do Minecraft para revisar o pedido antes de seguir para o pagamento.',
    reviewDescription: 'Confira o produto e o nick informado. O ticket de pagamento só será criado depois que você confirmar. Use “Editar nick” para corrigir alguma informação ou “Cancelar” para sair sem abrir um pedido.'
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
