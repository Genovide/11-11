function extractInsight(data) {
  const choice = data.choices?.[0],
    content = choice?.message?.content;
  const raw =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .filter((p) => p.type === 'text' || p.type === 'output_text')
            .map((p) => (typeof p.text === 'string' ? p.text : p.text?.value || ''))
            .join('\n')
        : '';
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/^```(?:\w+)?\s*|\s*```$/g, '')
    .replace(/^(?:описание|анализ песни)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    const error = Error(
      choice?.finish_reason === 'length'
        ? 'Модель исчерпала лимит ответа, не вернув описание. Нажми кнопку ещё раз.'
        : 'Модель вернула пустой ответ. Нажми кнопку ещё раз — будет выбран доступный бесплатный провайдер.'
    );
    error.code = 'AI_EMPTY';
    throw error;
  }
  const sentences = [...new Intl.Segmenter('ru', { granularity: 'sentence' }).segment(cleaned)]
    .slice(0, 2)
    .map((x) => x.segment)
    .join('')
    .trim();
  return sentences.length <= 700 ? sentences : sentences.slice(0, 697).replace(/\s+\S*$/, '') + '…';
}
module.exports = { extractInsight };
