// The model feature: "Suggest" proposes 3-5 tags and a one-line summary for an event.
//
// Four rules, each one a defence question:
//  1. The model client is passed in. Tests pass a fake one, so no test ever calls the provider.
//  2. Every call has a timeout. A provider that never answers must not hang the request.
//  3. Whatever goes wrong (no key, timeout, rate limit, nonsense output) we fall back to a
//     simple keyword heuristic, so the button always gives an answer and saving never depends on it.
//  4. The model's output is checked before anyone sees it: it is a suggestion, never data.
const { invalid, requireUser } = require('./errors');
const { cleanTags } = require('./events');

const TIMEOUT_MS = 8000;

const STOP_WORDS = new Set(
  ('a an and are as at be by for from has have in into is it its of on or our the this to we will with ' +
    'you your about after all also any can come do event join more new not one only out over so some than ' +
    'that their them then there they up us was what when where which who why')
    .split(' '),
);

function buildPrompt({ title, description }) {
  // Only the event's title and description are sent: never a name, email or anything about a user.
  return [
    'You label university club events.',
    'Reply with JSON only, exactly this shape: {"tags": ["..."], "summary": "..."}',
    'tags: 3 to 5 short lower-case topic words. summary: one sentence, at most 140 characters.',
    `Title: ${title}`,
    `Description: ${description}`,
  ].join('\n');
}

/** Returns {tags, summary} if the model's text is acceptable, otherwise null. */
function parseModelOutput(text) {
  let parsed;
  try {
    // Models like to wrap JSON in ```json fences; take the outermost {...}.
    const match = String(text).match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : '');
  } catch {
    return null;
  }
  const tags = cleanTags(parsed.tags); // parsed is an object: the regex only matches {...}
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  if (tags.length < 3 || !summary || summary.length > 140 || /<[^>]+>/.test(summary)) return null;
  return { tags, summary };
}

/** The fallback: the most frequent meaningful words, and the first sentence as the summary. */
function heuristicSuggestion({ title, description }) {
  const words = `${title} ${title} ${description}`.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  const counts = new Map();
  for (const w of words) if (!STOP_WORDS.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([w]) => w);
  const tags = cleanTags([...ranked, 'club', 'event', 'students']).slice(0, Math.max(3, Math.min(5, ranked.length)));
  const firstSentence = (description.split(/(?<=[.!?])\s/)[0] || title).trim();
  const summary = firstSentence.length > 140 ? `${firstSentence.slice(0, 137)}...` : firstSentence;
  return { tags, summary };
}

function suggestionsService({ model, timeoutMs = TIMEOUT_MS, log = () => {} }) {
  return {
    /**
     * @returns {{tags: string[], summary: string, source: 'model'|'fallback', note?: string}}
     */
    async suggest(user, input = {}) {
      requireUser(user);
      const title = String(input.title ?? '').trim().slice(0, 120);
      const description = String(input.description ?? '').trim().slice(0, 2000);
      if (title.length < 3) throw invalid('Write a title first, so there is something to suggest from.');

      if (!model) {
        return { ...heuristicSuggestion({ title, description }), source: 'fallback', note: 'No model is configured.' };
      }
      try {
        const text = await model.generate(buildPrompt({ title, description }), { signal: AbortSignal.timeout(timeoutMs) });
        const result = parseModelOutput(text);
        if (result) return { ...result, source: 'model' };
        return { ...heuristicSuggestion({ title, description }), source: 'fallback', note: 'The model gave an unusable answer.' };
      } catch (error) {
        // Log the kind of failure, never the prompt: it is user-written text.
        log(`model call failed: ${error.name}`);
        const note = error.name === 'TimeoutError' ? 'The model took too long.' : 'The model is unavailable right now.';
        return { ...heuristicSuggestion({ title, description }), source: 'fallback', note };
      }
    },
  };
}

module.exports = { suggestionsService, parseModelOutput, heuristicSuggestion, buildPrompt };
