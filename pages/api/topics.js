import { openai, MODEL, TEMPERATURE, stripAndParseJson } from '../../utils/openai';
// Using shared OpenAI client and config

export default async function handler(req, res) {
  // Validate method
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  const { grade, subject } = req.query;
  console.log('/api/topics called with grade:', grade, 'subject:', subject);

  try {
    const plannerRole = {
      math: 'You are an elementary math curriculum planner.',
      science: 'You are an elementary science curriculum planner.',
      spanish: 'You are a beginner Spanish language curriculum planner for English speakers. Plan topics that help English speakers learn Spanish vocabulary, grammar, and conversation skills.',
      hindi: 'You are a beginner Hindi language curriculum planner for English speakers. Plan topics that help English speakers learn Hindi vocabulary, grammar, and conversation skills.'
    }[subject] || 'You are an elementary tutor.';

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: plannerRole },
        { role: 'user', content: (
          subject === 'spanish' || subject === 'hindi'
            ? `List the fundamental ${subject} topics appropriate for grade ${grade} English-speaking students learning ${subject} as a JSON array of strings. Return AT MOST 12 topics. Prioritize foundational coverage and diversity across sub-areas students should master first. Focus on practical vocabulary, basic grammar, and conversational skills. Respond with JSON array ONLY; no extra text.`
            : `List the fundamental ${subject} topics appropriate for grade ${grade} as a JSON array of strings. Return AT MOST 12 topics. Prioritize foundational coverage and diversity across sub-areas students should master first. Focus on core concepts that build a strong foundation. Respond with JSON array ONLY; no extra text.`
        ) }
      ],
      temperature: TEMPERATURE,
    });

    if (!response.choices || response.choices.length === 0) {
      throw new Error('No choices returned from OpenAI');
    }
    const raw = response.choices[0].message.content;
    console.log('Raw OpenAI topics response:', raw);

    let topics;
    try {
      topics = stripAndParseJson(raw);
    } catch (err) {
      console.error('JSON parse error in topics:', err);
      return res.status(500).json({ error: 'Invalid JSON from LLM', raw });
    }

    // Normalize to an array of unique, non-empty strings and hard-cap to 12
    if (!Array.isArray(topics)) {
      console.warn('⚠️ LLM did not return an array. Raw:', topics);
      return res.status(500).json({ error: 'Invalid topics format from LLM' });
    }

    const cleaned = topics
      .filter(t => typeof t === 'string')
      .map(t => t.trim())
      .filter(Boolean);

    const unique = Array.from(new Set(cleaned));
    const limited = unique.slice(0, 12);

    console.log(`✅ Parsed topics (${limited.length} capped):`, limited);

    res.status(200).json({ topics: limited });
  } catch (err) {
    console.error('Error in /api/topics:', err);
    res.status(502).json({ error: 'Topics generation failed' });
  }
}
