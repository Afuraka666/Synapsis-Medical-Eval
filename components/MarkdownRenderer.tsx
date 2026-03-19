
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
 * Converts specific LaTeX artifacts to Unicode while preserving complex math syntax.
 */
const sanitizeContent = (text: string): string => {
    if (!text) return '';
    
    let cleaned = text
        // 1. Replace specific common LaTeX commands with Unicode where they often appear in plain text
        .replace(/\\rightarrow/gi, ' → ')
        .replace(/\\leftarrow/gi, ' ← ')
        .replace(/\\Delta/g, ' Δ ')
        .replace(/\\alpha/gi, ' α ')
        .replace(/\\beta/gi, ' β ')
        .replace(/\\gamma/gi, ' γ ')
        .replace(/\\approx/gi, ' ≈ ')
        .replace(/\\pm/gi, ' ± ')
        .replace(/\\times/gi, ' × ')
        
        // 2. Clean up LaTeX escaping artifacts for characters that shouldn't be escaped in Markdown
        .replace(/\\_/g, '_')            
        .replace(/\\\^/g, '^')           
        .replace(/\\\[/g, '[')           
        .replace(/\\\]/g, ']')           
        
        // 3. Normalize spacing for medical units
        .replace(/(\d)(mg|mcg|mL|mmHg|bpm|mmol|meq)/gi, '$1 $2')
        
        // 4. Unicode for standard medical variables (only if not in math mode)
        .replace(/(?<!\$)\bPaO2\b(?!\$)/g, 'PaO₂')
        .replace(/(?<!\$)\bSaO2\b(?!\$)/g, 'SaO₂')
        .replace(/(?<!\$)\bPvO2\b(?!\$)/g, 'PvO₂')
        .replace(/(?<!\$)\bCO2\b(?!\$)/g, 'CO₂')
        .replace(/(?<!\$)\bO2\b(?!\$)/g, 'O₂')
        .replace(/(?<!\$)\bH2O\b(?!\$)/g, 'H₂O')
        .replace(/(?<!\$)\bt1\/2\b(?!\$)/gi, 'T½')
        
        // 5. Final cleanup
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        
        // 6. Recovery for lost backslashes in common LaTeX commands
        .replace(/(?<!\\)\b(text|frac|sqrt)\{/gi, (match, p1) => `\\${p1.toLowerCase()}{`)
        .replace(/(?:\\)?\btext(mg\/dl|mmol\/l|mmhg|meq\/l|bpm|mcg|ml|meq|pco|hco|pao|sao|pvo|o|co|h)(?=[^a-zA-Z]|$)/gi, '\\text{$1}')
        .replace(/\\text\{([a-zA-Z]+)_([0-9]+)(\^[a-zA-Z0-9\+\-]+)?\}/gi, '\\text{$1}_{$2}$3')
        
        // 7. Specific fix for Alveolar Gas Equation
        .replace(/P\(A-a\)O2/g, 'P(A-a)O₂')
        
        // 8. Ensure equations are wrapped in math blocks if they look like equations but aren't wrapped
        .replace(/(?<!\$)\b([PF]\(A-a\)O_{2}\s*=\s*[^$\n]+)(?!\$)/g, '$$$1$$');

    return cleaned.trim();
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
    const cleanContent = useMemo(() => sanitizeContent(content), [content]);

    return (
        <div className={`prose prose-sm max-w-none text-gray-900 dark:text-slate-100 ${className || ''}`}>
            <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    a: ({ node, ...props }) => <a {...props} className="text-blue-700 dark:text-blue-300 hover:underline font-bold" target="_blank" rel="noopener noreferrer" />,
                    p: ({ node, ...props }) => <p {...props} className="mb-4 last:mb-0 leading-relaxed font-serif text-gray-900 dark:text-slate-100" />,
                    ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-5 mb-4 space-y-2 text-gray-900 dark:text-slate-100" />,
                    ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-5 mb-4 space-y-2 text-gray-900 dark:text-slate-100" />,
                    li: ({ node, ...props }) => <li {...props} className="text-gray-900 dark:text-slate-100" />,
                    h1: ({ node, ...props }) => <h1 {...props} className="text-2xl font-black mt-6 mb-4 text-brand-blue dark:text-brand-blue-light" />,
                    h2: ({ node, ...props }) => <h2 {...props} className="text-xl font-black mt-5 mb-3 text-gray-900 dark:text-slate-100 border-b-2 border-slate-100 dark:border-dark-border pb-1" />,
                    h3: ({ node, ...props }) => <h3 {...props} className="text-lg font-black mt-4 mb-2 text-gray-900 dark:text-slate-100" />,
                    blockquote: ({ node, ...props }) => <blockquote {...props} className="border-l-4 border-brand-blue/20 pl-4 italic my-4 bg-slate-50 dark:bg-slate-800/40 py-3 pr-3 text-gray-700 dark:text-slate-300 rounded-r-xl" />,
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
        </div>
    );
};
