# Planejamento administrativo do MedReview

## Estado da entrega

Implementação incremental no aplicativo React/Vite existente. Entrada **Docente → Planejamento**, exclusiva do administrador identificado pelo UUID já usado no MedReview: `2c337bd5-b283-4ce8-9c0a-c817e4cdd697`. Nenhuma tabela de cartões, revisões FSRS, contas ou dados anteriores foi alterada. O planejamento tem tabelas e funções próprias no mesmo Supabase.

Funciona com a migração aplicada: Hoje, Semana, Estudos, Revisões, Materiais, Desempenho, configurações de disponibilidade/intervalos, correção, histórico, prévia de importação JSON/CSV, confirmação e exportação. Registros persistem no PostgreSQL e são consultados entre dispositivos; não existe armazenamento principal em localStorage nem sincronização fictícia.

**Ainda depende de configuração no projeto real:** aplicar a migração SQL, publicar a Edge Function MCP, habilitar o OAuth Server do Supabase, configurar consentimento e conectar uma conta ChatGPT que ofereça apps MCP personalizados. Essas ações não foram executadas no Supabase de produção: este ambiente não dispõe de acesso administrativo SQL/deploy Supabase. Os testes utilizam PostgreSQL local (PGlite), não o banco de produção. A conexão ChatGPT/OAuth completa não foi validada com uma conta real.

## Execução e ativação do banco

1. No projeto Supabase **já usado pelo MedReview**, abra **SQL Editor** com uma conta que possa criar tabelas/funções/políticas. Execute integralmente `supabase/migrations/003_admin_planning.sql`. É uma transação aditiva; nenhuma migração de planejamento depende de apagar/recriar os dados anteriores. Não rode scripts antigos de reconstrução/reseed.
2. Confira o UUID do administrador com o responsável pelo projeto. A autorização do planejamento usa exclusivamente esse UUID imutável, não um campo editável em `profiles`, e-mail fornecido pelo cliente ou flag do navegador. Se a identidade real for diferente, ajuste consistentemente SQL e `src/planning/domain.ts` antes de aplicar/publicar.
3. Use as variáveis existentes `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. A chave pública de cliente não dá acesso aos dados novos: políticas RLS e RPC restringem o administrador. Não coloque `service_role`, senha do banco, client secret OAuth ou tokens pessoais em variáveis VITE, arquivos versionados ou URLs.
4. Execute:

```sh
npm ci --cache /tmp/medreview-npm-cache
npm test
npm run build
npm run dev
```

5. Entre com a conta administrativa e abra **Docente → Planejamento**. Em **Revisões**, escolha explicitamente os intervalos em dias e a disponibilidade semanal; não existe sequência de intervalos presumida. Registre uma sessão em **Novo registro → Assunto estudado**. A confirmação mostra o identificador retornado pelo banco. Feche/reabra a área ou consulte em outro dispositivo para ver o registro persistente.
6. Publique a build pelo fluxo Vercel existente **depois de aplicar a migração**. Caso a migração não esteja aplicada, a área apresenta a configuração pendente; o restante do MedReview continua funcionando.

## Regras e limites

- Início do acompanhamento: **12/10/2026, 00:00, America/Cuiaba** (04:00 UTC). Datas locais do formulário são convertidas pelo fuso IANA, não pelo fuso do dispositivo. Datas de API exigem ISO com offset ou Z.
- Uma aula pode estar prevista, assistida ou não assistida. Presença não cria sessão, não conclui tarefa e não gera revisão. Estudo é uma sessão explícita; revisão concluída é outro registro explícito.
- Sessões antigas ficam consultáveis, mas nunca geram séries retroativas. Materiais antigos ficam acessíveis. Eventos antigos não são transformados em tarefas. A fila só considera revisões a partir do marco.
- Campos ausentes continuam ausentes. `questions: 0` e `correct: 0` são preservados. Sem duração, o tempo é "não informado". Aproveitamento só é calculado com questões e acertos informados, e denominador maior que zero.
- Uma sessão gera revisões usando os intervalos configurados naquele momento. Alterar configurações afeta apenas sessões futuras. Corrigir a data da sessão não move revisões existentes; o aviso de confirmação informa essa preservação. Reagendar uma revisão exige confirmação e mantém o intervalo original registrado.
- A sugestão semanal usa disponibilidade, compromissos fixos, blocos manuais, duração estimada, prioridade e prazo/prova da disciplina. Mostra a razão de cada horário e o motivo de tarefas sem espaço. Não modifica dados ao ser consultada; aplicar requer prévia/confirmacão. Horários de tarefas são validados também no servidor, serializando operações para prevenir sobreposição concorrente. Ajustes manuais são feitos em Corrigir, respeitando disponibilidade/compromissos.
- Revisões sem estimativa de duração permanecem na fila, sem reservar tempo inventado no calendário. O administrador pode cadastrar uma tarefa com a estimativa real para reservar um bloco.
- Não há exclusão de registros ou ferramenta de exclusão nesta entrega. Correções usam ID/revision e deixam histórico. Alterações importantes de compromissos, tarefas agendadas, datas de estudo/revisão e intervalos exigem confirmação.
- Limites por registro: 50 KB de dados; por importação: 200 operações / 500 KB. Leitura é paginada. Divida importações maiores em lotes.

## Cronograma UC2 e troca manual com a conversa

Não foi encontrado cronograma oficial UC2 neste projeto. Nenhum calendário de aulas/provas foi preenchido.

Importe JSON `medreview-planning-v1` ou CSV. O CSV usa estas colunas (as quatro primeiras são obrigatórias):

```csv
title,event_type,starts_at,ends_at,subject,topic,attendance,notes
```

Tipos de evento: `class`, `exam`, `tutorial`, `study`. Presença opcional: `planned`, `attended`, `missed`. Horários explícitos ISO locais `YYYY-MM-DDTHH:mm` usam Cuiabá; ISO com Z/offset conserva o instante informado. PDF/Excel precisam ser convertidos/revisados para CSV; não há extração por IA paga. A prévia não grava. Só **Confirmar importação** envia o lote para a transação validada no banco; falha em um item reverte todo o lote.

O arquivo exportado inclui registros de origem com ID/revisão e identificadores de revisões para consulta. Séries derivadas são **somente leitura na exportação**, não um backup/restauro de conclusões: reimportar no mesmo banco conserva as séries atuais, e um banco vazio gera séries pelas configurações importadas. Não use a exportação como substituto de backup PostgreSQL.

Para registros vindos desta conversa sem MCP conectado, peça **somente fatos de estudo pertinentes** no formato abaixo. Substitua os marcadores por dados realmente fornecidos; não importe marcadores. Omita campos desconhecidos em vez de enviar null ou inventar zero:

```json
{
  "format": "medreview-planning-operations-v1",
  "idempotency_key": "<CHAVE-UNICA-ESTAVEL-DA-OPERACAO>",
  "commands": [
    {
      "action": "create",
      "kind": "session",
      "data": {
        "subject": "<DISCIPLINA INFORMADA>",
        "topic": "<ASSUNTO INFORMADO>",
        "studied_at": "<DATA/HORA ISO COM FUSO INFORMADA>"
      }
    }
  ]
}
```

Cole/importe, confira a prévia e confirme. Reenvie **a mesma chave e os mesmos comandos** em uma tentativa da mesma operação; o banco retorna o resultado anterior. Alterar os dados com a mesma chave é rejeitado. Para corrigir, use outro comando com ID, revisão atual e nova chave. Não envie transcript, mensagens inteiras, credenciais ou informações sem relação com estudo.

## MCP autenticado: publicação e conexão real com ChatGPT

O endpoint implementa MCP JSON-RPC/Streamable HTTP stateless por POST: initialize, ping, tools/list e tools/call. GET normal retorna 405 (não há stream SSE); notificações retornam 202. O endpoint **não permite escrita anônima**. Todas as chamadas, inclusive descoberta de ferramentas, validam o bearer via Supabase Auth `getUser` e verificam UUID administrativo. O site e as ferramentas usam a mesma função SQL transacional `mr_planning_command`.

Ferramentas: `consult_agenda_plan`, `consult_tasks_reviews`, `register_study_session`, `complete_activity`, `correct_record`, `propose_reorganization`. As consultas são somente leitura; propostas não são aplicadas automaticamente. Gravações exigem idempotência e retornam ID/dados confirmados. Correções exigem revisão atual para detectar conflito entre dispositivos. A ferramenta de correção orienta a pedir confirmação explícita para mudanças importantes; o servidor também exige `confirmed: true` nessas mudanças. Não há ingestor de mensagens nem chamadas de IA.

### Passos no Supabase

1. Aplique a migração e valide a aba antes de conectar terceiros.
2. Instale/execute o Supabase CLI em uma máquina sob seu controle. Autentique com sua conta Supabase e selecione o projeto existente. Nunca forneça senha/token em uma URL, commit ou conversa.
3. Configure origens explícitas e o endpoint público (substitua `<REF>` pelo identificador real do projeto):

```sh
supabase login
supabase link --project-ref <REF>
supabase secrets set PLANNING_ALLOWED_ORIGINS=https://flashcard-lac-xi.vercel.app,https://chatgpt.com
supabase secrets set PLANNING_MCP_PUBLIC_URL=https://<REF>.supabase.co/functions/v1/planning-mcp
supabase functions deploy planning-mcp --no-verify-jwt
```

`--no-verify-jwt` desliga apenas a checagem do gateway; a função verifica Auth.getUser em todas as operações protegidas. Não removê-la. `SUPABASE_URL`/`SUPABASE_ANON_KEY` são variáveis já disponibilizadas às Edge Functions. Nenhuma service_role é necessária ao planejamento.

4. No Supabase Dashboard, em **Authentication → OAuth Server**, verifique se a função está disponível no seu projeto/plano e habilite o OAuth Server. Configure o consentimento em `https://flashcard-lac-xi.vercel.app/planejamento/conectar` (se a tela pede caminho, use `/planejamento/conectar` com Site URL correto). A página usa a sessão existente, exige administrador, consulta os detalhes da solicitação no servidor Supabase e pede Autorizar/Negar. Entrar em outra aba reutiliza o login atual.
5. Confirme a descoberta OAuth do seu servidor (`https://<REF>.supabase.co/auth/v1/.well-known/oauth-authorization-server`). Use o `issuer` **real retornado** — não suponha que um servidor desabilitado funciona — e configure:

```sh
supabase secrets set PLANNING_OAUTH_ISSUER=<ISSUER-HTTPS-RETORNADO-PELA-DESCOBERTA>
```

A metadata de recurso MCP fica em `https://<REF>.supabase.co/functions/v1/planning-mcp?metadata=1`. A resposta pública contém apenas endereços do recurso/servidor OAuth e escopos, não dados de planejamento. A resposta 401 indica essa URL em WWW-Authenticate.
6. Habilite registro dinâmico de clientes se permitido pelo projeto e exigido pelo ChatGPT. Se sua organização requer registro manual, crie o cliente OAuth e use **exatamente** a URI de callback apresentada pelo ChatGPT. ID/secret, quando necessários, ficam no cadastro seguro do app no ChatGPT; nunca em código frontend, banco de estudos ou URLs. Não invente callback.

### Passos na conta ChatGPT

1. Confirme que sua conta/workspace oferece **apps/conectores MCP personalizados e modo de desenvolvedor**; os nomes/disponibilidade podem variar por plano e política da organização. O desenvolvimento não compra esse recurso nem muda seu plano.
2. Em **Configurações → Apps/Conectores → Configurações avançadas**, habilite modo de desenvolvedor se disponível. Crie um app MCP personalizado, informe a URL HTTPS acima e selecione autenticação **OAuth**. Preencha ID/secret somente se o cadastro manual anterior exigir.
3. Complete o fluxo Google/Supabase de autenticação que sua conta MedReview já utiliza (nesta instalação, login Supabase existente). A página MedReview de consentimento deve identificar o cliente real; autorize somente estando com a conta administrativa. Uma conta de aluno deve ser recusada pelo servidor MCP mesmo que possua token OAuth válido.
4. Ative o app na conversa. Execute `consult_agenda_plan` com uma data real e `consult_tasks_reviews`. Registre uma sessão conhecida com chave única, repita a mesma operação e confira o mesmo ID em **Estudos**. Teste aluno/visitante e erro de token expirado antes de considerar conectado.
5. Só após esse fluxo funcionar a conexão existe. Criar/publicar a função ou abrir a metadata **não conecta esta conversa automaticamente**. Esta entrega não teve acesso à configuração OAuth real nem à conta ChatGPT para completar essas etapas.

Se OAuth Server, registro de cliente, modo de desenvolvedor, política do workspace ou compatibilidade do fluxo não estiverem disponíveis, a conexão remota permanece pendente. Use o intercâmbio JSON com prévia como alternativa. Não escolha “sem autenticação”, não publique tokens bearer e não abra escrita pública para contornar a limitação. Clientes MCP de teste que suportam bearer podem usar uma sessão válida obtida por fluxo de autenticação autorizado, guardada fora do repositório/URLs; o token expira e não equivale à conexão OAuth ChatGPT.

## Testes e verificações

```sh
npm test
npm run lint
npm run build
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
# Em um terminal, sirva a build:
npm run preview -- --host 127.0.0.1 --port 8082 --strictPort
# Em outro, com Chromium instalado:
CHROMIUM_PATH=/usr/bin/chromium npm run test:planning:e2e
```

O E2E usa respostas de autenticação/catálogo controladas e executa a **migração/RPC em PostgreSQL real via PGlite local**, sem encaminhar requisições ao banco de produção. Testa conta administrativa e aluno, desktop e viewport iPhone, estudo salvo/encontrado após recarregar, zero de acertos, conclusão de revisão e ausência de overflow. Screenshots em `/tmp/medreview-planning-screenshots`, ou `PLANNING_SCREENSHOTS`.

Testes adicionais verificam RLS/grants de visitante/aluno, writes diretos recusados, retry/conflito de chave, não duplicação de sessão/série, persistência após fechar/reabrir banco, histórico e controle de versão, fuso/marco inicial, intervalos imutáveis para séries anteriores, confirmação, rollback de importação e conflitos de agenda. MCP é testado com a mesma transação, autenticação simulada controlada, metadata e seis ferramentas. A execução real de OAuth/ChatGPT depende das etapas acima. O teste móvel cobre Chromium/viewport iPhone; Safari físico não foi testado.

## Custos

Usa o Supabase/Vercel já existentes, dentro das quotas do seu projeto. Não foram contratados serviços, ativada cobrança ou acrescentadas chamadas pagas de IA. PGlite e Playwright são dependências apenas de desenvolvimento/teste. OAuth Server, Edge Functions e apps MCP dependem da disponibilidade/permissões/quota das suas contas; se algum requisito exigir upgrade pago, não ative automaticamente — mantenha a opção JSON manual. A importação do cronograma não depende de IA ou API externa paga.
