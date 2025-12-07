import React, { useState, useRef, useEffect } from 'react';
import { Message, Role, IndiResponse } from './types';
import { sendMessageToGemini, uploadFileToGemini, KnowledgeFileRef, getFriendlyErrorMessage } from './services/geminiService';
import AvatarDisplay from './components/AvatarDisplay';
import MessageBubble from './components/MessageBubble';
import InputArea from './components/InputArea';
import LiveConversation from './components/LiveConversation';
import { 
  Menu, X, ArrowRight, Upload, FileText, Trash2, 
  Loader2, AlertCircle, FileStack, FileSpreadsheet, FileCode, File as FileIcon, Brain, Link as LinkIcon, Plus, Download, Cloud,
  ChevronLeft, ChevronRight, Headphones, Settings, HardDrive, Pin
} from 'lucide-react';

const STARTERS = [
  "原住民傳統夢占有哪五個不同層次分類?",
  "原住民傳統醫療有哪九種文化特色分類? 試舉例說明",
  "雙向知識Two-eyed seeing 是甚麼意思?",
  "住在極圈附近的因紐特族和台灣泰雅族於紋面紋身各自有哪些意涵?"
];

const MAX_FILE_SIZE_MB = 500;
// Restored the specific Vimeo link requested
const DEFAULT_VIDEO_URL = "https://vimeo.com/1144075672?fl=ip&fe=ec"; 
const PLACEHOLDER_VIDEO = "https://vimeo.com/1144075672?fl=ip&fe=ec";

// Utility to resize images to avoid LocalStorage quota limits (5MB)
const resizeImage = (file: File, maxWidth: number = 300): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const elem = document.createElement('canvas');
        const scaleFactor = maxWidth / img.width;
        if (scaleFactor >= 1) {
            resolve(event.target?.result as string);
            return;
        }
        elem.width = maxWidth;
        elem.height = img.height * scaleFactor;
        const ctx = elem.getContext('2d');
        if (!ctx) {
            reject(new Error("Canvas context not available"));
            return;
        }
        ctx.drawImage(img, 0, 0, elem.width, elem.height);
        resolve(elem.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const formatBytes = (bytes?: number) => {
  if (typeof bytes !== 'number') return '';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getFileIcon = (mimeType: string, name: string) => {
  const lowerName = name.toLowerCase();
  if (mimeType.includes('pdf') || lowerName.endsWith('.pdf')) {
    return <FileText size={14} className="text-red-500" />;
  }
  if (mimeType.includes('csv') || lowerName.endsWith('.csv') || mimeType.includes('spreadsheet')) {
    return <FileSpreadsheet size={14} className="text-green-600" />;
  }
  if (lowerName.endsWith('.json') || lowerName.endsWith('.md') || lowerName.endsWith('.txt')) {
    return <FileCode size={14} className="text-stone-600" />;
  }
  return <FileIcon size={14} className="text-stone-400" />;
};

// --- Google Drive Helpers ---
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const App: React.FC = () => {
  // --- State Initialization ---

  // 1. Messages History
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('indi_hunter_history');
      if (saved) return JSON.parse(saved);
    } catch (e) { console.warn("Failed to load history", e); }
    return [{
      id: 'welcome',
      role: Role.MODEL,
      content: "NGA'AY HO! (你好!) 我是 INDI-HUNTER。我可以分享原住民族的傳統智慧，也能聊聊自然科學與 AI。請問你想了解什麼呢？",
      timestamp: Date.now(),
      parsedResponse: {
        reply_text: "NGA'AY HO! (你好!) 我是 INDI-HUNTER。我可以分享原住民族的傳統智慧，也能聊聊自然科學與 AI。請問你想了解什麼呢？",
        short_title: "歡迎！我是 INDI-HUNTER",
        voice_style: "calm",
        avatar_emotion: "happy",
        avatar_energy: "medium",
        reasoning_notes: "Initial greeting.",
        memory_to_save: []
      }
    }];
  });

  // 2. Custom Avatar (Static Image)
  const [customAvatar, setCustomAvatar] = useState<string | null>(() => {
    try { return localStorage.getItem('indi_hunter_avatar'); } catch (e) { return null; }
  });

  // 2b. Custom Avatar Video
  const [avatarVideoUrl, setAvatarVideoUrl] = useState<string | null>(() => {
    try { 
      const saved = localStorage.getItem('indi_hunter_avatar_video');
      return saved || PLACEHOLDER_VIDEO; 
    } catch (e) { return PLACEHOLDER_VIDEO; }
  });
  
  // 3. Knowledge Files
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFileRef[]>(() => {
    try {
      const saved = localStorage.getItem('indi_hunter_knowledge');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (e) { return []; }
  });

  // 4. Long-Term Memories
  const [memories, setMemories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('indi_hunter_memories');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  // 5. External Links
  const [externalLinks, setExternalLinks] = useState<string[]>(() => {
    const userDriveLink = "https://drive.google.com/drive/folders/1R8-9v-a2BOdPMhgmCmGPAezm2Ky-pVXR?usp=drive_link";
    try {
      const saved = localStorage.getItem('indi_hunter_links');
      if (saved) {
         const parsed = JSON.parse(saved);
         if (!parsed.includes(userDriveLink)) {
            return [userDriveLink, ...parsed];
         }
         return parsed;
      }
      return [userDriveLink];
    } catch (e) { return [userDriveLink]; }
  });

  // 6. Settings (Google Config)
  const [showSettings, setShowSettings] = useState(false);
  const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem('indi_hunter_g_client_id') || '');
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem('indi_hunter_g_api_key') || '');
  
  // 7. Suggestions Bar
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS);

  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); 
  const [currentSpeakingId, setCurrentSpeakingId] = useState<string | null>(null);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState("");

  const knowledgeInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // --- Effects ---

  useEffect(() => {
    try { localStorage.setItem('indi_hunter_history', JSON.stringify(messages)); } catch (e) {}
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    try { localStorage.setItem('indi_hunter_knowledge', JSON.stringify(knowledgeFiles)); } catch (e) {}
  }, [knowledgeFiles]);

  useEffect(() => {
    try { localStorage.setItem('indi_hunter_memories', JSON.stringify(memories)); } catch (e) {}
  }, [memories]);
  
  useEffect(() => {
    try { localStorage.setItem('indi_hunter_links', JSON.stringify(externalLinks)); } catch (e) {}
  }, [externalLinks]);

  useEffect(() => {
     localStorage.setItem('indi_hunter_g_client_id', googleClientId);
     localStorage.setItem('indi_hunter_g_api_key', googleApiKey);
  }, [googleClientId, googleApiKey]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // --- Google Drive Logic ---
  const handleDriveImport = () => {
    if (!googleClientId || !googleApiKey) {
      alert("Please configure Google Client ID and API Key in Settings (top right) first.");
      setShowSettings(true);
      return;
    }

    if (!window.gapi || !window.google) {
      alert("Google API scripts not loaded. Check internet connection.");
      return;
    }

    setIsUploadingFile(true);
    setUploadError("Waiting for Google Sign-in...");

    // 1. Load Picker API
    window.gapi.load('picker', async () => {
      // 2. Request Access Token
      // NOTE: initTokenClient is NOT a constructor, do not use 'new'
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: async (response: any) => {
          if (response.error !== undefined) {
            setUploadError("Auth Error: " + response.error);
            setIsUploadingFile(false);
            return;
          }
          createPicker(response.access_token);
        },
      });
      tokenClient.requestAccessToken({prompt: 'consent'});
    });
  };

  const createPicker = (accessToken: string) => {
    setUploadError("Select files from Drive...");
    const pickerCallback = async (data: any) => {
      if (data.action === window.google.picker.Action.PICKED) {
        setUploadError("Downloading files...");
        const docs = data.docs;
        const errors: string[] = [];

        for (const doc of docs) {
            const fileId = doc.id;
            const fileName = doc.name;
            const mimeType = doc.mimeType;

            try {
                // Fetch file content using the access token
                const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                
                if (!response.ok) throw new Error("Download failed");
                
                const blob = await response.blob();
                const file = new File([blob], fileName, { type: mimeType });
                
                // Reuse existing upload logic
                const fileRef = await uploadFileToGemini(file);
                setKnowledgeFiles(prev => {
                     if (prev.some(f => f.name === fileRef.name)) return prev;
                     return [...prev, fileRef];
                });
            } catch (err) {
                console.error(err);
                errors.push(fileName);
            }
        }
        
        if (errors.length > 0) {
            setUploadError(`Failed to download: ${errors.join(", ")}`);
        } else {
            setUploadError(null);
        }
        setIsUploadingFile(false);
      } else if (data.action === window.google.picker.Action.CANCEL) {
        setIsUploadingFile(false);
        setUploadError(null);
      }
    };

    const view = new window.google.picker.View(window.google.picker.ViewId.DOCS);
    view.setMimeTypes("application/pdf,text/plain,application/vnd.google-apps.document");
    
    // NOTE: PickerBuilder IS a constructor, use 'new'
    const picker = new window.google.picker.PickerBuilder()
      .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
      .setDeveloperKey(googleApiKey)
      .setAppId(googleClientId)
      .setOAuthToken(accessToken)
      .addView(view)
      .setCallback(pickerCallback)
      .build();
    picker.setVisible(true);
  };

  // --- Handlers ---

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollSuggestions = (direction: 'left' | 'right') => {
    if (suggestionsRef.current) {
      const scrollAmount = 200;
      suggestionsRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleSpeak = (text: string, messageId: string) => {
    if ('speechSynthesis' in window) {
      if (isSpeaking && currentSpeakingId === messageId) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        setCurrentSpeakingId(null);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-TW'; 
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(v => v.lang.includes('zh-TW') || v.lang.includes('zh-CN'));
      if (zhVoice) utterance.voice = zhVoice;

      utterance.onstart = () => {
        setIsSpeaking(true);
        setCurrentSpeakingId(messageId);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        setCurrentSpeakingId(null);
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setCurrentSpeakingId(null);
      };
      window.speechSynthesis.speak(utterance);
    } else {
      alert("TTS not supported in this browser.");
    }
  };

  const handleSendMessage = async (text: string, image?: File, isVoice: boolean = false) => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setCurrentSpeakingId(null);

    const newMessageId = Date.now().toString();
    
    let imageBase64: string | undefined;
    let mimeType: string | undefined;

    if (image) {
      const reader = new FileReader();
      reader.readAsDataURL(image);
      await new Promise<void>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string;
          imageBase64 = result.split(',')[1];
          mimeType = image.type;
          resolve();
        };
      });
    }

    const userMessage: Message = {
      id: newMessageId,
      role: Role.USER,
      content: text,
      image: image ? URL.createObjectURL(image) : undefined,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setSuggestions([]); 

    try {
      const response = await sendMessageToGemini({
        prompt: text,
        history: messages, 
        imageBase64,
        mimeType,
        knowledgeFiles,
        memories,
        externalLinks 
      });

      const modelMsgId = (Date.now() + 1).toString();
      const modelMessage: Message = {
        id: modelMsgId,
        role: Role.MODEL,
        content: response.reply_text,
        parsedResponse: response as IndiResponse,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, modelMessage]);

      if (isVoice) {
         setTimeout(() => handleSpeak(response.reply_text, modelMsgId), 500);
      }

      if (response.memory_to_save && response.memory_to_save.length > 0) {
        setMemories(prev => {
          const newMems = response.memory_to_save!.filter(m => !prev.includes(m));
          return [...prev, ...newMems];
        });
      }

      const nextSuggestions = [
        ...(response.related_questions || []),
        ...STARTERS
      ];
      setSuggestions([...new Set(nextSuggestions)]);

    } catch (error: any) {
      console.error(error);
      const errorText = getFriendlyErrorMessage(error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: Role.MODEL,
        content: errorText,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
      setSuggestions(STARTERS); 
      if (isVoice) {
         setTimeout(() => handleSpeak(errorText, (Date.now() + 1).toString()), 500);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddLink = () => {
    const rawLink = linkInput.trim();
    if (!rawLink) return;
    if (externalLinks.includes(rawLink)) return;
    setExternalLinks(prev => [...prev, rawLink]);
    setLinkInput("");
  };

  const removeLink = (linkToRemove: string) => {
    setExternalLinks(prev => prev.filter(l => l !== linkToRemove));
  };

  const downloadBackup = () => {
    const backupData = {
      timestamp: new Date().toISOString(),
      app: "INDI-HUNTER",
      memories: memories,
      history: messages,
      knowledge_files_meta: knowledgeFiles,
      external_links: externalLinks
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `indi_hunter_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert("Backup downloaded! \nTo save to Google Drive: Please drag this JSON file into your specific Google Drive folder manually.");
  };

  const handleAvatarUpload = async (file: File) => {
    try {
      const resizedBase64 = await resizeImage(file, 256);
      setCustomAvatar(resizedBase64);
      localStorage.setItem('indi_hunter_avatar', resizedBase64);
    } catch (err) {
      alert("Image processing failed.");
    }
  };

  const handleVideoLinkSet = (url: string | null) => {
    setAvatarVideoUrl(url);
    if (url) {
      localStorage.setItem('indi_hunter_avatar_video', url);
    } else {
      localStorage.removeItem('indi_hunter_avatar_video');
    }
  };

  const handleKnowledgeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploadingFile(true);
      setUploadError(null);
      
      const filesToUpload: File[] = Array.from(e.target.files);
      const errors: string[] = [];

      for (const file of filesToUpload) {
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          errors.push(`${file.name} (> ${MAX_FILE_SIZE_MB}MB)`);
          continue;
        }
        if (knowledgeFiles.some(f => f.name === file.name)) {
           errors.push(`${file.name} (Duplicate)`);
           continue;
        }
        try {
          const fileRef = await uploadFileToGemini(file);
          setKnowledgeFiles(prev => {
             if (prev.some(f => f.name === fileRef.name)) return prev;
             return [...prev, fileRef];
          });
        } catch (err: any) {
          errors.push(`${file.name} (Error)`);
          console.error(err);
        }
      }
      if (errors.length > 0) {
        setUploadError(`Failed: ${errors.join(", ")}`);
      }
      setIsUploadingFile(false);
      if (knowledgeInputRef.current) knowledgeInputRef.current.value = '';
    }
  };
  
  const removeKnowledgeFile = (uriToRemove: string) => {
    setKnowledgeFiles(prev => prev.filter(f => f.uri !== uriToRemove));
  };

  const clearAllFiles = () => {
    if (knowledgeFiles.length === 0) return;
    if (window.confirm("確定要清除所有檔案嗎？這通常能解決 Token 上限問題。\n(Clear all files?)")) {
      setKnowledgeFiles([]);
    }
  };

  const removeMemory = (index: number) => {
    setMemories(prev => prev.filter((_, i) => i !== index));
  };
  
  const resetChat = () => {
    if(window.confirm("Clear all history?")) {
       localStorage.removeItem('indi_hunter_history');
       setMessages([{
          id: 'welcome',
          role: Role.MODEL,
          content: "NGA'AY HO! (你好!) 我是 INDI-HUNTER。我可以分享原住民族的傳統智慧，也能聊聊自然科學與 AI。請問你想了解什麼呢？",
          timestamp: Date.now(),
          parsedResponse: {
            reply_text: "NGA'AY HO! (你好!) 我是 INDI-HUNTER。我可以分享原住民族的傳統智慧，也能聊聊自然科學與 AI。請問你想了解什麼呢？",
            short_title: "歡迎！我是 INDI-HUNTER",
            voice_style: "calm" as const,
            avatar_emotion: "happy" as const,
            avatar_energy: "medium" as const,
            reasoning_notes: "Initial greeting.",
            memory_to_save: []
          }
       }]);
       setSuggestions(STARTERS);
    }
  };

  const lastModelMsg = [...messages].reverse().find(m => m.role === Role.MODEL && m.parsedResponse);
  const currentEmotion = lastModelMsg?.parsedResponse?.avatar_emotion || 'neutral';
  const currentEnergy = lastModelMsg?.parsedResponse?.avatar_energy || 'medium';
  const currentTitle = lastModelMsg?.parsedResponse?.short_title || '';

  return (
    <div className="flex flex-col h-screen bg-stone-50 overflow-hidden">
      
      {/* Live Mode Overlay */}
      <LiveConversation isOpen={isLiveMode} onClose={() => setIsLiveMode(false)} />

      {/* Header */}
      <header className="bg-stone-900 text-stone-100 px-3 py-2 shadow-md flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center font-bold text-[10px]">IH</div>
          <h1 className="text-sm font-bold tracking-wider">INDI-HUNTER</h1>
        </div>
        <div className="flex gap-2 items-center">
           <button 
             onClick={() => setIsLiveMode(true)}
             className="flex items-center gap-1 text-[10px] bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded-full transition-colors shadow-sm animate-pulse"
             title="Start Live Conversation"
           >
             <Headphones size={12} /> Live Call
           </button>
           <div className="w-px h-4 bg-stone-700 mx-1"></div>
           <button 
             onClick={downloadBackup}
             className="hidden md:flex items-center gap-1 text-[10px] bg-teal-700 hover:bg-teal-600 text-white px-2 py-1 rounded-full transition-colors shadow-sm"
           >
             <Cloud size={12} /> Backup
           </button>
           <button 
             onClick={() => setShowSettings(true)}
             className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-white px-2 py-1 border border-stone-700 rounded-full transition-colors"
           >
             <Settings size={12} />
           </button>
           <button 
             className="md:hidden text-stone-300"
             onClick={() => setShowSidebar(!showSidebar)}
           >
             {showSidebar ? <X size={16} /> : <Menu size={16} />}
           </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <aside className={`
          absolute md:static inset-0 z-10 bg-stone-50/95 md:bg-transparent
          transform transition-transform duration-300 ease-in-out
          ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
          w-full md:w-96 p-6 md:border-r border-stone-200 overflow-y-auto
          flex flex-col items-center
        `}>
          <div className="mt-4 md:mt-0 w-full max-w-sm flex flex-col gap-3">
            <AvatarDisplay 
              emotion={currentEmotion} 
              energy={currentEnergy}
              title={currentTitle}
              isThinking={isLoading}
              isSpeaking={isSpeaking}
              customImage={customAvatar}
              customVideo={avatarVideoUrl}
              onImageUpload={handleAvatarUpload}
              onVideoLinkSet={handleVideoLinkSet}
            />

            {/* Knowledge Base */}
            <div className="bg-white p-2 rounded-lg border border-stone-200 shadow-sm flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <h3 className="text-stone-700 font-bold text-xs flex items-center gap-1.5">
                  <FileStack size={14} /> 檔案 (RAG Files)
                </h3>
                <div className="flex items-center gap-2">
                   <span className="text-[9px] text-stone-400">{knowledgeFiles.length + 1} files</span>
                   {knowledgeFiles.length > 0 && (
                     <button onClick={clearAllFiles} className="text-[9px] text-red-400 hover:text-red-600 border border-red-200 rounded px-1">Clear All</button>
                   )}
                </div>
              </div>

              <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1 no-scrollbar mt-1">
                  {/* Fixed Document Pin */}
                  <div className="bg-stone-100 border border-stone-300 rounded p-1.5 flex items-center justify-between opacity-80" title="Fixed Knowledge Base">
                      <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                        <FileText size={14} className="text-stone-600" />
                        {/* RESTORED original name */}
                        <span className="text-[10px] text-stone-700 truncate font-semibold">44tkb3_compressed_merged.pdf</span>
                      </div>
                      <Pin size={10} className="text-stone-400" />
                  </div>

                  {knowledgeFiles.map((file, idx) => (
                    <div key={idx} className="bg-stone-50 border border-stone-200 rounded p-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                        {getFileIcon(file.mimeType, file.name)}
                        <span className="text-[10px] text-stone-700 truncate">{file.name}</span>
                      </div>
                      <button onClick={() => removeKnowledgeFile(file.uri)} className="text-stone-300 hover:text-red-500">
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
              </div>
              
              <div className="flex gap-2 mt-1">
                {/* Local Upload */}
                <div onClick={() => knowledgeInputRef.current?.click()} className="flex-1 border border-dashed border-stone-300 rounded p-1.5 text-center cursor-pointer hover:bg-stone-50 transition-colors flex items-center justify-center gap-1">
                   {isUploadingFile ? <Loader2 className="animate-spin text-teal-600" size={12} /> : <Upload className="text-stone-400" size={12} />}
                   <span className="text-[9px] text-stone-400">Local Upload</span>
                </div>
                {/* Drive Import */}
                <div onClick={handleDriveImport} className="flex-1 border border-dashed border-blue-300 bg-blue-50/50 rounded p-1.5 text-center cursor-pointer hover:bg-blue-50 transition-colors flex items-center justify-center gap-1" title="Requires Google Client ID in Settings">
                   <HardDrive className="text-blue-500" size={12} />
                   <span className="text-[9px] text-blue-600">Drive Import</span>
                </div>
              </div>

              {uploadError && <p className="text-[9px] text-red-500 text-center">{uploadError}</p>}
              <input type="file" ref={knowledgeInputRef} onChange={handleKnowledgeUpload} accept=".pdf,.txt,.md,.csv,.json" className="hidden" multiple />
            </div>

            {/* External Links */}
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-stone-700 font-bold text-sm flex items-center gap-2">
                  <LinkIcon size={16} /> 網址/YouTube
                </h3>
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="Paste URL..." 
                  className="flex-1 text-xs border border-stone-300 rounded-md px-2 py-1.5 focus:outline-none focus:border-teal-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                />
                <button 
                  onClick={handleAddLink}
                  className="bg-stone-100 hover:bg-teal-100 text-stone-600 hover:text-teal-700 p-1.5 rounded-md transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
              {externalLinks.length > 0 && (
                <div className="flex flex-col gap-2 max-h-36 overflow-y-auto pr-1 no-scrollbar">
                  {externalLinks.map((link, idx) => (
                    <div key={idx} className="bg-blue-50 border border-blue-100 rounded-lg p-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <LinkIcon size={12} className="text-blue-400 flex-shrink-0" />
                        <span className="text-xs text-blue-800 truncate" title={link}>{link}</span>
                      </div>
                      <button onClick={() => removeLink(link)} className="text-blue-300 hover:text-red-500">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Memories */}
            {memories.length > 0 && (
              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-stone-700 font-bold text-sm flex items-center gap-2">
                    <Brain size={16} className="text-purple-600" /> 關於你
                  </h3>
                </div>
                <div className="flex flex-col gap-2 max-h-36 overflow-y-auto pr-1 no-scrollbar">
                  {memories.map((mem, idx) => (
                    <div key={idx} className="bg-purple-50 border border-purple-100 rounded-lg p-2 flex items-start justify-between">
                      <p className="text-xs text-purple-900 leading-tight pr-2">{mem}</p>
                      <button onClick={() => removeMemory(idx)} className="text-purple-300 hover:text-purple-600">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Chat Area */}
        <section className="flex-1 flex flex-col h-full relative w-full">
          <div className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar scroll-smooth">
             <div className="max-w-3xl mx-auto">
               {messages.map(msg => (
                 <MessageBubble 
                    key={msg.id} 
                    message={msg} 
                    onSpeak={handleSpeak} 
                    onSuggestionClick={(text) => handleSendMessage(text)}
                 />
               ))}
               {isLoading && (
                 <div className="flex items-center gap-2 text-stone-400 text-sm ml-4 animate-pulse">
                   <div className="w-2 h-2 rounded-full bg-stone-400"></div>
                   <div className="w-2 h-2 rounded-full bg-stone-400 delay-75"></div>
                   <div className="w-2 h-2 rounded-full bg-stone-400 delay-150"></div>
                 </div>
               )}
               <div ref={messagesEndRef} />
             </div>
          </div>
          
          {!isLoading && suggestions.length > 0 && (
            <div className="bg-stone-50 border-t border-stone-200 py-3 px-2 md:px-4">
              <div className="max-w-4xl mx-auto flex items-center gap-2">
                <span className="text-[10px] text-stone-400 uppercase font-bold whitespace-nowrap mr-1 hidden md:block">Try asking:</span>
                <button onClick={() => scrollSuggestions('left')} className="p-1.5 rounded-full bg-white border border-stone-300 text-stone-500 hover:text-teal-600 hover:border-teal-500 shadow-sm flex-shrink-0 z-10 transition-colors"><ChevronLeft size={16} /></button>
                <div ref={suggestionsRef} className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth">
                  {suggestions.map((question, idx) => (
                    <button key={idx} onClick={() => handleSendMessage(question)} className="flex-shrink-0 bg-white border border-stone-300 hover:border-teal-500 text-stone-600 hover:text-teal-700 text-xs px-3 py-2 rounded-full transition-all whitespace-nowrap shadow-sm hover:shadow-md">{question}</button>
                  ))}
                </div>
                <button onClick={() => scrollSuggestions('right')} className="p-1.5 rounded-full bg-white border border-stone-300 text-stone-500 hover:text-teal-600 hover:border-teal-500 shadow-sm flex-shrink-0 z-10 transition-colors"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
          <InputArea onSendMessage={handleSendMessage} isLoading={isLoading} />
        </section>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-stone-800 flex items-center gap-2">
                   <Settings className="text-stone-500" /> Settings
                </h3>
                <button onClick={() => setShowSettings(false)} className="text-stone-400 hover:text-stone-600"><X size={20} /></button>
             </div>
             
             <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-800">
                   <p className="font-bold mb-1">Google Drive Integration</p>
                   To directly import files from your Drive, you must provide your Google Cloud Client ID and API Key.
                   <br/><a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="underline font-bold">Get credentials here</a>.
                </div>
                
                <div>
                   <label className="block text-xs font-bold text-stone-600 mb-1">Google Client ID</label>
                   <input 
                     type="text" 
                     value={googleClientId} 
                     onChange={(e) => setGoogleClientId(e.target.value)}
                     placeholder="123...apps.googleusercontent.com"
                     className="w-full border border-stone-300 rounded p-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                   />
                </div>
                
                <div>
                   <label className="block text-xs font-bold text-stone-600 mb-1">Google API Key (Developer Key)</label>
                   <input 
                     type="text" 
                     value={googleApiKey} 
                     onChange={(e) => setGoogleApiKey(e.target.value)}
                     placeholder="AIzaSy..."
                     className="w-full border border-stone-300 rounded p-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                   />
                </div>
             </div>

                   <div className="mt-6 flex justify-end">
                        <button
        onClick={() => setShowSettings(false)}
        className="bg-teal-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-teal-800 font-medium"
      >
        Save & Close
      </button>
    </div>
  </div>

  {/* 原住民族智慧財產與資料著作權警語 */}
  <div className="mt-4 text-[10px] leading-relaxed text-stone-500 text-center border-t border-stone-200 pt-2 px-4">
    <p>
      {`【原住民族智慧財產與資料著作權聲明】
本系統呈現之多模態多媒體資料與對話內容（傳統醫療與夢境占卜內容）、圖檔內容、影像、文字等資訊內容，係為政府單位示範教學與研究用途，
未經原作作者或資料提供者授權同意，不得以任何形式下載、重製、公開傳輸、改作或用於商業用途。`}
    </p>
  </div>
</div>
