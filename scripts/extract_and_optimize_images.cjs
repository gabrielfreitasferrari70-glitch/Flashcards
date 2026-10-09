const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const backupPath = path.resolve('backup_full_supabase.json');
console.log('Loading backup...');
const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

const mediaDir = path.resolve('public/cards-media');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

let extractedCount = 0;
const b64ToUrl = new Map();

for (const card of data.cards) {
  // 1. Oclusões
  if (card.occlusion && typeof card.occlusion === 'object' && card.occlusion.imageUrl) {
    const raw = card.occlusion.imageUrl;
    if (raw.startsWith('data:image')) {
      if (!b64ToUrl.has(raw)) {
        const hash = crypto.createHash('md5').update(raw).digest('hex').slice(0, 12);
        const match = raw.match(/data:image\/(\w+);base64,/);
        const ext = match ? (match[1] === 'jpeg' ? 'jpg' : match[1]) : 'jpg';
        const filename = `occl_${hash}.${ext}`;
        const b64Payload = raw.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(path.join(mediaDir, filename), Buffer.from(b64Payload, 'base64'));
        b64ToUrl.set(raw, `/cards-media/${filename}`);
        extractedCount++;
      }
      card.occlusion.imageUrl = b64ToUrl.get(raw);
    }
  }

  // 2. Imagens embutidas no campo Q e A (músculos)
  for (const field of ['q', 'a']) {
    if (typeof card[field] === 'string' && card[field].includes('data:image')) {
      card[field] = card[field].replace(/data:image\/[a-zA-Z0-9+]+;base64,[a-zA-Z0-9+/=]+/g, (match) => {
        if (!b64ToUrl.has(match)) {
          const hash = crypto.createHash('md5').update(match).digest('hex').slice(0, 12);
          const mimeMatch = match.match(/data:image\/(\w+);base64,/);
          const ext = mimeMatch ? (mimeMatch[1] === 'jpeg' ? 'jpg' : mimeMatch[1]) : 'jpg';
          const filename = `img_${hash}.${ext}`;
          const b64Payload = match.replace(/^data:image\/\w+;base64,/, '');
          fs.writeFileSync(path.join(mediaDir, filename), Buffer.from(b64Payload, 'base64'));
          b64ToUrl.set(match, `/cards-media/${filename}`);
          extractedCount++;
        }
        return b64ToUrl.get(match);
      });
    }
  }
}

console.log(`Sucesso: ${extractedCount} imagens únicas extraídas e salvas em public/cards-media/!`);

const optimizedBackupPath = path.resolve('backup_optimized_clean.json');
fs.writeFileSync(optimizedBackupPath, JSON.stringify(data, null, 2));

const originalSize = fs.statSync(backupPath).size / (1024 * 1024);
const cleanSize = fs.statSync(optimizedBackupPath).size / (1024 * 1024);

console.log(`Tamanho original do banco: ${originalSize.toFixed(2)} MB`);
console.log(`Tamanho NOVO otimizado: ${cleanSize.toFixed(2)} MB!`);
console.log(`Redução de espaço: -${(originalSize - cleanSize).toFixed(2)} MB (${Math.round(((originalSize - cleanSize) / originalSize) * 100)}% de economia!)`);
