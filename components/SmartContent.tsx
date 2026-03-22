
import React from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SourceRenderer } from './SourceRenderer';
import { ScientificGraph } from './ScientificGraph';
import { InteractiveDiagram } from './InteractiveDiagram';
import type { DiagramData } from '../types';

interface SmartContentProps {
    content: string | undefined;
    language: string;
    T: Record<string, any>;
    onTriggerIllustration: (desc: string) => void;
    onTriggerDiagram?: (desc: string) => void;
    allowVisuals?: boolean;
    diagramData?: DiagramData;
    imageData?: string;
    groundingSources?: any[];
}

export const SmartContent: React.FC<SmartContentProps> = ({ 
    content, 
    language, 
    T, 
    onTriggerIllustration, 
    onTriggerDiagram, 
    allowVisuals = false,
    diagramData,
    imageData,
    groundingSources
}) => {
    if (!content) return null;

    // Split content by the tags, capturing the tags in the result array
    const parts = content.split(/(\[\s*(?:GRAPH|ILLUSTRATE|DIAGRAM):\s*.*?\s*\])/gi);

    return (
        <div className="space-y-3">
            {parts.map((part, index) => {
                const graphMatch = part.match(/\[GRAPH:\s*(.*?)\s*\]/i);
                if (graphMatch && allowVisuals) {
                    const graphType = graphMatch[1].trim().toLowerCase().replace(/[\s-]+/g, '_');
                    return (
                        <div key={index} className="my-4 animate-fade-in scientific-graph-container" data-tag={graphType}>
                            <ScientificGraph type={graphType as any} title={T.physiologicalModelVisualization || "Physiological Model"} />
                        </div>
                    );
                }

                const illustrateMatch = part.match(/\[ILLUSTRATE:\s*(.*?)\s*\]/i);
                if (illustrateMatch && allowVisuals) {
                    if (imageData) {
                        return (
                            <div key={index} className="my-4 rounded-xl overflow-hidden border border-gray-100 dark:border-dark-border shadow-md animate-fade-in illustration-container" data-tag={illustrateMatch[1].trim()}>
                                <img src={`data:image/png;base64,${imageData}`} alt="Illustration" className="w-full h-auto" referrerPolicy="no-referrer" />
                            </div>
                        );
                    }
                    return (
                        <div key={index} className="my-2 flex justify-center illustration-trigger-container" data-tag={illustrateMatch[1].trim()}>
                            <button onClick={() => onTriggerIllustration(illustrateMatch[1].trim())} title="Synthesize Clinical Illustration" className="group flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-brand-blue dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all text-[9px] font-black shadow-xs">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h14a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                {T.visualVerificationButton || "Synthesize Clinical Illustration"}
                            </button>
                        </div>
                    );
                }

                const diagramMatch = part.match(/\[DIAGRAM:\s*(.*?)\s*\]/i);
                if (diagramMatch && allowVisuals) {
                    if (diagramData) {
                        return (
                            <div key={index} className="my-4 h-[320px] border border-gray-100 dark:border-dark-border rounded-xl overflow-hidden bg-white shadow-md animate-fade-in interactive-diagram-container" data-tag={diagramMatch[1].trim()}>
                                <InteractiveDiagram data={diagramData} id={`diag-${index}`} />
                            </div>
                        );
                    }
                    return (
                        <div key={index} className="my-2 flex justify-center diagram-trigger-container" data-tag={diagramMatch[1].trim()}>
                            <button onClick={() => onTriggerDiagram?.(diagramMatch[1].trim())} title="Synthesize Medical Diagram" className="group flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all text-[9px] font-black shadow-xs">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                {T.generateMedicalDiagram || "Synthesize Medical Diagram"}
                            </button>
                        </div>
                    );
                }

                // If it's just text
                const cleanPart = part
                    .replace(/\[GRAPH:.*?\]/gi, '')
                    .replace(/\[ILLUSTRATE:.*?\]/gi, '')
                    .replace(/\[DIAGRAM:.*?\]/gi, '')
                    .replace(/\[ADVERSE:.*?\]/gi, '')
                    .trim();

                if (!cleanPart) return null;

                return <MarkdownRenderer key={index} content={cleanPart} />;
            })}
            <div className="pt-0.5">
                <SourceRenderer text={content} groundingSources={groundingSources} />
            </div>
        </div>
    );
};
