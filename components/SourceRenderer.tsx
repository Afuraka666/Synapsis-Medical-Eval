
import React from 'react';

interface SourceRendererProps {
    text: string;
    groundingSources?: any[];
    onSearchClick?: () => void;
}

export const SourceRenderer: React.FC<SourceRendererProps> = ({ text, groundingSources, onSearchClick }) => {
    const pmidRegex = /(\bPMID:?\s*\d{7,8}\b)/gi;
    const doiRegex = /(\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b)/gi;
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    const pmids = text.match(pmidRegex) || [];
    const dois = text.match(doiRegex) || [];
    
    // Remove PMIDs and DOIs from text for URL matching to avoid duplicates
    let textForUrls = text;
    pmids.forEach(p => textForUrls = textForUrls.replace(p, ''));
    dois.forEach(d => textForUrls = textForUrls.replace(d, ''));
    const urls = textForUrls.match(urlRegex) || [];

    // Extract URLs and Maps from groundingSources
    const groundingUrls = (groundingSources || []).map(gs => gs.web?.uri).filter(Boolean);
    const groundingMaps = (groundingSources || []).map(gs => gs.maps?.uri).filter(Boolean);
    const allUrls = Array.from(new Set([...urls, ...groundingUrls]));
    const allMaps = Array.from(new Set(groundingMaps));

    const hasLinks = pmids.length > 0 || dois.length > 0 || allUrls.length > 0 || allMaps.length > 0;

    return (
        <div className="flex flex-col gap-1.5">
            <div className="text-[10px] leading-relaxed text-gray-600 dark:text-gray-400">
                {text}
            </div>
            {hasLinks && (
                <div className="flex flex-wrap items-center gap-2">
                    {pmids.map((pmidStr, index) => {
                        const pmid = pmidStr.match(/\d+/)?.[0];
                        return (
                            <a 
                                key={`pmid-${index}`}
                                href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 hover:bg-blue-100 transition flex items-center gap-1 text-[9px] font-bold"
                            >
                                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
                                PMID {pmid}
                            </a>
                        );
                    })}
                    {dois.map((doi, index) => (
                        <a 
                            key={`doi-${index}`}
                            href={`https://doi.org/${doi}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 hover:bg-indigo-100 transition flex items-center gap-1 text-[9px] font-bold"
                        >
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
                            DOI
                        </a>
                    ))}
                    {allUrls.map((url, index) => {
                        const cleanUrl = url.replace(/[.,;)]$/, '');
                        return (
                            <a 
                                key={`url-${index}`}
                                href={cleanUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100 hover:bg-emerald-100 transition flex items-center gap-1 text-[9px] font-bold"
                            >
                                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
                                Link
                            </a>
                        );
                    })}
                    {allMaps.map((url, index) => (
                        <a 
                            key={`map-${index}`}
                            href={url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 hover:bg-amber-100 transition flex items-center gap-1 text-[9px] font-bold"
                        >
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                            Map
                        </a>
                    ))}
                    {onSearchClick && (
                        <button 
                            onClick={onSearchClick} 
                            title="Deep Search for Source"
                            className="p-1 rounded-full text-gray-400 hover:text-brand-blue hover:bg-white transition shadow-sm border border-transparent hover:border-gray-100"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                            </svg>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
