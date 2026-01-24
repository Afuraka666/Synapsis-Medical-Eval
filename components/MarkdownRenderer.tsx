
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

/**
 * High-fidelity sanitization for medical text.
 * Converts LaTeX artifacts to Unicode and ensures proper word separation.
 */
const sanitizeContent = (text: string): string => {
    if (!text) return '';
    
    let cleaned = text
        // 1. Replace LaTeX commands with Unicode - USING STRICT WORD BOUNDARIES
        .replace(/\\rightarrow|\brightarrow\b/gi, ' → ')
        .replace(/\\leftarrow|\bleftarrow\b/gi, ' ← ')
        .replace(/\\Delta|\bDelta\b/g, ' Δ ')
        .replace(/\\alpha|\balpha\b/gi, ' α ')
        .replace(/\\beta|\bbeta\b/gi, ' β ')
        .replace(/\\gamma|\bgamma\b/gi, ' γ ')
        // FIX: Only replace the explicit LaTeX command. Never target 'mu' as a word boundary
        // to prevent corruption of words like 'muscle', 'mutation', etc.
        .replace(/\\mu\b/gi, ' μ ')
        .replace(/\\approx|\bapprox\b/gi, ' ≈ ')
        .replace(/\\pm|\bpm\b/gi, ' ± ')
        
        // 2. Clean up LaTeX escaping artifacts
        .replace(/\\\$/g, '$')           
        .replace(/\$\\/g, '')            
        .replace(/\\_/g, '_')            
        .replace(/\\\^/g, '^')           
        .replace(/\\\[/g, '[')           
        .replace(/\\\]/g, ']')           
        
        // 3. Normalize spacing and word separation
        .replace(/([\.!\?])([A-Z])/g, '$1 $2')
        .replace(/(\d)(mg|mcg|mL|mmHg|bpm|mmol|meq)/gi, '$1 $2')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        
        // 4. Unicode for medical variables
        .replace(/\bPaO2\b/g, 'PaO₂')
        .replace(/\bSaO2\b/g, 'SaO₂')
        .replace(/\bPvO2\b/g, 'PvO₂')
        .replace(/\bCO2\b/g, 'CO₂')
        .replace(/\bO2\b/g, 'O₂')
        .replace(/\bH2O\b/g, 'H₂O')
        .replace(/\bt1\/2\b/gi, 'T½')
        
        // 5. Final cleanup
        .replace(/\\/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        
        // 6. Fix bullet formatting
        .replace(/^\s*[\-\*]\s+/gm, '• ');

    return cleaned.trim();
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
    const cleanContent = useMemo(() => sanitizeContent(content), [content]);

    return (
        <ReactMarkdown
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeKatex]}
            className={`prose prose-sm max-w-none text-gray-800 dark:text-slate-200 ${className || ''}`}
            components={{
                a: ({ node, ...props }) => <a {...props} className="text-blue-600 dark:text-blue-400 hover:underline font-bold" target="_blank" rel="noopener noreferrer" />,
                p: ({ node, ...props }) => <p {...props} className="mb-4 last:mb-0 leading-relaxed font-serif" />,
                ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-5 mb-4 space-y-2" />,
                ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-5 mb-4 space-y-2" />,
                h1: ({ node, ...props }) => <h1 {...props} className="text-2xl font-black mt-6 mb-4 text-brand-blue dark:text-brand-blue-light" />,
                h2: ({ node, ...props }) => <h2 {...props} className="text-xl font-black mt-5 mb-3 text-gray-900 dark:text-slate-100 border-b-2 border-slate-100 dark:border-dark-border pb-1" />,
                h3: ({ node, ...props }) => <h3 {...props} className="text-lg font-black mt-4 mb-2 text-gray-800 dark:text-slate-200" />,
                blockquote: ({ node, ...props }) => <blockquote {...props} className="border-l-4 border-brand-blue/20 pl-4 italic my-4 bg-slate-50 dark:bg-slate-800/40 py-3 pr-3 text-gray-600 dark:text-slate-400 rounded-r-xl" />,
                table: ({ node, ...props }) => (
                    <div className="overflow-x-auto my-6 bg-white dark:bg-slate-900 shadow-sm border border-gray-200 dark:border-dark-border rounded-lg">
                        <table {...props} className="min-w-full border-collapse" />
                    </div>
                ),
                thead: ({ node, ...props }) => <thead {...props} className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-dark-border" />,
                th: ({ node, ...props }) => (
                    <th 
                        {...props} 
                        className="px-4 py-2 text-left text-xs font-black text-gray-700 dark:text-gray-200 uppercase tracking-tight border-r border-gray-100 dark:border-dark-border last:border-0" 
                    />
                ),
                td: ({ node, ...props }) => (
                    <td 
                        {...props} 
                        className="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 border-t border-r border-gray-100 dark:border-dark-border last:border-r-0 font-medium" 
                    />
                ),
                tr: ({ node, ...props }) => (
                    <tr 
                        {...props} 
                        className="transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/30" 
                    />
                ),
                code: ({ node, className, children, ...props }) => {
                    const isInline = !className;
                    return isInline ? (
                        <code {...props} className="bg-slate-100 dark:bg-slate-800 rounded-md px-1.5 py-0.5 text-xs font-mono font-bold text-blue-700 dark:text-blue-400">
                            {children}
                        </code>
                    ) : (
                        <code {...props} className={`${className} block p-4 rounded-xl bg-slate-900 text-slate-100 overflow-x-auto font-mono text-xs leading-relaxed`}>
                            {children}
                        </code>
                    )
                }
            }}
        >
            {cleanContent}
        </ReactMarkdown>
    );
};
