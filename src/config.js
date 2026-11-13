export const CONFIG = {
  brand: {
    color: '#2F6BFF'
  },
  statusColors: {
    success: '#3BA55D',
    warning: '#FAA61A'
  },
  shop: {
    maxKits: 25,
    closeDelaySeconds: 3
  },
  text: {
    supportPanel: {
      title: 'Central de atendimento',
      description: 'Escolha o assunto para abrir um atendimento privado.'
    },
    supportTicket: {
      title: '{kind}',
      description: '{user} abriu este atendimento. Envie sua mensagem aqui; a equipe responderá neste canal.'
    },
    shopPanel: {
      title: 'Loja de kits',
      description: 'Selecione um kit para comprar.',
      empty: 'Nenhum kit cadastrado.'
    },
    order: {
      title: 'Pedido · {kit}',
      description: 'Pedido aberto por {user}. Envie o comprovante neste canal.'
    },
    pix: {
      title: 'Pagamento Pix',
      missingTitle: 'Pix não configurado',
      missingDescription: 'A equipe ainda não cadastrou a chave Pix. Não faça nenhum pagamento até receber os dados oficiais.'
    },
    closeButton: 'Fechar ticket'
  }
};

export function fmt(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : match
  );
}

export function hexToInt(hex, fallback = 0x2F6BFF) {
  const clean = String(hex ?? '').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(clean) ? Number.parseInt(clean, 16) : fallback;
}
