
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
    
    // 1. Protect existing math blocks by temporarily replacing them
    const mathBlocks: string[] = [];
    let cleaned = text.replace(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g, (match) => {
        mathBlocks.push(match);
        return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    });

    cleaned = cleaned
        // 2. Replace specific common LaTeX commands with Unicode ONLY if NOT in math mode
        .replace(/\\rightarrow/gi, ' → ')
        .replace(/\\leftarrow/gi, ' ← ')
        .replace(/\\Delta/g, ' Δ ')
        .replace(/\\alpha/gi, ' α ')
        .replace(/\\beta/gi, ' β ')
        .replace(/\\gamma/gi, ' γ ')
        .replace(/\\approx/gi, ' ≈ ')
        .replace(/\\pm/gi, ' ± ')
        .replace(/\\times/gi, ' × ')
        .replace(/\\cdot/gi, ' · ')
        
        // 3. Clean up LaTeX escaping artifacts for characters that shouldn't be escaped in Markdown
        .replace(/\\_/g, '_')            
        .replace(/\\\^/g, '^')           
        .replace(/\\\[/g, '[')           
        .replace(/\\\]/g, ']')           
        
        // 4. Normalize spacing for medical units
        .replace(/(\d)(mg|mcg|mL|mmHg|bpm|mmol|meq)/gi, '$1 $2')
        
        // 5. Unicode for standard medical variables (now safe because math is protected)
        .replace(/\bPaO2\b/g, 'PaO₂')
        .replace(/\bSaO2\b/g, 'SaO₂')
        .replace(/\bPvO2\b/g, 'PvO₂')
        .replace(/\bPaCO2\b/g, 'PaCO₂')
        .replace(/\bPvCO2\b/g, 'PvCO₂')
        .replace(/\bEtCO2\b/g, 'EtCO₂')
        .replace(/\bCO2\b/g, 'CO₂')
        .replace(/\bO2\b/g, 'O₂')
        .replace(/\bH2O\b/g, 'H₂O')
        .replace(/\bHCO3\b/g, 'HCO₃⁻')
        .replace(/\bt1\/2\b/gi, 'T½')
        .replace(/P\(A-a\)O2/g, 'P(A-a)O₂')
        
        // 6. Recovery for lost backslashes in common LaTeX commands
        .replace(/(?<!\\)\b(text|frac|sqrt|log|times|cdot|left|right|alpha|beta|gamma|delta|Delta|phi|pi|theta|mu|sigma|Sigma)\{/gi, (match, p1) => `\\${p1.toLowerCase()}{`)
        
        // 7. Detect and wrap equations that look like LaTeX but aren't wrapped
        // Matches things like: pH = pKa + \log_{10}... or E_k = ...
        .replace(/(?<![\w$])([a-zA-Z]+(?:_[a-zA-Z0-9]+)?\s*=\s*[^$\n]*\\[a-zA-Z]+[^$\n]+)(?![$\w])/g, '$$$1$$')
        // Matches standalone LaTeX commands like \frac{...}{...}
        .replace(/(?<![\w$])(\\[a-zA-Z]+\{[^$\n]+\})(?![$\w])/g, '$$$1$$')
        // Matches equations with subscripts/superscripts that might be LaTeX
        .replace(/(?<![\w$])([a-zA-Z]+_[0-9]+\s*=\s*[^$\n]+)(?![$\w])/g, '$$$1$$');

    // 8. Restore math blocks and fix Unicode subscripts inside them
    cleaned = cleaned.replace(/__MATH_BLOCK_(\d+)__/g, (match, p1) => {
        let block = mathBlocks[parseInt(p1)];
        // Convert Unicode subscripts/superscripts back to LaTeX for KaTeX compatibility
        return block
            .replace(/₀/g, '_0').replace(/₁/g, '_1').replace(/₂/g, '_2').replace(/₃/g, '_3').replace(/₄/g, '_4')
            .replace(/₅/g, '_5').replace(/₆/g, '_6').replace(/₇/g, '_7').replace(/₈/g, '_8').replace(/₉/g, '_9')
            .replace(/ₐ/g, '_a').replace(/ₑ/g, '_e').replace(/ₕ/g, '_h').replace(/ᵢ/g, '_i').replace(/ⱼ/g, '_j')
            .replace(/ₖ/g, '_k').replace(/ₗ/g, '_l').replace(/ₘ/g, '_m').replace(/ₙ/g, '_n').replace(/ₒ/g, '_o')
            .replace(/ₚ/g, '_p').replace(/ᵣ/g, '_r').replace(/ₛ/g, '_s').replace(/ₜ/g, '_t').replace(/ᵤ/g, '_u')
            .replace(/ᵥ/g, '_v').replace(/ₓ/g, '_x')
            .replace(/⁺/g, '^+').replace(/⁻/g, '^-')
            .replace(/⁰/g, '^0').replace(/¹/g, '^1').replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4')
            .replace(/⁵/g, '^5').replace(/⁶/g, '^6').replace(/⁷/g, '^7').replace(/⁸/g, '^8').replace(/⁹/g, '^9');
    });

    // 9. Final cleanup
    cleaned = cleaned
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n');

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
                    p: ({ node, ...props }) => <p {...props} className="mb-4 last:mb-0 leading-relaxed font-sans text-gray-900 dark:text-slate-100" />,
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
                            <code {...props} className="bg-slate-100 dark:bg-slate-800 rounded-md px-1.5 py-0.5 text-[1em] font-mono font-bold text-blue-700 dark:text-blue-400">
                                {children}
                            </code>
                        ) : (
                            <code {...props} className={`${className} block p-4 rounded-xl bg-slate-900 text-slate-100 overflow-x-auto font-mono text-sm leading-relaxed`}>
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
