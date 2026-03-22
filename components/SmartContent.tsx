
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
        <div className="space-y-4">
            {parts.map((part, index) => {
                if (!part) return null;

                const graphMatch = part.match(/\[GRAPH:\s*(.*?)\s*\]/i);
                if (graphMatch && allowVisuals) {
                    const graphType = graphMatch[1].trim().toLowerCase().replace(/[\s-]+/g, '_');
                    return (
                        <div key={index} className="my-6 animate-fade-in scientific-graph-container relative group" data-tag={graphType}>
                            <ScientificGraph type={graphType as any} title={T.physiologicalModelVisualization || "Physiological Model"} />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={(e) => {
                                        const svg = e.currentTarget.closest('.scientific-graph-container')?.querySelector('svg');
                                        if (svg) {
                                            const svgData = new XMLSerializer().serializeToString(svg);
                                            const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
                                            const url = URL.createObjectURL(svgBlob);
                                            const link = document.createElement('a');
                                            link.href = url;
                                            link.download = `graph_${graphType}.svg`;
                                            link.click();
                                        }
                                    }}
                                    className="p-1.5 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 text-gray-600 hover:text-brand-blue transition-colors"
                                    title="Download SVG"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                </button>
                            </div>
                        </div>
                    );
                }

                const illustrateMatch = part.match(/\[ILLUSTRATE:\s*(.*?)\s*\]/i);
                if (illustrateMatch && allowVisuals) {
                    if (imageData) {
                        return (
                            <div key={index} className="my-6 rounded-2xl overflow-hidden border border-gray-100 dark:border-dark-border shadow-lg animate-fade-in illustration-container relative group" data-tag={illustrateMatch[1].trim()}>
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
                        <div key={index} className="my-3 flex justify-center illustration-trigger-container" data-tag={illustrateMatch[1].trim()}>
                            <button onClick={() => onTriggerIllustration(illustrateMatch[1].trim())} title="Synthesize Clinical Illustration" className="group flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-brand-blue dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all text-[10px] font-black shadow-sm uppercase tracking-wider">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h14a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                {T.visualVerificationButton || "Synthesize Clinical Illustration"}
                            </button>
                        </div>
                    );
                }

                const diagramMatch = part.match(/\[DIAGRAM:\s*(.*?)\s*\]/i);
                if (diagramMatch && allowVisuals) {
                    if (diagramData) {
                        return (
                            <div key={index} className="my-6 h-[380px] border border-gray-100 dark:border-dark-border rounded-2xl overflow-hidden bg-white shadow-lg animate-fade-in interactive-diagram-container relative group" data-tag={diagramMatch[1].trim()}>
                                <InteractiveDiagram data={diagramData} id={`diag-${index}`} />
                                <div className="absolute top-2 right-12 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={(e) => {
                                            const svg = e.currentTarget.closest('.interactive-diagram-container')?.querySelector('svg');
                                            if (svg) {
                                                const svgData = new XMLSerializer().serializeToString(svg);
                                                const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
                                                const url = URL.createObjectURL(svgBlob);
                                                const link = document.createElement('a');
                                                link.href = url;
                                                link.download = `diagram_${diagramMatch[1].trim().replace(/\s+/g, '_')}.svg`;
                                                link.click();
                                            }
                                        }}
                                        className="p-1.5 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 text-gray-600 hover:text-brand-blue transition-colors"
                                        title="Download SVG"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    </button>
                                </div>
                            </div>
                        );
                    }
                    return (
                        <div key={index} className="my-3 flex justify-center diagram-trigger-container" data-tag={diagramMatch[1].trim()}>
                            <button onClick={() => onTriggerDiagram?.(diagramMatch[1].trim())} title="Synthesize Medical Diagram" className="group flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all text-[10px] font-black shadow-sm uppercase tracking-wider">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
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
            <div className="pt-2 border-t border-gray-50 dark:border-dark-border/10">
                <SourceRenderer text={content} groundingSources={groundingSources} />
            </div>
        </div>
    );
};
