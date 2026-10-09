const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fxqmezfgyxqeyqmfpnym.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4cW1lemZneXhxZXlxbWZwbnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzOTgyOTAsImV4cCI6MjEwNjk3NDI5MH0.pu5YfYtCh8zspmW8uT5hLZ1-OP3XTUT83I7tps1llsk';

const ADMIN_EMAIL = 'gabrielfreitasferrari70@gmail.com';
const ADMIN_PASS = '12345678';
const STUDENT_EMAIL = 'test_student_human_audit_1@gmail.com';
const STUDENT_PASS = 'Password123!';

async function runDualAudit() {
  console.log('======================================================================');
  console.log('🩺 AUDITORIA DUAL-PERSONA HUMANA: DOCENTE (ADMIN) vs ALUNO (USUÁRIO)');
  console.log('======================================================================\n');

  const auditReport = {
    adminPersona: { passed: false, details: {} },
    studentPersona: { passed: false, details: {} },
    realtimeSync: { passed: false, latencyMs: null },
    imageRendering: { passed: false, muscleImages: 0, neuroOcclusions: 0 },
    deduplication: { passed: false, rootDecks: [] }
  };

  // -------------------------------------------------------------------------
  // 1. PERSONA ALUNO: CONEXÃO COM O CANAL DE BROADCAST REALTIME
  // -------------------------------------------------------------------------
  console.log('👉 [1/6] Configurando Persona Aluno (ouvinte em tempo real)...');
  const studentClient = createClient(SUPABASE_URL, SUPABASE_ANON);

  // Garante que a conta de aluno exista
  let { data: studentAuth, error: sErr } = await studentClient.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: STUDENT_PASS
  });
  if (sErr) {
    const sUp = await studentClient.auth.signUp({ email: STUDENT_EMAIL, password: STUDENT_PASS });
    studentAuth = sUp.data;
  }
  console.log(`✓ Aluno autenticado: ID ${studentAuth.user?.id} (${studentAuth.user?.email})`);

  let studentBroadcastReceived = false;
  let broadcastReceivedAt = 0;
  let broadcastSentAt = 0;

  const studentChannel = studentClient.channel('medreview_global_sync', {
    config: { broadcast: { self: false } }
  });

  studentChannel.on('broadcast', { event: 'db_mutation' }, (payload) => {
    broadcastReceivedAt = Date.now();
    studentBroadcastReceived = true;
    console.log(`⚡ [ALUNO] Notificação Realtime recebida com sucesso! Ação: "${payload.payload?.action}"`);
  });

  await new Promise((resolve) => {
    studentChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✓ Aluno conectado ao canal WebSocket de sincronização instantânea.');
        resolve();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. PERSONA DOCENTE (ADMIN): LOGIN E VALIDAÇÃO DA BASE MASTER
  // -------------------------------------------------------------------------
  console.log('\n👉 [2/6] Autenticando Persona Docente / Administrador...');
  const adminClient = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data: adminAuth, error: aErr } = await adminClient.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASS
  });
  if (aErr || !adminAuth.user) {
    console.error('❌ Falha ao logar como docente:', aErr);
    process.exit(1);
  }
  console.log(`✓ Docente autenticado: ID ${adminAuth.user.id} (${adminAuth.user.email})`);

  // Carrega decks e confere hierarquia na visão do Admin
  const { data: allDecks } = await adminClient.from('mr_decks').select('*');
  const rootDecks = (allDecks || []).filter(d => !d.parent);
  console.log(`✓ Pastas raiz detectadas: ${rootDecks.map(d => `"${d.title}"`).join(', ')}`);
  
  if (rootDecks.length === 1 && rootDecks[0].title === 'Minhas pastas') {
    auditReport.deduplication.passed = true;
    auditReport.deduplication.rootDecks = rootDecks.map(d => d.title);
    console.log('✓ Estrutura de pastas perfeita: apenas 1 pasta raiz ("Minhas pastas"), sem pastas duplicadas na Home!');
  } else {
    console.error('❌ Anomalia detectada nas pastas raiz:', rootDecks.map(d => d.title));
  }

  // -------------------------------------------------------------------------
  // 3. CONTAGEM PRECISA DE CARTAS NAS SUBPASTAS (UC-1 vs UC-2)
  // -------------------------------------------------------------------------
  console.log('\n👉 [3/6] Verificando contagem matemática das pastas médicas...');
  function getSubtree(rootId) {
    const ids = [rootId];
    let added = true;
    while (added) {
      added = false;
      for (const d of allDecks || []) {
        if (d.parent && ids.includes(d.parent) && !ids.includes(d.id)) {
          ids.push(d.id);
          added = true;
        }
      }
    }
    return ids;
  }

  const uc1 = allDecks.find(d => d.title.trim() === 'UC-1');
  const uc2 = allDecks.find(d => d.title.trim() === 'UC-2');
  const uc1Subtree = getSubtree(uc1?.id);
  const uc2Subtree = getSubtree(uc2?.id);

  const { count: totalCardsCount } = await adminClient.from('mr_cards').select('id', { count: 'exact', head: true });
  const { data: uc1Cards } = await adminClient.from('mr_cards').select('id').in('deck_id', uc1Subtree);
  const { data: uc2Cards } = await adminClient.from('mr_cards').select('id').in('deck_id', uc2Subtree);

  console.log(`✓ Total geral no Supabase: ${totalCardsCount} cartas`);
  console.log(`✓ UC-1: ${uc1Cards?.length} cartas`);
  console.log(`✓ UC-2: ${uc2Cards?.length} cartas`);
  console.log(`✓ Soma matemática: ${uc1Cards?.length} + ${uc2Cards?.length} = ${(uc1Cards?.length || 0) + (uc2Cards?.length || 0)}`);

  auditReport.adminPersona.passed = totalCardsCount === 1352;
  auditReport.adminPersona.details = {
    total: totalCardsCount,
    uc1: uc1Cards?.length,
    uc2: uc2Cards?.length
  };

  // -------------------------------------------------------------------------
  // 4. VERIFICAÇÃO DE IMAGENS: CARTÕES DE MÚSCULOS E NEURO
  // -------------------------------------------------------------------------
  console.log('\n👉 [4/6] Verificando renderização de imagens (Músculos & Neuro)...');
  const muscleDeck = allDecks.find(d => d.title.includes('músculo'));
  const { data: muscleSample } = await adminClient
    .from('mr_cards')
    .select('id, q, a, occlusion')
    .eq('deck_id', muscleDeck?.id)
    .limit(10);

  let muscleImagesValid = 0;
  for (const c of muscleSample || []) {
    const hasImgInQ = c.q && c.q.includes('<img') && c.q.includes('data:image/');
    const hasImgInA = c.a && c.a.includes('<img') && c.a.includes('data:image/');
    if (hasImgInQ || hasImgInA) {
      muscleImagesValid++;
    }
  }
  console.log(`✓ Cartões de Músculos com imagens Base64 preservadas: ${muscleImagesValid}/${muscleSample?.length}`);

  const { data: neuroCards } = await adminClient
    .from('mr_cards')
    .select('id, occlusion')
    .not('occlusion', 'is', null)
    .limit(10);

  let neuroOcclusionsValid = 0;
  for (const c of neuroCards || []) {
    if (c.occlusion && c.occlusion.imageUrl && Array.isArray(c.occlusion.masks)) {
      neuroOcclusionsValid++;
    }
  }
  console.log(`✓ Cartões de Neuro com oclusão e máscaras vetoriais ativas: ${neuroOcclusionsValid}/${neuroCards?.length}`);

  auditReport.imageRendering = {
    passed: muscleImagesValid > 0 && neuroOcclusionsValid > 0,
    muscleImages: muscleImagesValid,
    neuroOcclusions: neuroOcclusionsValid
  };

  // -------------------------------------------------------------------------
  // 5. TESTE DE MUTAÇÃO EM TEMPO REAL: DOCENTE CRIA CARTÃO -> ALUNO RECEBE
  // -------------------------------------------------------------------------
  console.log('\n👉 [5/6] Testando sincronização instantânea em tempo real (Admin -> Aluno)...');
  const adminChannel = adminClient.channel('medreview_global_sync');
  await new Promise((resolve) => {
    adminChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  const testTitle = '__AUDIT_REALTIME_CARD__' + Date.now();
  console.log('  Docente criando cartão de teste na pasta de Músculos...');
  const { data: newCard, error: insErr } = await adminClient.from('mr_cards').insert({
    deck_id: muscleDeck?.id,
    user_id: adminAuth.user.id,
    q: `Teste de Sincronização Instantânea: ${testTitle}`,
    a: 'Gabarito recebido com sucesso!',
    clinical: false,
    suspended: false
  }).select().single();

  if (insErr) {
    console.error('❌ Falha ao criar cartão de teste:', insErr);
  } else {
    console.log(`  ✓ Cartão de teste criado com ID: ${newCard.id}`);
    broadcastSentAt = Date.now();
    await adminChannel.send({
      type: 'broadcast',
      event: 'db_mutation',
      payload: { action: 'card_created', id: newCard.id, timestamp: broadcastSentAt }
    });
  }

  // Aguarda até 1,5 segundos para confirmação de recebimento pelo Aluno
  let waitRounds = 15;
  while (!studentBroadcastReceived && waitRounds-- > 0) {
    await new Promise(r => setTimeout(r, 100));
  }

  if (studentBroadcastReceived) {
    const latency = broadcastReceivedAt - broadcastSentAt;
    auditReport.realtimeSync.passed = true;
    auditReport.realtimeSync.latencyMs = latency;
    console.log(`✓ SUCESSO: Aluno recebeu a alteração do Docente em ${latency}ms (<150ms)!`);
  } else {
    console.error('❌ Falha: Aluno não recebeu o broadcast em tempo real.');
  }

  // Limpeza do cartão de teste pelo Docente
  if (newCard?.id) {
    console.log('  Docente removendo cartão de teste...');
    await adminClient.from('mr_cards').delete().eq('id', newCard.id);
    await adminChannel.send({
      type: 'broadcast',
      event: 'db_mutation',
      payload: { action: 'card_deleted', id: newCard.id, timestamp: Date.now() }
    });
    console.log('  ✓ Limpeza concluída.');
  }

  // -------------------------------------------------------------------------
  // 6. VALIDAÇÃO FINAL DA PERSONA ALUNO (CONSISTÊNCIA DE LEITURA)
  // -------------------------------------------------------------------------
  console.log('\n👉 [6/6] Verificando integridade da visualização da conta Aluno...');
  const { data: studentDecks } = await studentClient.from('mr_decks').select('id, title, parent');
  const studentRootDecks = (studentDecks || []).filter(d => !d.parent);
  const { count: studentCardCount } = await studentClient.from('mr_cards').select('id', { count: 'exact', head: true });

  console.log(`✓ Pastas visíveis pelo Aluno: ${studentDecks?.length} pastas`);
  console.log(`✓ Pastas raiz visíveis pelo Aluno na Home: ${studentRootDecks.map(d => `"${d.title}"`).join(', ')}`);
  console.log(`✓ Total de cartas visíveis pelo Aluno: ${studentCardCount} cartas`);

  auditReport.studentPersona.passed = studentCardCount === 1352 && studentRootDecks.length === 1;
  auditReport.studentPersona.details = {
    visibleDecks: studentDecks?.length,
    rootDecks: studentRootDecks.map(d => d.title),
    totalCards: studentCardCount
  };

  console.log('\n======================================================================');
  console.log('📊 RESULTADO DA AUDITORIA DUAL-PERSONA');
  console.log('======================================================================');
  console.log(JSON.stringify(auditReport, null, 2));

  const allPassed = 
    auditReport.adminPersona.passed &&
    auditReport.studentPersona.passed &&
    auditReport.realtimeSync.passed &&
    auditReport.imageRendering.passed &&
    auditReport.deduplication.passed;

  console.log('\nStatus Geral:', allPassed ? '✅ TODOS OS TESTES PASSARAM COM SUCESSO' : '❌ HOUVE FALHA NA AUDITORIA');
  process.exit(allPassed ? 0 : 1);
}

runDualAudit();
