
import React, { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import { 
    Copy, 
    Bookmark, 
    Check, 
    MessageSquare, 
    Search, 
    Download, 
    Share2, 
    Edit3, 
    RotateCcw, 
    RotateCw,
    User,
    Stethoscope,
    Activity,
    FlaskConical,
    Network,
    ClipboardList,
    GraduationCap,
    BookOpen,
    HelpCircle,
    ChevronDown,
    ChevronUp,
    FileText,
    History,
    Microscope,
    Layers,
    Lightbulb,
    FileSearch,
    BrainCircuit,
    FileType
} from 'lucide-react';
import { EducationalContentType, Discipline } from '../types';
import type { PatientCase, EducationalContent, QuizQuestion, DisciplineSpecificConsideration, MultidisciplinaryConnection, TraceableEvidence, FurtherReading, ProcedureDetails, PatientOutcome, KnowledgeMapData, Snippet, ChatMessage } from '../types';
import { DisciplineColors } from './KnowledgeMap';
import { QuizView } from './QuizView';
import { ImageGenerator } from './ImageGenerator';
import { TextToSpeechPlayer } from './TextToSpeechPlayer';
import { InteractiveDiagram } from './InteractiveDiagram';
import { SourceSearchModal } from './SourceSearchModal';
import { enrichCaseWithWebSources } from '../services/geminiService';
import { DisciplineIcon } from './DisciplineIcon';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SourceRenderer } from './SourceRenderer';
import { ScientificGraph } from './ScientificGraph';
import { AudioVisualizer } from './AudioVisualizer';
import { useAnalytics } from '../contexts/analytics';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

const captureSvgAsBase64 = async (svgElement: SVGSVGElement): Promise<string> => {
    return new Promise((resolve) => {
        const xml = new XMLSerializer().serializeToString(svgElement);
        const svg64 = btoa(unescape(encodeURIComponent(xml)));
        const b64Start = 'data:image/svg+xml;base64,';
        const image64 = b64Start + svg64;
        
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 2; 
            canvas.width = svgElement.clientWidth * scale;
            canvas.height = svgElement.clientHeight * scale;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(scale, scale);
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png', 1.0));
            } else resolve('');
        };
        img.src = image64;
    });
};

const cleanTextForDownload = (text: string): string => {
    return text
        .replace(/\[ILLUSTRATE:.*?\]/g, '')
        .replace(/\[DIAGRAM:.*?\]/g, '')
        .replace(/\[GRAPH:.*?\]/g, '')
        .replace(/\\\$/g, '$')
        .replace(/\$\\/g, '')
        .replace(/\\/g, '') 
        .replace(/\bPaO2\b/g, 'PaO₂')
        .replace(/\bSaO2\b/g, 'SaO₂')
        .replace(/\bPvO2\b/g, 'PvO₂')
        .replace(/\bCO2\b/g, 'CO₂')
        .replace(/\bO2\b/g, 'O₂')
        .replace(/\bH2O\b/g, 'H₂O')
        .replace(/\bt1\/2\b/gi, 'T½')
        .replace(/\*/g, '')
        .replace(/__/g, '')
        .replace(/#/g, '')
        .trim();
};

function parseMarkdownTable(text: string) {
    const lines = text.trim().split('\n');
    if (lines.length < 3) return null;
    const rows = lines
        .filter(line => line.trim().startsWith('|'))
        .map(line => line.split('|').filter(cell => cell.trim() !== '').map(cell => cell.trim()));
    if (rows.length < 2) return null;
    const header = rows[0];
    const data = rows.slice(2);
    if (header.length === 0) return null;
    return { header, data };
}

function splitMessageContent(text: string) {
    const parts: {type: 'text' | 'table', content?: string, table?: {header: string[], data: string[][]}}[] = [];
    const lines = text.split('\n');
    let currentText = '';
    let inTable = false;
    let tableLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isTableRow = line.trim().startsWith('|');

        if (isTableRow) {
            if (!inTable) {
                if (currentText.trim()) parts.push({type: 'text', content: currentText.trim()});
                currentText = '';
                inTable = true;
                tableLines = [line];
            } else {
                tableLines.push(line);
            }
        } else {
            if (inTable) {
                const table = parseMarkdownTable(tableLines.join('\n'));
                if (table) parts.push({type: 'table', table});
                else currentText += (currentText ? '\n' : '') + tableLines.join('\n');
                inTable = false;
                tableLines = [];
            }
            currentText += (currentText ? '\n' : '') + line;
        }
    }
    if (inTable) {
        const table = parseMarkdownTable(tableLines.join('\n'));
        if (table) parts.push({type: 'table', table});
        else currentText += (currentText ? '\n' : '') + tableLines.join('\n');
    } else if (currentText.trim()) {
        parts.push({type: 'text', content: currentText.trim()});
    }
    return parts;
}

const getBCP47Language = (lang: string): string => {
    const map: Record<string, string> = {
        'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR', 'zh': 'zh-CN', 'hi': 'hi-IN',
        'sw': 'sw-KE', 'sn': 'sn-ZW', 'nd': 'nd-ZW', 'bem': 'en-ZM', 'ny': 'ny-MW',
        'ar': 'ar-SA', 'pt': 'pt-PT', 'ru': 'ru-RU', 'tn': 'tn-ZA', 'el': 'el-GR',
    };
    return map[lang] || 'en-US';
};

interface PatientCaseViewProps {
  patientCase: PatientCase;
  isGeneratingDetails: boolean;
  onSave: (updatedCase: PatientCase) => void;
  language: string;
  T: Record<string, any>;
  onSaveSnippet: (title: string, content: string, visualData?: Partial<Snippet>) => void;
  onOpenShare: () => void;
  onOpenDiscussion: (topic: DisciplineSpecificConsideration) => void;
  onGetMapImage?: () => Promise<string | undefined>;
  mapData: KnowledgeMapData | null;
}

const historyReducer = (state: { history: any[], currentIndex: number }, action: { type: string, payload: any }): { history: any[], currentIndex: number } => {
    switch (action.type) {
        case 'SET_STATE': {
            const { newState } = action.payload;
            if (JSON.stringify(newState) === JSON.stringify(state.history[state.currentIndex])) return state;
            const newHistory = state.history.slice(0, state.currentIndex + 1);
            newHistory.push(newState);
            return { history: newHistory, currentIndex: newHistory.length - 1 };
        }
        case 'UNDO': return { ...state, currentIndex: Math.max(0, state.currentIndex - 1) };
        case 'REDO': return { ...state, currentIndex: Math.min(state.history.length - 1, state.currentIndex + 1) };
        case 'RESET_STATE': return { history: [action.payload.initialState], currentIndex: 0 };
        default: return state;
    }
}

function useHistoryState<T>(initialState: T) {
  const [state, dispatch] = useReducer(historyReducer, { history: [initialState], currentIndex: 0 });
  const { history, currentIndex } = state;
  const currentState = history[currentIndex];
  const setState = useCallback((newState: T | ((prevState: T) => T)) => {
    const value = typeof newState === 'function' ? (newState as (prevState: T) => T)(currentState) : newState;
    dispatch({ type: 'SET_STATE', payload: { newState: value } });
  }, [currentState]);
  const undo = useCallback(() => dispatch({ type: 'UNDO', payload: {} }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO', payload: {} }), []);
  const resetState = useCallback((newState: T) => dispatch({ type: 'RESET_STATE', payload: { initialState: newState } }), []);
  return { state: currentState, setState, undo, redo, canUndo: currentIndex > 0, canRedo: currentIndex < history.length - 1, resetState };
}

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  onCopy: () => void;
  onSaveSnippet: () => void;
  T: Record<string, any>;
  onEnrich?: () => void;
  isEnriching?: boolean;
  groundingSources?: any[];
  children: React.ReactNode;
}> = ({ title, icon, onCopy, onSaveSnippet, onEnrich, isEnriching, groundingSources, children, T }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isSnippetSaved, setIsSnippetSaved] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCopy = () => { onCopy(); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); };
  const handleSaveSnippet = () => { onSaveSnippet(); setIsSnippetSaved(true); setTimeout(() => setIsSnippetSaved(false), 2000); };
  
  return (
    <section className="mt-4 first:mt-0 medical-card">
      <div className="flex items-center justify-between p-3 sm:p-4 bg-slate-50/50 dark:bg-slate-800/30 border-b border-gray-100 dark:border-dark-border">
        <div className="flex items-center space-x-2.5">
          <div className="text-brand-blue dark:text-brand-blue-light">
            {icon}
          </div>
          <h3 className="text-sm sm:text-base font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">{title}</h3>
        </div>
        <div className="flex items-center space-x-1">
            {onEnrich && (
                <button onClick={onEnrich} disabled={isEnriching} title={T.enrichButton} className="p-1.5 rounded-lg text-gray-400 hover:bg-white dark:hover:bg-slate-700 hover:text-brand-blue transition-all shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-slate-600">
                    {isEnriching ? <Activity className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}
                </button>
            )}
           <button onClick={handleSaveSnippet} title={T.saveSnippetButton} className="p-1.5 rounded-lg text-gray-400 hover:bg-white dark:hover:bg-slate-700 hover:text-brand-blue transition-all shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-slate-600">
              {isSnippetSaved ? <Check className="h-4 w-4 text-green-500" /> : <Bookmark className="h-4 w-4" />}
            </button>
          <button onClick={handleCopy} title={T.copySectionButton} className="p-1.5 rounded-lg text-gray-400 hover:bg-white dark:hover:bg-slate-700 hover:text-brand-blue transition-all shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-slate-600">
            {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white dark:hover:bg-slate-700 transition-all">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="p-4 sm:p-6 animate-fade-in">
          <div className="text-sm sm:text-base text-gray-900 dark:text-slate-100 leading-relaxed font-serif">{children}</div>
          {groundingSources && groundingSources.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-dark-border">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">{T.groundingSourcesTitle}</h4>
              <SourceRenderer text={JSON.stringify(groundingSources)} />
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const SmartContent: React.FC<{ content: string | undefined; language: string; T: Record<string, any>; onTriggerIllustration: (desc: string) => void; allowVisuals?: boolean }> = ({ content, language, T, onTriggerIllustration, allowVisuals = false }) => {
    if (!content) return null;
    const graphMatches = allowVisuals ? [...content.matchAll(/\[GRAPH:\s*(.*?)\s*\]/g)] : [];
    const illustrateMatches = allowVisuals ? [...content.matchAll(/\[ILLUSTRATE:\s*(.*?)\s*\]/g)] : [];
    
    const cleanContent = content
        .replace(/\[GRAPH:.*?\]/gi, '')
        .replace(/\[ILLUSTRATE:.*?\]/gi, '')
        .replace(/\[DIAGRAM:.*?\]/gi, '')
        .replace(/\[ADVERSE:.*?\]/gi, '') // Strip any legacy adverse tags
        .trim();
        
    return (
        <div className="space-y-1.5">
            <MarkdownRenderer content={cleanContent} />
            
            <div className="pt-0.5"><SourceRenderer text={content} /></div>
            {allowVisuals && graphMatches.length > 0 && (<div className="space-y-2 mt-1">{graphMatches.map((m, i) => <ScientificGraph key={i} type={m[1].trim() as any} title="Physiological Model Visualization" />)}</div>)}
            {allowVisuals && illustrateMatches.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                    {illustrateMatches.map((m, i) => (
                        <button key={i} onClick={() => onTriggerIllustration(m[1].trim())} title="Synthesize Clinical Illustration" className="group flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-brand-blue dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all text-[9px] font-black shadow-xs">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h14a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            {T.visualVerificationButton}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const SkeletonLoader: React.FC = () => (
    <div className="space-y-2 animate-pulse">
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div>
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-full"></div>
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-5/6"></div>
    </div>
);

const DiscussionBadge: React.FC<{ messages: ChatMessage[] | undefined }> = ({ messages }) => {
    if (!messages || messages.length <= 1) return null;
    return (
        <span className="flex items-center gap-1 bg-brand-blue text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-xs animate-pulse">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" /></svg>
            {messages.length - 1}
        </span>
    );
};

export const PatientCaseView: React.FC<PatientCaseViewProps> = ({ patientCase: initialCase, isGeneratingDetails, onSave, language, T, onSaveSnippet, onOpenShare, onOpenDiscussion, onGetMapImage, mapData }) => {
  const { logEvent } = useAnalytics();
  const { state: patientCase, setState: setPatientCase, undo, redo, canUndo, canRedo, resetState } = useHistoryState<PatientCase>(initialCase);
  const [isEditing, setIsEditing] = useState(false);
  const [activeImageGenerator, setActiveImageGenerator] = useState<{ content: EducationalContent; index: number } | null>(null);
  const [activeSourceSearch, setActiveSourceSearch] = useState<string | null>(null);
  const [isEnrichingEvidence, setIsEnrichingEvidence] = useState(false);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => { resetState(initialCase); }, [initialCase, resetState]);

  const handleTextChange = (value: string, key: keyof PatientCase) => setPatientCase({ ...patientCase, [key]: value });
  const handleSave = () => { 
    logEvent('save_case_edits');
    onSave(patientCase); 
    setIsEditing(false); 
  };
  const handleCancel = () => { resetState(initialCase); setIsEditing(false); };

  const handleMicClick = useCallback((key: keyof PatientCase) => {
    if (!isSpeechRecognitionSupported) return;
    if (isListening && recognitionRef.current) { 
      logEvent('stop_voice_input', { field: key });
      recognitionRef.current.stop(); 
      return; 
    }
    logEvent('start_voice_input', { field: key });
    const recognition = new SpeechRecognition();
    recognition.lang = getBCP47Language(language);
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (e: any) => {
        let fullTranscript = '';
        for (let i = 0; i < e.results.length; i++) {
            fullTranscript += e.results[i][0].transcript;
        }
        handleTextChange(fullTranscript, key);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening, language, patientCase]);

  const handleTriggerIllustration = (desc: string, sourceIndex: number) => { 
    logEvent('trigger_illustration', { source_index: sourceIndex });
    setActiveImageGenerator({ content: { title: T.clinicalVisualization, description: desc, type: EducationalContentType.IMAGE, reference: T.aiSynthesizedEvidence }, index: sourceIndex }); 
  };

  const handleDownloadPdf = async () => {
    logEvent('download_case_pdf');
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const brandColor = '#1e3a8a';
    
    // Header
    doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(brandColor).text('Ungana Medical', margin, 20);
    doc.setDrawColor(brandColor).setLineWidth(0.5).line(margin, 23, pageWidth - margin, 23);
    doc.setFontSize(14).setTextColor('#111827').text(patientCase.title.toUpperCase(), margin, 35);
    doc.setFontSize(10).setTextColor('#4b5563').text(`Synthesized on: ${new Date().toLocaleDateString()}`, margin, 42);
    
    let y = 52;

    const addSection = async (title: string, content: string, icon?: string) => {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(brandColor);
        doc.text(title.toUpperCase(), margin, y);
        y += 8;

        const blocks = splitMessageContent(content);
        for (const block of blocks) {
            if (block.type === 'text') {
                doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor('#111827');
                const cleaned = cleanTextForDownload(block.content || '');
                const lines = doc.splitTextToSize(cleaned, pageWidth - 2 * margin);
                if (y + (lines.length * 6) > 275) { doc.addPage(); y = 20; }
                doc.text(lines, margin, y);
                y += (lines.length * 6) + 4;
            } else if (block.type === 'table' && block.table) {
                if (y > 240) { doc.addPage(); y = 20; }
                (doc as any).autoTable({
                    startY: y,
                    head: [block.table.header],
                    body: block.table.data,
                    margin: { left: margin },
                    styles: { fontSize: 9, font: 'helvetica' },
                    headStyles: { fillColor: brandColor, textColor: 255 },
                    theme: 'grid'
                });
                y = (doc as any).lastAutoTable.finalY + 10;
            }
        }
        y += 5;
    };

    await addSection(T.patientProfile, patientCase.patientProfile);
    await addSection(T.presentingComplaint, patientCase.presentingComplaint);
    await addSection(T.history, patientCase.history);

    if (patientCase.biochemicalPathway) {
        await addSection(patientCase.biochemicalPathway.title, patientCase.biochemicalPathway.description);
    }

    if (patientCase.multidisciplinaryConnections) {
        let connText = patientCase.multidisciplinaryConnections.map(c => `* ${c.discipline}: ${c.connection}`).join('\n\n');
        await addSection(T.multidisciplinaryConnections, connText);
    }

    if (patientCase.disciplineSpecificConsiderations) {
        let consText = patientCase.disciplineSpecificConsiderations.map(c => `* ${c.aspect}: ${c.consideration}`).join('\n\n');
        await addSection(T.managementConsiderations, consText);
    }

    if (patientCase.educationalContent) {
        for (const edu of patientCase.educationalContent) {
            await addSection(edu.title, edu.description);
            if (edu.imageData) {
                // We'd need to convert base64 if it's not already
                if (y > 200) { doc.addPage(); y = 20; }
                const imgW = 140; 
                const imgH = 105;
                doc.addImage(edu.imageData, 'PNG', (pageWidth - imgW) / 2, y, imgW, imgH);
                y += imgH + 10;
            }
        }
    }

    // Capture SVGs if any are visible in the container
    if (containerRef.current) {
        const svgs = containerRef.current.querySelectorAll('svg');
        for (const svg of Array.from(svgs) as SVGSVGElement[]) {
            // Only capture relevant SVGs (diagrams, graphs)
            if (svg.closest('.interactive-diagram') || svg.closest('.scientific-graph')) {
                const imgData = await captureSvgAsBase64(svg);
                if (y > 180) { doc.addPage(); y = 20; }
                const imgW = pageWidth - (margin * 2);
                const imgH = (imgW * svg.clientHeight) / svg.clientWidth;
                doc.addImage(imgData, 'PNG', margin, y, imgW, imgH);
                y += imgH + 10;
            }
        }
    }
    
    doc.save(`${patientCase.title.replace(/\s+/g, '_')}_Case.pdf`);
  };

  const handleImageGenerated = useCallback((idx: number, img: string) => { 
    logEvent('generate_image', { source_index: idx });
    setPatientCase(prev => { 
        const edu = [...(prev.educationalContent || [])]; 
        if (idx >= 0 && edu[idx]) { edu[idx] = { ...edu[idx], imageData: img }; } 
        return { ...prev, educationalContent: edu }; 
    }); 
    setActiveImageGenerator(null); 
  }, [setPatientCase, logEvent]);

  const handleEnrichSources = async () => { 
    logEvent('enrich_sources');
    setIsEnrichingEvidence(true); 
    try { 
        const { newEvidence, newReadings, groundingSources: gs } = await enrichCaseWithWebSources(patientCase, language); 
        setPatientCase(prev => ({ ...prev, traceableEvidence: [...(prev.traceableEvidence || []), ...newEvidence], furtherReadings: [...(prev.furtherReadings || []), ...newReadings] })); 
        setGroundingSources(gs); 
    } catch (e) { console.error(e); } 
    finally { setIsEnrichingEvidence(false); } 
  };

  const EditableField: React.FC<{ value: string; fieldKey: keyof PatientCase; isEditing: boolean; allowVisuals?: boolean }> = ({ value, fieldKey, isEditing, allowVisuals = false }) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    useEffect(() => { if (isEditing && ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${ref.current.scrollHeight}px`; } }, [isEditing, value]);
    if (isEditing) {
        return (
            <div className="relative group">
                <textarea ref={ref} value={value} onChange={(e) => handleTextChange(e.target.value, fieldKey)} className="w-full p-3 pr-12 border border-blue-200 dark:border-blue-800 rounded-lg focus:ring-4 focus:ring-brand-blue/10 bg-blue-50/50 dark:bg-blue-900/20 text-black dark:text-white resize-none transition-all shadow-inner font-serif min-h-[100px]" />
                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => handleMicClick(fieldKey)} className={`p-2 rounded-full transition shadow-sm ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white dark:bg-slate-800 text-gray-500 border border-gray-200 dark:border-slate-700 hover:bg-gray-100'}`} title="Voice input"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm-1 4a4 4 0 108 0V4a4 4 0 10-8 0v4zM2 11a1 1 0 011-1h1a1 1 0 011 1v.5a.5.5 0 001 0V11a3 3 0 013-3h0a3 3 0 013 3v.5a.5.5 0 001 0V11a1 1 0 011 1h1a1 1 0 110 2h-1a1 1 0 01-1-1v-.5a2.5 2.5 0 00-5 0v.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" clipRule="evenodd" /></svg></button>
                    {isListening && <div className="mx-auto"><AudioVisualizer isListening={isListening} /></div>}
                </div>
            </div>
        );
    }
    return <SmartContent content={value} language={language} T={T} onTriggerIllustration={(d) => handleTriggerIllustration(d, -1)} allowVisuals={allowVisuals} />;
  };

  const archivedDiscussions = (Object.entries(patientCase.discussions || {}) as [string, ChatMessage[]][]).filter(([_, msgs]) => msgs.length > 1);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (patientCase.quiz && patientCase.quiz.length > 0 && !isGeneratingDetails) {
        // Auto-scroll to quiz when it arrives
        setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 800);
    }
  }, [!!patientCase.quiz, isGeneratingDetails]);

  return (
    <div ref={containerRef} className="p-2 sm:p-5 pb-40 relative bg-white dark:bg-dark-surface transition-colors duration-300">
      <header className="sticky top-0 -mx-2 sm:-mx-5 -mt-2 sm:-mt-5 p-2 sm:p-3 bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md border-b border-gray-100 dark:border-dark-border z-20 shadow-sm mb-4">
        <div className="flex justify-between items-center max-w-5xl mx-auto">
          <h2 className="text-base sm:text-xl font-black text-brand-text dark:text-dark-text truncate tracking-tight pr-4">{patientCase.title}</h2>
          <div className="flex items-center gap-1">
            {isEditing ? (
              <div className="flex items-center gap-1">
                <button onClick={undo} disabled={!canUndo} title="Undo" className="p-1 text-gray-400 hover:text-brand-blue disabled:opacity-20 transition-colors"><svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg></button>
                <button onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white font-black py-1 px-2 sm:px-2.5 rounded-md text-[9px] sm:text-[10px] shadow-sm transition-all">{T.saveButton}</button>
                <button onClick={handleCancel} className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-black py-1 px-2 sm:px-2.5 rounded-md text-[9px] sm:text-[10px] transition-all">{T.cancelButton}</button>
              </div>
            ) : (
              <>
                <button onClick={handleDownloadPdf} title={T.downloadPdfButton} className="p-1 sm:p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-all"><FileType className="h-3.5 w-3.5" /></button>
                <button onClick={onOpenShare} title={T.shareCaseTitle} className="p-1 sm:p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-all"><svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg></button>
                <button onClick={() => setIsEditing(true)} title={T.editTextTitle} className="p-1 sm:p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-all"><svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg></button>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="space-y-3 max-w-5xl mx-auto">
        <Section icon={<User className="w-4 h-4" />} title={T.patientProfile} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.patientProfile, patientCase.patientProfile)} T={T}><EditableField value={patientCase.patientProfile} fieldKey="patientProfile" isEditing={isEditing} /></Section>
        <Section icon={<Stethoscope className="w-4 h-4" />} title={T.presentingComplaint} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.presentingComplaint, patientCase.presentingComplaint)} T={T}><EditableField value={patientCase.presentingComplaint} fieldKey="presentingComplaint" isEditing={isEditing} /></Section>
        <Section icon={<History className="w-4 h-4" />} title={T.history} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.history, patientCase.history)} T={T}><EditableField value={patientCase.history} fieldKey="history" isEditing={isEditing} /></Section>
        
        { patientCase.biochemicalPathway ? (
            <Section icon={<FlaskConical className="w-4 h-4" />} title={T.biochemicalPathwaySection} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(patientCase.biochemicalPathway!.title, patientCase.biochemicalPathway!.description, { diagramData: patientCase.biochemicalPathway!.diagramData })} T={T} groundingSources={patientCase.groundingSources}>
                <div className="flex items-center justify-between mb-1 gap-2">
                    <div className="flex items-center gap-2 min-w-0"><h4 className="text-xs sm:text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tighter truncate">{patientCase.biochemicalPathway.title}</h4><TextToSpeechPlayer textToRead={`${patientCase.biochemicalPathway.title}. ${patientCase.biochemicalPathway.description}`} language={language} /></div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <DiscussionBadge messages={patientCase.discussions?.[patientCase.biochemicalPathway.title]} />
                        <button onClick={() => onOpenDiscussion({ aspect: patientCase.biochemicalPathway!.title, consideration: patientCase.biochemicalPathway!.description })} className="text-[8px] bg-brand-blue dark:bg-brand-blue-light text-white font-black py-1 px-2 sm:px-2.5 rounded-full shadow-xs transition-transform hover:scale-105 uppercase tracking-widest">{T.discussButton}</button>
                    </div>
                </div>
                <p className="text-[8px] text-gray-400 font-mono mb-1 uppercase tracking-tighter">{patientCase.biochemicalPathway.reference}</p>
                <SmartContent content={patientCase.biochemicalPathway.description} language={language} T={T} onTriggerIllustration={(d) => handleTriggerIllustration(d, -1)} allowVisuals={true} />
                {patientCase.biochemicalPathway.diagramData && <div className="mt-2 h-[200px] sm:h-[280px] rounded-xl border border-gray-100 dark:border-dark-border shadow-xs overflow-hidden"><InteractiveDiagram id="diagram-biochem" data={patientCase.biochemicalPathway.diagramData} /></div>}
            </Section>
        ) : isGeneratingDetails ? <Section icon={<FlaskConical className="w-4 h-4" />} title={T.biochemicalPathwaySection} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section> : null }

        { Array.isArray(patientCase.multidisciplinaryConnections) && patientCase.multidisciplinaryConnections.length > 0 ? (
            <Section icon={<Network className="w-4 h-4" />} title={T.multidisciplinaryConnections} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.multidisciplinaryConnections, patientCase.multidisciplinaryConnections!.map(c => `${c.discipline}: ${c.connection}`).join('\n'))} T={T}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                    {patientCase.multidisciplinaryConnections.map((conn, idx) => (
                        <div key={idx} className="bg-slate-50 dark:bg-slate-800/40 border border-gray-100 dark:border-dark-border rounded-xl p-3 transition-all hover:shadow-sm flex flex-col justify-between h-full border-l-4" style={{ borderLeftColor: DisciplineColors[conn.discipline] }}>
                            <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <div className="p-1 rounded-lg bg-white dark:bg-slate-900 shadow-xs"><DisciplineIcon discipline={conn.discipline} className="h-3.5 w-3.5" style={{ color: DisciplineColors[conn.discipline] }} /></div>
                                    <h5 className="text-xs font-black text-gray-900 dark:text-slate-100 tracking-tight uppercase">{conn.discipline}</h5>
                                </div>
                                <div className="text-[10px] sm:text-[11px] text-gray-700 dark:text-slate-300 leading-relaxed mb-2"><SmartContent content={conn.connection} language={language} T={T} onTriggerIllustration={(d) => handleTriggerIllustration(d, -1)} /></div>
                            </div>
                            <div className="flex items-center gap-2 self-end">
                                <DiscussionBadge messages={patientCase.discussions?.[conn.discipline]} />
                                <button onClick={() => onOpenDiscussion({ aspect: conn.discipline, consideration: conn.connection })} className="flex items-center gap-1 text-[8px] bg-white dark:bg-slate-700 border border-blue-100 dark:border-blue-900 text-brand-blue dark:text-blue-300 hover:bg-brand-blue hover:text-white font-black py-1 px-2 sm:px-2.5 rounded-full transition-all shadow-xs uppercase tracking-widest">{T.consultButton}</button>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>
        ) : isGeneratingDetails ? <Section icon={<Network className="w-4 h-4" />} title={T.multidisciplinaryConnections} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section> : null }

        { Array.isArray(patientCase.disciplineSpecificConsiderations) && patientCase.disciplineSpecificConsiderations.length > 0 ? (
            <Section icon={<ClipboardList className="w-4 h-4" />} title={T.managementConsiderations} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.managementConsiderations, patientCase.disciplineSpecificConsiderations!.map(c => `${c.aspect}: ${c.consideration}`).join('\n'))} T={T}>
                <div className="space-y-3 sm:space-y-4">
                    {patientCase.disciplineSpecificConsiderations.map((item, idx) => {
                        const isPhased = ["Preoperative", "Intraoperative", "Postoperative"].includes(item.aspect);
                        return (
                            <div key={idx} className={`bg-white dark:bg-dark-surface p-3 sm:p-4 rounded-xl border ${isPhased ? 'border-brand-blue/30 border-l-[4px] sm:border-l-[6px] dark:border-brand-blue-light/20' : 'border-gray-100 dark:border-dark-border'} shadow-sm transition-all`}>
                                <div className="flex justify-between items-center mb-2 border-b border-gray-50 dark:border-dark-border pb-2 gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {isPhased && <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-brand-blue dark:bg-brand-blue-light animate-pulse flex-shrink-0" />}
                                        <strong className={`text-xs sm:text-sm font-black tracking-tight uppercase truncate ${isPhased ? 'text-brand-blue dark:text-brand-blue-light' : 'text-gray-900 dark:text-slate-200'}`}>{item.aspect}</strong>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <DiscussionBadge messages={patientCase.discussions?.[item.aspect]} />
                                        <button onClick={() => onOpenDiscussion(item)} className="text-[8px] bg-blue-50 dark:bg-blue-900/30 text-brand-blue dark:text-blue-300 font-black py-1 px-2 sm:px-2.5 rounded-full border border-blue-100 dark:border-blue-900 transition-all hover:bg-brand-blue hover:text-white uppercase tracking-widest shadow-xs">{T.discussButton}</button>
                                    </div>
                                </div>
                                <div className="mt-1 text-[11px] sm:text-sm"><SmartContent content={item.consideration} language={language} T={T} onTriggerIllustration={(d) => handleTriggerIllustration(d, -1)} /></div>
                            </div>
                        );
                    })}
                </div>
            </Section>
        ) : isGeneratingDetails ? <Section icon={<ClipboardList className="w-4 h-4" />} title={T.managementConsiderations} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section> : null }

        { (isGeneratingDetails || (Array.isArray(patientCase.educationalContent) && patientCase.educationalContent.length > 0)) ? (
            <Section icon={<GraduationCap className="w-4 h-4" />} title={T.educationalContent} onCopy={() => {}} onSaveSnippet={() => {}} T={T}>
                {isGeneratingDetails && !patientCase.educationalContent?.length ? <SkeletonLoader /> : (
                    Array.isArray(patientCase.educationalContent) && patientCase.educationalContent.length > 0 ? (
                        <div className="space-y-6">
                            {patientCase.educationalContent.map((content, idx) => (
                                <div key={idx} className="bg-white dark:bg-dark-surface p-4 rounded-xl border border-gray-100 dark:border-dark-border shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">{content.title}</h4>
                                            <TextToSpeechPlayer textToRead={`${content.title}. ${content.description}`} language={language} />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <DiscussionBadge messages={patientCase.discussions?.[content.title]} />
                                            <button onClick={() => onOpenDiscussion({ aspect: content.title, consideration: content.description })} className="text-[8px] bg-brand-blue dark:bg-brand-blue-light text-white font-black py-1 px-2.5 rounded-full shadow-xs transition-transform hover:scale-105 uppercase tracking-widest">{T.discussButton}</button>
                                        </div>
                                    </div>
                                    <p className="text-[8px] text-gray-400 font-mono mb-2 uppercase tracking-tighter">{content.reference}</p>
                                    <SmartContent content={content.description} language={language} T={T} onTriggerIllustration={(d) => handleTriggerIllustration(d, idx)} allowVisuals={true} />
                                    
                                    {content.imageData ? (
                                        <div className="mt-4 rounded-xl overflow-hidden border border-gray-100 dark:border-dark-border shadow-md">
                                            <img src={content.imageData} alt={content.title} className="w-full h-auto object-cover" referrerPolicy="no-referrer" />
                                        </div>
                                    ) : content.diagramData ? (
                                        <div className="mt-4 h-[300px] rounded-xl border border-gray-100 dark:border-dark-border shadow-xs overflow-hidden">
                                            <InteractiveDiagram id={`diagram-${idx}`} data={content.diagramData} />
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-4 text-center text-gray-500 dark:text-slate-400 text-sm italic">
                            {T.noEducationalContentAvailable}
                        </div>
                    )
                )}
            </Section>
        ) : null }

        { archivedDiscussions.length > 0 && (
            <Section icon={<MessageSquare className="w-4 h-4" />} title={T.sessionDiscussionsArchive} onCopy={() => {}} onSaveSnippet={() => {}} T={T}>
                <div className="grid grid-cols-1 gap-2 mt-2">
                    {archivedDiscussions.map(([topicId, msgs]) => (
                        <div key={topicId} className="bg-slate-50 dark:bg-slate-800/20 rounded-lg p-3 border border-gray-100 dark:border-dark-border flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <h5 className="font-bold text-gray-900 dark:text-slate-100 text-xs truncate">{topicId}</h5>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 italic truncate mt-0.5">Last: "{msgs[msgs.length - 1].text.substring(0, 60)}..."</p>
                            </div>
                            <button onClick={() => onOpenDiscussion({ aspect: topicId, consideration: '' })} className="flex-shrink-0 bg-white dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900 text-brand-blue dark:text-blue-300 font-black text-[9px] uppercase tracking-widest shadow-xs hover:bg-brand-blue hover:text-white transition-all">{T.reopenHistoryButton}</button>
                        </div>
                    ))}
                </div>
            </Section>
        )}

        { (isGeneratingDetails || (Array.isArray(patientCase.traceableEvidence) && patientCase.traceableEvidence.length > 0) || (Array.isArray(patientCase.furtherReadings) && patientCase.furtherReadings.length > 0)) ? (
            <Section icon={<BookOpen className="w-4 h-4" />} title={T.evidenceAndReading} onCopy={() => {}} onSaveSnippet={() => {}} T={T} onEnrich={handleEnrichSources} isEnriching={isEnrichingEvidence} groundingSources={groundingSources}>
                {isGeneratingDetails && !patientCase.traceableEvidence?.length ? <SkeletonLoader /> : (
                    <>
                        {Array.isArray(patientCase.traceableEvidence) && patientCase.traceableEvidence.length > 0 ? (
                            <div className="mb-4">
                                <h4 className="font-black text-[10px] text-gray-900 dark:text-slate-100 mb-2 flex items-center gap-1.5 uppercase tracking-widest">
                                    <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.9L9.03 9.069a2.25 2.25 0 002.248 0l6.863-4.17A2.25 2.25 0 0015.83 2H4.477a2.25 2.25 0 00-2.311 2.9z" /><path d="M11 11.235V20l7-4.24V8.765l-7 2.47z" /><path d="M9 11.235V20L2 15.76V8.765l7 2.47z" /></svg>
                                    {T.traceableEvidence}
                                </h4>
                                <ul className="space-y-2">
                                    {patientCase.traceableEvidence.map((e, i) => (
                                        <li key={i} className="bg-slate-50 dark:bg-slate-800/20 p-3 rounded-xl border-l-4 border-green-500 shadow-xs">
                                            <span className="font-bold block text-[11px] text-gray-800 dark:text-slate-100 mb-1 leading-tight">"{e.claim}"</span>
                                            <span className="block text-[10px] text-gray-500 dark:text-gray-400"><SourceRenderer text={e.source} onSearchClick={() => setActiveSourceSearch(e.source)} /></span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : !isGeneratingDetails && (
                            <div className="text-center text-gray-500 dark:text-slate-400 text-xs italic py-2">
                                {T.noTraceableEvidenceAvailable}
                            </div>
                        )}
                        {Array.isArray(patientCase.furtherReadings) && patientCase.furtherReadings.length > 0 ? (
                            <div className="mt-4">
                                <h4 className="font-black text-[10px] text-gray-900 dark:text-slate-100 mb-2 flex items-center gap-1.5 uppercase tracking-widest">
                                    <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9 4.804A7.993 7.993 0 0113.196 4c1.63 0 3.133.488 4.39 1.324a.75.75 0 01.143 1.183L15.035 9.202a.75.75 0 01-1.06 0L12.31 7.537a.75.75 0 00-1.06 0l-2.25 2.25a.75.75 0 01-1.06 0L6.275 8.122a.75.75 0 00-1.06 0L2.27 11.067a.75.75 0 01-1.183-.143A7.995 7.995 0 014.804 9 7.993 7.993 0 019 4.804z" /><path d="M13.196 16c1.63 0 3.133-.488 4.39-1.324a.75.75 0 00.143-1.183L15.035 10.798a.75.75 0 00-1.06 0l-1.665 1.665a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 00-1.06 0L6.275 11.878a.75.75 0 01-1.06 0L2.27 8.933a.75.75 0 00-1.183.143A7.995 7.995 0 004.804 11 7.993 7.993 0 009 15.196z" /></svg>
                                    {T.furtherReading}
                                </h4>
                                <ul className="space-y-2">
                                    {patientCase.furtherReadings.map((r, i) => (
                                        <li key={i} className="bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                            <span className="font-bold text-[11px] text-brand-blue dark:text-blue-300 block mb-1">{r.topic}</span>
                                            <p className="text-[10px] text-gray-600 dark:text-gray-400 leading-snug italic">{r.reference}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : !isGeneratingDetails && (
                            <div className="text-center text-gray-500 dark:text-slate-400 text-xs italic py-2">
                                {T.noReadingsAvailable}
                            </div>
                        )}
                    </>
                )}
            </Section>
        ) : null }
        
        { (isGeneratingDetails || patientCase.quiz) ? (
            <div className="mt-4">
                {isGeneratingDetails && !patientCase.quiz?.length ? (
                    <Section icon={<HelpCircle className="w-4 h-4" />} title={T.quizTitle} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section>
                ) : (
                    <Section icon={<HelpCircle className="w-4 h-4" />} title={T.quizTitle} onCopy={() => {}} onSaveSnippet={() => {}} T={T}>
                        {patientCase.quiz && patientCase.quiz.length > 0 ? (
                            <QuizView quiz={patientCase.quiz} T={T} />
                        ) : (
                            <div className="p-4 text-center text-gray-500 dark:text-slate-400 text-sm italic">
                                {T.noQuizQuestionsAvailable}
                            </div>
                        )}
                    </Section>
                )}
            </div>
        ) : null }
        <div ref={bottomRef} className="h-1" />
      </div>
      {activeImageGenerator && <ImageGenerator content={activeImageGenerator.content} onClose={() => setActiveImageGenerator(null)} language={language} T={T} onImageGenerated={(img) => handleImageGenerated(activeImageGenerator.index, img)} />}
      {activeSourceSearch && <SourceSearchModal isOpen={!!activeSourceSearch} onClose={() => setActiveSourceSearch(null)} sourceQuery={activeSourceSearch} language={language} T={T} />}
    </div>
  );
};
