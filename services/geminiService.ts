
import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";
import type { PatientCase, KnowledgeMapData, KnowledgeNode, KnowledgeLink, TraceableEvidence, FurtherReading, DiagramData, EcgFindings } from '../types';

const getAiClient = () => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
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
const PRO_MODEL = "gemini-3-pro-preview";

const SYNTHESIS_GUIDELINE = `
**STRICT PROFESSIONAL MEDICAL SYNTHESIS RULES:**

1. **VISUAL PREFERENCE (MANDATORY):** Do NOT describe physiological graphs, clinical algorithms, or biochemical cascades in text. You MUST use visual triggers:
   - \`[GRAPH: oxygen_dissociation]\` (Respiratory, Saturation, Acid-Base)
   - \`[GRAPH: frank_starling]\` (CHF, Preload, Fluid resuscitation, Shock)
   - \`[GRAPH: pressure_volume_loop]\` (Valvular disease, Cardiac Cycle, Compliance)
   - \`[GRAPH: cerebral_pressure_volume]\` (TBI, ICH, Monro-Kellie)
   - \`[GRAPH: cerebral_autoregulation]\` (Stroke, HTN management, CBF)
   - Embed these at the END of the 'biochemicalPathway.description' or 'disciplineSpecificConsiderations.consideration' fields.

2. **CRITICAL: DRUG SAFETY REPORTING:** For every medication mentioned, you MUST immediately follow the drug name with [ADVERSE: effect1; effect2; effect3].

3. **HYPER-SPECIFIC DISCIPLINE TARGETING:** All management considerations MUST be strictly tailored to the professional scope of the selected discipline. AVOID GENERAL MEDICAL ADVICE. If the discipline is Nursing, focus on NANDA-I, monitoring, and NIC. If Physiotherapy, focus on specific mobilization protocols and respiratory toilet. Use precise, field-specific terminology.

4. **Clean Formatting:** Remove unnecessary symbols. Use Unicode for physiological variables (e.g., PaO₂, SaO₂, CO₂, H₂O, P_c, T½).

5. **Phased Management Structuring:** Categorize 'disciplineSpecificConsiderations' into "Preoperative", "Intraoperative", and "Postoperative" (or acute/recovery phases).

6. **RIGOROUS REFERENCE VERIFICATION:** You MUST use the Google Search tool to verify that every PMID and DOI provided is real, accurate, and corresponds exactly to the cited medical article. Fake or "hallucinated" IDs are strictly prohibited. Every ID must lead directly to the referenced study.

7. **Quiz Quality:** Exactly 5 high-yield MCQs.
8. **Narrative Integrity:** No citations/PMIDs in core case history sections.
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
        }
    },
    required: ["biochemicalPathway", "multidisciplinaryConnections", "disciplineSpecificConsiderations"]
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
        quiz: { type: Type.ARRAY, items: quizQuestionSchema }
    },
    required: ["traceableEvidence", "furtherReadings", "quiz"]
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

const extractJson = (text: string) => {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    if (jsonMatch) return jsonMatch[1].trim();
    return text.trim();
};

export const generateCorePatientCase = async (condition: string, discipline: string, difficulty: string, language: string): Promise<PatientCase> => {
    const ai = getAiClient();
    const prompt = `Senior medical consultant: Create core clinical record for "${condition}". Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}. ${SYNTHESIS_GUIDELINE}`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: corePatientCaseSchema,
            thinkingConfig: { thinkingBudget: 0 }
        },
    }));
    const data = JSON.parse(extractJson(response.text || "{}"));
    return { ...data } as PatientCase;
};

export const generateExtendedDetails = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => {
    const ai = getAiClient();
    const prompt = `Provide extended clinical depth for "${coreCase.title}" specifically for the discipline of "${discipline}". 
    
    **MANAGEMENT DEPTH REQUIREMENTS:** 
    For 'disciplineSpecificConsiderations', adopt an expert specialist persona for "${discipline}". AVOID ALL GENERALIZATION. Interventions must be specific to this field. Use triggers [GRAPH: type] instead of explaining physiological curves in text.
    
    **DRUG ADVERSE EFFECTS (MANDATORY):**
    For every medication, provide exactly 3 critical adverse effects using [ADVERSE: effect1; effect2; effect3] immediately after the drug name.
    
    Language: ${language}. ${SYNTHESIS_GUIDELINE}`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: extendedDetailsSchema,
            thinkingConfig: { thinkingBudget: 0 }
        },
    }));
    return JSON.parse(extractJson(response.text || "{}"));
};

export const generateEvidenceAndQuiz = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => {
    const ai = getAiClient();
    const prompt = `References & Quiz for "${coreCase.title}". 
    
    **CRITICAL REQUIREMENT:** You MUST use the Google Search tool to FIND and VERIFY every single clinical trial, meta-analysis, or guideline cited. 
    For every reference in 'traceableEvidence' and 'furtherReadings', the PMID or DOI provided MUST be factually correct and lead directly to the referenced article.
    Language: ${language}. ${SYNTHESIS_GUIDELINE}`;
    
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: PRO_MODEL, // Using Pro for better verification reasoning
        contents: prompt,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: evidenceAndQuizSchema,
            thinkingConfig: { thinkingBudget: 0 },
            tools: [{ googleSearch: {} }]
        },
    }));
    const data = JSON.parse(extractJson(response.text || "{}"));
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return { ...data, groundingSources: sources };
};

export const generateKnowledgeMap = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string): Promise<KnowledgeMapData> => {
    const ai = getAiClient();
    const prompt = `Knowledge map (10 connected nodes) for "${coreCase.title}". Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: knowledgeMapSchema,
            thinkingConfig: { thinkingBudget: 0 }
        },
    }));
    const data = JSON.parse(extractJson(response.text || "{}"));
    const validNodeIds = new Set((data as any).nodes?.map((n: KnowledgeNode) => n.id) || []);
    const validLinks = ((data as any).links || []).filter((l: KnowledgeLink) => validNodeIds.has(l.source) && validNodeIds.has(l.target));
    return { nodes: (data as any).nodes || [], links: validLinks };
};

export const searchForSource = async (sourceQuery: string, language: string): Promise<{ summary: string; sources: any[] }> => {
    const ai = getAiClient();
    const prompt = `Verified technical research for "${sourceQuery}". Verify all associated academic IDs (PMID/DOI). Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: PRO_MODEL,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
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
        contents: { parts: contentParts },
        config: { thinkingConfig: { thinkingBudget: 0 } }
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
        contents: prompt,
        config: { thinkingConfig: { thinkingBudget: 0 } }
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
        contents: prompt,
        config: { thinkingConfig: { thinkingBudget: 0 } }
    }));
    return response.text || "";
};

export const getConceptConnectionExplanation = async (conceptA: string, conceptB: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Connection: "${conceptA}" and "${conceptB}" in "${caseContext}". 3 sentences. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { thinkingConfig: { thinkingBudget: 0 } }
    }));
    return response.text || "";
};

export const generateDiagramForDiscussion = async (prompt: string, chatContext: string, language: string): Promise<DiagramData> => {
    const ai = getAiClient();
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: `Diagram JSON for: "${prompt}". Context: ${chatContext}. Language: ${language}.`,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: diagramDataSchema,
            thinkingConfig: { thinkingBudget: 0 }
        },
    }));
    const rawData = JSON.parse(response.text || "{}");
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
        config: { tools: [{ googleSearch: {} }], temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
    }));
    const text = extractJson(response.text || "{}");
    const parsedData = JSON.parse(text);
    return { 
        newEvidence: parsedData.traceableEvidence || [], 
        newReadings: parsedData.furtherReadings || [], 
        groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] 
    };
};
