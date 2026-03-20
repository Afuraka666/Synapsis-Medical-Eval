
import React, { useState, useEffect, useRef } from 'react';
import { 
    X, 
    Maximize, 
    Minimize, 
    Download, 
    FileText, 
    FileType, 
    Mic, 
    MicOff, 
    Send, 
    Save, 
    Activity,
    Share2,
    Minus,
    MessageSquare,
    Info,
    ChevronDown
} from 'lucide-react';
import type { DisciplineSpecificConsideration, ChatMessage, DiagramData, EducationalContent } from '../types';
import { EducationalContentType } from '../types';
import { GoogleGenAI, GenerateContentResponse, ThinkingLevel } from "@google/genai";
import { retryWithBackoff, generateDiagramForDiscussion } from '../services/geminiService';
import { InteractiveDiagram } from './InteractiveDiagram';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ImageGenerator } from './ImageGenerator';
import { SourceRenderer } from './SourceRenderer';
import { ScientificGraph } from './ScientificGraph';
import { AudioVisualizer } from './AudioVisualizer';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import { useAnalytics } from '../contexts/analytics';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

const GRAPH_TITLES: Record<string, string> = {
    'oxygen_dissociation': 'hemoglobinOxygenCurve',
    'frank_starling': 'frankStarlingModel',
    'pressure_volume_loop': 'pressureVolumeLoop',
    'respiratory_flow_volume': 'respiratoryFlowVolume',
    'cerebral_pressure_volume': 'monroKellieRelationship',
    'cerebral_autoregulation': 'cerebralAutoregulationCurve',
    'capnography': 'capnographyAnalysis',
    'spirometry': 'spirometryVolumeTime'
};

const getBCP47Language = (lang: string): string => {
    const map: Record<string, string> = {
        'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR', 'zh': 'zh-CN', 'hi': 'hi-IN',
        'sw': 'sw-KE', 'sn': 'sn-ZW', 'nd': 'nd-ZW', 'bem': 'en-ZM', 'ny': 'ny-MW',
        'ar': 'ar-SA', 'pt': 'pt-PT', 'ru': 'ru-RU', 'tn': 'tn-ZA', 'el': 'el-GR',
    };
    return map[lang] || 'en-US';
};

const captureSvgAsBase64 = async (svgElement: SVGSVGElement): Promise<string> => {
    return new Promise((resolve) => {
        const xml = new XMLSerializer().serializeToString(svgElement);
        const svg64 = btoa(unescape(encodeURIComponent(xml)));
        const b64Start = 'data:image/svg+xml;base64,';
        const image64 = b64Start + svg64;
        
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 2; 
            canvas.width = svgElement.clientWidth * scale;
            canvas.height = svgElement.clientHeight * scale;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(scale, scale);
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png', 1.0));
            } else resolve('');
        };
        img.src = image64;
    });
};

const cleanTextForDownload = (text: string): string => {
    return text
        .replace(/\[ILLUSTRATE:.*?\]/g, '')
        .replace(/\[DIAGRAM:.*?\]/g, '')
        .replace(/\[GRAPH:.*?\]/g, '')
        .replace(/\\\$/g, '$')
        .replace(/\$\\/g, '')
        .replace(/\\/g, '') 
        .replace(/\bPaO2\b/g, 'PaO₂')
        .replace(/\bSaO2\b/g, 'SaO₂')
        .replace(/\bPvO2\b/g, 'PvO₂')
        .replace(/\bCO2\b/g, 'CO₂')
        .replace(/\bO2\b/g, 'O₂')
        .replace(/\bH2O\b/g, 'H₂O')
        .replace(/\bt1\/2\b/gi, 'T½')
        .replace(/\*/g, '')
        .replace(/__/g, '')
        .replace(/#/g, '')
        .trim();
};

function parseMarkdownTable(text: string) {
    const lines = text.trim().split('\n');
    if (lines.length < 3) return null;
    
    // Improved parsing to handle empty cells and varying pipe configurations
    const rows = lines
        .filter(line => line.trim().startsWith('|'))
        .map(line => {
            const parts = line.trim().split('|');
            // Remove first and last empty parts if they exist (due to leading/trailing pipes)
            if (parts[0] === '') parts.shift();
            if (parts[parts.length - 1] === '') parts.pop();
            return parts.map(cell => cell.trim());
        });
        
    if (rows.length < 2) return null;
    
    const header = rows[0];
    // rows[1] is the separator row
    const data = rows.slice(2);
    
    if (header.length === 0) return null;
    return { header, data };
}

function splitMessageContent(text: string) {
    const parts: {type: 'text' | 'table', content?: string, table?: {header: string[], data: string[][]}}[] = [];
    const lines = text.split('\n');
    let currentText = '';
    let inTable = false;
    let tableLines: string[] = [];

    const isTableLine = (line: string) => line.trim().includes('|');
    const isSeparator = (line: string) => line.trim().match(/^[|:\s-]*$/) && line.trim().includes('-') && line.trim().includes('|');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (isTableLine(line)) {
            if (!inTable) {
                // Check if this is a header followed by a separator
                const nextLine = lines[i+1];
                if (nextLine && isSeparator(nextLine)) {
                    if (currentText.trim()) parts.push({type: 'text', content: currentText.trim()});
                    currentText = '';
                    inTable = true;
                    tableLines = [line];
                } else {
                    currentText += (currentText ? '\n' : '') + line;
                }
            } else {
                tableLines.push(line);
            }
        } else {
            if (inTable) {
                const table = parseMarkdownTable(tableLines.join('\n'));
                if (table) parts.push({type: 'table', table});
                else currentText += (currentText ? '\n' : '') + tableLines.join('\n');
                inTable = false;
                tableLines = [];
            }
            currentText += (currentText ? '\n' : '') + line;
        }
    }
    if (inTable) {
        const table = parseMarkdownTable(tableLines.join('\n'));
        if (table) parts.push({type: 'table', table});
        else currentText += (currentText ? '\n' : '') + tableLines.join('\n');
    }
    if (currentText.trim()) parts.push({type: 'text', content: currentText.trim()});
    return parts;
}

interface DiscussionModalProps {
    isOpen: boolean;
    onClose: () => void;
    topic: DisciplineSpecificConsideration;
    topicId: string;
    caseTitle: string;
    language: string;
    T: Record<string, any>;
    initialHistory?: ChatMessage[];
    onSaveDiscussion: (topicId: string, messages: ChatMessage[]) => void;
}

const LoadingSpinner: React.FC = () => (
    <div className="flex items-center gap-1.5 px-2">
        <div className="w-1.5 h-1.5 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
        <div className="w-1.5 h-1.5 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-1.5 h-1.5 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
    </div>
);

export const DiscussionModal: React.FC<DiscussionModalProps> = ({ 
    isOpen, onClose, topic, topicId, caseTitle, language, T, initialHistory, onSaveDiscussion 
}) => {
    const { logEvent } = useAnalytics();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMinimised, setIsMinimised] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [activeImagePrompt, setActiveImagePrompt] = useState<{prompt: string, index: number} | null>(null);
    const chatRef = useRef<any>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const shareMenuRef = useRef<HTMLDivElement | null>(null);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);

            const getSystemInstruction = () => `You are an expert medical tutor. Facilitate a deep Socratic discussion about "${topic.aspect}" for "${caseTitle}". 
            
            **VISUAL PREFERENCE & PHYSIOLOGICAL FIDELITY (MANDATORY):**
            Do NOT explain physiological curves in text. You MUST use visual triggers:
            1. **PHYSIOLOGY GRAPHS:** Use [GRAPH: type] tags. 
               - Available types: oxygen_dissociation, frank_starling, pressure_volume_loop (CARDIAC ONLY), respiratory_flow_volume (RESPIRATORY ONLY), cerebral_pressure_volume, cerebral_autoregulation, capnography, spirometry.
               - **IMPORTANT:** Use 'respiratory_flow_volume' for airway mechanics, NEVER 'pressure_volume_loop'.
            2. **CLINICAL ALGORITHMS:** Use [DIAGRAM: specific description] for treatment cascades or anatomical pathways.
            3. **DATA COMPARISON:** Use Markdown Tables for lab ranges, drug properties, or differential signs.
            
            **STRICT FORMATTING (CRITICAL):**
            1. **NO LATEX:** Do NOT use LaTeX or dollar signs ($ or $$) for equations.
            2. **UNICODE SUBSCRIPTS/SUPERSCRIPTS:** You MUST use Unicode characters for all subscripts and superscripts in equations and formulas.
               - Example: pH = pKₐ + log₁₀ ( [HCO₃⁻] / (0.03 × PaCO₂) )
               - Example: Eₖ = 61.5 × log₁₀ ( [K⁺]out / [K⁺]in )
               - Subscripts: ₀₁₂₃₄₅₆₇₈₉ ₊ ₋ ₌ ₍ ₎ ₐ ₑ ₕ ᵢ ⱼ ₖ ₗ ₘ ₙ ₒ ₚ ᵣ ₛ ₜ ᵤ ᵥ ₓ
               - Superscripts: ⁰¹²³⁴⁵⁶⁷⁸⁹ ⁺ ⁻ ₌ ⁽ ⁾ ᵃ ᵇ ᶜ ᵈ ᵉ ᶠ ᵍ ʰ ⁱ ʲ ᵏ ˡ ᵐ ⁿ ᵒ ᵖ ʳ ˢ ᵗ ᵘ ᵛ ʷ ˣ ʸ ᶻ
            3. **MOLECULAR FORMULAS:** Use Unicode: CO₂, O₂, H₂O, PaO₂, SaO₂, PvO₂, HCO₃⁻.
            4. Use Unicode for arrows and symbols: →, ←, Δ, ≈, ±, ×, ·.
            5. Ensure clear spacing between all words and symbols.
            
            **ACADEMIC RIGOR & VERIFICATION:**
            1. All references MUST be real and traceable. Use PMIDs or DOIs. DO NOT FABRICATE URLs.
            2. **GOOGLE SEARCH:** Use the search tool to verify any clinical claims or guidelines you mention.
            3. **PREFERRED SOURCES:** Prioritize evidence from Google Scholar, PubMed, Medline Plus, clinicaltrials.gov, CDC, JAMA, NEJM, The Lancet, Cochrane Library, Mayo Clinic, and Johns Hopkins.
            4. **URL VERIFICATION:** Every URL you provide MUST lead directly to the specific article or abstract mentioned. You MUST verify that the article title at the URL matches your claim.
            
            Language: ${language}.`;

    useEffect(() => {
        if (isOpen) {
            const systemInstruction = getSystemInstruction();
            
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY });
            let chatHistory: any[] | undefined = undefined;
            if (initialHistory && initialHistory.length > 0) {
                setMessages(initialHistory);
                // Ensure roles are strictly 'user' or 'model' for Gemini SDK
                chatHistory = initialHistory
                    .filter(m => m.role === 'user' || m.role === 'ai')
                    .map(m => ({ 
                        role: (m.role === 'ai' ? 'model' : m.role) as 'user' | 'model', 
                        parts: [{ text: m.text }] 
                    }));
                setIsSaved(true);
            } else {
                setMessages([{ role: 'system', text: T.chatWelcomeMessage }]);
                setIsSaved(false);
            }
            
            try {
                chatRef.current = ai.chats.create({
                  model: 'gemini-3-flash-preview',
                  config: { 
                      systemInstruction,
                      tools: [{ googleSearch: {} }]
                  },
                  history: chatHistory
                });
            } catch (err) {
                console.error("Failed to create chat session:", err);
                chatRef.current = null;
            }
        } else {
            chatRef.current = null;
        }
    }, [isOpen, topic, caseTitle, language, T, initialHistory]);

    const handleMicClick = () => {
        if (!isSpeechRecognitionSupported) return;
        if (isListening) { 
            recognitionRef.current?.stop(); 
            logEvent('stop_voice_input', { topic_id: topicId });
            return; 
        }
        logEvent('start_voice_input', { topic_id: topicId });
        const recognition = new SpeechRecognition();
        recognition.lang = getBCP47Language(language);
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => { setIsListening(false); };
        recognition.onresult = (e: any) => {
            let fullTranscript = '';
            for (let i = 0; i < e.results.length; i++) {
                fullTranscript += e.results[i][0].transcript;
            }
            setUserInput(fullTranscript);
        };
        recognitionRef.current = recognition;
        recognition.start();
    };

    useEffect(() => {
        if (!isMinimised) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isLoading, isMinimised]);

    const handleSendMessage = async (e?: React.FormEvent, customMsg?: string) => {
        if (e) e.preventDefault();
        const text = customMsg || userInput;
        if (!text.trim() || isLoading) return;
        
        logEvent('send_message', { topic_id: topicId });
        
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setUserInput('');
        setIsLoading(true);
        setIsSaved(false); 
        
        let aiMessageId = (Date.now() + 1).toString();
        
        try {
            // Re-initialize AI client to ensure we have the latest API key
            const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
            if (!apiKey) {
                throw new Error("API key is missing. Please check your environment variables.");
            }
            const ai = new GoogleGenAI({ apiKey });
            
            // Always create a fresh chat instance with current history to avoid stale client issues
            // and ensure we use the most up-to-date API key as per platform guidelines.
            const history = messages
                .filter(m => m.role === 'user' || m.role === 'ai')
                .map(m => ({ 
                    role: (m.role === 'ai' ? 'model' : m.role) as 'user' | 'model', 
                    parts: [{ text: m.text }] 
                }));

            const modelName = 'gemini-3-flash-preview';
            const fallbackModelName = 'gemini-3.1-pro-preview';

            const createChat = (model: string) => ai.chats.create({
                model,
                config: { 
                    systemInstruction: getSystemInstruction(),
                    tools: [{ googleSearch: {} }],
                    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
                },
                history
            });

            chatRef.current = createChat(modelName);

            let result;
            try {
                result = await retryWithBackoff(() => chatRef.current!.sendMessageStream({ message: text })) as AsyncIterable<GenerateContentResponse>;
            } catch (streamErr: any) {
                console.warn(`Initial stream with ${modelName} failed, retrying with ${fallbackModelName}...`, streamErr);
                try {
                    // One more attempt with a completely fresh session and fallback model if the first one failed
                    chatRef.current = createChat(fallbackModelName);
                    result = await retryWithBackoff(() => chatRef.current!.sendMessageStream({ message: text })) as AsyncIterable<GenerateContentResponse>;
                } catch (fallbackErr: any) {
                    console.warn(`Fallback stream with ${fallbackModelName} failed, retrying without tools...`, fallbackErr);
                    // Final attempt without tools
                    chatRef.current = ai.chats.create({
                        model: modelName,
                        config: { 
                            systemInstruction: getSystemInstruction(),
                            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
                        },
                        history
                    });
                    result = await retryWithBackoff(() => chatRef.current!.sendMessageStream({ message: text })) as AsyncIterable<GenerateContentResponse>;
                }
            }

            let currentResponse = '';
            let groundingSources: any[] = [];
            
            // Add the AI message placeholder only after the stream starts successfully
            setMessages(prev => [...prev, { id: aiMessageId, role: 'ai', text: '', timestamp: new Date() }]);
            
            for await (const chunk of result) {
                try {
                    const chunkText = chunk.text || '';
                    currentResponse += chunkText;
                    if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                        groundingSources = [...groundingSources, ...chunk.candidates[0].groundingMetadata.groundingChunks];
                    }
                    setMessages(prev => {
                        const newMessages = [...prev];
                        const aiMsgIndex = newMessages.findIndex(m => m.id === aiMessageId);
                        if (aiMsgIndex !== -1) {
                            newMessages[aiMsgIndex] = { 
                                ...newMessages[aiMsgIndex], 
                                text: currentResponse,
                                groundingSources: groundingSources.length > 0 ? groundingSources : undefined
                            };
                        }
                        return newMessages;
                    });
                } catch (chunkErr) {
                    console.error("Error processing stream chunk:", chunkErr);
                    // If we already have some text, we might want to keep it, but we should still signal an error
                    if (!currentResponse) throw chunkErr;
                }
            }
        } catch (error: any) {
            console.error('Chat error details:', {
                message: error.message,
                status: error.status,
                stack: error.stack,
                apiKeyPresent: !!(process.env.GEMINI_API_KEY || process.env.API_KEY),
                model: 'gemini-3-flash-preview'
            });
            
            // Restore user input so they don't lose their message
            setUserInput(text);
            
            // Clear chatRef so it re-initializes on next attempt
            chatRef.current = null;

            // Remove the empty or partial AI message if it exists
            setMessages(prev => {
                const filtered = prev.filter(m => m.id !== aiMessageId);
                return [...filtered, { id: Date.now().toString(), role: 'system', text: T.errorChat, timestamp: new Date() }];
            });

            if (error.status === 404) {
                console.warn("Model not found, might need to check model name availability.");
            }
        } finally { setIsLoading(false); }
    };

    const handleGenerateDiagram = async (index: number, prompt: string) => {
        logEvent('generate_diagram', { topic_id: topicId });
        const aiResponse = await generateDiagramForDiscussion(prompt, messages.slice(0, index).map(m => m.text).join('\n'), language);
        setMessages(prev => {
            const newMessages = [...prev];
            if (newMessages[index]) newMessages[index] = { ...newMessages[index], diagramData: aiResponse };
            return newMessages;
        });
        setIsSaved(false);
    };

    const handleImageGenerated = (index: number, imageData: string) => {
        logEvent('generate_image', { topic_id: topicId });
        setMessages(prev => {
            const newMessages = [...prev];
            if (newMessages[index]) newMessages[index] = { ...newMessages[index], imageData };
            return newMessages;
        });
        setIsSaved(false);
        setActiveImagePrompt(null);
    };

    const handleDownloadWord = async () => {
        logEvent('download_word', { topic_id: topicId });
        const sections: any[] = [];
        const brandColor = '1e3a8a';

        sections.push(new Paragraph({
            text: 'Ungana Clinical Tutorial',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
        }));

        sections.push(new Paragraph({
            children: [
                new TextRun({ text: `Topic: ${topic.aspect.toUpperCase()}`, bold: true }),
                new TextRun({ text: `\nCase: ${caseTitle}`, italics: true })
            ],
            spacing: { after: 400 }
        }));

        for (const [mIdx, m] of messages.filter(msg => msg.role !== 'system').entries()) {
            const isUser = m.role === 'user';
            
            sections.push(new Paragraph({
                children: [
                    new TextRun({ 
                        text: `${isUser ? 'STUDENT QUESTION' : 'AI TUTOR RESPONSE'}`, 
                        bold: true, 
                        color: isUser ? brandColor : '6b7280',
                        size: 18
                    })
                ],
                spacing: { before: 200, after: 100 }
            }));

            const blocks = splitMessageContent(m.text);
            for (const block of blocks) {
                if (block.type === 'text') {
                    sections.push(new Paragraph({
                        text: cleanTextForDownload(block.content || ''),
                        spacing: { after: 200 }
                    }));
                } else if (block.type === 'table' && block.table) {
                    const tableRows = [
                        new TableRow({
                            children: block.table.header.map(cell => new TableCell({
                                children: [new Paragraph({ 
                                    children: [new TextRun({ text: cell, bold: true })]
                                })],
                                shading: { fill: 'f3f4f6' }
                            }))
                        }),
                        ...block.table.data.map(row => new TableRow({
                            children: row.map(cell => new TableCell({
                                children: [new Paragraph({ text: cell })]
                            }))
                        }))
                    ];
                    sections.push(new Table({
                        rows: tableRows,
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        margins: { top: 100, bottom: 100, left: 100, right: 100 }
                    }));
                    sections.push(new Paragraph({ text: '', spacing: { before: 200 } }));
                }
            }

            if (scrollContainerRef.current) {
                const svgs = scrollContainerRef.current.querySelectorAll('svg');
                for (const svgsOfMsg of Array.from(svgs) as SVGSVGElement[]) {
                    if (svgsOfMsg.closest(`.msg-${mIdx}`)) {
                        const imgData = await captureSvgAsBase64(svgsOfMsg);
                        const imgBuffer = Uint8Array.from(atob(imgData.split(',')[1]), c => c.charCodeAt(0));
                        sections.push(new Paragraph({
                            children: [
                                new ImageRun({
                                    data: imgBuffer,
                                    transformation: { width: 500, height: (500 * svgsOfMsg.clientHeight) / svgsOfMsg.clientWidth }
                                })
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 200 }
                        }));
                    }
                }
            }

            if (m.imageData) {
                const imgBuffer = Uint8Array.from(atob(m.imageData), c => c.charCodeAt(0));
                sections.push(new Paragraph({
                    children: [
                        new ImageRun({
                            data: imgBuffer,
                            transformation: { width: 450, height: 337 }
                        })
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 }
                }));
            }
        }

        const doc = new Document({ sections: [{ children: sections }] });
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Tutorial_${topic.aspect.replace(/\s+/g, '_')}.docx`;
        a.click();
        setShowShareMenu(false);
    };

    const handleDownloadPdf = async () => {
        logEvent('download_pdf', { topic_id: topicId });
        const { jsPDF } = (window as any).jspdf;
        const doc = new jsPDF();
        const margin = 20;
        const pageWidth = doc.internal.pageSize.getWidth();
        const brandColor = '#1e3a8a';
        
        doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(brandColor).text('Ungana', margin, 20);
        doc.setDrawColor(brandColor).setLineWidth(0.5).line(margin, 23, pageWidth - margin, 23);
        doc.setFontSize(14).setTextColor('#111827').text(`Clinical Tutorial: ${topic.aspect.toUpperCase()}`, margin, 35);
        doc.setFontSize(10).setTextColor('#4b5563').text(`Case: ${caseTitle}`, margin, 42);
        
        let y = 52;

        for (const [mIdx, m] of messages.filter(msg => msg.role !== 'system').entries()) {
            const isUser = m.role === 'user';
            if (y > 270) { doc.addPage(); y = 20; }
            doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(isUser ? brandColor : '#6b7280');
            doc.text(`${isUser ? 'STUDENT QUESTION' : 'AI TUTOR RESPONSE'}`, margin, y);
            y += 7;

            const blocks = splitMessageContent(m.text);
            for (const block of blocks) {
                if (block.type === 'text') {
                    doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor('#111827');
                    const cleaned = cleanTextForDownload(block.content || '');
                    const lines = doc.splitTextToSize(cleaned, pageWidth - 2 * margin);
                    if (y + (lines.length * 6) > 275) { doc.addPage(); y = 20; }
                    doc.text(lines, margin, y);
                    y += (lines.length * 6) + 4;
                } else if (block.type === 'table' && block.table) {
                    if (y > 240) { doc.addPage(); y = 20; }
                    (doc as any).autoTable({
                        startY: y,
                        head: [block.table.header],
                        body: block.table.data,
                        margin: { left: margin },
                        styles: { fontSize: 9, font: 'helvetica' },
                        headStyles: { fillColor: brandColor, textColor: 255 },
                        theme: 'grid'
                    });
                    y = (doc as any).lastAutoTable.finalY + 10;
                }
            }

            if (scrollContainerRef.current) {
                const svgs = scrollContainerRef.current.querySelectorAll('svg');
                for (const svgsOfMsg of Array.from(svgs) as SVGSVGElement[]) {
                    if (svgsOfMsg.closest(`.msg-${mIdx}`)) {
                        const imgData = await captureSvgAsBase64(svgsOfMsg);
                        if (y > 180) { doc.addPage(); y = 20; }
                        const imgW = pageWidth - (margin * 2);
                        const imgH = (imgW * svgsOfMsg.clientHeight) / svgsOfMsg.clientWidth;
                        doc.addImage(imgData, 'PNG', margin, y, imgW, imgH);
                        y += imgH + 10;
                    }
                }
            }

            if (m.imageData) {
                if (y > 200) { doc.addPage(); y = 20; }
                const imgData = `data:image/png;base64,${m.imageData}`;
                const imgW = 140; 
                const imgH = 105;
                doc.addImage(imgData, 'PNG', (pageWidth - imgW) / 2, y, imgW, imgH);
                y += imgH + 10;
            }
            y += 5; 
        }
        
        doc.save(`Tutorial_${topic.aspect.replace(/\s+/g, '_')}.pdf`);
        setShowShareMenu(false);
    };

    if (!isOpen) return null;

    if (isMinimised) {
        return (
            <div className="fixed bottom-6 right-6 z-[60] animate-bounce-slow">
                <button 
                    onClick={() => setIsMinimised(false)}
                    className="group relative flex items-center gap-3 bg-brand-blue hover:bg-brand-blue-dark text-white p-3 pr-5 rounded-2xl shadow-2xl transition-all hover:scale-105 active:scale-95"
                    title={T.resumeAiTutorial}
                >
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <MessageSquare className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col items-start leading-none">
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-70">{T.tutorialActive}</span>
                        <span className="text-sm font-bold truncate max-w-[120px]">{topic.aspect}</span>
                    </div>
                    {isLoading && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping border-2 border-white"></div>}
                </button>
            </div>
        );
    }

    return (
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in ${isFullscreen ? 'bg-white dark:bg-dark-bg' : ''}`} aria-modal="true" role="dialog">
            <div className={`bg-white dark:bg-dark-surface flex flex-col transition-all duration-300 ${isFullscreen ? 'w-full h-full rounded-none' : 'medical-card w-full max-w-lg h-[90dvh] sm:h-[85dvh]'}`}>
                <header className={`p-3 sm:p-4 border-b border-gray-100 dark:border-dark-border bg-white/80 dark:bg-dark-surface/80 backdrop-blur-md z-10 transition-colors ${isFullscreen ? 'rounded-none' : 'rounded-t-2xl'}`}>
                    <div className="flex justify-between items-center">
                        <div className="flex flex-col min-w-0 pr-2 sm:pr-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Activity className="w-3 h-3 text-brand-blue" />
                                <h2 className="text-[10px] font-black text-brand-blue uppercase tracking-[0.2em] leading-none">{T.aiMedicalTutor}</h2>
                            </div>
                            <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-slate-100 truncate tracking-tight">{topic.aspect}</h3>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2">
                             <div className="relative" ref={shareMenuRef}>
                                <button onClick={() => setShowShareMenu(!showShareMenu)} className="p-2 sm:p-2.5 text-gray-500 dark:text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 rounded-xl transition-all" title={T.exportOptions}>
                                    <Share2 className="h-5 w-5" />
                                </button>
                                {showShareMenu && (
                                    <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-dark-surface rounded-2xl shadow-2xl border border-gray-100 dark:border-dark-border z-20 py-2 animate-fade-in overflow-hidden">
                                        <button onClick={handleDownloadPdf} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-slate-200 hover:bg-brand-blue/5 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors">
                                            <FileType className="h-4 w-4 text-red-500" />
                                            <div className="flex flex-col">
                                                <span className="font-bold">{T.downloadPdfButton}</span>
                                                <span className="text-[10px] opacity-60">{T.highFidelityDocument}</span>
                                            </div>
                                        </button>
                                        <button onClick={handleDownloadWord} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-slate-200 hover:bg-brand-blue/5 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors">
                                            <FileText className="h-4 w-4 text-blue-500" />
                                            <div className="flex flex-col">
                                                <span className="font-bold">{T.downloadWordButton}</span>
                                                <span className="text-[10px] opacity-60">{T.editableDocxFile}</span>
                                            </div>
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 sm:p-2.5 text-gray-500 dark:text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 rounded-xl transition-all hidden sm:flex" title={T.toggleFullscreen}>
                                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                            </button>
                            <button onClick={() => setIsMinimised(true)} className="p-2 sm:p-2.5 text-gray-500 dark:text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 rounded-xl transition-all" title={T.minimiseDiscussion}>
                                <Minus className="h-5 w-5" />
                            </button>
                            <button onClick={onClose} className="p-2 sm:p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title={T.closeTutorial}>
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                </header>
                <main ref={scrollContainerRef} className={`p-4 overflow-y-auto flex-grow bg-gray-50/50 dark:bg-slate-900/50 transition-colors ${isFullscreen ? 'max-w-4xl mx-auto w-full' : ''}`}>
                    <div className="space-y-6">
                        {messages.map((msg, index) => {
                            const illustrationMatch = msg.text.match(/\[\s*ILLUSTRATE:\s*(.*?)\s*\]/i);
                            const diagramMatch = msg.text.match(/\[\s*DIAGRAM:\s*(.*?)\s*\]/i);
                            const graphMatches = [...msg.text.matchAll(/\[\s*GRAPH:\s*(.*?)\s*\]/gi)];
                            const textWithoutTags = msg.text
                                .replace(/\[\s*(ILLUSTRATE|DIAGRAM|GRAPH):\s*.*?\s*\]/gi, '')
                                .trim();
                            return (
                                <div key={index} className={`msg-${index} flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                    {msg.role === 'model' && <div className="w-8 h-8 bg-brand-blue dark:bg-brand-blue-light text-white rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-sm">AI</div>}
                                    <div className={`max-w-[92%] sm:max-w-[85%] space-y-3 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className={`px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl text-sm shadow-sm transition-colors ${msg.role === 'user' ? 'bg-brand-blue dark:bg-brand-blue-light text-white rounded-tr-none' : msg.role === 'model' ? 'bg-white dark:bg-dark-surface text-brand-text dark:text-slate-200 border border-gray-200 dark:border-dark-border rounded-tl-none' : 'text-center w-full text-gray-500 italic bg-transparent shadow-none'}`}>
                                            {msg.role === 'model' ? (
                                                <div className="space-y-4">
                                                    <MarkdownRenderer content={msg.text} />
                                                    <div className="pt-2 mt-2 border-t border-gray-50 dark:border-dark-border">
                                                        <SourceRenderer text={msg.text} groundingSources={msg.groundingSources} />
                                                    </div>
                                                </div>
                                            ) : <p className="whitespace-pre-wrap">{msg.text}</p>}
                                            {diagramMatch && !msg.diagramData && (
                                                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-dark-border flex justify-center">
                                                    <button onClick={() => handleGenerateDiagram(index, diagramMatch[1])} className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-brand-blue dark:text-blue-300 hover:bg-blue-100 border border-blue-200 rounded-lg transition text-xs font-semibold">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                                        {T.generateMedicalDiagram}
                                                    </button>
                                                </div>
                                            )}
                                            {msg.diagramData && (
                                                <div className="mt-4 h-[300px] border border-gray-100 dark:border-dark-border rounded-xl overflow-hidden bg-white">
                                                    <InteractiveDiagram data={msg.diagramData} id={`chat-diag-${index}`} />
                                                </div>
                                            )}
                                            {illustrationMatch && !msg.imageData && (
                                                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-dark-border flex justify-center">
                                                    <button onClick={() => setActiveImagePrompt({ prompt: illustrationMatch[1], index })} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition text-xs font-semibold">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h14a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                                        {T.generateIllustration}
                                                    </button>
                                                </div>
                                            )}
                                            {graphMatches.length > 0 && (
                                                <div className="space-y-4 mt-4 pt-4 border-t border-gray-100 dark:border-dark-border">
                                                    {graphMatches.map((m, i) => (
                                                        <ScientificGraph 
                                                            key={i} 
                                                            type={m[1].trim().toLowerCase().replace(/[\s-]+/g, '_') as any} 
                                                            title={T[GRAPH_TITLES[m[1].trim().toLowerCase().replace(/[\s-]+/g, '_')]] || "Model"} 
                                                            className="scale-100" 
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                            {msg.imageData && <div className="mt-3"><img src={`data:image/png;base64,${msg.imageData}`} alt="Illustration" className="rounded-lg border border-gray-100 shadow-sm max-w-full h-auto" /></div>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {isLoading && (
                            <div className="flex items-start gap-3 flex-row">
                                <div className="w-8 h-8 bg-brand-blue dark:bg-brand-blue-light text-white rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-sm">AI</div>
                                <div className="px-5 py-4 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-2xl rounded-tl-none shadow-sm transition-colors"><LoadingSpinner /></div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </main>
                <footer className={`p-3 sm:p-4 border-t border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface transition-colors ${isFullscreen ? 'rounded-none' : 'rounded-b-2xl'}`}>
                    <div className={`flex flex-col ${isFullscreen ? 'max-w-4xl mx-auto w-full' : ''}`}>
                        <form onSubmit={(e) => handleSendMessage(e)} className="flex items-center gap-2 mb-3">
                            <button 
                                type="button" 
                                onClick={handleMicClick} 
                                disabled={isLoading} 
                                className={`p-2.5 sm:p-3 rounded-xl border transition-all flex items-center justify-center gap-2 ${isListening ? 'text-red-500 border-red-200 bg-red-50 animate-pulse' : 'text-gray-600 dark:text-gray-400 border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                            >
                                <AudioVisualizer isListening={isListening} />
                                {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                            </button>
                            <div className="flex-grow relative">
                                <input 
                                    type="text" 
                                    value={userInput} 
                                    onChange={(e) => setUserInput(e.target.value)} 
                                    placeholder={T.chatPlaceholder} 
                                    disabled={isLoading} 
                                    className="w-full p-2.5 sm:p-3 pr-10 sm:pr-12 border border-gray-200 dark:border-dark-border rounded-xl bg-gray-50 dark:bg-slate-800 text-black dark:text-white text-sm focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue outline-none transition-all" 
                                />
                                <button 
                                    type="submit" 
                                    disabled={isLoading || !userInput.trim()} 
                                    className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 text-brand-blue hover:bg-brand-blue/10 rounded-lg transition-all disabled:opacity-30"
                                >
                                    <Send className="h-5 w-5" />
                                </button>
                            </div>
                        </form>
                        <div className="flex justify-between items-center pt-3 border-t border-gray-50 dark:border-dark-border">
                            <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${isSaved ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{isSaved ? T.sessionSaved : T.unsavedSession}</span>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => { 
                                    logEvent('save_discussion', { topic_id: topicId });
                                    onSaveDiscussion(topicId, messages); 
                                    setIsSaved(true); 
                                }} 
                                disabled={isLoading || isSaved} 
                                className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${isSaved ? 'text-green-600 bg-green-50 border border-green-100' : 'text-brand-blue bg-brand-blue/5 border border-brand-blue/10 hover:bg-brand-blue/10'}`}
                            >
                                <Save className="w-3 h-3" />
                                {isSaved ? T.savedStatus : T.saveChanges}
                            </button>
                        </div>
                    </div>
                </footer>
            </div>
            {activeImagePrompt && <ImageGenerator content={{ title: 'Clinical Illustration', description: activeImagePrompt.prompt, type: EducationalContentType.IMAGE, reference: 'AI Generated' }} onClose={() => setActiveImagePrompt(null)} language={language} T={T} onImageGenerated={(data) => handleImageGenerated(activeImagePrompt.index, data)} />}
        </div>
    );
};
