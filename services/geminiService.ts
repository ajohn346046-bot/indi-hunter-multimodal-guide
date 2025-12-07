// services/geminiService.ts

// 從 Vite 的環境變數讀取 API Key（.env 裡的 VITE_GEMINI_API_KEY）
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

if (!apiKey) {
  console.warn(
    '[INDI-HUNTER] VITE_GEMINI_API_KEY is missing. The bot UI will load, but calls to Gemini will fail.',
  );
}

// App.tsx 只需要這三個 export：
export interface KnowledgeFileRef {
  fileUri: string;
  displayName: string;
}

/**
 * 傳送對話訊息給 Gemini，回傳模型產生的純文字結果
 * @param messages 來自 App.tsx 的訊息陣列（結構不拘，只要有 role + 文字）
 */
export async function sendMessageToGemini(messages: any[]): Promise<string> {
  // 1. 沒有 API Key：直接回傳一段友善提示文字
  if (!apiKey) {
    return '系統尚未設定 Gemini API Key，因此無法連線到模型。請通知系統管理者。';
  }

  // 2. 組 payload（盡量兼容不同訊息結構）
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' +
    encodeURIComponent(apiKey);

  const payload = {
    contents: messages.map((m: any) => {
      // 嘗試從多種欄位拿文字
      const text = m.content ?? m.text ?? m.message ?? '';
      // 把 assistant 統一轉成 Gemini 的 'model'
      const role =
        m.role === 'assistant'
          ? 'model'
          : m.role === 'user' || m.role === 'model'
          ? m.role
          : 'user';

      return {
        role,
        parts: [{ text }],
      };
    }),
  };

  try {
    // 3. 呼叫 Gemini HTTP API
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    // 4. 處理錯誤：這裡「完全不用 .map」，只抓錯誤訊息字串
    if (!resp.ok) {
      const errMsg =
        (data && data.error && data.error.message) ||
        `Gemini API 回傳錯誤（HTTP ${resp.status}）。`;
      throw new Error(errMsg);
    }

    // 5. 從 candidates 裡把文字拼出來
    const candidates = data.candidates ?? [];
    const parts = candidates[0]?.content?.parts ?? [];
    const text = parts.map((p: any) => p.text).join('\n').trim();

    return text || '模型沒有回傳內容。';
  } catch (error) {
    console.error('[INDI-HUNTER] Gemini request failed:', error);
    // 丟一個乾淨的 Error，讓 App.tsx 用 getFriendlyErrorMessage 顯示
    throw new Error(getFriendlyErrorMessage(error));
  }
}

/**
 * 檔案上傳目前先給一個安全的 stub，
 * 讓 App.tsx 可以編譯，但若點到檔案上傳會得到清楚的提示。
 */
export async function uploadFileToGemini(
  _file: File,
): Promise<KnowledgeFileRef> {
  throw new Error('目前線上版尚未開啟檔案上傳功能。');
}

/**
 * 把各種型態的錯誤，轉成一行友善文字
 */
// 統一把錯誤變成友善字串，不要直接 e.map(...)
// 統一把錯誤變成友善字串，不要直接 e.map(...)
export function getFriendlyErrorMessage(error: unknown): string {
  // 1. 什麼都沒有
  if (!error) {
    return '發生未知錯誤，請稍後再試。';
  }

  // 2. 已經是字串
  if (typeof error === 'string') {
    return error;
  }

  // 3. 一般的 Error 物件
  if (error instanceof Error) {
    return error.message || '發生錯誤，請稍後再試。';
  }

  const anyErr = error as any;

  // 4. 如果是陣列，就把每一個錯誤的 message 串起來
  if (Array.isArray(anyErr)) {
    const msgs = anyErr
      .map((e: any) => e?.message || e?.error?.message || '')
      .filter((m: string) => m && m.trim().length > 0);

    if (msgs.length > 0) {
      return msgs.join('\n');
    }
  }

  // 5. 處理常見的 Gemini REST 回傳格式
  if (typeof anyErr === 'object') {
    // e.error.message
    if (anyErr.error?.message) {
      return anyErr.error.message;
    }

    // e.details 是陣列
    if (Array.isArray(anyErr.details)) {
      const msgs = anyErr.details
        .map((d: any) => d?.error?.message || d?.message || '')
        .filter((m: string) => m && m.trim().length > 0);

      if (msgs.length > 0) {
        return msgs.join('\n');
      }
    }
  }

  // 6. 最後保底：把整個物件 JSON 化
  try {
    return JSON.stringify(anyErr);
  } catch {
    return '發生未知錯誤，請稍後再試。';
  }
}
