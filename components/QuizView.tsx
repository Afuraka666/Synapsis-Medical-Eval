import React, { useState } from 'react';
import type { QuizQuestion } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface QuizViewProps {
  quiz: QuizQuestion[];
  T: Record<string, any>;
  showTitle?: boolean;
}

export const QuizView: React.FC<QuizViewProps> = ({ quiz, T, showTitle = true }) => {
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleAnswerChange = (questionIndex: number, answerIndex: number) => {
    setUserAnswers(prev => ({ ...prev, [questionIndex]: answerIndex }));
  };

  const handleSubmit = () => {
    setIsSubmitted(true);
  };
  
  const handleReset = () => {
      setUserAnswers({});
      setIsSubmitted(false);
  }

  const score = quiz.reduce((acc, question, index) => {
    return acc + (userAnswers[index] === question.correctAnswerIndex ? 1 : 0);
  }, 0);

  return (
    <div className="mt-1 relative pb-28">
      {showTitle && <h3 className="text-base font-black text-brand-blue border-b-2 border-brand-blue/30 pb-1 mb-3 uppercase tracking-tight">{T.quizTitle}</h3>}
      {isSubmitted && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-4 text-center shadow-sm">
            <h4 className="font-black text-lg text-brand-blue dark:text-blue-300 uppercase tracking-tight">{T.quizComplete}</h4>
            <p className="text-sm text-gray-900 dark:text-slate-100 mt-1">{T.quizScore(score, quiz.length)}</p>
            <button onClick={handleReset} className="mt-3 bg-brand-blue hover:bg-blue-800 text-white font-black py-2 px-5 rounded-lg transition text-[10px] uppercase tracking-widest shadow-md">
                {T.quizTryAgain}
            </button>
        </div>
      )}
      <div className="space-y-2">
        {quiz.map((q, qIndex) => (
          <div key={qIndex} className="bg-white dark:bg-dark-surface p-2.5 rounded-xl border border-gray-100 dark:border-dark-border shadow-xs">
            <div className="font-black text-gray-900 dark:text-slate-100 flex gap-2 text-[10px] sm:text-[11px] leading-tight">
                <span className="text-brand-blue dark:text-brand-blue-light">{qIndex + 1}.</span>
                <MarkdownRenderer content={q.question} className="!mb-0 flex-1" />
            </div>
            <div className="mt-2 space-y-1">
              {q.options.map((option, oIndex) => {
                const isCorrect = oIndex === q.correctAnswerIndex;
                const isSelected = userAnswers[qIndex] === oIndex;
                
                let optionClasses = "w-full text-left p-2 border rounded-xl transition text-[10px] sm:text-[11px] flex items-start gap-2 text-brand-text dark:text-slate-300 group";
                if (!isSubmitted) {
                  optionClasses += isSelected 
                    ? " bg-blue-50 dark:bg-blue-900/30 border-brand-blue dark:border-brand-blue-light ring-2 ring-brand-blue/10" 
                    : " bg-white dark:bg-dark-surface border-gray-100 dark:border-dark-border hover:border-brand-blue/50 hover:bg-slate-50 dark:hover:bg-slate-800/50";
                } else {
                    if (isCorrect) {
                        optionClasses += " bg-green-50 dark:bg-green-900/20 border-green-500 dark:border-green-500/50 font-bold text-green-700 dark:text-green-400";
                    } else if (isSelected && !isCorrect) {
                        optionClasses += " bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-500/50 text-red-700 dark:text-red-400";
                    } else {
                        optionClasses += " bg-white dark:bg-dark-surface border-gray-100 dark:border-dark-border opacity-50";
                    }
                }

                return (
                  <button key={oIndex} onClick={() => handleAnswerChange(qIndex, oIndex)} disabled={isSubmitted} className={optionClasses}>
                    <span className={`flex-shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-black border transition-colors ${isSelected ? 'bg-brand-blue text-white border-brand-blue' : 'bg-slate-100 dark:bg-slate-800 text-gray-500 border-gray-200 dark:border-slate-700 group-hover:border-brand-blue/30'}`}>
                        {String.fromCharCode(65 + oIndex)}
                    </span> 
                    <MarkdownRenderer content={option} className="!mb-0 flex-1" />
                  </button>
                );
              })}
            </div>
            {isSubmitted && (
                <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800/40 border-l-4 border-brand-blue dark:border-brand-blue-light rounded-r-xl text-[9px] leading-relaxed">
                    <div className="flex gap-2">
                        <span className="font-black text-brand-blue dark:text-brand-blue-light uppercase tracking-tighter shrink-0">{T.quizExplanation}:</span> 
                        <MarkdownRenderer content={q.explanation} className="!mb-0 text-gray-900 dark:text-slate-100" />
                    </div>
                </div>
            )}
          </div>
        ))}
      </div>
      {!isSubmitted && (
        <div className="sticky bottom-0 -mx-4 sm:-mx-6 mt-6 py-4 bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md border-t border-gray-100 dark:border-dark-border text-center z-10 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <button 
            onClick={handleSubmit} 
            disabled={Object.keys(userAnswers).length !== quiz.length}
            className="bg-brand-blue hover:bg-blue-800 text-white font-black py-2.5 px-8 rounded-full transition-all duration-300 disabled:bg-gray-300 dark:disabled:bg-slate-700 disabled:text-gray-500 shadow-lg hover:shadow-xl active:scale-95 text-[10px] uppercase tracking-widest"
          >
            {T.quizSubmit}
          </button>
        </div>
      )}
    </div>
  );
};
