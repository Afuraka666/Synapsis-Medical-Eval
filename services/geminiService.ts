
import { GoogleGenAI, Type, GenerateContentResponse, Modality, ThinkingLevel } from "@google/genai";
import type { PatientCase, KnowledgeMapData, KnowledgeNode, KnowledgeLink, TraceableEvidence, FurtherReading, DiagramData, EcgFindings } from '../types';
import { db } from '../db';

const getAiClient = () => {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY });
};

export async function retryWithBackoff<T>(
    fn: (model?: string) => Promise<T>,
    maxRetries: number = 5,
    initialDelay: number = 2000,
    initialModel: string = FAST_MODEL
): Promise<T> {
    let lastError: any;
    let currentModel = initialModel;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn(currentModel);
        } catch (error: any) {
            console.error(`Attempt ${i + 1} failed with model ${currentModel}:`, {
                message: error?.message,
                status: error?.status,
                code: error?.code,
                errorObj: error
            });
            lastError = error;
            
            // Extract status code and message
            const status = error?.status || error?.response?.status || error?.code;
            const message = (error?.message || "").toLowerCase();
            
            const isRateLimit = status === 429 || 
                               message.includes("429") || 
                               message.includes("resource has been exhausted") ||
                               message.includes("quota") ||
                               message.includes("rate limit");

            const isTokenLimit = message.includes("max tokens limit") || 
                                message.includes("token limit exceeded") ||
                                message.includes("16384");

            const isForbidden = status === 403 || message.includes("forbidden");

            const isServerError = (status >= 500 && status < 600);

            // If it's not a retryable error, throw immediately
            if (!isRateLimit && !isServerError && !isTokenLimit && !isForbidden) {
                throw error;
            }

            // If it's forbidden, try switching to a more basic model if we're not already using it
            if (isForbidden && currentModel !== FAST_MODEL && i < maxRetries - 1) {
                console.warn("Model forbidden, switching to fast model for next attempt...");
                currentModel = FAST_MODEL;
                continue;
            }

            // If it's a token limit error, we can't just retry with same model/prompt
            if (isTokenLimit) {
                throw new Error("The discussion has become too complex for the current model. Please try starting a new discussion or asking a more specific, shorter question.");
            }

            // If it's a rate limit on the fast model, try the fallback model on next attempt
            if (isRateLimit && currentModel === FAST_MODEL && i < maxRetries - 1) {
                console.warn("Fast model exhausted, switching to fallback model for next attempt...");
                currentModel = FALLBACK_MODEL;
            } else if (isRateLimit && currentModel === PRO_MODEL && i < maxRetries - 1) {
                console.warn("Pro model exhausted, switching to fast model for next attempt...");
                currentModel = FAST_MODEL;
            }

            // Exponential backoff with jitter
            const baseDelay = isRateLimit ? 3000 : initialDelay;
            const delay = baseDelay * Math.pow(2, i) + Math.random() * 1000;
            
            console.warn(`Retrying in ${Math.round(delay)}ms due to ${isRateLimit ? 'rate limit' : 'server error'}...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // If we've exhausted all retries, try to provide a more user-friendly message
    if (lastError) {
        const status = lastError.status || lastError.code;
        if (status === 429) {
            throw new Error("The medical intelligence service is currently experiencing high demand. Please wait a few minutes and try again.");
        }
        if (status === 401 || status === 403) {
            throw new Error("Medical intelligence service authentication failed. Please verify your API key configuration.");
        }
        if (status === 404) {
            throw new Error(`The requested model (${currentModel}) was not found. Please check your configuration.`);
        }
    }
    
    throw lastError;
}

const FAST_MODEL = "gemini-3-flash-preview";
const FALLBACK_MODEL = "gemini-3.1-flash-lite-preview";
const PRO_MODEL = "gemini-3-flash-preview"; // Temporarily use flash as pro to avoid 403
const VISION_MODEL = "gemini-2.5-flash-image";

const SYNTHESIS_GUIDELINE = `
**STRICT MEDICAL SYNTHESIS RULES:**
1. **DISCIPLINE RIGOR:** Management MUST be specific to the discipline (e.g., Anaesthesia, Nursing).
2. **VISUALS:** Use triggers: \`[GRAPH: oxygen_dissociation]\`, \`[GRAPH: frank_starling]\`, \`[GRAPH: pressure_volume_loop]\`, \`[GRAPH: respiratory_flow_volume]\`.
3. **NO LATEX:** Do NOT use LaTeX or dollar signs ($ or $$) for equations.
4. **UNICODE SUBSCRIPTS/SUPERSCRIPTS:** You MUST use Unicode characters for all subscripts and superscripts in equations and formulas.
   - Example: pH = pKₐ + log₁₀ ( [HCO₃⁻] / (0.03 × PaCO₂) )
   - Example: Eₖ = 61.5 × log₁₀ ( [K⁺]out / [K⁺]in )
   - Subscripts: ₀₁₂₃₄₅₆₇₈₉ ₊ ₋ ₌ ₍ ₎ ₐ ₑ ₕ ᵢ ⱼ ₖ ₗ ₘ ₙ ₒ ₚ ᵣ ₛ ₜ ᵤ ᵥ ₓ
   - Superscripts: ⁰¹²³⁴⁵⁶⁷⁸⁹ ⁺ ⁻ ₌ ⁽ ⁾ ᵃ ᵇ ᶜ ᵈ ᵉ ᶠ ᵍ ʰ ⁱ ʲ ᵏ ˡ ᵐ ⁿ ᵒ ᵖ ʳ ˢ ᵗ ᵘ ᵛ ʷ ˣ ʸ ᶻ
5. **MOLECULAR FORMULAS:** Use Unicode: CO₂, O₂, H₂O, PaO₂, SaO₂, PvO₂, HCO₃⁻.
6. **COMPLETENESS:** You MUST provide detailed, high-fidelity content for EVERY field in the schema. DO NOT TRUNCATE. DO NOT USE PLACEHOLDERS.
7. **ACADEMIC RIGOR:** All references and sources MUST be real and traceable.
8. **EVIDENCE-BASED CONTENT REQUIREMENTS (MANDATORY):**
   - **PRIORITY OF ACCURACY:** Do not prioritize speed or completeness over accuracy. If information cannot be verified, state this explicitly.
   - **CITATION STANDARD:** All claims requiring evidence must be supported by citable sources. Prefer persistent identifiers (DOI, PMID, ISBN) over standard URLs.
   - **LINK INTEGRITY:** If URLs are provided, they must be derived from known stable repositories (e.g., publisher domains, government databases, PubMed). Do NOT generate fabricated links.
   - **VERIFICATION PROTOCOL:** You MUST use the Google Search tool to verify the existence of every reference before citing. If you cannot verify a reference, you MUST label it as [AI-Generated Citation - Requires Verification].
   - **UNCERTAINTY LABELING:** Any claim, statistic, or reference that cannot be cross-referenced with high-confidence training data must be labeled as [Unverified] or [Speculation].
   - **LOGICAL CONSISTENCY:** Ensure all arguments follow valid logical structures. Identify and expose any potential fallacies in the reasoning process.
   - **BIAS IDENTIFICATION:** Actively identify potential biases in the source material or in the interpretation of the data.
   - **REFERENCE FORMAT:** Provide references in a standard academic format (e.g., APA, Vancouver) including the persistent identifier.
   - **ERROR CORRECTION:** If you detect an error in your own reasoning or output during generation, correct it plainly and immediately.
   - **CRITICAL INSTRUCTION:** Do not agree with premises that lack evidence. Your role is to sharpen thinking, not to validate assumptions. If a request implies a factual certainty that does not exist, challenge the assumption rigorously.
`;

const EVIDENCE_GUIDELINE = `
**VERIFICATION RULES:**
1. **GOOGLE SEARCH:** You MUST use Google Search to verify clinical trials, PMIDs, and latest guidelines for the specific condition. 
2. **PMID/DOI VERIFICATION (CRITICAL):** You MUST verify the PMID and DOI for every reference using Google Search. Do NOT rely on internal knowledge for these IDs as they are frequently hallucinated. Cross-reference the title with the ID.
   - **MANDATORY:** You MUST include the PMID (e.g., "PMID: 12345678") or DOI (e.g., "10.1056/NEJMoa2206286") directly in the 'source' or 'reference' text field.
3. **PREFERRED SOURCES:** Prioritize evidence from:
   - Google Scholar
   - Government/Public Health Databases: PubMed, Medline Plus, clinicaltrials.gov, CDC.
   - Peer-Reviewed Medical Journals: JAMA Network, NEJM, The Lancet, Cochrane Library.
   - Academic Medical Centers: Mayo Clinic, Johns Hopkins Medicine, Cleveland Clinic.
4. **ACADEMIC RIGOR:** All "traceableEvidence" and "furtherReadings" MUST be real, existing publications. DO NOT FABRICATE PMIDs, DOIs, OR URLs.
5. **URL VERIFICATION:** The "url" field for each source MUST be a real, working link that leads DIRECTLY to the specific article, abstract, or guideline mentioned.
   - **CRITICAL:** You MUST verify that the article title at the URL matches your claim. Do NOT provide a URL if you are not 100% certain it leads to the correct material.
   - Do NOT use generic search result pages or homepage URLs.
6. **EVIDENCE-BASED CONTENT REQUIREMENTS (MANDATORY):**
   - **PRIORITY OF ACCURACY:** Do not prioritize speed or completeness over accuracy. If information cannot be verified, state this explicitly.
   - **CITATION STANDARD:** All claims requiring evidence must be supported by citable sources. Prefer persistent identifiers (DOI, PMID, ISBN) over standard URLs.
   - **LINK INTEGRITY:** If URLs are provided, they must be derived from known stable repositories (e.g., publisher domains, government databases, PubMed). Do NOT generate fabricated links.
   - **VERIFICATION PROTOCOL:** You MUST use the Google Search tool to verify the existence of every reference before citing. If you cannot verify a reference, you MUST label it as [AI-Generated Citation - Requires Verification].
   - **UNCERTAINTY LABELING:** Any claim, statistic, or reference that cannot be cross-referenced with high-confidence training data must be labeled as [Unverified] or [Speculation].
   - **LOGICAL CONSISTENCY:** Ensure all arguments follow valid logical structures. Identify and expose any potential fallacies in the reasoning process.
   - **BIAS IDENTIFICATION:** Actively identify potential biases in the source material or in the interpretation of the data.
   - **REFERENCE FORMAT:** Provide references in a standard academic format (e.g., APA, Vancouver) including the persistent identifier.
   - **ERROR CORRECTION:** If you detect an error in your own reasoning or output during generation, correct it plainly and immediately.
   - **CRITICAL INSTRUCTION:** Do not agree with premises that lack evidence. Your role is to sharpen thinking, not to validate assumptions. If a request implies a factual certainty that does not exist, challenge the assumption rigorously.
7. **QUIZ:** Generate exactly 5 high-yield MCQs with explanations.
8. **NO LATEX:** Do NOT use LaTeX or dollar signs ($ or $$) for equations. Use Unicode subscripts/superscripts.
9. **COMPLETENESS:** Ensure all 5 questions are fully generated.
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

const sourcesSchema = {
    type: Type.OBJECT,
    properties: {
        traceableEvidence: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    claim: { type: Type.STRING },
                    source: { type: Type.STRING },
                    url: { type: Type.STRING }
                },
                required: ["claim", "source", "url"]
            }
        },
        furtherReadings: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    topic: { type: Type.STRING },
                    reference: { type: Type.STRING },
                    url: { type: Type.STRING }
                },
                required: ["topic", "reference", "url"]
            }
        }
    },
    required: ["traceableEvidence", "furtherReadings"]
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
                    source: { type: Type.STRING },
                    url: { type: Type.STRING }
                },
                required: ["claim", "source", "url"]
            }
        },
        furtherReadings: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    topic: { type: Type.STRING },
                    reference: { type: Type.STRING },
                    url: { type: Type.STRING }
                },
                required: ["topic", "reference", "url"]
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

const coreCaseSchema = {
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
        }
    },
    required: ["title", "patientProfile", "presentingComplaint", "history", "biochemicalPathway", "multidisciplinaryConnections", "disciplineSpecificConsiderations"]
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

export const generateFullCaseStream = async function* (condition: string, discipline: string, difficulty: string, language: string) {
    const ai = getAiClient();
    
    const corePrompt = `Expert Medical Synthesis: Create a comprehensive, high-fidelity clinical case for "${condition}". 
    Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}.
    
    CORE MISSION: Produce a detailed, professional-grade medical case study.
    
    ${SYNTHESIS_GUIDELINE}
    
    IMPORTANT: You MUST output ONLY the JSON object.`;

    const stream = await retryWithBackoff(async (model) => {
        return await ai.models.generateContentStream({
            model: model || FAST_MODEL,
            contents: corePrompt,
            config: { 
                responseMimeType: "application/json", 
                responseSchema: coreCaseSchema,
                maxOutputTokens: 16384,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                tools: [{ googleSearch: {} }]
            },
        });
    });

    let fullText = "";
    let groundingSources: any[] = [];
    for await (const chunk of stream) {
        fullText += chunk.text;
        if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
            groundingSources = [...groundingSources, ...chunk.candidates[0].groundingMetadata.groundingChunks];
        }
        try {
            // Try to parse partial JSON if possible (this is hard for nested objects)
            // For now, we yield the full text so the UI can show progress
            yield { partialText: fullText };
        } catch (e) {}
    }

    const finalJson = JSON.parse(extractJson(fullText));
    finalJson.groundingSources = groundingSources;
    yield { finalCase: finalJson };
};

export const generateFullCase = async (condition: string, discipline: string, difficulty: string, language: string): Promise<{ patientCase: PatientCase, knowledgeMap: KnowledgeMapData }> => {
    const ai = getAiClient();
    
    const corePrompt = `Expert Medical Synthesis: Create a comprehensive, high-fidelity clinical case for "${condition}". 
    Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}.
    
    CORE MISSION: Produce a detailed, professional-grade medical case study that covers all aspects from demographics to deep biochemistry.
    
    REQUIREMENTS:
    1. PATIENT PROFILE: Elaborate on demographics, lifestyle, and background.
    2. PRESENTING COMPLAINT: Use precise clinical language.
    3. HISTORY: Include a full HPI, PMH (with specific dates/conditions), Medications (with dosages), and Social/Family History.
    4. BIOCHEMICAL PATHWAY: Provide a rigorous explanation of the pathophysiology. Include specific enzymes, metabolites, and chemical reactions.
    5. MULTIDISCIPLINARY CONNECTIONS: Detail how at least 3 other specialties (e.g., Radiology, Pathology, Cardiology) intersect with this case.
    6. MANAGEMENT: Provide specific, evidence-based management steps relevant to ${discipline}.
    
    ${SYNTHESIS_GUIDELINE}`;

    const mapPrompt = `Expert Medical Synthesis: Create a comprehensive knowledge map for a clinical case of "${condition}". 
    Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}.
    
    CORE MISSION: Design a network of 8-12 interconnected nodes showing how symptoms, labs, pathophysiology, and management mechanisms are linked for this condition.
    
    REQUIREMENTS:
    1. NODES: Create 8-12 nodes representing key concepts (e.g., specific symptoms, biomarkers, anatomical structures, drugs).
    2. LINKS: Create meaningful connections between these nodes with clear descriptions of the relationship.
    3. DISCIPLINE: Ensure the map highlights aspects relevant to ${discipline}.
    
    ${SYNTHESIS_GUIDELINE}`;

    const [coreData, mapData] = await Promise.all([
        retryWithBackoff(async (model) => {
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: model || FAST_MODEL,
                contents: corePrompt,
                config: { 
                    responseMimeType: "application/json", 
                    responseSchema: coreCaseSchema,
                    maxOutputTokens: 16384,
                    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
                },
            });

            const finishReason = response.candidates?.[0]?.finishReason;
            if (finishReason !== 'STOP') {
                console.warn("generateFullCase (core) finished with reason:", finishReason);
            }

            const text = response.text || "{}";
            try {
                return JSON.parse(extractJson(text));
            } catch (e) {
                console.error("JSON Parse Error in generateFullCase (core) retry:", e, text);
                throw new Error("Failed to parse core case JSON. Retrying...");
            }
        }),
        retryWithBackoff(async (model) => {
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: model || FAST_MODEL,
                contents: mapPrompt,
                config: { 
                    responseMimeType: "application/json", 
                    responseSchema: knowledgeMapSchema,
                    maxOutputTokens: 4096,
                    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
                },
            });

            const finishReason = response.candidates?.[0]?.finishReason;
            if (finishReason !== 'STOP') {
                console.warn("generateFullCase (map) finished with reason:", finishReason);
            }

            const text = response.text || "{}";
            try {
                return JSON.parse(extractJson(text));
            } catch (e) {
                console.error("JSON Parse Error in generateFullCase (map) retry:", e, text);
                throw new Error("Failed to parse knowledge map JSON. Retrying...");
            }
        })
    ]);

    // Validate knowledge map links
    const nodes = mapData.nodes || [];
    const links = mapData.links || [];
    const validNodeIds = new Set(nodes.map((n: any) => n.id));
    const validLinks = links.filter((l: any) => validNodeIds.has(l.source) && validNodeIds.has(l.target));

    const finalMap = { nodes, links: validLinks };
    const patientCase = { ...coreData, knowledgeMap: finalMap } as PatientCase;

    return { patientCase, knowledgeMap: finalMap as KnowledgeMapData };
};

export const generateKnowledgeMap = async (condition: string, discipline: string, difficulty: string, language: string): Promise<KnowledgeMapData> => {
    const ai = getAiClient();
    const mapPrompt = `Expert Medical Synthesis: Create a comprehensive knowledge map for a clinical case of "${condition}". 
    Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}.
    
    CORE MISSION: Design a network of 8-12 interconnected nodes showing how symptoms, labs, pathophysiology, and management mechanisms are linked for this condition.
    
    REQUIREMENTS:
    1. NODES: Create 8-12 nodes representing key concepts (e.g., specific symptoms, biomarkers, anatomical structures, drugs).
    2. LINKS: Create meaningful connections between these nodes with clear descriptions of the relationship.
    3. DISCIPLINE: Ensure the map highlights aspects relevant to ${discipline}.
    
    ${SYNTHESIS_GUIDELINE}`;

    const mapData = await retryWithBackoff(async (model) => {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model || FAST_MODEL,
            contents: mapPrompt,
            config: { 
                responseMimeType: "application/json", 
                responseSchema: knowledgeMapSchema,
                maxOutputTokens: 4096,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
            },
        });

        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason !== 'STOP') {
            console.warn("generateKnowledgeMap finished with reason:", finishReason);
        }

        const text = response.text || "{}";
        try {
            return JSON.parse(extractJson(text));
        } catch (e) {
            console.error("JSON Parse Error in generateKnowledgeMap retry:", e, text);
            throw new Error("Failed to parse knowledge map JSON. Retrying...");
        }
    });

    // Validate knowledge map links
    const nodes = mapData.nodes || [];
    const links = mapData.links || [];
    const validNodeIds = new Set(nodes.map((n: any) => n.id));
    const validLinks = links.filter((l: any) => validNodeIds.has(l.source) && validNodeIds.has(l.target));

    return { nodes, links: validLinks } as KnowledgeMapData;
};

export const generateEvidenceAndQuiz = async (condition: string, discipline: string, difficulty: string, language: string) => {
    const ai = getAiClient();
    const prompt = `Generate high-yield clinical evidence and a medical quiz for "${condition}".
    Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}.
    
    1. TRACEABLE EVIDENCE: Provide 3-5 verified clinical claims with sources (PMIDs or major guidelines). 
       - YOU MUST PERFORM A SEARCH to find real, existing evidence.
       - **CRITICAL:** Verify the PMID/DOI for each source via Google Search. Do NOT hallucinate IDs.
       - YOU MUST INCLUDE A VALID, CLICKABLE URL (e.g., https://pubmed.ncbi.nlm.nih.gov/...) in the "url" field for each source.
       - DO NOT FABRICATE URLs.
    2. FURTHER READINGS: Provide 2-3 relevant topics for deeper study. 
       - YOU MUST INCLUDE A VALID, CLICKABLE URL in the "url" field for each reference.
       - DO NOT FABRICATE URLs.
    3. EDUCATIONAL CONTENT: Create 3-5 high-yield teaching points. Each MUST have a detailed description and a diagram specification.
    4. QUIZ: Generate exactly 5 high-yield multiple-choice questions (MCQs).
       - Each question must have exactly 4 options.
       - Include a clear explanation for the correct answer.
       - Use medical terminology appropriate for ${difficulty} level.
       - Ensure formulas and symbols are correctly formatted in LaTeX or Unicode.
    
    ${EVIDENCE_GUIDELINE}`;
    
    try {
        const result = await retryWithBackoff(async (model) => {
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: model || FAST_MODEL,
                contents: prompt,
                config: { 
                    responseMimeType: "application/json", 
                    responseSchema: evidenceAndQuizSchema,
                    maxOutputTokens: 16384,
                    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    const response: GenerateContentResponse = await retryWithBackoff((model) => ai.models.generateContent({
        model: model || FAST_MODEL,
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
    const response: GenerateContentResponse = await retryWithBackoff((model) => ai.models.generateContent({
        model: model || FAST_MODEL,
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
    const response: GenerateContentResponse = await retryWithBackoff((model) => ai.models.generateContent({
        model: model || FAST_MODEL,
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

// Cache for concept abstracts to avoid redundant AI calls
const abstractCache = new Map<string, string>();

export const getConceptAbstract = async (concept: string, caseContext: string, language: string): Promise<string> => {
    const cacheKey = `${concept}_${language}`;
    if (abstractCache.has(cacheKey)) return abstractCache.get(cacheKey)!;

    // Check IndexedDB cache as well
    try {
        const cached = await db.patientCases.where('title').equals(`CACHE_${cacheKey}`).first();
        if (cached) {
            const result = cached.patientProfile;
            abstractCache.set(cacheKey, result);
            return result;
        }
    } catch (e) { console.error("Cache read error:", e); }

    const ai = getAiClient();
    const prompt = `Significance: "${concept}" in context of "${caseContext}". 50 words. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff((model) => ai.models.generateContent({
        model: model || FAST_MODEL,
        contents: prompt
    }));
    const result = response.text || "";
    
    if (result) {
        abstractCache.set(cacheKey, result);
        // Persist to DB cache (using patientProfile field as a temporary store for the abstract)
        db.patientCases.add({
            id: `cache_${Date.now()}_${Math.random()}`,
            title: `CACHE_${cacheKey}`,
            patientProfile: result,
            presentingComplaint: '',
            history: '',
            timestamp: Date.now()
        } as any).catch(e => console.error("Cache write error:", e));
    }
    
    return result;
};

export const getConceptConnectionExplanation = async (conceptA: string, conceptB: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Connection: "${conceptA}" and "${conceptB}" in "${caseContext}". 3 sentences. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff((model) => ai.models.generateContent({
        model: model || FAST_MODEL,
        contents: prompt
    }));
    return response.text || "";
};

export const generateDiagramForDiscussion = async (prompt: string, chatContext: string, language: string): Promise<DiagramData> => {
    const ai = getAiClient();
    const response: GenerateContentResponse = await retryWithBackoff((model) => ai.models.generateContent({
        model: model || FAST_MODEL,
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
    
    **MANDATORY VERIFICATION:** 
    1. Use the Google Search tool to verify all clinical evidence.
    2. Every PMID or DOI MUST be factually verified for accuracy and relevance using the search tool. Do NOT rely on internal memory for these IDs.
    3. **MANDATORY:** You MUST include the PMID (e.g., "PMID: 12345678") or DOI (e.g., "10.1056/NEJMoa2206286") directly in the 'source' or 'reference' text field.
    4. PREFERRED SOURCES: Google Scholar, PubMed, clinicaltrials.gov, CDC, JAMA, NEJM, The Lancet, Cochrane Library, Mayo Clinic, Johns Hopkins.
    5. YOU MUST INCLUDE A VALID, CLICKABLE URL (e.g., https://pubmed.ncbi.nlm.nih.gov/...) in the "url" field for each source and reference.
    6. **CRITICAL:** The URL MUST lead directly to the article or abstract. You MUST verify that the article title at the URL matches your claim.
    7. DO NOT FABRICATE URLs. Use the actual URLs found via the search tool.
    8. **EVIDENCE-BASED CONTENT REQUIREMENTS (MANDATORY):**
       - **PRIORITY OF ACCURACY:** Do not prioritize speed or completeness over accuracy. If information cannot be verified, state this explicitly.
       - **CITATION STANDARD:** All claims requiring evidence must be supported by citable sources. Prefer persistent identifiers (DOI, PMID, ISBN) over standard URLs.
       - **LINK INTEGRITY:** If URLs are provided, they must be derived from known stable repositories (e.g., publisher domains, government databases, PubMed). Do NOT generate fabricated links.
       - **VERIFICATION PROTOCOL:** You MUST use the Google Search tool to verify the existence of every reference before citing. If you cannot verify a reference, you MUST label it as [AI-Generated Citation - Requires Verification].
       - **UNCERTAINTY LABELING:** Any claim, statistic, or reference that cannot be cross-referenced with high-confidence training data must be labeled as [Unverified] or [Speculation].
       - **LOGICAL CONSISTENCY:** Ensure all arguments follow valid logical structures. Identify and expose any potential fallacies in the reasoning process.
       - **BIAS IDENTIFICATION:** Actively identify potential biases in the source material or in the interpretation of the data.
       - **REFERENCE FORMAT:** Provide references in a standard academic format (e.g., APA, Vancouver) including the persistent identifier.
       - **ERROR CORRECTION:** If you detect an error in your own reasoning or output during generation, correct it plainly and immediately.
       - **CRITICAL INSTRUCTION:** Do not agree with premises that lack evidence. Your role is to sharpen thinking, not to validate assumptions. If a request implies a factual certainty that does not exist, challenge the assumption rigorously.
    Language: ${language}.`;
    
    const response: GenerateContentResponse = await retryWithBackoff((model) => ai.models.generateContent({
        model: model || FAST_MODEL,
        contents: prompt,
        config: { 
            responseMimeType: "application/json",
            responseSchema: sourcesSchema,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            tools: [{ googleSearch: {} }], 
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
