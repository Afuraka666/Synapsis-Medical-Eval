
import React from 'react';
import { X, MessageSquare, Activity, Info } from 'lucide-react';
import type { KnowledgeNode } from '../types';
import { DisciplineColors } from './KnowledgeMap';

interface ConceptCardProps {
  nodeInfo: {
    node: KnowledgeNode;
    abstract: string;
    loading: boolean;
  };
  onClose: () => void;
  onDiscuss: (nodeInfo: ConceptCardProps['nodeInfo']) => void;
  T: Record<string, any>;
}

const LoadingSpinner: React.FC = () => (
    <div className="flex flex-col items-center justify-center h-24 text-brand-blue">
        <span title="Activity">
            <Activity className="h-8 w-8 animate-pulse mb-2" />
        </span>
        <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Analyzing...</p>
    </div>
);

export const ConceptCard: React.FC<ConceptCardProps> = ({ nodeInfo, onClose, onDiscuss, T }) => {
  const { node, abstract, loading } = nodeInfo;
  const color = DisciplineColors[node.discipline] || '#6b7280';
  
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-4 w-[calc(100%-2rem)] max-w-sm sm:w-80 glass-panel p-4 sm:p-6 animate-fade-in z-10 rounded-3xl shadow-2xl overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-brand-blue/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
      <div className="flex justify-between items-start mb-6 relative">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-[0.2em] border border-current/20"
              style={{ backgroundColor: `${color}10`, color: color }}
              title={`Medical Domain: ${node.discipline}`}
            >
              {node.discipline}
            </span>
          </div>
          <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter leading-none">{node.label}</h3>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-all touch-manipulation"
          aria-label="Close"
          title="Dismiss concept detail"
        >
          <span title="Close">
            <X className="w-5 h-5" />
          </span>
        </button>
      </div>

      <div className="relative group mb-8">
        <div className="text-sm text-gray-700 dark:text-slate-300 min-h-[80px] leading-relaxed">
          {loading ? (
            <LoadingSpinner />
          ) : (
            <div className="space-y-4">
              <p className="whitespace-pre-wrap font-medium tracking-tight text-gray-800 dark:text-slate-200">{abstract}</p>
              <div className="flex items-start gap-3 p-4 bg-brand-blue/5 dark:bg-brand-blue-light/5 rounded-2xl border border-brand-blue/10 dark:border-brand-blue-light/10">
                <span title="Information">
                  <Info className="w-4 h-4 text-brand-blue dark:text-brand-blue-light mt-0.5 flex-shrink-0" />
                </span>
                <p className="text-[11px] text-gray-600 dark:text-slate-400 font-medium leading-snug">
                  This concept is a key node in the biochemical pathway for this case.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative">
          <button
              onClick={() => onDiscuss(nodeInfo)}
              disabled={loading}
              title="Initiate deep-dive medical discussion on this concept"
              className="w-full bg-brand-blue dark:bg-brand-blue-light hover:bg-brand-blue-dark dark:hover:bg-brand-blue text-white font-black py-4 px-6 rounded-2xl transition-all text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-xl shadow-brand-blue/20 dark:shadow-brand-blue-light/20 disabled:opacity-50 disabled:shadow-none hover:scale-[1.02] active:scale-[0.98] touch-manipulation"
          >
              <span title="Discuss">
                <MessageSquare className="w-4 h-4" />
              </span>
              {T.discussButton}
          </button>
      </div>
    </div>
  );
};
