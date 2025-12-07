
import { GoogleGenAI, Type, Content } from "@google/genai";
import { SYSTEM_INSTRUCTION, RESPONSE_SCHEMA } from "../constants";
import { Message, Role, IndiResponse, GroundingSource } from "../types";
import { PDF_KNOWLEDGE } from "../knowledge/source_material"; // Import the fixed knowledge

let client: GoogleGenAI | null = null;

const getClient = () => {
  if (!client) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.error("API Key not found in environment variables");
      throw new Error("API Key missing");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
};

console.log('[INDI-HUNTER] Gemini API key length =', (import.meta.env.VITE_GEMINI_API_KEY as string | '').length);

export interface KnowledgeFileRef {
  uri: string;
  mimeType: string;
  name: string;
  fileResourceName?: string; 
  size?: number;
}

export interface GenerateContentParams {
  prompt: string;
  history: Message[];
  imageBase64?: string;
  mimeType?: string;
  knowledgeFiles?: KnowledgeFileRef[]; 
  memories?: string[];
  externalLinks?: string[]; 
}

const getFallbackMimeType = (file: File): string => {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'txt': return 'text/plain';
    case 'md': return 'text/markdown';
    case 'csv': return 'text/csv';
    case 'json': return 'application/json';
    default: return 'application/octet-stream';
  }
};

export const getFriendlyErrorMessage = (error: any): string => {
  const msg = error.message || JSON.stringify(error);
  
  if (msg.includes("page limit") || (msg.includes("exceeds") && msg.includes("pages"))) {
    return "檔案頁數過多 (超過 1000 頁)，系統無法處理。請將 PDF 分割為較小的檔案後再上傳 (Document exceeds 1000 pages limit).";
  }

  if (msg.includes("token count") || msg.includes("maximum number of tokens")) {
    return "已超過 100 萬 Tokens 上限。\n\n1. 系統已自動縮減對話記憶。\n2. 若仍看到此訊息，代表「檔案本身」過大。\n請點擊左側紅色「Clear All」按鈕清除所有檔案，然後只上傳最需要的檔案。\n(Token limit exceeded. Please clear files and retry with fewer documents.)";
  }

  if (msg.includes("API Key")) return "API Key 設定錯誤 (Invalid API Key).";
  if (msg.includes("Network") || msg.includes("fetch") || msg.includes("Failed to fetch")) return "網路連線不穩定 (Network connection error).";
  if (msg.includes("400")) return "請求格式錯誤 (Bad Request - 400).";
  if (msg.includes("403")) return "存取被拒 (Access Denied - 403).";
  if (msg.includes("429")) return "請求次數過多，請稍後再試 (Too Many Requests - 429).";
  if (msg.includes("500") || msg.includes("503") || msg.includes("Overloaded")) return "伺服器暫時無法回應 (Server Error - 503).";
  
  return msg || "未知錯誤 (Unknown Error).";
};

const waitForFileActive = async (ai: GoogleGenAI, fileResourceName: string): Promise<void> => {
  console.log(`Waiting for ${fileResourceName} to become ACTIVE...`);
  const maxRetries = 300; 
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const fileStatus = await ai.files.get({ name: fileResourceName });
      if (fileStatus.state === 'ACTIVE') {
        await new Promise(resolve => setTimeout(resolve, 3000));
        return;
      }
      if (fileStatus.state === 'FAILED') throw new Error("檔案處理失敗 (File processing failed).");
    } catch (e: any) {
      if (i > 10 && e.message?.includes("404")) throw new Error("找不到檔案 (File not found).");
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("檔案處理逾時 (Timeout).");
};

export const uploadFileToGemini = async (file: File): Promise<KnowledgeFileRef> => {
  const ai = getClient();
  const mimeType = getFallbackMimeType(file);
  
  try {
    const uploadResult = await ai.files.upload({
      file: file,
      config: { displayName: file.name, mimeType: mimeType }
    });
    
    const uploadedFile = uploadResult.file || (uploadResult as any);
    if (!uploadedFile || !uploadedFile.uri) throw new Error("Invalid upload response.");

    if (uploadedFile.state === 'ACTIVE') {
       await new Promise(resolve => setTimeout(resolve, 2000));
       return {
        uri: uploadedFile.uri,
        mimeType: uploadedFile.mimeType || mimeType,
        name: uploadedFile.displayName || file.name,
        fileResourceName: uploadedFile.name,
        size: file.size
      };
    }

    await waitForFileActive(ai, uploadedFile.name);
    return {
      uri: uploadedFile.uri,
      mimeType: uploadedFile.mimeType || mimeType,
      name: uploadedFile.displayName || file.name,
      fileResourceName: uploadedFile.name,
      size: file.size
    };
  } catch (error: any) {
    console.error("Error uploading file:", error);
    throw new Error(getFriendlyErrorMessage(error));
  }
};

const safeParseResponse = (text: string, modelInfo: string): IndiResponse => {
  try {
    const parsed = JSON.parse(text);
    if (parsed.reasoning_notes) parsed.reasoning_notes = `[${modelInfo}] ${parsed.reasoning_notes}`;
    return parsed;
  } catch (e) {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
        try { 
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.reasoning_notes) parsed.reasoning_notes = `[${modelInfo}] ${parsed.reasoning_notes}`;
          return parsed;
        } catch(err) {}
    }
    
    return {
      reply_text: text,
      short_title: "回應",
      voice_style: "calm",
      avatar_emotion: "neutral",
      avatar_energy: "medium",
      reasoning_notes: `[${modelInfo}] Response was not strict JSON. Raw text returned.`
    };
  }
};

export const sendMessageToGemini = async ({ 
  prompt, 
  history, 
  imageBase64, 
  mimeType,
  knowledgeFiles,
  memories,
  externalLinks
}: GenerateContentParams): Promise<IndiResponse> => {
  const ai = getClient();
  
  // 1. Inject Fixed PDF Knowledge Base
  let dynamicSystemInstruction = SYSTEM_INSTRUCTION;
  dynamicSystemInstruction += `\n\n[CORE KNOWLEDGE BASE (Primary Source)]:\n${PDF_KNOWLEDGE}\n\nUse this CORE KNOWLEDGE to answer questions about Indigenous traditions, plants, and dreams first.`;
  
  // 2. Inject Memory
  if (memories && memories.length > 0) {
    dynamicSystemInstruction += `\n\n[KNOWN USER FACTS (Long-Term Memory)]:\n${memories.map(m => `- ${m}`).join('\n')}\n\nUse these facts to personalize your response.`;
  }

  const hasFiles = knowledgeFiles && knowledgeFiles.length > 0;
  const hasLinks = externalLinks && externalLinks.length > 0;

  // 3. Prepare History
  let maxHistoryTurns = 10;
  if (hasFiles) {
    maxHistoryTurns = knowledgeFiles!.length > 2 ? 0 : 2;
  }

  const filteredHistory = history.filter(msg => msg.id !== 'welcome');
  const recentHistory = maxHistoryTurns > 0 ? filteredHistory.slice(-maxHistoryTurns) : [];
    
  const previousContents: Content[] = recentHistory.map(msg => ({
      role: msg.role === Role.USER ? "user" : "model",
      parts: [
        { text: msg.parsedResponse ? JSON.stringify(msg.parsedResponse) : msg.content }
      ]
    }));

  const currentParts: any[] = [];

  // 4. Prompt Construction for Files & Links
  let contextPrompt = "";
  
  if (hasFiles) {
    const fileNames = knowledgeFiles!.map(f => `"${f.name}"`).join(", ");
    contextPrompt += `[ATTACHED DOCUMENTS]: ${fileNames}\n`;
    knowledgeFiles!.forEach(file => {
      currentParts.push({
        fileData: { fileUri: file.uri, mimeType: file.mimeType }
      });
    });
  }

  if (hasLinks) {
    contextPrompt += `[EXTERNAL LINK RESOURCES]:\n${externalLinks!.map(l => `- ${l}`).join('\n')}\n`;
    contextPrompt += `INSTRUCTION: 
    1. You SHOULD use the 'googleSearch' tool to verify or find information about these links.
    2. FOR GOOGLE DRIVE LINKS: Attempt to use 'googleSearch' to see if the content is public.
       - If you cannot access the file directly, politely inform the user to use the "Import from Drive" button for private files.
    3. Treat verified links as primary knowledge sources.\n`;
  }

  if (hasFiles || hasLinks) {
    contextPrompt += `\nINSTRUCTION: Answer the user's question "${prompt}" using the attached documents and/or the external links provided. `;
    currentParts.push({ text: contextPrompt });
  }

  if (imageBase64 && mimeType) {
    currentParts.push({ inlineData: { data: imageBase64, mimeType: mimeType } });
  }
  
  currentParts.push({ text: prompt });

  const contents = [
    ...previousContents,
    { role: "user", parts: currentParts }
  ];

  // --- STRATEGY SELECTION ---
  
  if (hasLinks) {
    try {
      console.log("Strategy: Links present -> Flash with Search Tool");
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
        config: {
          systemInstruction: dynamicSystemInstruction + "\n\nIMPORTANT: Output valid JSON matching the schema previously defined. Do NOT output markdown only.",
          tools: [{ googleSearch: {} }],
          temperature: 0.5,
        }
      });
      return processResponseWithGrounding(response, "Flash+Links");
    } catch (e: any) {
      console.error("Link strategy failed", e);
      if (getFriendlyErrorMessage(e).includes("Token limit exceeded")) throw e;
      throw e;
    }
  }

  if (hasFiles) {
    try {
      console.log("Strategy: Files only -> Pro with Schema");
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: contents,
        config: {
          systemInstruction: dynamicSystemInstruction,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.1, 
        }
      });
      if (response.text) return safeParseResponse(response.text, "Pro+Files");
    } catch (e: any) {
      console.warn("Pro+Files failed, falling back to Flash...", e.message);
      const friendlyMsg = getFriendlyErrorMessage(e);
      if (friendlyMsg.includes("檔案頁數過多") || friendlyMsg.includes("Token limit exceeded")) {
        throw e;
      }
    }
  }

  try {
    console.log("Strategy: General/Fallback -> Flash with Search");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: dynamicSystemInstruction + "\n\nIMPORTANT: Output valid JSON matching the schema. Do NOT output plain text.",
        temperature: 0.7, 
      }
    });
    return processResponseWithGrounding(response, "Flash+Search");

  } catch (e: any) {
    console.error("All tiers failed.", e);
    throw e;
  }
};

const processResponseWithGrounding = (response: any, modelTag: string): IndiResponse => {
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources: GroundingSource[] = [];
    if (groundingChunks) {
      groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) {
          sources.push({ title: chunk.web.title, uri: chunk.web.uri });
        }
      });
    }

    const parsed = safeParseResponse(response.text || "{}", modelTag);
    
    if (sources.length > 0) {
        parsed.groundingSources = [...(parsed.groundingSources || []), ...sources];
        parsed.groundingSources = parsed.groundingSources.filter((v,i,a)=>a.findIndex(v2=>(v2.uri===v.uri))===i);
    }

    return parsed;
};
