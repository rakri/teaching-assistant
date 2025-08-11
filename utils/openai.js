import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Missing OPENAI_API_KEY');
  throw new Error('OPENAI_API_KEY not set');
}

export const openai = new OpenAI({ apiKey });
export const MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
export const MODEL_EVAL = process.env.OPENAI_MODEL || 'gpt-5-mini'; // Model for answer evaluation
export const TEMP_GEN = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7;  // Temperature for question generation
export const TEMPERATURE = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7;  // Temperature for question generation
export const TEMP_EVAL = parseFloat(process.env.OPENAI_EVAL_TEMPERATURE) || 0.1; // Temperature for answer evaluation

/**
 * Strip Markdown fences and parse JSON from LLM response.
 * @param {string} raw LLM response content
 * @returns {any} Parsed JSON object
 * @throws will throw if JSON.parse fails
 */
export function stripAndParseJson(raw) {
  const trimmed = raw.trim();
  // Remove Markdown fences
  const noFences = trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  // Locate JSON object or array delimiters
  const objStart = noFences.indexOf('{');
  const objEnd = noFences.lastIndexOf('}');
  const arrStart = noFences.indexOf('[');
  const arrEnd = noFences.lastIndexOf(']');
  let jsonText = noFences;
  if (objStart !== -1 && objEnd !== -1 && objStart < objEnd) {
    jsonText = noFences.slice(objStart, objEnd + 1);
  } else if (arrStart !== -1 && arrEnd !== -1 && arrStart < arrEnd) {
    jsonText = noFences.slice(arrStart, arrEnd + 1);
  }
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    console.error('stripAndParseJson failed to parse JSON.');
    console.error('Raw response:', raw);
    console.error('Cleaned text:', noFences);
    console.error('JSON text:', jsonText);
    throw err;
  }
}
