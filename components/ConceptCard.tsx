
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
        <Activity className="h-8 w-8 animate-pulse mb-2" />
        <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Analyzing...</p>
    </div>
);

export const ConceptCard: React.FC<ConceptCardProps> = ({ nodeInfo, onClose, onDiscuss, T }) => {
  const { node, abstract, loading } = nodeInfo;
  const color = DisciplineColors[node.discipline] || '#6b7280';
  
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-4 w-[calc(100%-2rem)] max-w-sm sm:w-80 medical-card p-4 sm:p-6 animate-fade-in z-10">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest"
              style={{ backgroundColor: `${color}15`, color: color }}
              title={`Medical Domain: ${node.discipline}`}
            >
              {node.discipline}
            </span>
          </div>
          <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">{node.label}</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-all"
          aria-label="Close"
          title="Dismiss concept detail"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative group">
        <div className="absolute -left-2 top-0 bottom-0 w-1 bg-brand-blue/20 rounded-full"></div>
        <div className="text-sm text-gray-600 dark:text-slate-300 min-h-[60px] leading-relaxed">
          {loading ? (
            <LoadingSpinner />
          ) : (
            <div className="space-y-3">
              <p className="whitespace-pre-wrap font-medium">{abstract}</p>
              <div className="flex items-start gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                <Info className="w-4 h-4 text-brand-blue mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-gray-500 dark:text-slate-400 italic">
                  This concept is a key node in the biochemical pathway for this case.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-700">
          <button
              onClick={() => onDiscuss(nodeInfo)}
              disabled={loading}
              title="Initiate deep-dive medical discussion on this concept"
              className="w-full bg-brand-blue hover:bg-brand-blue-dark text-white font-black py-3 px-4 rounded-xl transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-brand-blue/20 disabled:opacity-50 disabled:shadow-none hover:scale-[1.02] active:scale-[0.98]"
          >
              <MessageSquare className="w-4 h-4" />
              {T.discussButton}
          </button>
      </div>
    </div>
  );
};
