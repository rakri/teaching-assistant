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
  //console.log('\n=== /api/lesson called ===');
  //console.log('Using OPENAI_API_KEY:', process.env.OPENAI_API_KEY);

  console.log('Request body:', JSON.stringify(req.body, null, 2));

  const { grade, subject, topic, history, reveal } = req.body;
  // Validate payload
  if (!grade || !topic || !Array.isArray(history)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;
  console.log('Last entry:', JSON.stringify(lastEntry, null, 2));

  // Extract previous question prompts to avoid repetition
  const previousQuestions = history.map(entry => entry.question?.prompt).filter(Boolean);
  console.log('Previous questions:', previousQuestions);

  const isFirst = history.length === 0;

  // Handle reveal request: provide detailed solution and next question
  if (!isFirst && reveal) {
    console.log('🕵️ Reveal mode: generating detailed solution and next question');
    const revealMessages = [
      {
        role: 'system',
        content: [
          subject === 'spanish' || subject === 'hindi' ? `You are a detailed, explanatory ${subject} tutor for ${grade}th-grade English speakers learning ${subject}.` : `You are a detailed, explanatory ${subject} tutor for ${grade}th-graders.`,
          subject === 'spanish' || subject === 'hindi' ? `Provide explanations in English and ${subject} content with English translations. Focus on practical language learning with age-appropriate examples.` : `Focus on teaching fundamental concepts with age-appropriate language and short real-world examples.`,
          `Ensure your solutions are correct and respond with JSON only; no extra text.`
        ].join(' ')
      },
      {
        role: 'user',
        content: [
          `Here is the last question, its explanation, and the student's answer:`,
          JSON.stringify({ question: lastEntry.question, explanation: lastEntry.explanation }, null, 2),
          `Student answered: "${lastEntry.answer}"`,
          `Now provide a step-by-step solution, using a simple real-world context if helpful, and then give a new question on "${topic}".`,
          previousQuestions.length > 0 ? `IMPORTANT: Avoid repeating these previously asked questions: ${previousQuestions.join('; ')}. Create a completely different question on the same topic.` : '',
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
        ].filter(Boolean).join('\n')
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
          subject === 'spanish' || subject === 'hindi' ? `You are a playful, engaging ${subject} tutor for ${grade}th-grade English speakers learning ${subject}.` : `You are a playful, engaging ${subject} tutor for ${grade}th-graders.`,
          subject === 'spanish' || subject === 'hindi' ? `Provide explanations in English and ${subject} content with English translations. Focus on practical language learning with brief real-world examples that help English speakers understand ${subject}.` : `Focus on helping students master fundamental ideas with age-appropriate language and brief real-world examples.`,
          `Make explanations fun—use characters, stories, or mini-scenes.`,
          `Value correctness greatly and always respond with JSON only; no extra text.`
        ].join(' ')
      },
      {
        role: 'user',
        content: [
          subject === 'spanish' || subject === 'hindi' ? `Introduce the ${subject} concept "${topic}" with a one-sentence mini-story or analogy a ${grade}th-grade English speaker will love. Provide explanations in English with ${subject} words/phrases and their English translations.` : `Introduce the concept "${topic}" with a one-sentence mini-story or analogy a ${grade}th-grader will love.`,
          subject === 'spanish' || subject === 'hindi' ? `Explain the language concept in simple English terms and include ${subject} examples with translations. Focus on practical usage for English speakers learning ${subject}.` : `Explain the idea in simple terms and include a short real-world example suited to their grade.`,
          subject === 'spanish' || subject === 'hindi' ? `Then give exactly one practice question that helps English speakers practice ${subject} vocabulary, grammar, or conversation skills.` : `Then give exactly one practice question that either applies the concept in real life or drills the basic skill.`,
          previousQuestions.length > 0 ? `IMPORTANT: Avoid repeating these previously asked questions: ${previousQuestions.join('; ')}. Create a completely different question on the same topic.` : '',
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
        ].filter(Boolean).join('\n')
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
          subject === 'spanish' || subject === 'hindi' ? `You are a playful, kid-friendly ${subject} tutor for ${grade}th-grade English speakers learning ${subject}.` : `You are a playful, kid-friendly ${subject} tutor for ${grade}th-graders.`,
          subject === 'spanish' || subject === 'hindi' ? `Focus on checking that the English-speaking student grasps the ${subject} language concept. Provide feedback and hints in English with ${subject} translations when helpful.` : `Focus on checking that the student grasps the basic concept and guide them with clear, correct reasoning.`,
          `Based on the student’s last answer and the full question context (prompt and explanation), infer the likely mistake and give a short real-world hint if possible.`,
          `For incorrect answers, your NEXT QUESTION must be self-contained: repeat the entire question object including its explanation.`,
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
            subject === 'spanish' || subject === 'hindi' ? `You are a playful, engaging ${subject} tutor for ${grade}th-grade English speakers learning ${subject}.` : `You are a playful, engaging ${subject} tutor for ${grade}th-graders.`,
            subject === 'spanish' || subject === 'hindi' ? `Focus on reinforcing ${subject} language concepts with English explanations and ${subject} content with translations. Use real-world contexts that help English speakers understand ${subject}.` : `Focus on reinforcing basic concepts with age-appropriate language and real-world contexts.`,
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
            subject === 'spanish' || subject === 'hindi' ? `Now, give a new question on the same ${subject} topic "${topic}" that helps English speakers practice another aspect of ${subject} language learning with practical examples.` : `Now, give a new question on the same topic "${topic}" that checks another fundamental aspect using a brief real-world example or a basic drill.`,
            previousQuestions.length > 0 ? `IMPORTANT: Avoid repeating these previously asked questions: ${previousQuestions.join('; ')}. Create a completely different question on the same topic.` : '',
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
          ].filter(Boolean).join('\n')
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
