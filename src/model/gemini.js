// The ONLY file that knows which model provider we use. Swapping Gemini for another
// provider means rewriting this file and nothing else, because the service only needs
// an object with generate(prompt, { signal }) -> text.
//
// REST API: https://ai.google.dev/api/generate-content
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** null when there is no key: the service then uses its fallback instead of failing */
function createGeminiClient({ apiKey = process.env.GEMINI_API_KEY, model = process.env.MODEL_NAME || 'gemini-2.5-flash' } = {}) {
  if (!apiKey) return null;
  return {
    async generate(prompt, { signal } = {}) {
      const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        // The key goes in a header, not the URL, so it never appears in a logged URL.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 300 },
        }),
        signal, // the caller's timeout: when it fires, fetch rejects with a TimeoutError
      });
      if (!res.ok) {
        const error = new Error(`Gemini answered ${res.status}`);
        error.name = res.status === 429 ? 'RateLimited' : 'ProviderError';
        throw error;
      }
      const body = await res.json();
      return body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    },
  };
}

module.exports = { createGeminiClient };
