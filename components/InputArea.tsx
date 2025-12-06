
import React, { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, X, Mic, MicOff } from 'lucide-react';

interface InputAreaProps {
  onSendMessage: (text: string, image?: File, isVoice?: boolean) => void;
  isLoading: boolean;
}

// Add declaration for SpeechRecognition if not using a library that provides it
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const InputArea: React.FC<InputAreaProps> = ({ onSendMessage, isLoading }) => {
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [isListening, setIsListening] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef<string>(""); // To store existing text before dictation starts

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch(e) {}
      }
    };
  }, []);

  const stopListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
      setIsListening(false);
    }
  };

  const startListening = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("此瀏覽器不支援語音輸入 (Browser does not support Speech Recognition).");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-TW'; // Default to Traditional Chinese
    recognition.interimResults = true;
    recognition.continuous = false; 

    // Capture current text so we append to it, not replace it
    baseTextRef.current = inputText;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      if (event.results && event.results[0]) {
        const transcript = event.results[0][0].transcript;
        // Append new transcript to the base text
        const prefix = baseTextRef.current ? baseTextRef.current + " " : "";
        setInputText(prefix + transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
      
      if (event.error === 'not-allowed') {
         alert("無法存取麥克風。請至瀏覽器設定允許麥克風權限 (Microphone access denied).");
      } else if (event.error === 'audio-capture') {
         alert("麥克風無法使用，可能被其他程式占用 (Audio capture failed).");
      } else if (event.error === 'no-speech') {
         // Just stop quietly
      } else {
         console.warn("Recognition error:", event.error);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // NOTE: Removed auto-send logic.
      // Now it behaves as a "Text Generating Prompt" tool (Dictation).
      // User must click send manually.
    };

    recognitionRef.current = recognition;
    try {
        recognition.start();
    } catch (e) {
        console.error("Failed to start recognition:", e);
        setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !selectedImage) || isLoading) return;

    // Manual stop if typing and listening at same time
    if (isListening) stopListening();

    onSendMessage(inputText, selectedImage || undefined, false);
    setInputText('');
    setSelectedImage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedImage(e.target.files[0]);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`bg-white border-t transition-colors duration-300 p-4 sticky bottom-0 z-10 ${isListening ? 'border-red-400 bg-red-50/30' : 'border-stone-200'}`}>
      <div className="max-w-4xl mx-auto flex flex-col gap-3">
        
        {/* Image Preview */}
        {selectedImage && (
          <div className="relative w-fit">
            <div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 cursor-pointer shadow-md hover:bg-red-600" onClick={clearImage}>
              <X size={12} />
            </div>
            <img 
              src={URL.createObjectURL(selectedImage)} 
              alt="Selected" 
              className="h-16 w-auto rounded-lg border border-stone-300 shadow-sm" 
            />
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* File Input Trigger */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-stone-500 hover:text-teal-700 hover:bg-stone-100 rounded-full transition-colors flex-shrink-0"
            title="Upload Image"
            disabled={isLoading}
          >
            <ImageIcon size={24} />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />

          {/* Text Input Container */}
          <div className="flex-1 relative">
             <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isListening ? "Listening... (Speak to generate text)" : "Type or use microphone to generate prompt..."}
              className={`w-full text-stone-900 text-sm rounded-xl block p-3 pr-12 resize-none no-scrollbar shadow-inner transition-all duration-300 ${
                isListening 
                  ? 'bg-white ring-2 ring-red-400 border-red-400 placeholder-red-400' 
                  : 'bg-stone-50 border-stone-300 focus:ring-teal-500 focus:border-teal-500'
              }`}
              rows={1}
              style={{ minHeight: '48px', maxHeight: '120px' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              disabled={isLoading}
            />
            {/* Microphone Button */}
            <button
              type="button"
              onClick={toggleListening}
              className={`absolute right-2 bottom-2 p-1.5 rounded-full transition-all duration-300 ${
                isListening 
                  ? 'text-white bg-red-500 hover:bg-red-600 animate-pulse scale-110 shadow-lg' 
                  : 'text-stone-400 hover:text-teal-600 hover:bg-stone-100'
              }`}
              title={isListening ? "Stop listening" : "Voice Dictation"}
              disabled={isLoading}
            >
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={(!inputText.trim() && !selectedImage) || isLoading}
            className={`p-3 rounded-full shadow-md transition-all duration-200 flex items-center justify-center flex-shrink-0 ${
              (!inputText.trim() && !selectedImage) || isLoading
                ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
                : 'bg-teal-700 text-white hover:bg-teal-800 hover:scale-105'
            }`}
          >
            {isLoading ? (
               <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>
        <div className="text-center text-xs text-stone-400">
           INDI-HUNTER can make mistakes. Consider checking important information.
        </div>
      </div>
    </form>
  );
};

export default InputArea;
