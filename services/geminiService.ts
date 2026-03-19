
import { GoogleGenAI, Type, GenerateContentResponse, Modality, ThinkingLevel } from "@google/genai";
import type { PatientCase, KnowledgeMapData, KnowledgeNode, KnowledgeLink, TraceableEvidence, FurtherReading, DiagramData, EcgFindings } from '../types';

const getAiClient = () => {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY });
};

export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
): Promise<T> {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            console.error(`Attempt ${i + 1} failed:`, error);
            lastError = error;
            const status = error?.status || error?.response?.status;
            if (status !== 429 && (status < 500 || status >= 600)) {
                throw error;
            }
            const delay = initialDelay * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

const FAST_MODEL = "gemini-3-flash-preview";
const PRO_MODEL = "gemini-3.1-pro-preview";
const VISION_MODEL = "gemini-2.5-flash-image";

const SYNTHESIS_GUIDELINE = `
**STRICT MEDICAL SYNTHESIS RULES:**
1. **DISCIPLINE RIGOR:** Management MUST be specific to the discipline (e.g., Anaesthesia, Nursing).
2. **VISUALS:** Use triggers: \`[GRAPH: oxygen_dissociation]\`, \`[GRAPH: frank_starling]\`, \`[GRAPH: pressure_volume_loop]\`, \`[GRAPH: respiratory_flow_volume]\`.
3. **LATEX:** Wrap complex mathematical equations and scientific notation in double dollar signs ($$ ... $$) for blocks or single dollar signs ($ ... $) for inline.
4. **MOLECULAR FORMULAS:** Do NOT use LaTeX for simple molecular formulas (e.g., CO2, O2, H2O, PaO2). You MUST use Unicode subscripts: CO₂, O₂, H₂O, PaO₂, SaO₂, PvO₂, HCO₃⁻.
5. **LATEX JSON ESCAPING:** When outputting LaTeX in JSON strings, you MUST double-escape backslashes (e.g., use "\\\\times" for \\times, "\\\\frac" for \\frac). Failure to do so will break rendering.
6. **COMPLETENESS:** You MUST provide detailed, high-fidelity content for EVERY field in the schema. DO NOT TRUNCATE. DO NOT USE PLACEHOLDERS.
`;

const EVIDENCE_GUIDELINE = `
**VERIFICATION RULES:**
1. **GOOGLE SEARCH:** Use Google Search to verify clinical trials, PMIDs, and latest guidelines. No hallucinations.
2. **QUIZ:** Generate exactly 5 high-yield MCQs with explanations.
3. **LATEX JSON ESCAPING:** When outputting LaTeX in JSON strings, you MUST double-escape backslashes (e.g., use "\\\\times" for \\times, "\\\\frac" for \\frac).
4. **COMPLETENESS:** Ensure all 5 questions are fully generated.
`;

const diagramNodeSchema = {
    type: Type.OBJECT,
    properties: {
        id: { type: Type.STRING },
        label: { type: Type.STRING },
        description: { type: Type.STRING },
    },
    required: ["id", "label"]
};

const diagramLinkSchema = {
    type: Type.OBJECT,
    properties: {
        source: { type: Type.STRING },
        target: { type: Type.STRING },
        label: { type: Type.STRING }
    },
    required: ["source", "target", "label"]
};

const diagramDataSchema = {
    type: Type.OBJECT,
    properties: {
        nodes: { type: Type.ARRAY, items: diagramNodeSchema },
        links: { type: Type.ARRAY, items: diagramLinkSchema }
    },
    required: ["nodes", "links"],
    nullable: true
};

const educationalContentSchema = {
    type: Type.OBJECT,
    properties: {
        type: { type: Type.STRING, enum: ["Diagram", "Graph", "Formula", "Image"] },
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        reference: { type: Type.STRING },
        diagramData: { ...diagramDataSchema }
    },
    required: ["type", "title", "description", "reference"]
};

const quizQuestionSchema = {
    type: Type.OBJECT,
    properties: {
        question: { type: Type.STRING },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correctAnswerIndex: { type: Type.INTEGER },
        explanation: { type: Type.STRING }
    },
    required: ["question", "options", "correctAnswerIndex", "explanation"]
};

const corePatientCaseSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        patientProfile: { type: Type.STRING },
        presentingComplaint: { type: Type.STRING },
        history: { type: Type.STRING }
    },
    required: ["title", "patientProfile", "presentingComplaint", "history"]
};

const extendedDetailsSchema = {
    type: Type.OBJECT,
    properties: {
        biochemicalPathway: { ...educationalContentSchema },
        multidisciplinaryConnections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              discipline: { type: Type.STRING },
              connection: { type: Type.STRING },
            },
            required: ["discipline", "connection"],
          },
        },
        disciplineSpecificConsiderations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                aspect: { type: Type.STRING },
                consideration: { type: Type.STRING }
              },
              required: ["aspect", "consideration"]
            }
        },
        educationalContent: {
            type: Type.ARRAY,
            items: educationalContentSchema
        }
    },
    required: ["biochemicalPathway", "multidisciplinaryConnections", "disciplineSpecificConsiderations", "educationalContent"]
};

const evidenceAndQuizSchema = {
    type: Type.OBJECT,
    properties: {
        traceableEvidence: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    claim: { type: Type.STRING },
                    source: { type: Type.STRING }
                },
                required: ["claim", "source"]
            }
        },
        furtherReadings: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    topic: { type: Type.STRING },
                    reference: { type: Type.STRING }
                },
                required: ["topic", "reference"]
            }
        },
        educationalContent: {
            type: Type.ARRAY,
            items: educationalContentSchema,
            description: "3-5 high-yield educational items with diagrams and deep explanations."
        },
        quiz: { type: Type.ARRAY, items: quizQuestionSchema }
    },
    required: ["traceableEvidence", "furtherReadings", "educationalContent", "quiz"]
};

const knowledgeMapSchema = {
    type: Type.OBJECT,
    properties: {
        nodes: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    label: { type: Type.STRING },
                    discipline: { type: Type.STRING },
                    summary: { type: Type.STRING }
                },
                required: ["id", "label", "discipline", "summary"]
            }
        },
        links: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    source: { type: Type.STRING },
                    target: { type: Type.STRING },
                    description: { type: Type.STRING }
                },
                required: ["source", "target", "description"]
            }
        }
    },
    required: ["nodes", "links"]
};

const fullCaseSchema = {
    type: Type.OBJECT,
    properties: {
        title: { 
            type: Type.STRING,
            description: "A professional, clinical title for the case."
        },
        patientProfile: { 
            type: Type.STRING,
            description: "Detailed patient demographics, age, gender, occupation, and relevant background (min 100 words)."
        },
        presentingComplaint: { 
            type: Type.STRING,
            description: "The primary reason for the visit, described in clinical terms (min 30 words)."
        },
        history: { 
            type: Type.STRING,
            description: "Comprehensive HPI, PMH, Medications, Social History, and Family History (min 150 words)."
        },
        biochemicalPathway: {
            ...educationalContentSchema,
            description: "A deep-dive into the pathophysiology and biochemistry. MUST include formulas, reactions, and detailed mechanisms."
        },
        multidisciplinaryConnections: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    discipline: { type: Type.STRING },
                    connection: { type: Type.STRING }
                },
                required: ["discipline", "connection"]
            },
            description: "At least 3-5 connections to other medical specialties."
        },
        disciplineSpecificConsiderations: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    aspect: { type: Type.STRING },
                    consideration: { type: Type.STRING }
                },
                required: ["aspect", "consideration"]
            },
            description: "Management and diagnostic considerations specific to the requested discipline."
        },
        knowledgeMap: {
            ...knowledgeMapSchema,
            description: "8-12 interconnected nodes showing the conceptual framework of the case."
        }
    },
    required: ["title", "patientProfile", "presentingComplaint", "history", "biochemicalPathway", "multidisciplinaryConnections", "disciplineSpecificConsiderations", "knowledgeMap"]
};

const extractJson = (text: string) => {
    // 1. Try to find the first '{' and last '}'
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    
    if (start !== -1 && end !== -1 && end > start) {
        return text.substring(start, end + 1).trim();
    }
    
    // 2. Fallback to code block regex if simple search fails
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    if (jsonMatch) return jsonMatch[1].trim();
    
    return text.trim();
};

export const generateFullCase = async (condition: string, discipline: string, difficulty: string, language: string): Promise<{ patientCase: PatientCase, knowledgeMap: KnowledgeMapData }> => {
    const ai = getAiClient();
    const prompt = `Expert Medical Synthesis: Create a comprehensive, high-fidelity clinical case for "${condition}". 
    Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}.
    
    CORE MISSION: Produce a detailed, professional-grade medical case study that covers all aspects from demographics to deep biochemistry.
    
    REQUIREMENTS:
    1. PATIENT PROFILE: Elaborate on demographics, lifestyle, and background.
    2. PRESENTING COMPLAINT: Use precise clinical language.
    3. HISTORY: Include a full HPI, PMH (with specific dates/conditions), Medications (with dosages), and Social/Family History.
    4. BIOCHEMICAL PATHWAY: Provide a rigorous explanation of the pathophysiology. Include specific enzymes, metabolites, and chemical reactions.
    5. MULTIDISCIPLINARY CONNECTIONS: Detail how at least 3 other specialties (e.g., Radiology, Pathology, Cardiology) intersect with this case.
    6. MANAGEMENT: Provide specific, evidence-based management steps relevant to ${discipline}.
    7. KNOWLEDGE MAP: Design a network of 8-12 nodes showing how symptoms, labs, and mechanisms are linked.
    
    ${SYNTHESIS_GUIDELINE}`;

    const data = await retryWithBackoff(async () => {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: PRO_MODEL,
            contents: prompt,
            config: { 
                responseMimeType: "application/json", 
                responseSchema: fullCaseSchema
            },
        });

        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason !== 'STOP') {
            console.warn("generateFullCase finished with reason:", finishReason);
        }

        const text = response.text || "{}";
        try {
            return JSON.parse(extractJson(text));
        } catch (e) {
            console.error("JSON Parse Error in generateFullCase retry:", e, text);
            throw new Error("Failed to parse AI response. Retrying...");
        }
    });

    const { knowledgeMap = { nodes: [], links: [] }, ...patientCaseData } = data;
    
    // Validate knowledge map links
    const nodes = knowledgeMap.nodes || [];
    const links = knowledgeMap.links || [];
    const validNodeIds = new Set(nodes.map((n: any) => n.id));
    const validLinks = links.filter((l: any) => validNodeIds.has(l.source) && validNodeIds.has(l.target));

    const finalMap = { nodes, links: validLinks };
    const patientCase = { ...patientCaseData, knowledgeMap: finalMap } as PatientCase;

    return { patientCase, knowledgeMap: finalMap as KnowledgeMapData };
};

export const generateEvidenceAndQuiz = async (condition: string, discipline: string, difficulty: string, language: string) => {
    const ai = getAiClient();
    const prompt = `Generate high-yield clinical evidence and a medical quiz for "${condition}".
    Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}.
    
    1. TRACEABLE EVIDENCE: Provide 3-5 verified clinical claims with sources (PMIDs or major guidelines).
    2. FURTHER READINGS: Provide 2-3 relevant topics for deeper study.
    3. EDUCATIONAL CONTENT: Create 3-5 high-yield teaching points. Each MUST have a detailed description and a diagram specification.
    4. QUIZ: Generate exactly 5 high-yield multiple-choice questions (MCQs).
       - Each question must have exactly 4 options.
       - Include a clear explanation for the correct answer.
       - Use medical terminology appropriate for ${difficulty} level.
       - Ensure formulas and symbols are correctly formatted in LaTeX or Unicode.
    
    ${EVIDENCE_GUIDELINE}`;
    
    try {
        const result = await retryWithBackoff(async () => {
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: PRO_MODEL,
                contents: prompt,
                config: { 
                    responseMimeType: "application/json", 
                    responseSchema: evidenceAndQuizSchema,
                    tools: [{ googleSearch: {} }]
                },
            });

            const finishReason = response.candidates?.[0]?.finishReason;
            if (finishReason !== 'STOP') {
                console.warn("generateEvidenceAndQuiz finished with reason:", finishReason);
            }

            const text = response.text || "{}";
            try {
                const data = JSON.parse(extractJson(text));
                const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
                return { data, sources };
            } catch (e) {
                console.error("JSON Parse Error in generateEvidenceAndQuiz retry:", e, text);
                throw new Error("Failed to parse AI response. Retrying...");
            }
        });

        return { 
            traceableEvidence: result.data.traceableEvidence || [], 
            furtherReadings: result.data.furtherReadings || [],
            educationalContent: result.data.educationalContent || [],
            quiz: result.data.quiz || [],
            groundingSources: result.sources 
        };
    } catch (err) {
        console.error("Final error in generateEvidenceAndQuiz:", err);
        return { traceableEvidence: [], furtherReadings: [], educationalContent: [], quiz: [], groundingSources: [] };
    }
};

export const searchForSource = async (sourceQuery: string, language: string): Promise<{ summary: string; sources: any[] }> => {
    const ai = getAiClient();
    const prompt = `Verified technical research for "${sourceQuery}". Verify all associated academic IDs (PMID/DOI). Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: PRO_MODEL,
        contents: prompt,
        config: { 
            tools: [{ googleSearch: {} }], 
            temperature: 0.1
        },
    }));
    return { summary: response.text || "", sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] };
};

export const interpretEcg = async (findings: EcgFindings, imageBase64: string | null, imageMimeType: string | null, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `ECG Report. Findings: ${JSON.stringify(findings)}. Language: ${language}.`;
    const contentParts: any[] = [{ text: prompt }];
    if (imageBase64 && imageMimeType) contentParts.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: { parts: contentParts }
    }));
    return response.text || "";
};

export const generateVisualAid = async (prompt: string): Promise<string> => {
    const ai = getAiClient();
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: '4:3' } },
    }));
    const data = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!data) throw new Error("Visual aid failed.");
    return data;
};

export const checkDrugInteractions = async (drugNames: string[], language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Drug interactions for: ${drugNames.join(', ')}. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt
    }));
    return response.text || "";
};

export const generateSpeech = async (text: string, voiceName: string): Promise<string> => {
    const ai = getAiClient();
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
    }));
    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data) throw new Error("Speech failed.");
    return data;
};

export const getConceptAbstract = async (concept: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Significance: "${concept}" in context of "${caseContext}". 50 words. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt
    }));
    return response.text || "";
};

export const getConceptConnectionExplanation = async (conceptA: string, conceptB: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Connection: "${conceptA}" and "${conceptB}" in "${caseContext}". 3 sentences. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt
    }));
    return response.text || "";
};

export const generateDiagramForDiscussion = async (prompt: string, chatContext: string, language: string): Promise<DiagramData> => {
    const ai = getAiClient();
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: PRO_MODEL,
        contents: `Diagram JSON for: "${prompt}". Context: ${chatContext}. Language: ${language}.`,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: diagramDataSchema
        },
    }));

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason !== 'STOP') {
        console.warn("generateDiagramForDiscussion finished with reason:", finishReason);
    }

    const rawData = JSON.parse(extractJson(response.text || "{}"));
    return (rawData as DiagramData) || { nodes: [], links: [] };
};

export const enrichCaseWithWebSources = async (patientCase: PatientCase, language: string): Promise<{ newEvidence: TraceableEvidence[]; newReadings: FurtherReading[]; groundingSources: any[] }> => {
    const ai = getAiClient();
    const prompt = `Find 2 trials and 2 meta-analyses for "${patientCase.title}". 
    
    **MANDATORY VERIFICATION:** Use the Google Search tool to verify all clinical evidence.
    Every PMID or DOI MUST be factually verified for accuracy and relevance. 
    Language: ${language}. JSON.`;
    
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: PRO_MODEL,
        contents: prompt,
        config: { 
            tools: [{ googleSearch: {} }], 
            temperature: 0.2
        },
    }));

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason !== 'STOP') {
        console.warn("enrichCaseWithWebSources finished with reason:", finishReason);
    }

    const text = extractJson(response.text || "{}");
    const parsedData = JSON.parse(text);
    return { 
        newEvidence: parsedData.traceableEvidence || [], 
        newReadings: parsedData.furtherReadings || [], 
        groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] 
    };
};
