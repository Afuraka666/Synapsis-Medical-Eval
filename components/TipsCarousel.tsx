import React, { useState, useEffect, useMemo } from 'react';
import { Lightbulb, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Tip, InteractionState } from '../types';

interface TipsCarouselProps {
    interactionState: InteractionState;
    T: Record<string, any>;
}

const allTips = (T: Record<string, any>): Tip[] => [
    {
        id: 'explore-nodes',
        title: T.tipExploreNodesTitle,
        text: T.tipExploreNodesText,
        trigger: (state) => state.caseGenerated && !state.caseEdited && state.nodeClicks < 2,
    },
    {
        id: 'edit-case',
        title: T.tipEditCaseTitle,
        text: T.tipEditCaseText,
        trigger: (state) => state.caseGenerated && !state.caseEdited,
    },
    {
        id: 'undo-redo',
        title: T.tipUndoRedoTitle,
        text: T.tipUndoRedoText,
        trigger: (state) => state.caseEdited && !state.caseSaved,
    },
    {
        id: 'save-case',
        title: T.tipSaveCaseTitle,
        text: T.tipSaveCaseText,
        trigger: (state) => state.caseGenerated && !state.caseSaved,
    },
    {
        id: 'save-snippet',
        title: T.tipSaveSnippetTitle,
        text: T.tipSaveSnippetText,
        trigger: (state) => state.caseGenerated && !state.snippetSaved,
    },
    {
        id: 'fullscreen-map',
        title: T.tipFullscreenTitle,
        text: T.tipFullscreenText,
        trigger: (state) => state.nodeClicks > 4,
    },
];

export const TipsCarousel: React.FC<TipsCarouselProps> = ({ interactionState, T }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [dismissedTips, setDismissedTips] = useState<string[]>([]);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        try {
            const storedDismissed = localStorage.getItem('ungana_dismissed_tips');
            if (storedDismissed) {
                setDismissedTips(JSON.parse(storedDismissed));
            }
        } catch (e) {
            console.error('Failed to parse dismissed tips from localStorage', e);
        }
    }, []);

    const activeTips = useMemo(() => {
        return allTips(T).filter(tip => tip.trigger(interactionState) && !dismissedTips.includes(tip.id));
    }, [interactionState, dismissedTips, T]);

    useEffect(() => {
        setCurrentIndex(0);
    }, [activeTips.length]);

    const handleDismissTip = (tipId: string) => {
        const newDismissed = [...dismissedTips, tipId];
        setDismissedTips(newDismissed);
        localStorage.setItem('ungana_dismissed_tips', JSON.stringify(newDismissed));
        if (activeTips.length <= 1) {
            setIsVisible(false);
        }
    };
    
    const handleDismissCarousel = () => {
        setIsVisible(false);
    }

    const handleNext = () => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % activeTips.length);
    };

    const handlePrev = () => {
        setCurrentIndex((prevIndex) => (prevIndex - 1 + activeTips.length) % activeTips.length);
    };

    if (!isVisible || activeTips.length === 0) {
        return null;
    }

    const currentTip = activeTips[currentIndex];

    return (
        <div className="mt-4 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-3 flex items-center space-x-3 animate-fade-in relative backdrop-blur-sm">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                <Lightbulb className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-grow min-w-0">
                <p className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-0.5">Clinical Tip</p>
                <p className="text-sm font-bold text-gray-800 dark:text-slate-200 truncate">{currentTip.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{currentTip.text}</p>
            </div>
            <div className="flex items-center flex-shrink-0 space-x-1">
                {activeTips.length > 1 && (
                    <div className="flex items-center bg-white/50 dark:bg-slate-800/50 rounded-lg p-0.5 border border-blue-100/50 dark:border-blue-900/20 mr-1">
                        <button onClick={handlePrev} className="p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 text-gray-400 hover:text-gray-800 dark:hover:text-slate-200 transition-colors">
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-[10px] font-black text-gray-400 px-1 min-w-[30px] text-center">{currentIndex + 1}/{activeTips.length}</span>
                        <button onClick={handleNext} className="p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 text-gray-400 hover:text-gray-800 dark:hover:text-slate-200 transition-colors">
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                )}
                 <button onClick={() => handleDismissTip(currentTip.id)} title="Dismiss this tip" className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-all active:scale-90">
                    <X className="h-4 w-4" />
                 </button>
            </div>
        </div>
    );
};
