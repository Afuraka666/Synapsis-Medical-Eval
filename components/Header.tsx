
import React from 'react';
import { Moon, Sun, Globe, Activity } from 'lucide-react';

interface HeaderProps {
  supportedLanguages: Record<string, string>;
  currentLanguage: string;
  onLanguageChange: (langCode: string) => void;
  currentTheme: string;
  onThemeToggle: () => void;
  T: Record<string, any>;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({ supportedLanguages, currentLanguage, onLanguageChange, currentTheme, onThemeToggle, T, className }) => {
  return (
    <header className={`bg-brand-blue/95 dark:bg-slate-900/95 backdrop-blur-md shadow-lg text-white border-b border-white/10 transition-all duration-300 ${className || ''}`}>
      <div className="container mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3 group cursor-pointer">
          <div className="bg-white p-1.5 rounded-xl shadow-inner group-hover:scale-110 transition-transform">
            <svg width="24" height="24" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6">
              <rect width="100" height="100" rx="20" fill="#1e3a8a"/>
              <g stroke="white" strokeWidth="4" strokeLinecap="round">
                <line x1="50" y1="50" x2="50" y2="20"/>
                <line x1="50" y1="50" x2="71.21" y2="28.79"/>
                <line x1="50" y1="50" x2="80" y2="50"/>
                <line x1="50" y1="50" x2="71.21" y2="71.21"/>
                <line x1="50" y1="50" x2="50" y2="80"/>
                <line x1="50" y1="50" x2="28.79" y2="71.21"/>
                <line x1="50" y1="50" x2="20" y2="50"/>
                <line x1="50" y1="50" x2="28.79" y2="28.79"/>
              </g>
              <g fill="#3b82f6" stroke="white" strokeWidth="2.5">
                <circle cx="50" cy="20" r="8"/>
                <circle cx="71.21" cy="28.79" r="8"/>
                <circle cx="80" cy="50" r="8"/>
                <circle cx="71.21" cy="71.21" r="8"/>
                <circle cx="50" cy="80" r="8"/>
                <circle cx="28.79" cy="71.21" r="8"/>
                <circle cx="20" cy="50" r="8"/>
                <circle cx="28.79" cy="28.79" r="8"/>
              </g>
              <circle cx="50" cy="50" r="16" fill="white"/>
              <line x1="42" y1="50" x2="58" y2="50" stroke="#1e3a8a" strokeWidth="5" strokeLinecap="round"/>
              <line x1="50" y1="42" x2="50" y2="58" stroke="#1e3a8a" strokeWidth="5" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg sm:text-xl font-black tracking-tighter leading-none">Ungana Medical</h1>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-4">
          <p className="text-xs font-medium text-blue-200/80 hidden lg:block italic">{T.headerSubtitle}</p>
          
          <div className="h-6 w-px bg-white/10 hidden sm:block"></div>

          <button 
            onClick={onThemeToggle}
            className="p-2 rounded-xl hover:bg-white/10 transition-all active:scale-95"
            title={currentTheme === 'light' ? T.switchToDarkMode : T.switchToLightMode}
          >
            {currentTheme === 'light' ? (
               <Moon className="h-5 w-5 text-blue-100" />
            ) : (
               <Sun className="h-5 w-5 text-yellow-300" />
            )}
          </button>

          <div className="relative group">
            <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
              <Globe className="h-3.5 w-3.5 text-blue-200" />
            </div>
            <select
              value={currentLanguage}
              onChange={(e) => onLanguageChange(e.target.value)}
              aria-label="Select language"
              className="bg-white/10 dark:bg-slate-800/50 text-white text-xs sm:text-sm rounded-xl pl-7 pr-8 py-2 border border-white/5 hover:bg-white/20 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all appearance-none cursor-pointer font-bold"
            >
              {Object.entries(supportedLanguages).map(([code, name]) => (
                <option key={code} value={code} className="bg-brand-blue dark:bg-slate-800 text-white">{name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-blue-200">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
