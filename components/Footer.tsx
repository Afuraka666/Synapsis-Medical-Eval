import React from 'react';
import { MessageSquare } from 'lucide-react';

interface FooterProps {
    T: Record<string, any>;
    evaluationDaysRemaining: number | null;
    onOpenFeedback: () => void;
    className?: string;
}

export const Footer: React.FC<FooterProps> = ({ T, evaluationDaysRemaining, onOpenFeedback, className }) => {
    const currentYear = new Date().getFullYear();

    return (
        <footer className={`bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-dark-border py-4 px-4 sm:px-6 transition-all duration-300 ${className || ''}`}>
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 md:gap-4">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 sm:gap-6">
                    <div className="flex flex-col items-center md:items-start">
                        <span className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Platform</span>
                        <span className="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-slate-100">Ungana Medical Intelligence</span>
                    </div>
                    <div className="h-6 w-px bg-gray-100 dark:bg-slate-800 hidden sm:block"></div>
                    <div className="flex flex-col items-center md:items-start">
                        <span className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Copyright</span>
                        <span className="text-[11px] sm:text-xs font-medium text-gray-500 dark:text-gray-400">© {currentYear} Samuel Sibanda</span>
                    </div>
                    <div className="h-6 w-px bg-gray-100 dark:bg-slate-800 hidden sm:block"></div>
                    <div className="flex flex-col items-center md:items-start">
                        <span className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Version</span>
                        <span className="text-[11px] sm:text-xs font-medium text-gray-500 dark:text-gray-400">v1.0.32</span>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full md:w-auto">
                    {evaluationDaysRemaining !== null && (
                        <div className="flex items-center space-x-3 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-lg border border-gray-100 dark:border-slate-700 w-full sm:w-auto justify-center">
                            <div className="flex flex-col items-center sm:items-end">
                                <span className="text-[8px] sm:text-[9px] font-black text-brand-blue dark:text-brand-blue-light uppercase tracking-tighter leading-none mb-0.5">Evaluation Status</span>
                                <span className="text-[10px] sm:text-[11px] font-bold text-gray-700 dark:text-slate-300">
                                    {evaluationDaysRemaining > 0 ? T.trialDaysRemaining(evaluationDaysRemaining) : T.evalPeriodEnded}
                                </span>
                            </div>
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${evaluationDaysRemaining > 5 ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}></div>
                        </div>
                    )}
                    
                    <button 
                        onClick={onOpenFeedback}
                        className="flex items-center justify-center space-x-2 bg-brand-blue hover:bg-brand-blue-dark text-white px-5 py-2.5 sm:px-4 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95 w-full sm:w-auto"
                    >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{T.feedbackButton}</span>
                    </button>
                </div>
            </div>
        </footer>
    );
};
