// services/geminiService.ts
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

if (!apiKey) {
  console.warn(
    '[INDI-HUNTER] VITE_GEMINI_API_KEY is missing. The bot UI will load, but calls to Gemini will fail.'
  );
}

type ChatMessage = {
  role: 'user' | 'model';
  content: string;
};

export async function callGemini(messages: ChatMessage[]): Promise<string> {
  if (!apiKey) {
    // 這裡只回傳錯誤字串，不要 throw，避免整個 React 掛掉
    return '系統尚未設定 Gemini API Key，因此無法連線到模型。';
  }

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

  const payload = {
    contents: messages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    })),
  };

  const res = await fetch(`${url}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error('[INDI-HUNTER] Gemini API error:', await res.text());
    return `呼叫 Gemini 失敗（HTTP ${res.status}）。請稍後再試。`;
  }

  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text ??
    '模型沒有回傳內容。';

  return text;
}
