
import React, { useState, useCallback } from 'react';
import { 
    Activity, 
    Upload, 
    FileText, 
    AlertCircle, 
    CheckCircle2,
    Heart,
    Zap,
    Info
} from 'lucide-react';
import { EcgFindings } from '../types';
import { interpretEcg } from '../services/geminiService';

interface EcgInterpreterProps {
    T: Record<string, any>;
    language: string;
}

export const EcgInterpreter: React.FC<EcgInterpreterProps> = ({ T, language }) => {
    const [findings, setFindings] = useState<EcgFindings>({
        rate: '', rhythm: 'Normal Sinus Rhythm', pr: '', qrs: '', qtc: '', stSegment: 'Normal', other: ''
    });
    const [file, setFile] = useState<{ base64: string; mimeType: string; name: string; url: string } | null>(null);
    const [isInterpreting, setIsInterpreting] = useState(false);
    const [interpretationResult, setInterpretationResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFindings(prev => ({ ...prev, [name]: value }));
    };

    const processFile = (selectedFile: File) => {
        if (!selectedFile.type.startsWith('image/')) {
            setError(T.ecgErrorOnlyImages);
            return;
        }
        if (selectedFile.size > 4 * 1024 * 1024) { // 4MB limit for inline data
            setError(T.ecgErrorFileTooLarge);
            return;
        }
        setError(null);
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            const dataUrl = loadEvent.target?.result as string;
            const base64String = dataUrl.split(',')[1];
            setFile({ base64: base64String, mimeType: selectedFile.type, name: selectedFile.name, url: dataUrl });
        };
        reader.onerror = () => setError(T.ecgErrorReadFailed);
        reader.readAsDataURL(selectedFile);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) processFile(selectedFile);
    };
    
    const handleDragEvents = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragOver(true);
        } else if (e.type === 'dragleave') {
            setIsDragOver(false);
        }
    };
    
    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile) processFile(droppedFile);
    };


    const handleInterpret = async () => {
        setIsInterpreting(true);
        setInterpretationResult(null);
        setError(null);
        try {
            const result = await interpretEcg(findings, file?.base64 || null, file?.mimeType || null, language);
            setInterpretationResult(result);
        } catch (err) {
            console.error("ECG Interpretation failed:", err);
            setError(T.ecgInterpretationError);
        } finally {
            setIsInterpreting(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="medical-card p-5 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-brand-blue/10 rounded-lg">
                        <span title={T.iconLabelActivity}>
                            <Activity className="w-5 h-5 text-brand-blue" />
                        </span>
                    </div>
                    <div>
                        <h3 className="text-md font-bold text-slate-900 leading-tight">{T.ecgInterpreterTitle || 'ECG Analysis Assistant'}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{T.ecgAnalysisAssistant}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                            <span title={T.iconLabelActivity}>
                                <Zap className="w-3 h-3" />
                            </span>
                            {T.ecgRateLabel}
                        </label>
                        <input 
                            type="number" 
                            name="rate" 
                            value={findings.rate} 
                            onChange={handleInputChange} 
                            placeholder={T.ecgBpmPlaceholder || "bpm"}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                            <span title={T.iconLabelHeart}>
                                <Heart className="w-3 h-3" />
                            </span>
                            {T.ecgRhythmLabel}
                        </label>
                        <select 
                            name="rhythm" 
                            value={findings.rhythm} 
                            onChange={handleInputChange} 
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none appearance-none"
                        >
                            <option value="Normal Sinus Rhythm">{T.ecgRhythmNormal}</option>
                            <option value="Sinus Tachycardia">{T.ecgRhythmSinusTachy}</option>
                            <option value="Sinus Bradycardia">{T.ecgRhythmSinusBrady}</option>
                            <option value="Atrial Fibrillation">{T.ecgRhythmAfib}</option>
                            <option value="Atrial Flutter">{T.ecgRhythmAflutter}</option>
                            <option value="Ventricular Tachycardia">{T.ecgRhythmVtach}</option>
                            <option value="Other">{T.ecgRhythmOther}</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelInformation}>
                            <Info className="w-3 h-3" />
                        </span>
                        {T.ecgIntervals}
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                        <input 
                            type="number" 
                            name="pr" 
                            value={findings.pr} 
                            onChange={handleInputChange} 
                            placeholder={T.ecgPrInterval || "PR (ms)"} 
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                        />
                        <input 
                            type="number" 
                            name="qrs" 
                            value={findings.qrs} 
                            onChange={handleInputChange} 
                            placeholder={T.ecgQrsDuration || "QRS (ms)"} 
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                        />
                        <input 
                            type="number" 
                            name="qtc" 
                            value={findings.qtc} 
                            onChange={handleInputChange} 
                            placeholder={T.ecgQtcInterval || "QTc (ms)"} 
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none" 
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelActivity}>
                            <Activity className="w-3 h-3" />
                        </span>
                        {T.ecgStSegment}
                    </label>
                    <select 
                        name="stSegment" 
                        value={findings.stSegment} 
                        onChange={handleInputChange} 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none appearance-none"
                    >
                        <option value="Normal">{T.ecgStNormal}</option>
                        <option value="ST Elevation">{T.ecgStElevation}</option>
                        <option value="ST Depression">{T.ecgStDepression}</option>
                        <option value="Non-specific changes">{T.ecgStNonSpecific}</option>
                    </select>
                </div>

                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelResults}>
                            <FileText className="w-3 h-3" />
                        </span>
                        {T.ecgOtherFindings}
                    </label>
                    <textarea 
                        name="other" 
                        value={findings.other} 
                        onChange={handleInputChange} 
                        rows={2} 
                        placeholder={T.ecgOtherFindingsPlaceholder || "e.g. T-wave inversion in V1-V3..."}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all outline-none resize-none" 
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span title={T.iconLabelUpload}>
                            <Upload className="w-3 h-3" />
                        </span>
                        {T.uploadEcgLabel}
                    </label>
                     <label 
                        onDragEnter={handleDragEvents} 
                        onDragOver={handleDragEvents} 
                        onDragLeave={handleDragEvents} 
                        onDrop={handleDrop}
                        className={`relative flex flex-col justify-center items-center w-full min-h-[160px] px-6 py-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                            isDragOver 
                                ? 'border-brand-blue bg-brand-blue/5' 
                                : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                    >
                        {file ? (
                            <div className="text-center animate-fade-in">
                                <div className="relative inline-block">
                                    <img src={file.url} alt="ECG Preview" className="max-h-32 rounded-lg shadow-md border border-slate-200" />
                                    <div className="absolute -top-2 -right-2 p-1 bg-brand-blue text-white rounded-full shadow-lg">
                                        <span title={T.iconLabelSelected}>
                                            <CheckCircle2 className="w-4 h-4" />
                                        </span>
                                    </div>
                                </div>
                                <p className="mt-3 text-xs font-bold text-slate-600 truncate max-w-[200px] mx-auto">{file.name}</p>
                                <p className="text-[10px] font-black text-brand-blue uppercase tracking-widest mt-1">{T.ecgClickToChange}</p>
                            </div>
                        ) : (
                            <div className="text-center space-y-3">
                                <div className="p-3 bg-white rounded-full shadow-sm border border-slate-100 inline-block">
                                    <span title={T.iconLabelUpload}>
                                        <Upload className="w-6 h-6 text-slate-400" />
                                    </span>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-700">{T.uploadEcgPrompt || 'Drop ECG image here or click to browse'}</p>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{T.uploadEcgVideoNote || 'Supports PNG, JPG (Max 4MB)'}</p>
                                </div>
                            </div>
                        )}
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={handleFileChange} />
                    </label>
                </div>

                <button
                    onClick={handleInterpret}
                    disabled={isInterpreting}
                    className="w-full flex items-center justify-center gap-2 bg-brand-blue hover:bg-blue-800 text-white font-black py-4 px-6 rounded-xl transition-all shadow-md disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none uppercase tracking-widest text-xs"
                >
                    {isInterpreting ? (
                        <span title={T.iconLabelActivity}>
                            <Activity className="w-5 h-5 animate-pulse" />
                        </span>
                    ) : (
                        <span title={T.iconLabelActivity}>
                            <Zap className="w-5 h-5" />
                        </span>
                    )}
                    {isInterpreting ? T.interpretingEcgMessage : T.interpretEcgButton}
                </button>

                {(isInterpreting || interpretationResult || error) && (
                    <div className="mt-6 p-5 bg-white border border-slate-200 rounded-2xl animate-fade-in shadow-sm">
                        <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                            <span title={T.iconLabelResults}>
                                <FileText className="w-4 h-4 text-brand-blue" />
                            </span>
                            <h4 className="text-[10px] font-black text-brand-blue uppercase tracking-widest">{T.interpretationResultTitle}</h4>
                        </div>
                        
                        {isInterpreting && (
                            <div className="flex flex-col items-center justify-center py-8 space-y-3">
                                <div className="w-8 h-8 border-4 border-slate-100 border-t-brand-blue rounded-full animate-spin" />
                                <p className="text-xs font-bold text-slate-500 animate-pulse">{T.interpretingEcgMessage}</p>
                            </div>
                        )}
                        
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2">
                                <span title={T.iconLabelAlert}>
                                    <AlertCircle className="w-4 h-4 text-red-500" />
                                </span>
                                <p className="text-xs font-bold text-red-600">{error}</p>
                            </div>
                        )}
                        
                        {interpretationResult && (
                            <div className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                                <div 
                                    className="prose prose-sm max-w-none prose-headings:text-brand-blue prose-headings:font-black prose-headings:uppercase prose-headings:tracking-widest prose-headings:text-[10px] prose-headings:mb-2 prose-p:text-slate-800 prose-p:font-medium prose-strong:text-slate-900 prose-strong:font-bold"
                                    dangerouslySetInnerHTML={{ 
                                        __html: interpretationResult
                                            .replace(/## (.*)/g, '<h4 class="mt-4">$1</h4>')
                                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                                    }} 
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};