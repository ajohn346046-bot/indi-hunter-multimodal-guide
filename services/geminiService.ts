// services/geminiService.ts

// 從 Vite 的環境變數讀 API Key（在 GitHub 上是用 GEMINI_API_KEY secret 映射過來）
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

if (!apiKey) {
  console.warn(
    '[INDI-HUNTER] VITE_GEMINI_API_KEY is missing. The bot UI will load, but calls to Gemini will fail.',
  );
}

// ==== 型別定義（只在這個檔案裡用） ====

export type ChatMessage = {
  role: 'user' | 'model';
  content: string;
};

export type KnowledgeFileRef = {
  id: string;          // 之後如果你真的接上「上傳檔案」，可以用後端回傳的 id
  displayName: string; // 顯示在 UI 上的名稱
};

// 這個型別大致對應 App 裡面用到的回應結構
export type IndiResponse = {
  ok: boolean;
  answer?: string;
  errorMessage?: string;
  raw?: unknown;
};

// 把前端對話訊息轉成 Gemini API 需要的格式
function toGeminiContents(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
}

// ==== 對 App.tsx 匯出的函式 ====

/**
 * 主要聊天：送文字訊息給 Gemini，拿回模型回答
 */
export async function sendMessageToGemini(
  messages: ChatMessage[],
): Promise<IndiResponse> {
  if (!apiKey) {
    // 這裡不要 throw，避免整個 React 掛掉
    return {
      ok: false,
      errorMessage:
        '系統尚未設定 Gemini API Key，因此目前無法連線到模型。',
    };
  }

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' +
    encodeURIComponent(apiKey);

  const payload = {
    contents: toGeminiContents(messages),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Gemini HTTP error:', res.status, text);
      return {
        ok: false,
        errorMessage: `呼叫 Gemini API 失敗（HTTP ${res.status}）`,
        raw: text,
      };
    }

    const data: any = await res.json();

    const answer =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text ?? '')
        .join('') ?? '';

    return {
      ok: true,
      answer,
      raw: data,
    };
  } catch (err) {
    console.error('Gemini fetch error:', err);
    return {
      ok: false,
      errorMessage: getFriendlyErrorMessage(err),
    };
  }
}

/**
 * 檔案上傳目前先做「假實作」：
 * - 讓 TypeScript / App.tsx 可以正常編譯
 * - 之後你要串真正的「上傳到 Google AI Studio / 其他後端」再改這裡就好
 */
export async function uploadFileToGemini(
  file: File,
): Promise<KnowledgeFileRef> {
  console.warn(
    '[INDI-HUNTER] uploadFileToGemini is a stub. The file is NOT really uploaded anywhere.',
    file,
  );

  // 目前只是回傳一個假的 id，讓前端 UI 可以先跑起來
  return {
    id: `local-${Date.now()}`,
    displayName: file.name,
  };
}

/**
 * 把錯誤物件轉成比較友善的訊息
 */
export function getFriendlyErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '系統發生未預期錯誤，請稍後再試。';
}
