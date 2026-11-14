const aliases = {
  genre: {
    фонк: 'phonk',
    джаз: 'jazz',
    рок: 'rock',
    рэп: 'rap',
    'хип хоп': 'hip hop',
    электроника: 'electronic',
    техно: 'techno',
    эмбиент: 'ambient',
    поп: 'pop',
    метал: 'metal',
  },
  mood: {
    спокойное: 'chill ambient',
    спокойная: 'chill ambient',
    спокойствие: 'chill ambient',
    грустное: 'sad melancholy',
    грустная: 'sad melancholy',
    'для тренировки': 'workout gym',
    тренировка: 'workout gym',
    энергичное: 'energetic dance',
    веселое: 'happy upbeat',
    'для сна': 'sleep ambient',
    'для учебы': 'focus instrumental',
    'для работы': 'focus instrumental',
    романтичное: 'romantic',
  },
};
function parseQuery(value) {
  const input = typeof value === 'string' ? { query: value } : value;
  if (!input || typeof input.query !== 'string') throw Error('Введи запрос');
  const mode = ['artist', 'genre', 'mood'].includes(input.mode) ? input.mode : 'artist';
  const original = input.query.trim();
  if (!original || original.length > 500) throw Error('Введи запрос до 500 символов');
  const key = original.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  return { query: aliases[mode]?.[key] || original, original, mode };
}
module.exports = { parseQuery };
