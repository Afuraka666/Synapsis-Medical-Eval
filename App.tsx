
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// Components
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { PatientCaseView } from './components/PatientCaseView';
import { KnowledgeMap } from './components/KnowledgeMap';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LoadingOverlay } from './components/LoadingOverlay';
import { ErrorDisplay } from './components/ErrorDisplay';
import { SavedWorkModal } from './components/SavedWorkModal';
import { ShareModal } from './components/ShareModal';
import { ClinicalToolsModal } from './components/ClinicalToolsModal';
import { FeedbackModal } from './components/FeedbackModal';
import { TipsCarousel } from './components/TipsCarousel';
import { Footer } from './components/Footer';
import { EvaluationScreen } from './components/EvaluationScreen';
import { DiscussionModal } from './components/DiscussionModal';

// Services
import { 
    generateFullCase,
    generateEvidenceAndQuiz,
    getConceptAbstract
} from './services/geminiService';

// Types
import type { PatientCase, KnowledgeMapData, KnowledgeNode, SavedCase, Snippet, InteractionState, DisciplineSpecificConsideration, ChatMessage } from './types';

// i18n
import { translations, supportedLanguages } from './i18n';

// Hooks
import { useAnalytics } from './contexts/analytics';

// Helper: Decompresses a URL-safe Base64 string back into a JSON object
async function decodeAndDecompress(encodedString: string): Promise<any | null> {
    try {
        const base64 = encodedString.replace(/-/g, '+').replace(/_/g, '/');
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const stream = new Blob([bytes]).stream();
        const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
        const reader = decompressedStream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        const decompressedBlob = new Blob(chunks);
        const jsonString = await decompressedBlob.text();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Decompression failed:", error);
        return null;
    }
}

export const App: React.FC = () => {
    const { logEvent } = useAnalytics();

    // Core App State
    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingDetails, setIsGeneratingDetails] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [patientCase, setPatientCase] = useState<PatientCase | null>(null);
    const [mapData, setMapData] = useState<KnowledgeMapData | null>(null);

    // Theme State
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('ungana_theme');
        if (saved) return saved;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });

    // Knowledge Map State
    const [selectedNodeInfo, setSelectedNodeInfo] = useState<{ node: KnowledgeNode; abstract: string; loading: boolean } | null>(null);
    const [isMapFullscreen, setIsMapFullscreen] = useState(false);
    const knowledgeMapRef = useRef<{ captureAsImage: () => Promise<string> } | null>(null);

    // Internationalization State
    const [language, setLanguage] = useState(localStorage.getItem('ungana_language') || 'en');

    // Modal States
    const [isSavedWorkOpen, setIsSavedWorkOpen] = useState(false);
    const [isClinicalToolsOpen, setIsClinicalToolsOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [activeDiscussionTopic, setActiveDiscussionTopic] = useState<DisciplineSpecificConsideration | null>(null);

    // Saved Data State
    const [savedCases, setSavedCases] = useState<SavedCase[]>([]);
    const [savedSnippets, setSavedSnippets] = useState<Snippet[]>([]);

    // User Interaction Tracking
    const [interactionState, setInteractionState] = useState<InteractionState>({
        caseGenerated: false,
        caseEdited: false,
        caseSaved: false,
        snippetSaved: false,
        nodeClicks: 0,
    });
    
    const [generationCount, setGenerationCount] = useState(0);
    const [showEvaluationScreen, setShowEvaluationScreen] = useState(false);
    const [evaluationDaysRemaining, setEvaluationDaysRemaining] = useState<number | null>(null);
    const [mobileView, setMobileView] = useState<'case' | 'map'>('case');
    const caseScrollRef = useRef<HTMLDivElement>(null);

    // Automatically detect screen size and adjust layout state
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setMobileView('case');
                setIsMapFullscreen(false);
            }
        };
        
        // Initial check
        handleResize();
        
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const T = useMemo(() => {
        const selectedTranslation = translations[language];
        if (!selectedTranslation) return translations.en;
        return { ...translations.en, ...selectedTranslation };
    }, [language]);
    
    // -- EFFECTS --

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('ungana_theme', theme);
    }, [theme]);

    // MIGRATION Logic
    useEffect(() => {
        try {
            document.title = "Ungana Medical";
            
            const keysToMigrate = [
                'theme', 'language', 'saved_cases', 'saved_snippets', 
                'generation_count', 'trial_start_date', 'feedback_submitted',
                'generationHistory', 'dismissed_tips', 'respondent_id'
            ];

            keysToMigrate.forEach(key => {
                const oldKey = `synapsis_${key}`;
                const newKey = `ungana_${key}`;
                const oldValue = localStorage.getItem(oldKey);
                const newValue = localStorage.getItem(newKey);

                if (oldValue !== null && newValue === null) {
                    localStorage.setItem(newKey, oldValue);
                }
            });
        } catch (e) {
            console.error("Migration error:", e);
        }
    }, []);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('case')) return;
        try {
            const trialStartDateStr = localStorage.getItem('ungana_trial_start_date');
            const hasSubmitted = localStorage.getItem('ungana_feedback_submitted') === 'true';
            let trialStartDate: Date;
            if (trialStartDateStr) {
                trialStartDate = new Date(trialStartDateStr);
            } else {
                trialStartDate = new Date();
                localStorage.setItem('ungana_trial_start_date', trialStartDate.toISOString());
            }
            const now = new Date();
            const timeDiff = now.getTime() - trialStartDate.getTime();
            const daysElapsed = Math.floor(timeDiff / (1000 * 3600 * 24));
            const daysRemaining = 30 - daysElapsed;
            setEvaluationDaysRemaining(daysRemaining);
            if (daysRemaining <= 0 && !hasSubmitted) setShowEvaluationScreen(true);
        } catch (e) { console.error("Failed to process evaluation status", e); }
    }, []);
    
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('case')) return;
        try {
            const cases = JSON.parse(localStorage.getItem('ungana_saved_cases') || '[]');
            const snippets = JSON.parse(localStorage.getItem('ungana_saved_snippets') || '[]');
            const count = parseInt(localStorage.getItem('ungana_generation_count') || '0', 10);
            setSavedCases(cases);
            setSavedSnippets(snippets);
            setGenerationCount(count);
        } catch (e) { console.error("Failed to load data from localStorage", e); }
    }, []);
    
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const caseDataParam = urlParams.get('case');
        if (caseDataParam) {
            setIsLoading(true);
            setLoadingMessage('Loading shared case...');
            decodeAndDecompress(caseDataParam).then(decodedCase => {
                if (decodedCase) {
                    const pc = decodedCase as PatientCase;
                    setPatientCase(pc);
                    setMapData(pc.knowledgeMap || null); 
                } else {
                    setError('Failed to load the shared case. The link might be invalid.');
                }
                setIsLoading(false);
                window.history.replaceState({}, document.title, window.location.pathname);
            });
        }
    }, []);

    // -- HANDLERS --
    
    const handleLanguageChange = (langCode: string) => {
        setLanguage(langCode);
        localStorage.setItem('ungana_language', langCode);
    };

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const handleFeedbackSubmitted = () => {
        localStorage.setItem('ungana_feedback_submitted', 'true');
        setShowEvaluationScreen(false);
    };

    const handleGenerate = async (condition: string, discipline: string, difficulty: string) => {
        logEvent('generate_case', { condition, discipline, difficulty });
        setError(null);
        setIsLoading(true);
        setLoadingMessage(T.generatingCaseMessage(condition));
        setPatientCase(null);
        setMapData(null);
        setSelectedNodeInfo(null);
        setMobileView('case');

        try {
            // Start both in parallel for maximum speed
            const casePromise = generateFullCase(condition, discipline, difficulty, language);
            const evidencePromise = generateEvidenceAndQuiz(condition, discipline, difficulty, language);

            // Wait for core case first to show UI immediately
            const { patientCase: fullCase, knowledgeMap: fullMap } = await casePromise;
            
            setPatientCase(fullCase);
            setMapData(fullMap);
            setIsLoading(false);
            setIsGeneratingDetails(true); // Keep this for evidence/quiz loading state
            
            setGenerationCount(prev => {
                const count = prev + 1;
                localStorage.setItem('ungana_generation_count', String(count));
                return count;
            });
            
            // Wait for evidence and quiz (already running in parallel)
            try {
                const evidenceRes = await evidencePromise;
                if (evidenceRes && (evidenceRes.traceableEvidence || evidenceRes.quiz || evidenceRes.educationalContent)) {
                    setPatientCase(prev => prev ? { ...prev, ...evidenceRes } : null);
                } else {
                    // Fallback to empty arrays so sections at least show "No data" or are handled
                    setPatientCase(prev => prev ? { ...prev, traceableEvidence: [], educationalContent: [], quiz: [] } : null);
                }
            } catch (err) {
                console.error("Error generating evidence/quiz:", err);
                setPatientCase(prev => prev ? { ...prev, traceableEvidence: [], educationalContent: [], quiz: [] } : null);
            }
            
            setInteractionState(prev => ({ ...prev, caseGenerated: true, caseEdited: false, caseSaved: false, nodeClicks: 0, snippetSaved: false }));
        } catch (err: any) {
            console.error("Error generating case:", err);
            setError(T.errorService + " Details: " + (err.message || err.toString()));
            setIsLoading(false);
        } finally {
            setIsGeneratingDetails(false);
        }
    };

    const handleGenerateNew = () => {
        setPatientCase(null);
        setMapData(null);
        setError(null);
        setSelectedNodeInfo(null);
        setMobileView('case');
    };

    const handleNodeClick = useCallback(async (node: KnowledgeNode) => {
        logEvent('node_click', { node_label: node.label });
        setSelectedNodeInfo(prev => {
            if (prev?.node.id === node.id) return null;
            return { node, abstract: node.summary, loading: false };
        });
        setInteractionState(prev => ({...prev, nodeClicks: prev.nodeClicks + 1}));
    }, [logEvent]);
    
    const handleClearNodeSelection = useCallback(() => setSelectedNodeInfo(null), []);
    
    const generateId = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    };

    const handleSaveCase = () => {
        if (!patientCase || !mapData) return;
        logEvent('save_case', { case_title: patientCase.title });
        
        const caseId = patientCase.id || generateId();
        const newSavedCase: SavedCase = {
            id: caseId,
            title: patientCase.title,
            savedAt: new Date().toISOString(),
            caseData: { ...patientCase, id: caseId },
            mapData: mapData,
        };

        const existingIdx = savedCases.findIndex(c => c.id === caseId);
        let updatedCases;
        if (existingIdx >= 0) {
            updatedCases = [...savedCases];
            updatedCases[existingIdx] = newSavedCase;
        } else {
            updatedCases = [...savedCases, newSavedCase];
        }

        setSavedCases(updatedCases);
        localStorage.setItem('ungana_saved_cases', JSON.stringify(updatedCases));
        setPatientCase(newSavedCase.caseData);
        setInteractionState(prev => ({...prev, caseSaved: true }));
        alert('Case saved successfully!');
    };
    
    const handleLoadCase = (caseId: string) => {
        const caseToLoad = savedCases.find(c => c.id === caseId);
        if (caseToLoad) {
            setPatientCase(caseToLoad.caseData);
            setMapData(caseToLoad.mapData);
            setIsSavedWorkOpen(false);
            setMobileView('case');
        }
    };
    
    const handleDeleteCase = (caseId: string) => {
        const updatedCases = savedCases.filter(c => c.id !== caseId);
        setSavedCases(updatedCases);
        localStorage.setItem('ungana_saved_cases', JSON.stringify(updatedCases));
        if (patientCase?.id === caseId) {
            setPatientCase(prev => prev ? { ...prev, id: undefined } : null);
        }
    };

    const handleSaveSnippet = useCallback((title: string, content: string, visualData?: Partial<Snippet>) => {
        logEvent('save_snippet', { snippet_title: title });
        const newSnippet: Snippet = {
            id: generateId(),
            title,
            content,
            savedAt: new Date().toISOString(),
            ...visualData
        };
        setSavedSnippets(prev => {
            const updated = [...prev, newSnippet];
            localStorage.setItem('ungana_saved_snippets', JSON.stringify(updated));
            return updated;
        });
        setInteractionState(prev => ({ ...prev, snippetSaved: true }));
    }, [logEvent]);

    const handleSaveMapSnippet = useCallback(() => {
        if (!mapData || !patientCase) return;
        handleSaveSnippet(
            `Map: ${patientCase.title}`,
            `Knowledge relationship map for ${patientCase.title}.`,
            { mapData: mapData }
        );
        alert('Map saved to collection!');
    }, [mapData, patientCase, handleSaveSnippet]);

    const handleDeleteSnippet = (snippetId: string) => {
        const updatedSnippets = savedSnippets.filter(s => s.id !== snippetId);
        setSavedSnippets(updatedSnippets);
        localStorage.setItem('ungana_saved_snippets', JSON.stringify(updatedSnippets));
    };
    
    const handlePatientCaseUpdate = (updatedCase: PatientCase) => {
        setPatientCase(updatedCase);
        setInteractionState(prev => ({ ...prev, caseEdited: true }));
        
        // AUTO-PERSISTENCE: If this is a previously saved case, update it in the collection automatically
        if (updatedCase.id) {
            const existingIdx = savedCases.findIndex(c => c.id === updatedCase.id);
            if (existingIdx >= 0 && mapData) {
                const updatedSavedCase: SavedCase = {
                    ...savedCases[existingIdx],
                    caseData: updatedCase,
                    savedAt: new Date().toISOString(),
                };
                const newSavedCases = [...savedCases];
                newSavedCases[existingIdx] = updatedSavedCase;
                setSavedCases(newSavedCases);
                localStorage.setItem('ungana_saved_cases', JSON.stringify(newSavedCases));
            }
        }
    };

    const handleDiscussNode = useCallback((nodeInfo: { node: KnowledgeNode; abstract: string; loading: boolean }) => {
        if (nodeInfo.loading || !nodeInfo.abstract) return;
        logEvent('discuss_node', { node_label: nodeInfo.node.label });
        setActiveDiscussionTopic({
            aspect: `Concept: ${nodeInfo.node.label}`,
            consideration: `Discipline: ${nodeInfo.node.discipline}\n\n${nodeInfo.abstract}`
        });
        setSelectedNodeInfo(null);
    }, [logEvent]);

    const getKnowledgeMapImage = useCallback(async (): Promise<string | undefined> => {
        return await knowledgeMapRef.current?.captureAsImage();
    }, []);

    const handleDownloadMap = useCallback(async () => {
        const dataUrl = await getKnowledgeMapImage();
        if (dataUrl) {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `${patientCase?.title || 'knowledge-map'}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, [getKnowledgeMapImage, patientCase?.title]);

    if (showEvaluationScreen) return <EvaluationScreen T={T} onFeedbackSubmitted={handleFeedbackSubmitted} />;
    
    return (
        <div className="flex flex-col h-[100dvh] bg-gray-100 dark:bg-dark-bg font-sans transition-colors duration-300">
            <Header
                supportedLanguages={supportedLanguages}
                currentLanguage={language}
                onLanguageChange={handleLanguageChange}
                currentTheme={theme}
                onThemeToggle={toggleTheme}
                T={T}
                className="sticky top-0 z-30"
            />
            
            <main className="flex-grow p-2 sm:p-4 overflow-hidden relative flex flex-col">
                <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
                <div className="max-w-7xl mx-auto w-full h-full flex flex-col min-h-0 relative z-10">
                    <div className="flex-shrink-0 mb-3 sm:mb-4">
                        <ControlPanel
                            onGenerate={handleGenerate}
                            disabled={isLoading || isGeneratingDetails}
                            T={T}
                            language={language}
                            onSaveCase={handleSaveCase}
                            onOpenSavedWork={() => setIsSavedWorkOpen(true)}
                            onOpenClinicalTools={() => setIsClinicalToolsOpen(true)}
                            isCaseActive={!!patientCase}
                            onGenerateNew={handleGenerateNew}
                            mobileView={mobileView}
                            onSetMobileView={setMobileView}
                        />
                    </div>

                    <div className="hidden md:block flex-shrink-0 mb-4">
                        <TipsCarousel interactionState={interactionState} T={T} />
                    </div>
                    
                    {patientCase ? (
                        <div className="flex-grow min-h-0 relative flex flex-col overflow-hidden">
                            <div 
                                className="flex flex-grow w-full transition-transform duration-500 ease-in-out lg:transform-none lg:flex-row lg:gap-4 min-h-0"
                                style={{ transform: `translateX(${mobileView === 'map' ? '-100%' : '0%'})` }}
                            >
                                <div className="w-full flex-shrink-0 h-full lg:w-[62%] lg:flex-shrink min-h-0 flex flex-col">
                                    <div ref={caseScrollRef} className="flex-grow overflow-y-auto bg-white dark:bg-dark-surface rounded-2xl shadow-lg border border-gray-200 dark:border-dark-border">
                                        <PatientCaseView
                                            patientCase={patientCase}
                                            isGeneratingDetails={isGeneratingDetails}
                                            onSave={handlePatientCaseUpdate}
                                            language={language}
                                            T={T}
                                            onSaveSnippet={handleSaveSnippet}
                                            onOpenShare={() => setIsShareModalOpen(true)}
                                            onOpenDiscussion={(topic) => {
                                                logEvent('open_discussion', { topic_aspect: topic.aspect });
                                                setActiveDiscussionTopic(topic);
                                            }}
                                            onGetMapImage={getKnowledgeMapImage}
                                            mapData={mapData}
                                        />
                                    </div>
                                </div>
                                <div className="w-full flex-shrink-0 h-full flex flex-col lg:w-[38%] lg:flex-shrink min-h-0">
                                    {mapData ? (
                                        <div className="flex-grow min-h-0">
                                            <KnowledgeMap
                                                ref={knowledgeMapRef}
                                                data={mapData}
                                                onNodeClick={handleNodeClick}
                                                selectedNodeInfo={selectedNodeInfo}
                                                onClearSelection={handleClearNodeSelection}
                                                isMapFullscreen={isMapFullscreen}
                                                setIsMapFullscreen={setIsMapFullscreen}
                                                caseTitle={patientCase.title}
                                                language={language}
                                                T={T}
                                                onDiscussNode={handleDiscussNode}
                                                onSaveMap={handleSaveMapSnippet}
                                                onDownloadMap={handleDownloadMap}
                                            />
                                        </div>
                                    ) : isGeneratingDetails ? (
                                        <div className="w-full h-full flex items-center justify-center bg-white dark:bg-dark-surface rounded-2xl shadow-lg border border-gray-200 dark:border-dark-border p-8 text-center text-dark-text">
                                            <LoadingOverlay message={T.buildingMapMessage} subMessages={[]} />
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ) : (
                        !isLoading && <div className="flex-grow overflow-y-auto px-1">
                            <WelcomeScreen 
                                T={T} 
                                onOpenSavedWork={() => setIsSavedWorkOpen(true)}
                                onOpenClinicalTools={() => setIsClinicalToolsOpen(true)}
                            />
                        </div>
                    )}

                    {isLoading && <LoadingOverlay message={loadingMessage} subMessages={T.loadingSubMessages} />}
                    {error && <div className="mt-4"><ErrorDisplay message={error} /></div>}
                </div>
            </main>
            
            <SavedWorkModal
                isOpen={isSavedWorkOpen}
                onClose={() => setIsSavedWorkOpen(false)}
                savedCases={savedCases}
                onLoadCase={handleLoadCase}
                onDeleteCase={handleDeleteCase}
                savedSnippets={savedSnippets}
                onDeleteSnippet={handleDeleteSnippet}
                T={T}
                language={language}
            />

             <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                patientCase={patientCase}
                T={T}
            />
            
            <ClinicalToolsModal
                isOpen={isClinicalToolsOpen}
                onClose={() => setIsClinicalToolsOpen(false)}
                T={T}
                language={language}
            />

            <FeedbackModal
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                T={T}
            />

            {activeDiscussionTopic && (
                <DiscussionModal
                    isOpen={!!activeDiscussionTopic}
                    onClose={() => setActiveDiscussionTopic(null)}
                    topic={activeDiscussionTopic}
                    topicId={activeDiscussionTopic.aspect}
                    caseTitle={patientCase?.title || 'this case'}
                    language={language}
                    T={T}
                    initialHistory={patientCase?.discussions?.[activeDiscussionTopic.aspect]}
                    onSaveDiscussion={(topicId, messages) => {
                        if (patientCase) {
                            const updatedDiscussions = { ...(patientCase.discussions || {}), [topicId]: messages };
                            handlePatientCaseUpdate({ ...patientCase, discussions: updatedDiscussions });
                        }
                    }}
                />
            )}

            <Footer
                T={T}
                evaluationDaysRemaining={evaluationDaysRemaining}
                onOpenFeedback={() => setIsFeedbackModalOpen(true)}
                className="sticky bottom-0 z-20"
            />
        </div>
    );
};
