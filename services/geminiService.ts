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

// ---- 暫時版：檔案上傳 stub，讓 App.tsx 可以編譯通過 ----

// 如果你在別的地方已經有定義 KnowledgeFileRef，就不要重複宣告
export type KnowledgeFileRef = {
  id: string;
  displayName: string;
};

export async function uploadFileToGemini(file: File): Promise<KnowledgeFileRef> {
  // 目前 GitHub Pages 是純前端 demo，
  // 我們先不真的呼叫 Gemini 的「檔案上傳」API，
  // 只回傳一個假的 id＋檔名，讓 UI 可以正常運作。
  console.warn('uploadFileToGemini is running in demo mode – file is not actually uploaded.');
  return {
    id: `local-${Date.now()}`,
    displayName: file.name,
  };
}
