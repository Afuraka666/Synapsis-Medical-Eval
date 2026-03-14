
import React from 'react';
import { Network, Library, Calculator, Sparkles, ArrowRight } from 'lucide-react';

interface WelcomeScreenProps {
  T: Record<string, any>;
  onOpenSavedWork: () => void;
  onOpenClinicalTools: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ T, onOpenSavedWork, onOpenClinicalTools }) => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent p-4 sm:p-8 text-center overflow-y-auto">
      <div className="max-w-2xl mx-auto animate-fade-in py-8 sm:py-0">
        <div className="relative mb-6 sm:mb-8">
            <div className="absolute inset-0 bg-brand-blue/10 rounded-full blur-3xl transform -translate-y-4 animate-pulse"></div>
            <div className="relative mx-auto h-20 w-20 sm:h-24 sm:w-24 bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl shadow-xl flex items-center justify-center border border-gray-100 dark:border-dark-border rotate-3 hover:rotate-0 transition-transform duration-500">
                <Network className="h-10 w-10 sm:h-12 sm:w-12 text-brand-blue" />
            </div>
        </div>
        
        <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white tracking-tighter mb-4 px-2">
            {T.welcomeTitle}
            <span className="text-brand-blue">.</span>
        </h2>
        <p className="text-base sm:text-lg text-gray-500 dark:text-gray-400 leading-relaxed font-medium px-4">
          {T.welcomeMessage}
        </p>

        <div className="mt-8 sm:mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 px-2">
            <button 
                onClick={onOpenSavedWork}
                className="medical-card group flex flex-col items-center p-6 sm:p-8 hover:border-brand-blue hover:shadow-2xl hover:shadow-brand-blue/10 transition-all duration-500 hover:-translate-y-1"
            >
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-50 dark:bg-blue-900/20 text-brand-blue rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-500">
                    <Library className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <h3 className="font-black text-gray-800 dark:text-white uppercase tracking-widest text-[10px] sm:text-xs mb-2">{T.savedWorkButton}</h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4">{T.viewSavedWorkButton}</p>
                <div className="flex items-center text-brand-blue text-[10px] sm:text-xs font-black uppercase tracking-tighter opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    {T.openCollection} <ArrowRight className="ml-1 w-3 h-3" />
                </div>
            </button>

            <button 
                onClick={onOpenClinicalTools}
                className="medical-card group flex flex-col items-center p-6 sm:p-8 hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 hover:-translate-y-1"
            >
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-500">
                    <Calculator className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <h3 className="font-black text-gray-800 dark:text-white uppercase tracking-widest text-[10px] sm:text-xs mb-2">{T.clinicalToolsButton}</h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4">{T.clinicalToolsTitle}</p>
                <div className="flex items-center text-indigo-600 dark:text-indigo-400 text-[10px] sm:text-xs font-black uppercase tracking-tighter opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    {T.openTools} <ArrowRight className="ml-1 w-3 h-3" />
                </div>
            </button>
        </div>

        <div className="mt-8 sm:mt-12 flex items-center justify-center gap-2 text-gray-400 dark:text-gray-500 text-[10px] sm:text-xs font-black uppercase tracking-widest">
            <Sparkles className="w-4 h-4" />
            {T.poweredByAi}
        </div>
      </div>
    </div>
  );
};
