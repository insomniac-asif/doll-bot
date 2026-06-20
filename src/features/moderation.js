import { getThreshold } from '../config.js';

export async function moderateContent(text) {
  if (!process.env.OPENAI_API_KEY) return { flagged: false, categories: {}, scores: {} };

  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: text }),
  });

  if (!res.ok) {
    console.error(`[Moderation] OpenAI API error: ${res.status}`);
    return { flagged: false, categories: {}, scores: {} };
  }

  const data = await res.json();
  const result = data.results?.[0];
  if (!result) return { flagged: false, categories: {}, scores: {} };

  return {
    flagged: result.flagged,
    categories: result.categories,
    scores: result.category_scores,
  };
}

export function checkThresholds(scores, level) {
  const threshold = getThreshold(level);
  const violations = [];

  for (const [category, score] of Object.entries(scores)) {
    if (score >= threshold) {
      violations.push({ category, score });
    }
  }

  return violations;
}

const categoryLabels = {
  'sexual': 'Sexual Content',
  'hate': 'Hate Speech',
  'harassment': 'Harassment',
  'self-harm': 'Self-Harm',
  'sexual/minors': 'Sexual Content (Minors)',
  'hate/threatening': 'Hate/Threatening',
  'violence/graphic': 'Graphic Violence',
  'violence': 'Violence',
  'harassment/threatening': 'Threatening Harassment',
  'self-harm/intent': 'Self-Harm Intent',
  'self-harm/instructions': 'Self-Harm Instructions',
};

export function formatCategory(key) {
  return categoryLabels[key] || key;
}
