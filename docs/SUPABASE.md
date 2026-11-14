# Supabase

O Supabase é opcional. O bot grava o estado primeiro em `data/state.json` e, quando a conexão estiver configurada, envia uma cópia do snapshot para a tabela `asthen_bot_state`.

## 1. Criar a tabela

No painel do projeto Supabase, abra o SQL Editor e execute:

`supabase/001_asthen_bot_state.sql`

A tabela guarda uma única linha, com `id = main`, contendo o snapshot JSON do bot.

## 2. Configurar o arquivo .env

Use a URL base do projeto, sem `/rest/v1` nem `/v1` no final:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_sua_chave
SUPABASE_TABLE=asthen_bot_state
```

O bot também reconhece as variáveis antigas `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_KEY`. A chave secreta nova `sb_secret_...` deve ficar somente no backend do bot.

## 3. Como a sincronização funciona

- Cada alteração é salva primeiro no arquivo local.
- Alterações próximas são agrupadas antes de enviar um snapshot ao Supabase.
- Se o arquivo local estiver vazio e existir um snapshot remoto, o bot restaura o snapshot remoto para o arquivo local.
- Se houver estado local e remoto ao iniciar, o estado local é mantido e enviado ao banco.
- Quando o Supabase está indisponível, o bot continua usando o backup local e tenta sincronizar novamente com intervalo progressivo.
- Ao encerrar com Ctrl+C ou SIGTERM, o bot tenta concluir a sincronização pendente.
- O banco guarda o estado atual, não um histórico permanente de tickets encerrados.

## 4. Cabeçalhos e chaves

Para uma chave atual `sb_secret_...`, o bot envia a chave no cabeçalho `apikey` e não tenta usá-la como um JWT no cabeçalho `Authorization`. Chaves antigas do tipo `service_role` continuam sendo enviadas também como Bearer JWT.

A Secret API Key tem acesso administrativo e ignora as regras RLS. Use-a somente no computador/servidor onde o bot roda. Nunca a coloque no GitHub, em prints ou em mensagens.

## 5. Diagnóstico

- **401/403:** confira se a chave é uma Secret API Key ou uma chave antiga `service_role`, e se foi copiada por inteiro.
- **404 / tabela não encontrada:** execute o SQL e confira `SUPABASE_TABLE`.
- **PGRST125 / Invalid path specified:** confira se `SUPABASE_URL` contém somente a URL base do projeto.
- **Sem conexão:** confira a URL, a rede e o status do projeto. O backup local continua disponível.

O comando `/bridge status` mostra se o Supabase está configurado e apresenta a última sincronização ou o aviso mais recente.

Nunca compartilhe o conteúdo do `.env` ao pedir ajuda.
