const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://fxqmezfgyxqeyqmfpnym.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4cW1lemZneXhxZXlxbWZwbnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzOTgyOTAsImV4cCI6MjEwNjk3NDI5MH0.pu5YfYtCh8zspmW8uT5hLZ1-OP3XTUT83I7tps1llsk';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

async function run() {
  console.log('1. Autenticando com credenciais admin...');
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'gabrielfreitasferrari70@gmail.com',
    password: '12345678',
  });
  if (authErr) throw authErr;
  console.log('Autenticado com sucesso!');

  const cleanData = JSON.parse(fs.readFileSync('backup_optimized_clean.json', 'utf8'));
  console.log(`Lidas ${cleanData.cards.length} cartas e ${cleanData.reviews.length} avaliações do backup otimizado.`);

  // 2. Limpar mr_cards e mr_reviews via Supabase API (ou verificar se já foi truncado)
  console.log('Verificando estado atual de mr_cards...');
  const { count: currentCards } = await supabase.from('mr_cards').select('id', { count: 'estimated' });
  console.log(`Cartas atualmente na tabela: ${currentCards}`);

  if (currentCards > 0) {
    console.log('A tabela ainda tem cartas antigas pesadas. Deletando em lotes...');
    // Deleta os cartões antigos para limpar o banco
    const { error: delRevErr } = await supabase.from('mr_reviews').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('mr_reviews limpo:', delRevErr || 'ok');

    const { error: delCardErr } = await supabase.from('mr_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('mr_cards limpo:', delCardErr || 'ok');
  }

  // 3. Inserir cartas limpas (apenas 3.68 MB)
  console.log('Inserindo 1352 cartas otimizadas com URLs estáticas CDN...');
  const CHUNK_SIZE = 100;
  for (let i = 0; i < cleanData.cards.length; i += CHUNK_SIZE) {
    const chunk = cleanData.cards.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('mr_cards').insert(chunk);
    if (error) {
      console.error(`Erro no lote ${i}-${i + CHUNK_SIZE}:`, error);
      throw error;
    }
    process.stdout.write(`Inseridas ${Math.min(i + CHUNK_SIZE, cleanData.cards.length)}/${cleanData.cards.length} cartas...\r`);
  }
  console.log('\nTodas as 1352 cartas inseridas com sucesso!');

  // 4. Inserir avaliações
  if (cleanData.reviews && cleanData.reviews.length > 0) {
    console.log(`Inserindo ${cleanData.reviews.length} avaliações...`);
    const { error: rErr } = await supabase.from('mr_reviews').insert(cleanData.reviews);
    if (rErr) console.error('Erro ao restaurar reviews:', rErr);
    else console.log('Avaliações restauradas com sucesso!');
  }

  console.log('BANCO 100% POPULADO E OTIMIZADO COM SUCESSO!');
}

run().catch(console.error);
