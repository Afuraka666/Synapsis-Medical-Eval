import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not found in environment.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function translate() {
  const missingKeys = JSON.parse(fs.readFileSync("missing_keys.json", "utf-8"));
  
  const prompt = `
You are an expert medical translator specializing in Bemba (ChiBemba), a language spoken in Zambia.
Translate the following English medical UI strings into Bemba.
Maintain the JSON structure.
For strings that look like arrow functions (e.g., "score => ..."), translate the text content inside the template literals but keep the logic and variable names (like \${score}) intact.
For arrays, translate each element.

English Strings:
\${JSON.stringify(missingKeys, null, 2)}

Return ONLY the translated JSON object.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      }
    });

    const translatedJson = response.text;
    fs.writeFileSync("translated_keys.json", translatedJson);
    console.log("Translation complete. Saved to translated_keys.json");
  } catch (error) {
    console.error("Translation failed:", error);
    process.exit(1);
  }
}

translate();
