import { openai, MODEL, MODEL_EVAL, TEMP_GEN, TEMP_EVAL, stripAndParseJson } from '../../utils/openai';

export default async function handler(req, res) {
  // Method guard: only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }
  // Early env check
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  console.log('\n=== /api/lesson called ===');
  console.log('Using OPENAI_API_KEY:', process.env.OPENAI_API_KEY);

  console.log('Request body:', JSON.stringify(req.body, null, 2));

  const { grade, topic, history, reveal } = req.body;
  // Validate payload
  if (!grade || !topic || !Array.isArray(history)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;
  console.log('Last entry:', JSON.stringify(lastEntry, null, 2));

  const isFirst = history.length === 0;

  // Handle reveal request: provide detailed solution and next question
  if (!isFirst && reveal) {
    console.log('🕵️ Reveal mode: generating detailed solution and next question');
    const revealMessages = [
      {
        role: 'system',
        content: `You are a detailed, explanatory math tutor for ${grade}th-graders. Respond with JSON only, no extra text.`
      },
      {
        role: 'user',
        content: [
          `Here is the last question, its explanation, and the student's answer:`,
          JSON.stringify({ question: lastEntry.question, explanation: lastEntry.explanation }, null, 2),
          `Student answered: "${lastEntry.answer}"`,
          `Now provide a step-by-step solution and then a new question on "${topic}".`,
          `Return exactly this JSON shape (no fences):`,
          `{`,
          `  "status": "revealed",`,
          `  "solution": "…detailed solution…",`,
          `  "nextQuestion": {`,
          `    "id": "…string…",`,
          `    "prompt": "…string…",`,
          `    "type": "numeric" or "mcq",`,
          `    "options"?: ["…string…"],`,
          `    "explanation": "…string…"`,
          `  }`,
          `}`,
        ].join('\n')
      }
    ];
    console.log('📤 Reveal LLM messages:', JSON.stringify(revealMessages, null, 2));
    const revResp = await openai.chat.completions.create({
      model: MODEL,
      messages: revealMessages,
      temperature: TEMP_GEN,
    });
    const revRaw = revResp.choices?.[0]?.message?.content;
    console.log('📥 Reveal LLM response raw:', revRaw);
    let revData;
    try {
      revData = stripAndParseJson(revRaw);
      console.log('✅ Reveal parsed:', JSON.stringify(revData, null, 2));
      return res.status(200).json(revData);
    } catch (err) {
      console.error('❌ Reveal parse error:', err);
      return res.status(500).json({ error: 'Invalid JSON in reveal', raw: revRaw });
    }
  }
  // First turn: explanation + initial question at creative temperature
  if (isFirst) {
    const initMessages = [
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
    ];
    console.log('📤 Initial LLM messages:', JSON.stringify(initMessages, null, 2));
    try {
      const resp = await openai.chat.completions.create({
        model: MODEL,
        messages: initMessages,
        temperature: TEMP_GEN,
      });
      console.log('📥 Initial LLM response raw:', resp.choices?.[0]?.message?.content);
      if (!resp.choices?.length) throw new Error('No choices returned from OpenAI');
      const raw = resp.choices[0].message.content;
      const data = stripAndParseJson(raw);
      return res.status(200).json(data);
    } catch (err) {
      console.error('❌ Initial lesson error:', err);
      return res.status(502).json({ error: 'Lesson generation failed' });
    }
  }
  // Follow-up: evaluate answer first, then generate next question if correct
  try {
    // Evaluate correctness & get feedback/hint
    const evalMessages = [
      {
        role: 'system',
        content: [
          `You are a playful, kid-friendly ${grade}th-grade tutor.`,
          `Based on the student’s last answer and the full question context (prompt and explanation), infer the likely mistake and give a diagnostic hint.`,
          `For incorrect answers, your NEXT QUESTION must be self-contained: repeat the entire question object including its explanation. Carefully check for correctness of answer, that is paramount.`,
          `Always respond with JSON only; no extra text.`
        ].join(' ')
      },
      {
        role: 'user',
        content: [
          `Here is the last question, its explanation, and the student's answer:`,
          JSON.stringify({
            question: lastEntry.question,
            explanation: lastEntry.explanation
          }, null, 2),
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
          `  • "nextQuestion" repeats the entire question object including its explanation:`,
          "```json",
          JSON.stringify({
  status: "incorrect",
  feedback: "Oops, not quite—let’s walk through it.",
  hint: "…diagnostic hint…",
  nextQuestion: {
    ...lastEntry.question,
    explanation: lastEntry.explanation
  }
}, null, 2),
          "```",
          ``,
          `Do not include anything outside the JSON object.`
        ].join('\n')
      }
    ];
    console.log('📤 Eval LLM messages:', JSON.stringify(evalMessages, null, 2));
    const evalResp = await openai.chat.completions.create({
      model: MODEL_EVAL,
      messages: evalMessages,
      temperature: TEMP_EVAL,
    });
    console.log('📥 Eval LLM response raw:', evalResp.choices?.[0]?.message?.content);
    if (!evalResp.choices?.length) throw new Error('No choices from evaluation');
    const evalRaw = evalResp.choices[0].message.content;
    const evalData = stripAndParseJson(evalRaw);
    console.log('✅ Evaluation parsed:', JSON.stringify(evalData, null, 2));
    const statusNorm = String(evalData.status).toLowerCase().trim();
    console.log('🔍 Normalized status:', statusNorm);

    // If correct, generate fresh nextQuestion
    if (statusNorm === 'correct') {
      console.log('✨ Status is correct, generating next question');
      const genMessages = [
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
            `Here is the last question and answer:`,
            JSON.stringify(lastEntry.question, null, 2),
            `Student answered: "${lastEntry.answer}"`,
            ``,
            `Now, give a new question on the same topic "${topic}" to challenge the student further.`,
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
      ];
      console.log('📤 Generation messages:', JSON.stringify(genMessages, null, 2));
      const genResp = await openai.chat.completions.create({
        model: MODEL,
        messages: genMessages,
        temperature: TEMP_GEN,
      });
      console.log('📥 Gen LLM response raw:', genResp.choices?.[0]?.message?.content);
      if (genResp.choices?.length) {
        const genRaw = genResp.choices[0].message.content;
        console.log('📥 Raw generated question:', genRaw);
        try {
          const genData = stripAndParseJson(genRaw);
          // Extract the question object so front-end sees correct prompt
          evalData.nextQuestion = genData.question;
          // Optionally include explanation for follow-up
          evalData.explanation = genData.explanation;
          console.log('✅ Extracted nextQuestion:', JSON.stringify(evalData.nextQuestion, null, 2));
          console.log('📖 Follow-up explanation:', genData.explanation);
        } catch (err) {
          console.error('❌ Error parsing generated question:', err);
        }
      } else {
        console.warn('⚠️ No choices returned for nextQuestion generation');
      }
    } else {
      console.log('ℹ️ Status not correct, using repeated question');
      // Ensure full context: add original explanation
      if (lastEntry.explanation) {
        console.log('🛠️ Attaching original explanation to nextQuestion and response');
        evalData.nextQuestion = {
          ...evalData.nextQuestion,
          explanation: lastEntry.explanation,
        };
        // Expose explanation at top level for UI
        evalData.explanation = lastEntry.explanation;
      }
    }
    return res.status(200).json(evalData);
  } catch (err) {
    console.error('❌ Follow-up lesson error:', err);
    return res.status(502).json({ error: 'Lesson evaluation failed' });
  }
}
