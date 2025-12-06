
import React, { useEffect, useRef, useState } from 'react';
import { Message, Role } from '../types';
import { User, Sparkles, Info, Globe, ExternalLink, GitGraph, Volume2, Maximize2, X, Move, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ZoomIn, ZoomOut, Layers, MessageCircleQuestion } from 'lucide-react';
// @ts-ignore
import mermaid from 'mermaid';

interface MessageBubbleProps {
  message: Message;
  onSpeak?: (text: string, id: string) => void;
  onSuggestionClick?: (text: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onSpeak, onSuggestionClick }) => {
  const isUser = message.role === Role.USER;
  const diagramRef = useRef<HTMLDivElement>(null);
  const [diagramError, setDiagramError] = useState(false);
  const [svgContent, setSvgContent] = useState<string>("");
  
  // Modal & View State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  
  // Mind Map Interactive State
  // Default to showing only 1st layer (Root + children) if it's a mindmap
  const [displayLevel, setDisplayLevel] = useState<number>(1);
  const [maxDetectedLevel, setMaxDetectedLevel] = useState<number>(5);

  // Safe check for mindmap
  const isMindMap = message.parsedResponse?.diagram_code && message.parsedResponse.diagram_code.trim().startsWith('mindmap');

  // Filter Code based on indentation level to simulate "expanding"
  const getFilteredCode = (code: string | undefined, level: number) => {
    if (!code || !code.trim().startsWith('mindmap')) return code || '';
    
    const lines = code.split('\n');
    if (lines.length < 2) return code;

    // Detect base indentation of the root node (first non-empty line after 'mindmap')
    let baseIndent = 0;
    let rootFound = false;

    // Heuristic: Filter lines based on indentation.
    // We assume standard indentation (2 spaces or 4 spaces per level)
    // Level 0: Root
    // Level 1: Root children
    // Level 2: Grandchildren
    
    return lines.filter((line, index) => {
      if (index === 0) return true; // Keep 'mindmap' declaration
      if (!line.trim()) return false;
      
      const contentStart = line.search(/\S/);
      if (contentStart === -1) return false;

      if (!rootFound) {
        baseIndent = contentStart;
        rootFound = true;
        return true; // Always keep root
      }

      const relativeIndent = contentStart - baseIndent;
      // Estimate level: assuming 2 spaces per level is standard for compact mindmaps
      // But let's be generous: 2-3 spaces = level 1, 4-5 spaces = level 2
      const estimatedLevel = Math.floor(relativeIndent / 2);
      
      return estimatedLevel <= level;
    }).join('\n');
  };

  // Analyze code to find max depth (for slider)
  useEffect(() => {
    if (isMindMap && message.parsedResponse?.diagram_code) {
      const lines = message.parsedResponse.diagram_code.split('\n');
      let maxIndent = 0;
      let minIndent = 999;
      
      lines.forEach((line, i) => {
        if (i === 0 || !line.trim()) return;
        const indent = line.search(/\S/);
        if (indent > -1) {
          if (indent < minIndent) minIndent = indent;
          if (indent > maxIndent) maxIndent = indent;
        }
      });
      
      const estimatedMaxLevel = Math.ceil((maxIndent - minIndent) / 2);
      setMaxDetectedLevel(Math.max(2, estimatedMaxLevel));
      // Default to level 1 (Root + 1st layer) for initial view
      setDisplayLevel(1); 
    }
  }, [message.parsedResponse?.diagram_code, isMindMap]);

  // Render Mermaid
  useEffect(() => {
    if (!isUser && message.parsedResponse?.diagram_code && diagramRef.current) {
      
      // Determine what code to render
      const codeToRender = isMindMap 
        ? getFilteredCode(message.parsedResponse.diagram_code, displayLevel)
        : message.parsedResponse.diagram_code;

      mermaid.initialize({ 
        startOnLoad: false, 
        theme: 'base',
        themeVariables: {
          primaryColor: '#fafaf9', 
          primaryTextColor: '#1c1917', 
          primaryBorderColor: '#78716c', 
          lineColor: '#57534e', 
          secondaryColor: '#f0fdfa', 
          tertiaryColor: '#ffffff',
          fontFamily: 'Noto Sans TC',
          fontSize: '14px', // Reduced slightly for better box fit
        },
        fontFamily: 'Noto Sans TC',
        securityLevel: 'loose',
        flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis' },
        mindmap: {
          useMaxWidth: false,
          padding: 20, // Increased padding to prevent text overlap
          maxNodeWidth: 200,
          nodeSpacing: 40,
          rankSpacing: 40
        }
      });

      const renderDiagram = async () => {
        try {
          // Unique ID including level to force re-render on level change
          const renderId = `mermaid-${message.id}-${displayLevel}`;
          const { svg } = await mermaid.render(renderId, codeToRender);
          setSvgContent(svg);
          if (diagramRef.current) {
            diagramRef.current.innerHTML = svg;
          }
          setDiagramError(false);
        } catch (error) {
          console.error("Mermaid rendering failed:", error);
          setDiagramError(true);
        }
      };

      // Small debounce to prevent rapid-fire render issues
      const timeoutId = setTimeout(renderDiagram, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [message.parsedResponse?.diagram_code, message.id, isUser, displayLevel, isMindMap]);

  const handlePlayAudio = () => {
    if (!onSpeak) return;
    const textToSpeak = message.parsedResponse?.reply_text || message.content;
    onSpeak(textToSpeak, message.id);
  };

  const handlePan = (dx: number, dy: number) => {
    setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const handleZoom = (factor: number) => {
    setZoom(prev => Math.max(0.2, Math.min(5, prev + factor)));
  };

  const openModal = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setIsModalOpen(true);
    // When opening modal, maybe reset to level 1 or keep current? Keeping current is better UX.
  };

  const formattedText = (text: string | undefined) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => (
      <p key={i} className="mb-2 last:mb-0 min-h-[1.2em]">{line}</p>
    ));
  };

  return (
    <>
      <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex max-w-[85%] md:max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
          
          {/* Icon */}
          <div className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${isUser ? 'bg-stone-700 text-white' : 'bg-teal-700 text-white'}`}>
            {isUser ? <User size={20} /> : <Sparkles size={20} />}
          </div>

          {/* Content */}
          <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full min-w-0`}>
            
            <div className={`relative px-5 py-3.5 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed break-words w-full ${
              isUser 
                ? 'bg-stone-700 text-white rounded-tr-none' 
                : 'bg-white text-stone-800 border border-stone-200 rounded-tl-none'
            }`}>
              {message.image && (
                 <img src={message.image} alt="User uploaded" className="max-w-full h-auto rounded-lg mb-3 border border-white/20" style={{ maxHeight: '200px'}} />
              )}
              
              {message.parsedResponse ? (
                <div>
                  {formattedText(message.parsedResponse.reply_text)}
                  
                  {/* Diagram Section */}
                  {message.parsedResponse.diagram_code && (
                    <div className="mt-4 border-t border-stone-200 pt-3 group">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-stone-500 text-xs font-bold uppercase tracking-wider">
                          <GitGraph size={12} />
                          Visual Summary
                        </div>
                        <div className="flex gap-2">
                          {isMindMap && (
                            <div className="flex bg-stone-100 rounded-full p-0.5 border border-stone-200">
                               <button 
                                 onClick={() => setDisplayLevel(prev => Math.max(0, prev - 1))}
                                 className="px-2 text-[10px] text-stone-500 hover:text-teal-600 font-mono disabled:opacity-30"
                                 disabled={displayLevel <= 1}
                                 title="Collapse Level"
                               >
                                 -
                               </button>
                               <span className="text-[10px] text-teal-700 font-bold px-1 border-x border-stone-200 flex items-center">
                                 L{displayLevel}
                               </span>
                               <button 
                                 onClick={() => setDisplayLevel(prev => Math.min(maxDetectedLevel + 2, prev + 1))}
                                 className="px-2 text-[10px] text-stone-500 hover:text-teal-600 font-mono"
                                 title="Expand Level"
                               >
                                 +
                               </button>
                            </div>
                          )}
                          <button 
                             onClick={openModal}
                             className="text-teal-600 hover:text-teal-800 flex items-center gap-1 text-[10px] bg-teal-50 px-2 py-1 rounded-full transition-colors opacity-80 hover:opacity-100"
                          >
                            <Maximize2 size={10} /> Enlarge
                          </button>
                        </div>
                      </div>

                      {/* Mermaid Container (Clickable) */}
                      <div 
                        ref={diagramRef} 
                        onClick={openModal}
                        className="mermaid-container w-full overflow-x-auto bg-stone-50 rounded-lg p-2 border border-stone-100 flex justify-center cursor-pointer hover:border-teal-200 transition-colors"
                        title="Click to enlarge and explore"
                      >
                        {/* SVG will be injected here */}
                      </div>
                      
                      {diagramError && (
                        <div className="text-xs text-red-400 mt-1 italic">
                          (Diagram could not be rendered automatically)
                          <pre className="mt-2 p-2 bg-stone-100 rounded text-[10px] overflow-auto text-stone-500">
                             {message.parsedResponse.diagram_code}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Related Options / Questions - Styled as Chips/Buttons */}
                  {!isUser && message.parsedResponse.related_questions && message.parsedResponse.related_questions.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-stone-100">
                      <p className="text-[10px] uppercase tracking-wider text-stone-400 font-bold mb-2 flex items-center gap-1.5">
                        <MessageCircleQuestion size={12} /> Try asking:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {message.parsedResponse.related_questions.map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => onSuggestionClick && onSuggestionClick(q)}
                            className="text-left text-xs py-1.5 px-3 rounded-full bg-stone-50 hover:bg-teal-50 text-stone-600 hover:text-teal-700 transition-all border border-stone-200 hover:border-teal-300 flex items-center gap-2 shadow-sm hover:shadow-md"
                          >
                            <span>{q}</span>
                            <ArrowRight size={10} className="text-teal-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                <div>{formattedText(message.content)}</div>
              )}
              
              {/* Audio Play Button */}
              {!isUser && onSpeak && (
                <button 
                  onClick={handlePlayAudio}
                  className="absolute top-2 right-2 text-stone-300 hover:text-teal-600 transition-colors p-1"
                  title="Read Aloud / Stop (Click to Toggle)"
                >
                  <Volume2 size={16} />
                </button>
              )}
            </div>

            {/* Grounding Sources */}
            {!isUser && message.parsedResponse?.groundingSources && message.parsedResponse.groundingSources.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 w-full pl-2">
                 <div className="text-[10px] uppercase tracking-wider text-stone-500 font-bold flex items-center gap-1">
                   <Globe size={10} /> Sources
                 </div>
                 <div className="flex flex-wrap gap-2">
                   {message.parsedResponse.groundingSources.map((source, idx) => (
                     <a 
                       key={idx} 
                       href={source.uri} 
                       target="_blank" 
                       rel="noopener noreferrer"
                       className="bg-white border border-stone-200 hover:border-teal-400 hover:bg-teal-50 text-stone-600 hover:text-teal-700 text-xs px-2 py-1.5 rounded-md transition-colors flex items-center gap-1.5 shadow-sm max-w-full truncate"
                     >
                       <span className="truncate max-w-[150px]">{source.title}</span>
                       <ExternalLink size={10} className="flex-shrink-0 opacity-50" />
                     </a>
                   ))}
                 </div>
              </div>
            )}

            {/* Reasoning Notes */}
            {!isUser && message.parsedResponse && message.parsedResponse.reasoning_notes && (
              <div className="mt-2 text-xs text-stone-500 bg-stone-100 p-2 rounded-lg border border-stone-200 flex items-start gap-1 max-w-full ml-1">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  <span className="font-semibold">Reasoning:</span> {message.parsedResponse.reasoning_notes}
                </span>
              </div>
            )}
            
            <span className="text-[10px] text-stone-400 mt-1 px-1 text-right w-full block">
               {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>

          </div>
        </div>
      </div>

      {/* --- Mermaid Full Screen Modal --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-100/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
           
           {/* Modal Header */}
           <div className="flex justify-between items-center p-3 bg-white border-b border-stone-200 shadow-sm z-10">
              <h3 className="font-bold text-stone-700 text-sm flex items-center gap-2">
                <GitGraph size={16} className="text-teal-600"/> Mind Map View
              </h3>
              
              <div className="flex items-center gap-3">
                 {/* Expand Controls for Mind Map */}
                 {isMindMap && (
                   <div className="flex items-center gap-2 bg-stone-100 rounded-lg px-2 py-1 border border-stone-200">
                      <Layers size={14} className="text-stone-500" />
                      <span className="text-xs text-stone-600 font-medium">展開層級 (Levels):</span>
                      <input 
                        type="range" 
                        min="1" 
                        max={maxDetectedLevel + 1} 
                        step="1"
                        value={displayLevel}
                        onChange={(e) => setDisplayLevel(Number(e.target.value))}
                        className="w-24 h-1 bg-stone-300 rounded-lg appearance-none cursor-pointer accent-teal-600"
                        title="Slide to expand/collapse nodes"
                      />
                      <span className="text-xs font-mono w-4 text-center text-teal-700 font-bold">{displayLevel}</span>
                   </div>
                 )}

                 {/* Close Button */}
                 <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="flex items-center gap-1 bg-white hover:bg-red-50 text-stone-500 hover:text-red-600 border border-stone-300 hover:border-red-200 px-3 py-1 rounded-full text-xs transition-colors shadow-sm"
                  title="Close and return to chat"
                >
                  <X size={14} /> 關閉 (Close)
                </button>
              </div>
           </div>

           {/* Canvas Area */}
           <div className="flex-1 overflow-hidden relative flex items-center justify-center bg-stone-50 cursor-grab active:cursor-grabbing">
              <div 
                 style={{ 
                   transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                   transition: 'transform 0.1s ease-out'
                 }}
                 className="origin-center"
                 dangerouslySetInnerHTML={{__html: svgContent}} 
              />
           </div>

           {/* Floating Controls (Bottom Right - Very Compact & Transparent) */}
           <div className="absolute bottom-4 right-4 bg-white/50 hover:bg-white border border-stone-200/50 hover:border-stone-200 p-1.5 rounded-xl shadow-sm hover:shadow-lg flex flex-col gap-1 items-center backdrop-blur-sm transition-all duration-300 opacity-60 hover:opacity-100 z-50">
              
              {/* Directional Pad */}
              <div className="grid grid-cols-3 gap-0.5">
                 <div />
                 <button onClick={() => handlePan(0, 100)} className="w-5 h-5 flex items-center justify-center hover:bg-teal-50 rounded text-stone-600 hover:text-teal-600" title="Pan Down"><ArrowDown className="rotate-180" size={12} /></button>
                 <div />
                 
                 <button onClick={() => handlePan(100, 0)} className="w-5 h-5 flex items-center justify-center hover:bg-teal-50 rounded text-stone-600 hover:text-teal-600" title="Pan Right"><ArrowRight className="rotate-180" size={12} /></button>
                 <div className="w-5 h-5 flex items-center justify-center text-stone-300"><Move size={12} /></div>
                 <button onClick={() => handlePan(-100, 0)} className="w-5 h-5 flex items-center justify-center hover:bg-teal-50 rounded text-stone-600 hover:text-teal-600" title="Pan Left"><ArrowRight size={12} /></button>
                 
                 <div />
                 <button onClick={() => handlePan(0, -100)} className="w-5 h-5 flex items-center justify-center hover:bg-teal-50 rounded text-stone-600 hover:text-teal-600" title="Pan Up"><ArrowDown size={12} /></button>
                 <div />
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 border-t border-stone-200/50 pt-1 w-full justify-center mt-0.5">
                 <button onClick={() => handleZoom(-0.2)} className="p-0.5 hover:bg-teal-50 rounded text-stone-600 hover:text-teal-600" title="Zoom Out"><ZoomOut size={12} /></button>
                 <span className="text-[9px] font-mono text-stone-500 w-6 text-center select-none">{Math.round(zoom * 100)}%</span>
                 <button onClick={() => handleZoom(0.2)} className="p-0.5 hover:bg-teal-50 rounded text-stone-600 hover:text-teal-600" title="Zoom In"><ZoomIn size={12} /></button>
              </div>

           </div>
        </div>
      )}
    </>
  );
};

export default MessageBubble;
