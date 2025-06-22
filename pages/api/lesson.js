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

  const { grade, subject, topic, history, reveal, difficulty = 'medium' } = req.body;
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

  // Generate difficulty-specific instructions
  const getDifficultyInstructions = (difficultyLevel) => {
    switch (difficultyLevel) {
      case 'easy':
        return 'Generate EASIER questions with simpler concepts, smaller numbers, basic vocabulary, and more straightforward problems. Provide extra hints and encouragement.';
      case 'hard':
        return 'Generate CHALLENGING questions with more complex concepts, larger numbers, advanced vocabulary, and multi-step problems that require deeper thinking.';
      case 'medium':
      default:
        return 'Generate questions at a moderate difficulty level appropriate for the grade level.';
    }
  };

  const difficultyInstructions = getDifficultyInstructions(difficulty);
  console.log(`Using difficulty: ${difficulty} - ${difficultyInstructions}`);

  // Handle reveal request: provide detailed solution and next question
  if (!isFirst && reveal) {
    console.log('🕵️ Reveal mode: generating detailed solution and next question');
    const revealMessages = [
      {
        role: 'system',
        content: [
          subject === 'spanish' || subject === 'hindi' ? `You are a detailed, explanatory ${subject} tutor for ${grade}th-grade English speakers learning ${subject}.` : `You are a detailed, explanatory ${subject} tutor for ${grade}th-graders.`,
          subject === 'spanish' || subject === 'hindi' ? `Provide explanations in English and ${subject} content with English translations. Focus on practical language learning with age-appropriate examples.` : `Focus on teaching fundamental concepts with age-appropriate language and short real-world examples.`,
          difficultyInstructions,
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
          `    "type": "numeric" or "mcq" or "text",`,
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
          difficultyInstructions,
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
    "type": "numeric"|"mcq"|"text",
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
  // Follow-up: evaluate answer only (no question generation)
  try {
    // Evaluate correctness & get feedback/hint
    const evalMessages = [
      {
        role: 'system',
        content: [
//          subject === 'spanish' || subject === 'hindi' ? `You are a playful, kid-friendly ${subject} tutor for ${grade}th-grade English speakers learning ${subject}.` : `You are a playful, kid-friendly ${subject} tutor for ${grade}th-graders.`,
//          subject === 'spanish' || subject === 'hindi' ? `Focus on checking that the English-speaking student grasps the ${subject} language concept. Provide feedback and hints in English with ${subject} translations when helpful.` : `Focus on checking that the student grasps the basic concept and guide them with clear, correct reasoning.`,
          `Based on the student's answer and the full question with context, think hard and evaluate if the answer is correct or not. 
          Make sure the final answer in your response is correct or incorrect. This rule HAS to be followed, and the response cannot end with any other word, not even a full stop like "correct." or "incorrect.".`
        ].join(' ')
      },
      {
        role: 'user',
        content: [
          lastEntry.explanation ? `Context: ${lastEntry.explanation}` : '',
          `Question: ${lastEntry.question.prompt}`,
          `Student Answer: ${lastEntry.answer}`
        ].filter(Boolean).join('. ')
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
    
    // Extract the final word to determine correctness
    const finalWord = evalRaw.trim().split(/\s+/).pop().toLowerCase();
    console.log('🔍 Final word from evaluation:', finalWord);
    
    let status;
    if (finalWord === 'correct') {
      status = 'correct';
    } else if (finalWord === 'incorrect') {
      status = 'incorrect';
    } else {
      console.warn('⚠️ Unexpected final word:', finalWord, 'defaulting to incorrect');
      status = 'incorrect';
    }
    
    // Create evaluation response object
    const evalData = {
      status: status,
      feedback: evalRaw, // Use the full LLM response as feedback
    };
    
    // For correct answers, generate an explanation of why it's correct
    if (status === 'correct') {
      console.log('✅ Answer correct, generating explanation...');
      
      const explanationMessages = [
        {
          role: 'system',
          content: [
            subject === 'spanish' || subject === 'hindi' ? `You are an encouraging ${subject} tutor for ${grade}th-grade English speakers learning ${subject}.` : `You are an encouraging ${subject} tutor for ${grade}th-graders.`,
            `Provide a clear, positive explanation of why the student's answer is correct.`,
            `Help them understand the reasoning and reinforce their learning.`,
            `Always respond with JSON only; no extra text.`
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            `Question: ${lastEntry.question.prompt}`,
            lastEntry.explanation ? `Context: ${lastEntry.explanation}` : '',
            `Student's correct answer: ${lastEntry.answer}`,
            ``,
            `Explain why this answer is correct and help reinforce their understanding.`,
            `Return exactly this JSON format:`,
            `{`,
            `  "explanation": "Great job! Here's why your answer is correct: [clear explanation]"`,
            `}`
          ].filter(Boolean).join('\n')
        }
      ];
      
      console.log('📤 Explanation generation messages:', JSON.stringify(explanationMessages, null, 2));
      
      try {
        const explainResp = await openai.chat.completions.create({
          model: MODEL_EVAL,
          messages: explanationMessages,
          temperature: TEMP_GEN,
        });
        
        const explainRaw = explainResp.choices?.[0]?.message?.content;
        console.log('📥 Explanation generation response raw:', explainRaw);
        
        if (explainRaw) {
          const explainData = stripAndParseJson(explainRaw);
          evalData.explanation = explainData.explanation;
        } else {
          evalData.explanation = "Great job! Your answer is correct!";
        }
      } catch (explainErr) {
        console.error('❌ Explanation generation error:', explainErr);
        evalData.explanation = "Great job! Your answer is correct!";
      }
    }
    
    // For incorrect answers, generate a hint and include the original question for re-display
    else if (status === 'incorrect') {
      console.log('🔍 Answer incorrect, generating hint...');
      
      // Generate hint with separate LLM call
      const hintMessages = [
        {
          role: 'system',
          content: [
            subject === 'spanish' || subject === 'hindi' ? `You are a helpful ${subject} tutor for ${grade}th-grade English speakers learning ${subject}.` : `You are a helpful ${subject} tutor for ${grade}th-graders.`,
            `Provide a clear, encouraging hint that guides the student toward the correct answer without giving it away completely.`,
            `Focus on helping them understand their mistake and think through the problem step by step.`,
            `Always respond with JSON only; no extra text.`
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            `Question: ${lastEntry.question.prompt}`,
            lastEntry.explanation ? `Context: ${lastEntry.explanation}` : '',
            `Student's incorrect answer: ${lastEntry.answer}`,
            ``,
            `Provide a helpful hint that guides the student toward the correct answer without revealing the answer like a teacher would.`,
            `Return exactly this JSON format:`,
            `{`,
            `  "hint": "Your encouraging hint here that helps them understand what to think about or reconsider"`,
            `}`
          ].filter(Boolean).join('\n')
        }
      ];
      
      console.log('📤 Hint generation messages:', JSON.stringify(hintMessages, null, 2));
      
      try {
        const hintResp = await openai.chat.completions.create({
          model: MODEL_EVAL,
          messages: hintMessages,
          temperature: TEMP_GEN, // Use generation temperature for more creative hints
        });
        
        const hintRaw = hintResp.choices?.[0]?.message?.content;
        console.log('📥 Hint generation response raw:', hintRaw);
        
        if (hintRaw) {
          const hintData = stripAndParseJson(hintRaw);
          evalData.hint = hintData.hint;
        } else {
          evalData.hint = "Think about this step by step. What part of the question might you have missed?";
        }
      } catch (hintErr) {
        console.error('❌ Hint generation error:', hintErr);
        evalData.hint = "Think about this step by step. What part of the question might you have missed?";
      }
      
      evalData.question = {
        ...lastEntry.question,
        explanation: lastEntry.explanation
      };
      evalData.explanation = lastEntry.explanation;
    }
    
    console.log('✅ Evaluation processed:', JSON.stringify(evalData, null, 2));
    return res.status(200).json(evalData);
  } catch (err) {
    console.error('❌ Follow-up lesson error:', err);
    return res.status(502).json({ error: 'Lesson evaluation failed' });
  }
}