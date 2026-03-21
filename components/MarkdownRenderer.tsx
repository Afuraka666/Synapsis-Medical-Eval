
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';

interface MarkdownRendererProps {
    content: string;
    className?: string;
    compact?: boolean;
}

/**
 * High-fidelity sanitization for medical text.
 * Converts specific LaTeX artifacts to Unicode while preserving complex math syntax.
 */
const sanitizeContent = (text: string): string => {
    if (!text) return '';
    
    // 0. Unescape \$ if AI over-escaped it (common in JSON responses)
    let cleaned = text
        .replace(/\\\$/g, '$')
        // 0.1 Strip out custom visual tags that are handled by the UI
        .replace(/\[\s*(ILLUSTRATE|DIAGRAM|GRAPH):\s*.*?\s*\]/gi, '')
        .trim();

    // 0.2 Ensure tables have a double newline before them to be correctly parsed
    // We look for a line starting with | that is preceded by text on the previous line
    cleaned = cleaned.replace(/([^\n])\n\|/g, '$1\n\n|');

    // 1. Protect existing math blocks by temporarily replacing them
    const protectedBlocks: string[] = [];
    
    // Protect math blocks
    cleaned = cleaned.replace(/(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g, (match) => {
        protectedBlocks.push(match);
        return `__PROTECTED_BLOCK_${protectedBlocks.length - 1}__`;
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
        
        // 6. Recovery for lost backslashes in common LaTeX commands (outside math blocks)
        // Only do this if we still want to support some LaTeX, but the user wants Unicode.
        // Actually, let's skip this if we want to move away from LaTeX.
        
        // 7. REMOVED: Detect and wrap equations that look like LaTeX but aren't wrapped
        // We no longer want to force LaTeX wrapping as the user wants plain text with Unicode.
        
    // 8. Final cleanup (BEFORE restoring blocks to avoid mangling them)
    cleaned = cleaned
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/(^|\s)\$+(?!\d)(\s|$)/g, '$1$2') // Remove $ or $$ that are not followed by a digit
        .replace(/\\\$/g, '$'); // Final unescape

    // 9. Restore protected blocks (math)
    cleaned = cleaned.replace(/__PROTECTED_BLOCK_(\d+)__/g, (match, p1) => {
        let block = protectedBlocks[parseInt(p1)];
        
        // If it's a math block, fix common issues inside it
        // If the user wants NO $, we strip them and convert to plain text
        let unwrapped = block.replace(/^\$\$?|\$\$?$/g, '').trim();
        
        // Convert common LaTeX math commands to plain text/Unicode
        unwrapped = unwrapped
            .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1 / $2)')
            .replace(/\\left\(|\\right\)/g, '')
            .replace(/\\left\[|\\right\]/g, '[')
            .replace(/\\left\{|\\right\}/g, '{')
            .replace(/\\log_\{?(\d+)\}?/g, 'log$1')
            .replace(/\\times/g, ' × ')
            .replace(/\\cdot/g, ' · ')
            .replace(/\\pm/g, ' ± ')
            .replace(/\\approx/g, ' ≈ ')
            .replace(/\\Delta/g, ' Δ ')
            .replace(/\\rightarrow/g, ' → ')
            .replace(/\\leftarrow/g, ' ← ')
            .replace(/\\alpha/g, ' α ')
            .replace(/\\beta/g, ' β ')
            .replace(/\\gamma/g, ' γ ')
            .replace(/\\theta/g, ' θ ')
            .replace(/\\mu/g, ' μ ')
            .replace(/\\pi/g, ' π ')
            .replace(/\\sigma/g, ' σ ')
            .replace(/\\tau/g, ' τ ')
            .replace(/\\phi/g, ' φ ')
            .replace(/\\omega/g, ' ω ')
            .replace(/\\infty/g, ' ∞ ')
            .replace(/\\partial/g, ' ∂ ')
            .replace(/\\nabla/g, ' ∇ ')
            .replace(/\\sum/g, ' Σ ')
            .replace(/\\prod/g, ' Π ')
            .replace(/\\int/g, ' ∫ ')
            .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
            .replace(/\\text\{([^}]*)\}/g, '$1')
            .replace(/\\mathrm\{([^}]*)\}/g, '$1')
            .replace(/\\mathbf\{([^}]*)\}/g, '$1')
            .replace(/\\mathit\{([^}]*)\}/g, '$1')
            .replace(/\\mathsf\{([^}]*)\}/g, '$1')
            .replace(/\\mathtt\{([^}]*)\}/g, '$1')
            .replace(/\\mathcal\{([^}]*)\}/g, '$1')
            .replace(/\\mathbb\{([^}]*)\}/g, '$1');

        // Convert LaTeX subscripts/superscripts to Unicode
        return unwrapped
            .replace(/_\{?([0-9a-z\+\-\=])\}?/g, (m, p1) => {
                const subs: Record<string, string> = {
                    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
                    '+': '₊', '-': '₋', '=': '₌',
                    'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'
                };
                return subs[p1] || m;
            })
            .replace(/\^\{?([0-9a-z\+\-\=])\}?/g, (m, p1) => {
                const supers: Record<string, string> = {
                    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
                    '+': '⁺', '-': '⁻', '=': '₌',
                    'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ'
                };
                return supers[p1] || m;
            })
            .replace(/\\/g, ''); // Remove any remaining backslashes
    });

    return cleaned.trim();
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className, compact }) => {
    const cleanContent = useMemo(() => sanitizeContent(content), [content]);

    return (
        <div className={`prose prose-sm max-w-none text-gray-900 dark:text-slate-100 font-serif ${className || ''}`}>
            <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    a: ({ node, ...props }) => <a {...props} className="text-blue-700 dark:text-blue-300 hover:underline font-bold" target="_blank" rel="noopener noreferrer" />,
                    p: ({ node, ...props }) => <p {...props} className={`${compact ? 'mb-0' : 'mb-4 last:mb-0'} leading-relaxed font-serif text-gray-900 dark:text-slate-100`} />,
                    ul: ({ node, ...props }) => <ul {...props} className={`list-disc pl-5 ${compact ? 'mb-0' : 'mb-4'} space-y-2 text-gray-900 dark:text-slate-100`} />,
                    ol: ({ node, ...props }) => <ol {...props} className={`list-decimal pl-5 ${compact ? 'mb-0' : 'mb-4'} space-y-2 text-gray-900 dark:text-slate-100`} />,
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
