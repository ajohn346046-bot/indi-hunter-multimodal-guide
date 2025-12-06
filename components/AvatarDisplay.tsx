import React, { useRef, useState, useEffect } from 'react';
import { AvatarEmotion, AvatarEnergy } from '../types';
import { AVATAR_BASE_URL } from '../constants';
import { Camera, Link as LinkIcon, Video, X } from 'lucide-react';

interface AvatarDisplayProps {
  emotion: AvatarEmotion;
  energy: AvatarEnergy;
  title: string;
  isThinking: boolean;
  isSpeaking?: boolean; // Controls animation/video playback
  customImage?: string | null;
  customVideo?: string | null; // URL for the video avatar
  onImageUpload?: (file: File) => void;
  onVideoLinkSet?: (url: string | null) => void;
}

const AvatarDisplay: React.FC<AvatarDisplayProps> = ({ 
  emotion, 
  energy, 
  title, 
  isThinking,
  isSpeaking = false,
  customImage,
  customVideo,
  onImageUpload,
  onVideoLinkSet
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [videoInput, setVideoInput] = useState("");

  // Helper to detect and format Embed URLs
  const getEmbedInfo = (url: string) => {
    if (!url) return null;
    
    // Vimeo: vimeo.com/123456 -> player.vimeo.com/video/123456
    const vimeoMatch = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
    if (vimeoMatch) {
      return {
        type: 'iframe',
        // background=1 removes controls/chrome, autoplay/loop/muted required for background feel
        url: `https://player.vimeo.com/video/${vimeoMatch[1]}?background=1&autoplay=1&loop=1&byline=0&title=0&muted=1`
      };
    }

    // YouTube: youtube.com/watch?v=ID or youtu.be/ID -> youtube.com/embed/ID
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
    if (ytMatch) {
      const id = ytMatch[1];
      return {
        type: 'iframe',
        // playlist=ID required for loop to work on YT embeds
        url: `https://www.youtube.com/embed/${id}?autoplay=1&controls=0&disablekb=1&loop=1&playlist=${id}&mute=1&showinfo=0&modestbranding=1`
      };
    }

    // Default to direct video file (mp4, webm)
    return { type: 'video', url: url };
  };

  const embedInfo = customVideo ? getEmbedInfo(customVideo) : null;

  // Control Direct Video Playback based on Speaking State
  useEffect(() => {
    if (embedInfo?.type === 'video' && videoRef.current) {
      if (isSpeaking) {
        videoRef.current.play().catch(e => console.log("Auto-play prevented", e));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isSpeaking, embedInfo]);
  
  // Mapping emotions to visual cues
  const getBorderColor = () => {
    if (isSpeaking) return 'border-teal-400 animate-pulse'; 
    switch (emotion) {
      case 'happy': return 'border-yellow-400';
      case 'serious': return 'border-blue-800';
      case 'surprised': return 'border-orange-400';
      case 'thoughtful': return 'border-purple-500';
      default: return 'border-stone-400';
    }
  };

  const getEmoji = () => {
    if (isThinking) return "🤔";
    if (isSpeaking) return "🗣️";
    switch (emotion) {
      case 'happy': return "😊";
      case 'serious': return "😐";
      case 'surprised': return "😲";
      case 'thoughtful': return "🧐";
      default: return "🙂";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onImageUpload) {
      onImageUpload(e.target.files[0]);
    }
  };

  const handleVideoSubmit = () => {
    if (onVideoLinkSet) {
      onVideoLinkSet(videoInput.trim() || null);
    }
    setShowLinkInput(false);
  };

  return (
    <div className="flex flex-col items-center justify-center p-0.5 bg-transparent w-full md:w-80 h-fit sticky top-2">
      
      {/* Avatar Container - Expanded Size & Portrait Mode (w-64 h-80) 
          Updated: Removed padding, thinner border (1.5px), simpler styling 
      */}
      <div className={`relative w-64 h-80 rounded-[2rem] border-[1.5px] ${getBorderColor()} transition-colors duration-500 bg-black group overflow-hidden shadow-md`}>
        
        {/* Render Video (Iframe or Tag) or Image */}
        <div className="w-full h-full overflow-hidden relative bg-black">
          {customVideo && embedInfo ? (
             embedInfo.type === 'iframe' ? (
               // Iframe for Vimeo/YouTube
               <iframe 
                 src={embedInfo.url}
                 className="w-full h-full object-cover scale-[1.8] pointer-events-none origin-center" 
                 frameBorder="0"
                 allow="autoplay; fullscreen; picture-in-picture" 
                 title="Avatar Video"
                 style={{ pointerEvents: 'none' }} // Ensure clicks go through if needed, though usually blocked by overlay
               />
             ) : (
               // Direct Video File (MP4)
               <video 
                 ref={videoRef}
                 src={embedInfo.url}
                 loop 
                 muted 
                 playsInline
                 className="w-full h-full object-cover"
               />
             )
          ) : (
            <img 
              src={customImage || AVATAR_BASE_URL} 
              alt="Indi-Hunter Avatar" 
              className={`w-full h-full object-cover ${isSpeaking ? 'animate-pulse' : ''}`} 
            />
          )}
        </div>
        
        {/* Hover Actions Overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-30">
          {onImageUpload && (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 bg-white/20 rounded-full hover:bg-white/40 text-white transition-colors"
              title="Upload Static Photo"
            >
              <Camera size={16} />
            </button>
          )}
          <button 
            onClick={() => {
              setShowLinkInput(true);
              setVideoInput(customVideo || "");
            }}
            className="p-1.5 bg-white/20 rounded-full hover:bg-white/40 text-white transition-colors"
            title="Set Video Avatar URL"
          >
            <Video size={16} />
          </button>
          {customVideo && onVideoLinkSet && (
             <button 
             onClick={() => onVideoLinkSet(null)}
             className="p-1.5 bg-red-500/50 rounded-full hover:bg-red-500 text-white transition-colors"
             title="Remove Video"
           >
             <X size={16} />
           </button>
          )}
        </div>

        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/*" 
          className="hidden" 
        />
        
        {/* Emotion Overlay Indicator */}
        <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur rounded-full p-1 shadow-sm text-sm pointer-events-none z-10">
          {getEmoji()}
        </div>

        {/* Thinking Overlay */}
        {isThinking && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none z-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        )}
      </div>

      {/* Video URL Input Popover */}
      {showLinkInput && (
        <div className="absolute top-64 z-50 bg-white p-3 rounded-lg shadow-xl border border-stone-300 w-64 flex flex-col gap-2">
           <div className="text-xs font-bold text-stone-700">Video Avatar Link (影片連結):</div>
           <input 
             type="text" 
             value={videoInput}
             onChange={(e) => setVideoInput(e.target.value)}
             placeholder="https://vimeo.com/..."
             className="text-xs border border-stone-300 rounded p-1.5 w-full focus:ring-1 focus:ring-teal-500 outline-none"
           />
           <div className="text-[10px] text-stone-500 leading-tight">
             <p className="mb-1">✅ <b>Vimeo / YouTube</b>: Loops continuously.</p>
             <p>✅ <b>MP4/WebM</b>: Plays only when speaking.</p>
           </div>
           <div className="flex gap-2 justify-end mt-1">
              <button onClick={() => setShowLinkInput(false)} className="text-xs text-stone-500 hover:text-stone-800 px-2">Cancel</button>
              <button onClick={handleVideoSubmit} className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded hover:bg-teal-700 font-medium">Set Video</button>
           </div>
        </div>
      )}

      {/* Title Box - Compact */}
      <div className="mt-3 w-64 bg-white/80 backdrop-blur p-1.5 rounded-lg border border-stone-200 shadow-sm min-h-[24px] flex items-center justify-center">
        <p className="text-stone-700 text-center text-xs font-medium italic leading-tight">
          {title || "我準備好了，請問關於原住民傳統或自然的知識吧！"}
        </p>
      </div>
    </div>
  );
};

export default AvatarDisplay;