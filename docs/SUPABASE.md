# Supabase

O Supabase é opcional. O bot sempre salva o estado atual em `data/state.json` antes de tentar sincronizar a cópia remota.

## Configurar

1. Abra o projeto no painel do Supabase.
2. Entre em SQL Editor.
3. Execute o arquivo `supabase/001_asthen_bot_state.sql` deste repositório.
4. Na configuração inicial do bot, informe:
   - **Project URL:** URL base do projeto, por exemplo `https://seu-projeto.supabase.co`.
   - **Secret API Key:** chave do tipo `sb_secret_...`.

O bot também remove automaticamente os sufixos `/rest/v1` e `/v1` caso tenham sido copiados junto com a URL. Não inclua caminhos REST no valor salvo no `.env`.

## Segurança

- Use a Secret API Key somente no computador/servidor onde o bot é executado.
- Não use a chave Publishable/anon para operações administrativas de gravação.
- Não publique, envie por print ou versione o arquivo `.env`.
- O SQL habilita RLS, revoga acesso de `anon` e `authenticated` e concede acesso à tabela para `service_role`.

## Como a sincronização funciona

- Cada alteração é salva primeiro no arquivo local.
- Alterações próximas são agrupadas em um snapshot, reduzindo requisições repetidas.
- Se a API ficar indisponível, o estado local continua valendo e uma nova tentativa é agendada com intervalo progressivo.
- O banco guarda o snapshot atual, não um histórico de tickets encerrados.
- Tickets abertos são mantidos no estado. Quando o canal é excluído, seu registro é removido na próxima sincronização.
- Ao iniciar, o bot compara os registros locais com os canais existentes e reconcilia registros órfãos.

## Diagnóstico

- **PGRST125 / Invalid path specified:** confira se a Project URL não contém um caminho incorreto. Use a URL base; o bot normaliza os sufixos mais comuns.
- **401/403:** confira se a chave é uma Secret API Key válida e se foi copiada por inteiro.
- **404 / tabela não encontrada:** execute novamente o SQL e confirme o nome `public.asthen_bot_state`.
- **Sem conexão:** confira a URL, a rede e o status do projeto. O backup local continua sendo usado.

Nunca compartilhe o conteúdo do `.env` ao pedir ajuda.