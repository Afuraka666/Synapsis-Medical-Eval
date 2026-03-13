
import React, { useState, useEffect, useRef } from 'react';
import { 
    Mic, 
    MicOff, 
    History as HistoryIcon, 
    Plus, 
    Search, 
    Calculator, 
    Library, 
    Bookmark, 
    FileText, 
    Network,
    ChevronDown,
    Trash2,
    Sparkles
} from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';

interface ControlPanelProps {
  onGenerate: (condition: string, discipline: string, difficulty: string) => void;
  disabled: boolean;
  T: Record<string, any>;
  language: string;
  onSaveCase: () => void;
  onOpenSavedWork: () => void;
  onOpenClinicalTools: () => void;
  isCaseActive: boolean;
  onGenerateNew: () => void;
  mobileView: 'case' | 'map';
  onSetMobileView: (view: 'case' | 'map') => void;
}

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

const getBCP47Language = (lang: string): string => {
    const map: Record<string, string> = {
        'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR', 'zh': 'zh-CN', 'hi': 'hi-IN',
        'sw': 'sw-KE', 'sn': 'sn-ZW', 'nd': 'nd-ZW', 'bem': 'en-ZM', 'ny': 'ny-MW',
        'ar': 'ar-SA', 'pt': 'pt-PT', 'ru': 'ru-RU', 'tn': 'tn-ZA', 'el': 'el-GR',
    };
    return map[lang] || 'en-US';
};

const MicButton: React.FC<{ onClick: () => void, isListening: boolean, disabled: boolean, title: string }> = ({ onClick, isListening, disabled, title }) => {
    return (
        <button 
            type="button" 
            onClick={onClick} 
            disabled={disabled} 
            title={title}
            className="absolute right-1 top-1 bottom-1 px-2.5 flex items-center text-gray-400 hover:text-brand-blue-light disabled:text-gray-300 disabled:cursor-not-allowed transition-all gap-2 hover:bg-gray-100 dark:hover:bg-slate-600 rounded-lg"
        >
            <AudioVisualizer isListening={isListening} />
            {isListening ? (
                 <MicOff className="h-4 w-4 text-red-500 animate-pulse" />
            ) : (
                <Mic className="h-4 w-4" />
            )}
        </button>
    );
};

export const ControlPanel: React.FC<ControlPanelProps> = ({ 
    onGenerate, disabled, T, language, onSaveCase, onOpenSavedWork, 
    onOpenClinicalTools, isCaseActive, onGenerateNew, mobileView, onSetMobileView 
}) => {
  const [conditionInput, setConditionInput] = useState("Type 2 Diabetes Mellitus");
  const [disciplineInput, setDisciplineInput] = useState("Medicine");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [history, setHistory] = useState<{ condition: string; discipline: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [activeInput, setActiveInput] = useState<'condition' | 'discipline' | null>(null);
  const recognitionRef = useRef<any>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [isSavedWorkMenuOpen, setIsSavedWorkMenuOpen] = useState(false);
  const savedWorkMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const storedHistory = JSON.parse(localStorage.getItem('generationHistory') || '[]');
      if (Array.isArray(storedHistory)) setHistory(storedHistory);
    } catch (e) { setHistory([]); }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (historyRef.current && !historyRef.current.contains(event.target as Node)) setShowHistory(false);
        if (savedWorkMenuRef.current && !savedWorkMenuRef.current.contains(event.target as Node)) setIsSavedWorkMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMicClick = (targetInput: 'condition' | 'discipline') => {
      if (!isSpeechRecognitionSupported) return;
      if (isListening && activeInput === targetInput && recognitionRef.current) { recognitionRef.current.stop(); return; }
      setMicError(null); setActiveInput(targetInput);
      const recognition = new SpeechRecognition();
      recognition.continuous = true; 
      recognition.interimResults = true; 
      recognition.maxAlternatives = 1;
      recognition.lang = getBCP47Language(language);
      
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => { setIsListening(false); setActiveInput(null); recognitionRef.current = null; };
      recognition.onerror = (event: any) => { 
          setIsListening(false); 
          setActiveInput(null); 
          setMicError(event.error === 'not-allowed' ? T.micPermissionError : T.micGenericError); 
      };
      
      recognition.onresult = (event: any) => { 
          let fullTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
              fullTranscript += event.results[i][0].transcript;
          }
          if (targetInput === 'condition') setConditionInput(fullTranscript); 
          else setDisciplineInput(fullTranscript); 
      };

      try { 
          recognitionRef.current = recognition; 
          recognition.start(); 
      } catch (err: any) { 
          setIsListening(false); 
          setActiveInput(null); 
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const condition = conditionInput.trim();
    const discipline = disciplineInput.trim();
    if (condition && discipline && !disabled) {
      onGenerate(condition, discipline, difficulty);
      setHistory(prev => {
        const newEntry = { condition, discipline };
        if (prev.some(item => item.condition.toLowerCase() === condition.toLowerCase() && item.discipline.toLowerCase() === discipline.toLowerCase())) return prev;
        const updated = [newEntry, ...prev].slice(0, 15);
        localStorage.setItem('generationHistory', JSON.stringify(updated));
        return updated;
      });
    }
  };

  return (
    <div className="medical-card p-4 sm:p-5 transition-all duration-300">
      {!isCaseActive ? (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
          <div className="flex flex-col sm:flex-1 sm:min-w-[240px]">
              <label htmlFor="condition-input" className="font-black text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-widest mb-1.5 ml-1">{T.conditionLabel}</label>
              <div className="relative group">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400 group-focus-within:text-brand-blue transition-colors" />
                  </div>
                  <input type="text" id="condition-input" value={conditionInput} onChange={(e) => setConditionInput(e.target.value)} disabled={disabled} placeholder={T.conditionPlaceholder} className="p-2.5 pl-10 border border-gray-200 dark:border-dark-border rounded-xl focus:ring-2 focus:ring-brand-blue-light/30 focus:border-brand-blue-light w-full bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white pr-10 transition-all outline-none font-medium" />
                  {isSpeechRecognitionSupported && <MicButton onClick={() => handleMicClick('condition')} isListening={isListening && activeInput === 'condition'} disabled={disabled} title="Voice Input for Medical Condition" />}
              </div>
          </div>
          <div className="flex flex-col sm:flex-1 sm:min-w-[240px]">
              <label htmlFor="discipline-input" className="font-black text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-widest mb-1.5 ml-1">{T.disciplineLabel}</label>
              <div className="relative group">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Network className="h-4 w-4 text-gray-400 group-focus-within:text-brand-blue transition-colors" />
                  </div>
                  <input type="text" id="discipline-input" value={disciplineInput} onChange={(e) => setDisciplineInput(e.target.value)} disabled={disabled} placeholder={T.disciplinePlaceholder} className="p-2.5 pl-10 border border-gray-200 dark:border-dark-border rounded-xl focus:ring-2 focus:ring-brand-blue-light/30 focus:border-brand-blue-light w-full bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white pr-10 transition-all outline-none font-medium" />
                  {isSpeechRecognitionSupported && <MicButton onClick={() => handleMicClick('discipline')} isListening={isListening && activeInput === 'discipline'} disabled={disabled} title="Voice Input for Academic Discipline" />}
              </div>
          </div>
          <div className="flex flex-col w-full sm:w-auto">
              <label htmlFor="difficulty-select" className="font-black text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-widest mb-1.5 ml-1">{T.difficultyLabel}</label>
              <div className="relative">
                <select id="difficulty-select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} disabled={disabled} className="bg-gray-50 dark:bg-slate-800 p-2.5 border border-gray-200 dark:border-dark-border rounded-xl h-[46px] pr-10 text-gray-900 dark:text-white transition-all outline-none focus:ring-2 focus:ring-brand-blue-light/30 appearance-none font-bold cursor-pointer" title="Select medical complexity level">
                    <option value="beginner">{T.difficultyBeginner}</option>
                    <option value="intermediate">{T.difficultyIntermediate}</option>
                    <option value="advanced">{T.difficultyAdvanced}</option>
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">
                    <ChevronDown className="h-4 w-4" />
                </div>
              </div>
          </div>
          <div className="w-full sm:w-auto flex items-end space-x-2">
              <div className="relative" ref={historyRef}>
                  <button type="button" onClick={() => setShowHistory(s => !s)} disabled={disabled} title="View previously generated cases" className="h-[46px] w-[46px] bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-300 font-bold rounded-xl transition-all flex items-center justify-center border border-gray-200 dark:border-dark-border shadow-sm active:scale-90"><HistoryIcon className="h-5 w-5" /></button>
                  {showHistory && (
                      <div className="absolute bottom-full mb-3 right-0 w-80 bg-white dark:bg-dark-surface rounded-2xl shadow-2xl border border-gray-200 dark:border-dark-border z-20 max-h-80 overflow-y-auto animate-fade-in">
                          <div className="p-4 border-b border-gray-100 dark:border-dark-border flex justify-between items-center sticky top-0 bg-white/95 dark:bg-dark-surface/95 backdrop-blur-sm"><h4 className="font-black text-xs text-gray-400 uppercase tracking-widest">{T.historyTitle}</h4>{history.length > 0 && <button onClick={() => { setHistory([]); localStorage.removeItem('generationHistory'); setShowHistory(false); }} className="text-[10px] text-red-500 hover:text-red-700 font-black uppercase tracking-tighter flex items-center gap-1"><Trash2 className="w-3 h-3" /> Clear</button>}</div>
                          {history.length === 0 ? <p className="p-8 text-sm text-gray-400 text-center italic">{T.noHistoryMessage}</p> : <ul className="divide-y divide-gray-50 dark:divide-dark-border">{history.map((item, index) => <li key={index} onClick={() => { setConditionInput(item.condition); setDisciplineInput(item.discipline); setShowHistory(false); }} className="p-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-all group"><p className="font-bold text-sm text-gray-800 dark:text-slate-200 truncate group-hover:text-brand-blue">{item.condition}</p><p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.discipline}</p></li>)}</ul>}
                      </div>
                  )}
              </div>
              <button type="submit" disabled={disabled || !conditionInput.trim() || !disciplineInput.trim()} title="Launch AI case synthesis" className="flex-grow h-[46px] bg-brand-blue hover:bg-blue-800 text-white font-black py-2 px-6 rounded-xl transition-all disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg shadow-brand-blue/20 hover:scale-[1.02] active:scale-95"><Sparkles className="w-4 h-4" /><span>{T.generateButton}</span></button>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative" ref={savedWorkMenuRef}>
                    <button onClick={() => setIsSavedWorkMenuOpen(!isSavedWorkMenuOpen)} disabled={disabled} title="Access your saved medical cases and snippets" className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center space-x-2 text-sm border border-gray-200 dark:border-dark-border shadow-sm active:scale-95"><Library className="h-4 w-4" /><span className="hidden sm:inline">{T.savedWorkButton}</span><ChevronDown className={`h-3 w-3 transition-transform ${isSavedWorkMenuOpen ? 'rotate-180' : ''}`} /></button>
                    {isSavedWorkMenuOpen && (
                        <div className="absolute top-full mt-2 left-0 w-56 bg-white dark:bg-dark-surface rounded-xl shadow-2xl border border-gray-200 dark:border-dark-border z-20 animate-fade-in overflow-hidden"><ul className="py-1">
                          <li><button onClick={() => { onSaveCase(); setIsSavedWorkMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center space-x-3 transition-colors" title="Store current case for future reference"><Bookmark className="h-4 w-4 text-brand-blue" /><span>Save Case</span></button></li>
                          <li><button onClick={() => { onOpenSavedWork(); setIsSavedWorkMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center space-x-3 transition-colors" title="View all previously saved data"><Library className="h-4 w-4 text-indigo-500" /><span>Browse All</span></button></li>
                        </ul></div>
                    )}
                </div>
                <button onClick={onOpenClinicalTools} disabled={disabled} title="Quick medical calculators (Dosing, Fluid, ECG)" className="bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center space-x-2 text-sm border border-indigo-100 dark:border-indigo-900/50 shadow-sm active:scale-95"><Calculator className="h-4 w-4" /><span className="hidden sm:inline">Calculators</span></button>
            </div>
            <div className="lg:hidden"><div className="flex items-center bg-gray-100 dark:bg-slate-800 p-1 rounded-xl transition-colors"><button onClick={() => onSetMobileView('case')} title="Switch to textual case view" className={`p-2 rounded-lg transition-all ${mobileView === 'case' ? 'bg-white dark:bg-slate-700 text-brand-blue dark:text-brand-blue-light shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><FileText className="h-5 w-5" /></button><button onClick={() => onSetMobileView('map')} title="Switch to interactive knowledge map" className={`p-2 rounded-lg transition-all ${mobileView === 'map' ? 'bg-white dark:bg-slate-700 text-brand-blue dark:text-brand-blue-light shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><Network className="h-5 w-5" /></button></div></div>
            <button onClick={onGenerateNew} disabled={disabled} title="Clear current work and start a new synthesis" className="bg-brand-blue hover:bg-blue-800 text-white font-black py-2.5 px-5 rounded-xl transition-all flex items-center justify-center space-x-2 shadow-lg shadow-brand-blue/20 active:scale-95"><Plus className="h-5 w-5" /><span className="hidden sm:inline">Reset</span></button>
        </div>
      )}
    </div>
  );
};
