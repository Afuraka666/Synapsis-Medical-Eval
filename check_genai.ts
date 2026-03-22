
import * as genai from "@google/genai";
console.log("Exports of @google/genai:", Object.keys(genai));
if (genai.ThinkingLevel) {
    console.log("ThinkingLevel is available:", genai.ThinkingLevel);
} else {
    console.log("ThinkingLevel is NOT available");
}
