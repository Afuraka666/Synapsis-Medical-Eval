
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Network } from 'lucide-react';

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
    generateFullCaseStream,
    generateEvidenceAndQuiz,
    generateKnowledgeMap,
    getConceptAbstract
} from './services/geminiService';

// DB
import { db } from './db';
import { useLiveQuery } from 'dexie-react-hooks';

// Types
import type { PatientCase, KnowledgeMapData, KnowledgeNode, KnowledgeLink, SavedCase, Snippet, InteractionState, DisciplineSpecificConsideration, ChatMessage } from './types';

// i18n
import { translations, supportedLanguages } from './i18n';

// Hooks
import { useAnalytics } from './contexts/analytics';
import { ContentDensityProvider, useContentDensity } from './contexts/ContentDensityContext';
import { useCollaboration } from './contexts/CollaborationContext';
import { useResponsive } from './hooks/useResponsive';
import { useToast } from './contexts/ToastContext';

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
    const { isMobile: isMobileResp, isTablet, isDesktop: isDesktopResp } = useResponsive();
    const { joinRoom, broadcastUpdate, remoteUpdate, isConnected, roomId } = useCollaboration();
    const { addToast } = useToast();

    // Core App State
    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingDetails, setIsGeneratingDetails] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [patientCase, setPatientCase] = useState<PatientCase | null>(null);
    const [mapData, setMapData] = useState<KnowledgeMapData | null>(null);

    // Theme State
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        const saved = localStorage.getItem('ungana_theme');
        if (saved === 'light' || saved === 'dark') return saved;
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

    // Saved Data State from IndexedDB
    const savedCasesRaw = useLiveQuery(() => db.patientCases.toArray());
    const savedCases = useMemo(() => {
        if (!savedCasesRaw) return [];
        return savedCasesRaw.map(c => ({
            id: c.id?.toString() || '',
            title: c.title,
            savedAt: c.savedAt || new Date().toISOString(),
            caseData: c,
            mapData: c.knowledgeMap || { nodes: [], links: [] }
        }));
    }, [savedCasesRaw]);

    const savedSnippetsRaw = useLiveQuery(() => db.snippets.toArray());
    const savedSnippets = useMemo(() => {
        return savedSnippetsRaw || [];
    }, [savedSnippetsRaw]);

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

    useEffect(() => {
        // Force a window resize event to trigger KnowledgeMap recalculation when switching views
        // This is crucial for D3 simulations that depend on container dimensions
        const timer = setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 150); // Slightly longer delay for better stability
        return () => clearTimeout(timer);
    }, [mobileView, isDesktopResp]); // Also trigger when desktop mode changes
    const caseScrollRef = useRef<HTMLDivElement>(null);
    const { density, isDesktop, size, orientation, isMobile } = useContentDensity();

    // Automatically detect screen size and adjust layout state
    const wasDesktop = useRef(isDesktopResp);
    useEffect(() => {
        if (isDesktopResp && !wasDesktop.current) {
            setMobileView('case');
            setIsMapFullscreen(false);
        }
        wasDesktop.current = isDesktopResp;
    }, [isDesktopResp]);

    // Handle mobile orientation changes for better layout
    useEffect(() => {
        if (isMobile && orientation === 'landscape') {
            // In landscape mobile, maybe we want a different default? 
            // For now, just ensuring consistency
        }
    }, [isMobile, orientation]);

    const T = useMemo(() => {
        const selectedTranslation = translations[language];
        if (!selectedTranslation) return translations.en;
        return { ...translations.en, ...selectedTranslation };
    }, [language]);
    
    const lastSyncedCaseRef = useRef<string>('');

    // -- EFFECTS --

    // Sync with remote updates
    useEffect(() => {
        if (remoteUpdate) {
            const remoteStr = JSON.stringify(remoteUpdate);
            if (remoteStr !== lastSyncedCaseRef.current) {
                lastSyncedCaseRef.current = remoteStr;
                setPatientCase(remoteUpdate);
                if (remoteUpdate.knowledgeMap) {
                    const mapStr = JSON.stringify(remoteUpdate.knowledgeMap);
                    if (mapStr !== JSON.stringify(mapData)) {
                        setMapData(remoteUpdate.knowledgeMap);
                    }
                }
            }
        }
    }, [remoteUpdate, mapData]);

    // Broadcast local updates
    useEffect(() => {
        if (patientCase && roomId) {
            const caseStr = JSON.stringify(patientCase);
            if (caseStr !== lastSyncedCaseRef.current) {
                lastSyncedCaseRef.current = caseStr;
                broadcastUpdate(patientCase);
            }
        }
    }, [patientCase, roomId, broadcastUpdate]);

    // Keep mapData in sync with patientCase.knowledgeMap if it changes elsewhere
    useEffect(() => {
        if (patientCase?.knowledgeMap) {
            const caseMapStr = JSON.stringify(patientCase.knowledgeMap);
            const currentMapStr = JSON.stringify(mapData);
            if (caseMapStr !== currentMapStr) {
                setMapData(patientCase.knowledgeMap);
            }
        }
    }, [patientCase?.knowledgeMap, mapData]);

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
            const count = parseInt(localStorage.getItem('ungana_generation_count') || '0', 10);
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
            // Use Streaming for the core case
            const stream = generateFullCaseStream(condition, discipline, difficulty, language);
            
            for await (const update of stream) {
                if (update.partialText) {
                    // We could show partial text if we had a dedicated "Live Feed" component
                    // For now, we just wait for the final case to be parsed
                }
                if (update.finalCase) {
                    const fullCase = update.finalCase as PatientCase;
                    setPatientCase(fullCase);
                    setIsLoading(false);
                    setIsGeneratingDetails(true);
                    
                    // Start evidence generation in background
                    generateEvidenceAndQuiz(condition, discipline, difficulty, language).then(evidenceRes => {
                        if (evidenceRes) {
                            setPatientCase(prev => prev ? { ...prev, ...evidenceRes } : null);
                        }
                    }).catch(err => {
                        console.error("Evidence generation error:", err);
                    });

                    // Start knowledge map generation in background
                    generateKnowledgeMap(condition, discipline, difficulty, language).then(mapRes => {
                        if (mapRes) {
                            setMapData(mapRes);
                            setPatientCase(prev => prev ? { ...prev, knowledgeMap: mapRes } : null);
                        }
                        setIsGeneratingDetails(false);
                    }).catch(err => {
                        console.error("Knowledge map generation error:", err);
                        setIsGeneratingDetails(false);
                    });
                }
            }
            
            setGenerationCount(prev => {
                const count = prev + 1;
                localStorage.setItem('ungana_generation_count', String(count));
                return count;
            });
            
            setInteractionState(prev => ({ ...prev, caseGenerated: true, caseEdited: false, caseSaved: false, nodeClicks: 0, snippetSaved: false }));
        } catch (err: any) {
            console.error("Error generating case:", err);
            setError(T.errorService + " Details: " + (err.message || err.toString()));
            setIsLoading(false);
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

    const handleSaveCase = async () => {
        if (!patientCase) return;
        logEvent('save_case', { case_title: patientCase.title });
        
        const caseId = patientCase.id || generateId();
        const caseToSave = {
            ...patientCase,
            id: caseId,
            timestamp: Date.now(),
            knowledgeMap: mapData || patientCase.knowledgeMap
        };

        try {
            await db.patientCases.put(caseToSave);
            setPatientCase(caseToSave);
            setInteractionState(prev => ({...prev, caseSaved: true }));
        } catch (e) {
            console.error("Save error:", e);
        }
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
    
    const handleDeleteCase = async (caseId: string) => {
        try {
            await db.patientCases.delete(caseId);
            if (patientCase?.id === caseId) {
                setPatientCase(prev => prev ? { ...prev, id: undefined } : null);
            }
        } catch (e) {
            console.error("Delete error:", e);
        }
    };

    const handleSaveSnippet = useCallback(async (title: string, content: string, visualData?: Partial<Snippet>) => {
        logEvent('save_snippet', { snippet_title: title });
        const newSnippet: Snippet = {
            id: generateId(),
            title,
            content,
            savedAt: new Date().toISOString(),
            ...visualData
        };
        try {
            await db.snippets.add(newSnippet);
            setInteractionState(prev => ({ ...prev, snippetSaved: true }));
        } catch (e) {
            console.error("Save snippet error:", e);
        }
    }, [logEvent]);

    const handleSaveMapSnippet = useCallback(() => {
        if (!mapData || !patientCase) return;
        handleSaveSnippet(
            `Map: ${patientCase.title}`,
            `Knowledge relationship map for ${patientCase.title}.`,
            { mapData: mapData }
        );
        addToast('Map saved to collection!', 'success');
    }, [mapData, patientCase, handleSaveSnippet, addToast]);

    const handleDeleteSnippet = async (snippetId: string) => {
        try {
            await db.snippets.delete(snippetId);
        } catch (e) {
            console.error("Delete snippet error:", e);
        }
    };

    const handleImportCase = async (caseData: PatientCase) => {
        try {
            // Ensure the case has an ID and timestamp
            const caseToSave = {
                ...caseData,
                id: caseData.id || generateId(),
                timestamp: caseData.timestamp || Date.now()
            };
            await db.patientCases.put(caseToSave);
            logEvent('import_case', { case_title: caseToSave.title });
        } catch (e) {
            console.error("Import case error:", e);
        }
    };
    
    const handlePatientCaseUpdate = async (updatedCase: PatientCase) => {
        setPatientCase(updatedCase);
        setInteractionState(prev => ({ ...prev, caseEdited: true }));
        
        // AUTO-PERSISTENCE: If this is a previously saved case, update it in the collection automatically
        if (updatedCase.id) {
            try {
                await db.patientCases.put({
                    ...updatedCase,
                    knowledgeMap: mapData || updatedCase.knowledgeMap,
                    timestamp: Date.now()
                });
            } catch (e) {
                console.error("Auto-persistence error:", e);
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

    const handleAddNode = useCallback((node: KnowledgeNode) => {
        if (mapData) {
            setMapData({
                ...mapData,
                nodes: [...mapData.nodes, node]
            });
            logEvent('map_node_added', { node_label: node.label });
        }
    }, [mapData, logEvent]);

    const handleAddLink = useCallback((link: KnowledgeLink) => {
        if (mapData) {
            setMapData({
                ...mapData,
                links: [...mapData.links, link]
            });
            logEvent('map_link_added', { source: link.source, target: link.target });
        }
    }, [mapData, logEvent]);

    const handleJoinCollaboration = useCallback(() => {
        const id = prompt('Enter Room ID to join or create:', roomId || Math.random().toString(36).substring(7));
        if (id) {
            joinRoom(id);
            logEvent('collaboration_joined', { room_id: id });
        }
    }, [joinRoom, roomId, logEvent]);

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
                onCollaborate={handleJoinCollaboration}
                isCollaborating={!!roomId}
                T={T}
                isCompact={!!patientCase}
                className="sticky top-0 z-30"
            />
            
            <main className={`flex-grow overflow-hidden relative flex flex-col transition-all duration-500 ${
                !!patientCase ? 'p-1 sm:p-2' :
                density === 'compact' ? 'p-1 sm:p-2' : 
                density === 'relaxed' ? 'p-4 sm:p-8' : 
                'p-2 sm:p-4'
            }`}>
                <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
                <div className="max-w-7xl mx-auto w-full h-full flex flex-col min-h-0 relative z-10">
                    <div className={`flex-shrink-0 transition-all duration-300 ${!!patientCase ? 'mb-2' : 'mb-3 sm:mb-4'}`}>
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

                    <div className={`hidden md:block flex-shrink-0 transition-all duration-300 ${!!patientCase ? 'h-0 overflow-hidden mb-0 opacity-0' : 'mb-4 opacity-100'}`}>
                        <TipsCarousel interactionState={interactionState} T={T} />
                    </div>
                    
                    {patientCase ? (
                        <div className="flex-grow min-h-0 relative flex flex-col overflow-hidden">
                            <div 
                                className="flex flex-grow w-full transition-transform duration-500 ease-in-out lg:transform-none lg:flex-row lg:gap-4 min-h-0 h-full"
                                style={!isDesktopResp ? { 
                                    transform: `translateX(${mobileView === 'map' ? '-100%' : '0%'})`,
                                    width: '200%',
                                    display: 'flex',
                                    flexDirection: 'row'
                                } : {}}
                            >
                                {/* Case View Container */}
                                <div className={`w-full flex-shrink-0 h-full lg:w-[62%] lg:flex-shrink min-h-0 flex flex-col transition-opacity duration-300 ${!isDesktopResp && mobileView === 'map' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
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

                                {/* Map View Container */}
                                <div className={`w-full flex-shrink-0 h-full flex flex-col lg:w-[38%] lg:flex-shrink min-h-0 relative transition-opacity duration-300 ${!isDesktopResp && mobileView === 'case' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                                    {/* Knowledge Map Label for Desktop */}
                                    <div className="hidden lg:flex absolute -top-6 left-0 items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
                                        <Network className="w-3 h-3" />
                                        <span>{T.knowledgeMapTitle || 'Knowledge Map'}</span>
                                    </div>
                                    
                                    {mapData ? (
                                        <div className="flex-grow h-full min-h-0 flex flex-col">
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
                                                theme={theme}
                                                T={T}
                                                onDiscussNode={handleDiscussNode}
                                                onSaveMap={handleSaveMapSnippet}
                                                onDownloadMap={handleDownloadMap}
                                                onAddNode={handleAddNode}
                                                onAddLink={handleAddLink}
                                            />
                                        </div>
                                    ) : isGeneratingDetails ? (
                                        <div className="flex-grow h-full flex items-center justify-center bg-white dark:bg-dark-surface rounded-2xl shadow-lg border border-gray-200 dark:border-dark-border p-8 text-center text-dark-text">
                                            <LoadingOverlay message={T.buildingMapMessage} subMessages={[]} />
                                        </div>
                                    ) : (
                                        <div className="flex-grow h-full flex flex-col items-center justify-center bg-white dark:bg-dark-surface rounded-2xl shadow-lg border border-gray-200 dark:border-dark-border p-8 text-center">
                                            <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-full mb-4">
                                                <Network className="w-8 h-8 text-gray-300 dark:text-slate-600" />
                                            </div>
                                            <h3 className="text-lg font-medium text-gray-900 dark:text-slate-200 mb-2">{T.mapNotReadyTitle || "Knowledge Map"}</h3>
                                            <p className="text-sm text-gray-500 dark:text-slate-400 max-w-xs">{T.mapNotReadyDesc || "The interactive knowledge map is being prepared. It will appear here shortly."}</p>
                                        </div>
                                    )}
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
                onImportCase={handleImportCase}
                T={T}
                language={language}
                theme={theme}
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
                isCompact={!!patientCase}
                className="sticky bottom-0 z-20"
            />
        </div>
    );
};
