
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, PhoneOff, Activity, Volume2 } from 'lucide-react';
import { PDF_KNOWLEDGE } from '../knowledge/source_material';

interface LiveConversationProps {
  onClose: () => void;
  isOpen: boolean;
}

const LiveConversation: React.FC<LiveConversationProps> = ({ onClose, isOpen }) => {
  const [isActive, setIsActive] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [status, setStatus] = useState("Initializing...");
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Audio Context Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  
  // Audio Playback
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Base64 helper manually implemented
  const base64Encode = (bytes: Uint8Array) => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const base64Decode = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  // Convert Float32 input to PCM 16-bit 16kHz
  const createPcmBlob = (data: Float32Array): string => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      // Clamp values
      let s = Math.max(-1, Math.min(1, data[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return base64Encode(new Uint8Array(int16.buffer));
  };

  // Decode Model Output (PCM 16-bit or 24kHz raw) to AudioBuffer
  const decodeAudioData = async (
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number = 24000 // Gemini Live outputs 24kHz
  ): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);
    
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  };

  useEffect(() => {
    if (!isOpen) {
      cleanup();
      return;
    }

    startSession();

    return () => {
      cleanup();
    };
  }, [isOpen]);

  const startSession = async () => {
    try {
      setStatus("Connecting to INDI-HUNTER...");
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("No API Key");

      const ai = new GoogleGenAI({ apiKey });
      
      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      // Output Context (24kHz for Gemini response)
      // Correct usage: new AudioContext({ ... })
      const ctx = new AudioContextClass({ sampleRate: 24000 });
      await ctx.resume(); // CRITICAL: Ensure context is active
      audioContextRef.current = ctx;
      nextStartTimeRef.current = ctx.currentTime;

      // Input Context (16kHz for Gemini input)
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      await inputCtx.resume(); // CRITICAL: Ensure context is active
      inputAudioContextRef.current = inputCtx;

      // Get Microphone Stream
      // Removed sampleRate constraint to prevent OverconstrainedError on some devices
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        } 
      });
      mediaStreamRef.current = stream;

      // Create Source & Processor
      const source = inputCtx.createMediaStreamSource(stream);
      // 4096 frames @ 16kHz ~= 256ms chunk size
      // Correct usage: factory method, NO 'new' keyword
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!isMicOn) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Simple visualizer logic
        let sum = 0;
        for(let i=0; i<inputData.length; i+=100) sum += Math.abs(inputData[i]);
        setVolumeLevel(Math.min(100, (sum / (inputData.length/100)) * 500));

        const base64Data = createPcmBlob(inputData);
        
        // Use the promise to ensure session is ready
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => {
                session.sendRealtimeInput({
                    media: {
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Data
                    }
                });
            }).catch(e => console.error("Send Error:", e));
        }
      };

      source.connect(processor);
      processor.connect(inputCtx.destination); // Need to connect to dest for script processor to fire
      
      sourceRef.current = source;
      processorRef.current = processor;

      // Connect to Gemini Live
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are INDI-HUNTER, a knowledgeable indigenous guide.
          
          CORE KNOWLEDGE BASE (Use this priority):
          ${PDF_KNOWLEDGE}
          
          Speak in a warm, storytelling tone. Keep answers concise for voice conversation. 
          If you don't know, say "I'm not sure" instead of hallucinating.
          Use Traditional Chinese mainly, but you can use indigenous terms if applicable.`,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          }
        },
        callbacks: {
          onopen: () => {
            setStatus("Connected. Listening...");
            setIsActive(true);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && audioContextRef.current) {
                const ctx = audioContextRef.current;
                
                const buffer = await decodeAudioData(base64Decode(audioData), ctx);
                
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                
                // Gapless playback scheduling
                const now = ctx.currentTime;
                // Schedule next chunk at the end of the previous one, or immediately if we fell behind
                const startTime = Math.max(now, nextStartTimeRef.current);
                source.start(startTime);
                nextStartTimeRef.current = startTime + buffer.duration;
                
                activeSourcesRef.current.push(source);
                source.onended = () => {
                    activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
                };
            }
            
            if (msg.serverContent?.interrupted) {
                // Clear audio queue
                activeSourcesRef.current.forEach(s => {
                    try { s.stop(); } catch(e) {}
                });
                activeSourcesRef.current = [];
                if (audioContextRef.current) {
                    nextStartTimeRef.current = audioContextRef.current.currentTime;
                }
            }
          },
          onclose: () => {
            setStatus("Connection closed.");
            setIsActive(false);
          },
          onerror: (err) => {
            console.error("Gemini Live Error:", err);
            setStatus("Error connecting.");
          }
        }
      });
      
      sessionPromiseRef.current = sessionPromise;

    } catch (err: any) {
      console.error("Live Init Error:", err);
      if (err.name === 'NotAllowedError') {
          setStatus("Microphone permission denied.");
      } else if (err.name === 'NotFoundError') {
          setStatus("No microphone found.");
      } else {
          setStatus("Failed to initialize: " + (err.message || "Unknown error"));
      }
    }
  };

  const cleanup = () => {
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close()).catch(e => console.error(e));
        sessionPromiseRef.current = null;
    }
    
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
    }

    if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
    }
    
    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
    }
    audioContextRef.current = null;

    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        inputAudioContextRef.current.close();
    }
    inputAudioContextRef.current = null;
    
    activeSourcesRef.current.forEach(s => {
        try { s.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];
    
    setIsActive(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center animate-in fade-in duration-300">
        
        {/* Visualizer Circle */}
        <div className="relative mb-12">
             <div 
               className="w-48 h-48 rounded-full bg-teal-600/30 blur-2xl absolute top-0 left-0 transition-all duration-100"
               style={{ transform: `scale(${1 + volumeLevel/50})` }}
             />
             <div className="w-48 h-48 rounded-full border-2 border-teal-500 flex items-center justify-center bg-black relative z-10 shadow-[0_0_50px_rgba(20,184,166,0.5)]">
                 <Activity size={64} className="text-teal-400 animate-pulse" />
             </div>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2 tracking-widest">INDI-HUNTER LIVE</h2>
        <p className="text-teal-300 text-sm mb-8 animate-pulse text-center px-4">{status}</p>

        <div className="flex gap-6">
            <button 
                onClick={() => setIsMicOn(!isMicOn)}
                className={`p-4 rounded-full transition-all ${isMicOn ? 'bg-stone-800 text-white hover:bg-stone-700' : 'bg-red-500/20 text-red-500 border border-red-500'}`}
            >
                {isMicOn ? <Mic size={32} /> : <MicOff size={32} />}
            </button>

            <button 
                onClick={onClose}
                className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition-all scale-110 shadow-lg hover:shadow-red-900/50"
            >
                <PhoneOff size={32} />
            </button>
        </div>
        
        <p className="text-stone-500 text-xs mt-12 max-w-xs text-center">
            Conversational Mode using Gemini 2.5 Native Audio. <br/>
            Speak naturally to ask about Indigenous knowledge.
        </p>
    </div>
  );
};

export default LiveConversation;
