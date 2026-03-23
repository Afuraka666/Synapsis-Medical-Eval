
import React from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SourceRenderer } from './SourceRenderer';
import { ScientificGraph } from './ScientificGraph';
import { InteractiveDiagram } from './InteractiveDiagram';
import { ClinicalChart } from './ClinicalChart';
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
    reference?: string;
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
    groundingSources,
    reference
}) => {
    if (!content) return null;

    // Split content by the tags, capturing the tags in the result array
    const parts = content.split(/(\[\s*(?:GRAPH|ILLUSTRATE|DIAGRAM|CHART):\s*.*?\s*\])/gi);

    return (
        <div className="space-y-4">
            {parts.map((part, index) => {
                if (!part) return null;

                const visualMatch = part.match(/\[(?:ILLUSTRATE|DIAGRAM|GRAPH|CHART):\s*(.*?)\s*\]/i);
                if (visualMatch && allowVisuals) {
                    if (imageData) {
                        return (
                            <div key={index} className="my-6 rounded-2xl overflow-hidden border border-gray-100 dark:border-dark-border shadow-lg animate-fade-in illustration-container relative group" data-tag={visualMatch[1].trim()}>
                                <img src={`data:image/png;base64,${imageData}`} alt="Illustration" className="w-full h-auto" referrerPolicy="no-referrer" />
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <a 
                                        href={`data:image/png;base64,${imageData}`}
                                        download="illustration.png"
                                        className="p-1.5 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 text-gray-600 hover:text-brand-blue transition-colors inline-block"
                                        title="Download Image"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    </a>
                                </div>
                            </div>
                        );
                    }
                    return (
                        <div key={index} className="my-3 flex justify-center illustration-trigger-container" data-tag={visualMatch[1].trim()}>
                            <button onClick={() => onTriggerIllustration(visualMatch[1].trim())} title="Synthesize Visual" className="group flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-brand-blue dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all text-[10px] font-black shadow-sm uppercase tracking-wider">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h14a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                {T.visualVerificationButton || "Synthesize Visual"}
                            </button>
                        </div>
                    );
                }

                // If it's just text
                const cleanPart = part
                    .replace(/\[GRAPH:.*?\]/gi, '')
                    .replace(/\[ILLUSTRATE:.*?\]/gi, '')
                    .replace(/\[DIAGRAM:.*?\]/gi, '')
                    .replace(/\[CHART:.*?\]/gi, '')
                    .replace(/\[ADVERSE:.*?\]/gi, '')
                    .trim();

                if (!cleanPart) return null;

                return <MarkdownRenderer key={index} content={cleanPart} />;
            })}
            {(groundingSources?.length || content?.match(/pmid|doi|http/i) || reference) ? (
                <div className="pt-2 border-t border-gray-50 dark:border-dark-border/10">
                    <SourceRenderer text={`${content || ""} ${reference || ""}`} groundingSources={groundingSources} hideText={true} />
                    {reference && !reference.match(/pmid|doi|http/i) && (
                        <div className="text-[10px] text-gray-500 italic mt-1">{reference}</div>
                    )}
                </div>
            ) : null}
        </div>
    );
};
