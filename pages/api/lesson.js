import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  console.log('\n=== /api/lesson called ===');
  console.log('Using OPENAI_API_KEY:', process.env.OPENAI_API_KEY);

  const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
  console.log('Using model:', MODEL);

  console.log('Request body:', JSON.stringify(req.body, null, 2));

  const { grade, topic, history } = req.body;
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;
  console.log('Last entry:', JSON.stringify(lastEntry, null, 2));

  const isFirst = history.length === 0;

  const messages = isFirst
    ? [
        {
          role: 'system',
          content: [
            `You are a playful, engaging math tutor for ${grade}th-graders.`,
            `Make explanations fun—use characters, stories, or mini-scenes.`,
            `Always respond with JSON only; no extra text.`
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            `Introduce the concept "${topic}" with a 1-sentence mini-story or analogy a ${grade}th-grader will love.`,
            `Then give exactly one practice question—alternate between creative real-world problems and basic drills.`,
            `Return exactly this JSON shape (no fences):`,
            "```json",
            `{
  "status": "pending",
  "explanation": "…string…",
  "question": {
    "id": "…string…",
    "prompt": "…string…",
    "type": "numeric"|"mcq",
    "options"?: ["…string…"]
  }
}`,
            "```"
          ].join('\n')
        }
      ]
    : [
        {
          role: 'system',
          content: [
            `You are a playful, kid-friendly ${grade}th-grade tutor.`,
            `Based on the student’s last answer, infer the likely mistake and give a diagnostic hint.`,
            `For incorrect answers, your NEXT QUESTION must be self-contained: include the full original prompt verbatim.`,
            `Always respond with JSON only; no extra text.`
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            `Here is the last question and answer:`,
            JSON.stringify(lastEntry.question, null, 2),
            `Student answered: "${lastEntry.answer}"`,
            ``,
            `If correct, return:`,
            "```json",
            `{
  "status": "correct",
  "feedback": "Great job! You nailed it! 🎉",
  "nextQuestion": { /* brand-new question */ }
}`,
            "```",
            ``,
            `If incorrect, return JSON where:`,
            `  • "hint" is a diagnostic tip, and`,
            `  • "nextQuestion" repeats the entire question object (self-contained):`,
            "```json",
            `{
  "status": "incorrect",
  "feedback": "Oops, not quite—let’s walk through it.",
  "hint": "…diagnostic hint…",
  "nextQuestion": ${JSON.stringify(lastEntry.question, null, 2)}
}`,
            "```",
            ``,
            `Do not include anything outside the JSON object.`
          ].join('\n')
        }
      ];

  console.log('LLM request messages:', JSON.stringify(messages, null, 2));
  console.log('LLM user message content:', messages[messages.length - 1].content);

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.7,
    });

    let raw = response.choices[0].message.content;
    console.log('Raw OpenAI response:', raw);

    let cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```$/, '');
    console.log('After fence-strip:', cleaned);

    const b1 = cleaned.indexOf('{');
    const b2 = cleaned.lastIndexOf('}');
    if (b1 !== -1 && b2 !== -1 && b1 < b2) {
      cleaned = cleaned.slice(b1, b2 + 1);
    }
    console.log('JSON-to-parse:', cleaned);

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch (err) {
      console.error('❌ JSON parse error:', err);
      return res.status(500).json({ error: 'Invalid JSON', raw: cleaned });
    }

    console.log('✅ Parsed data:', JSON.stringify(data, null, 2));
    return res.status(200).json(data);

  } catch (err) {
    console.error('❌ Error calling OpenAI:', err);
    return res.status(500).json({ error: 'Lesson generation failed' });
  }
}
