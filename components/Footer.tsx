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
        <footer className={`bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-dark-border py-3 px-4 sm:px-6 transition-all duration-300 ${className || ''}`}>
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Platform</span>
                        <span className="text-xs font-bold text-gray-900 dark:text-slate-100">Ungana Medical Intelligence</span>
                    </div>
                    <div className="h-6 w-px bg-gray-100 dark:bg-slate-800 hidden sm:block"></div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Copyright</span>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">© {currentYear} Samuel Sibanda</span>
                    </div>
                    <div className="h-6 w-px bg-gray-100 dark:bg-slate-800 hidden sm:block"></div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Version</span>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">v1.0.32</span>
                    </div>
                </div>

                <div className="flex items-center space-x-6">
                    {evaluationDaysRemaining !== null && (
                        <div className="flex items-center space-x-3 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-slate-700">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-brand-blue dark:text-brand-blue-light uppercase tracking-tighter leading-none mb-0.5">Evaluation Status</span>
                                <span className="text-[11px] font-bold text-gray-700 dark:text-slate-300">
                                    {evaluationDaysRemaining > 0 ? T.trialDaysRemaining(evaluationDaysRemaining) : T.evalPeriodEnded}
                                </span>
                            </div>
                            <div className={`w-2 h-2 rounded-full ${evaluationDaysRemaining > 5 ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}></div>
                        </div>
                    )}
                    
                    <button 
                        onClick={onOpenFeedback}
                        className="flex items-center space-x-2 bg-brand-blue hover:bg-brand-blue-dark text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95"
                    >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{T.feedbackButton}</span>
                    </button>
                </div>
            </div>
        </footer>
    );
};
