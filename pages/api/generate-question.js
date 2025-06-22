import { openai, MODEL, TEMP_GEN, stripAndParseJson } from '../../utils/openai';

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

  console.log('Generate question request body:', JSON.stringify(req.body, null, 2));

  const { grade, subject, topic, history, difficulty = 'medium' } = req.body;
  
  // Validate payload
  if (!grade || !subject || !topic || !Array.isArray(history)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  // Extract previous question prompts to avoid repetition
  const previousQuestions = history.map(entry => entry.question?.prompt).filter(Boolean);
  console.log('Previous questions for new generation:', previousQuestions);

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
  console.log(`Generating question with difficulty: ${difficulty} - ${difficultyInstructions}`);

  try {
    const genMessages = [
      {
        role: 'system',
        content: [
          subject === 'spanish' || subject === 'hindi' ? `You are a playful, engaging ${subject} tutor for ${grade}th-grade English speakers learning ${subject}.` : `You are a playful, engaging ${subject} tutor for ${grade}th-graders.`,
          subject === 'spanish' || subject === 'hindi' ? `Focus on reinforcing ${subject} language concepts with English explanations and ${subject} content with translations. Use real-world contexts that help English speakers understand ${subject}.` : `Focus on reinforcing basic concepts with age-appropriate language and real-world contexts.`,
          `Make explanations fun—use characters, stories, or mini-scenes.`,
          difficultyInstructions,
          `Always respond with JSON only; no extra text.`
        ].join(' ')
      },
      {
        role: 'user',
        content: [
          `Generate a new question on the ${subject} topic "${topic}" for a ${grade}th-grade student.`,
          subject === 'spanish' || subject === 'hindi' ? `The question should help English speakers practice ${subject} language learning with practical examples.` : `The question should check fundamental understanding using a brief real-world example or a basic drill.`,
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
    
    console.log('📤 Question generation messages:', JSON.stringify(genMessages, null, 2));
    
    const genResp = await openai.chat.completions.create({
      model: MODEL,
      messages: genMessages,
      temperature: TEMP_GEN,
    });
    
    console.log('📥 Question generation response raw:', genResp.choices?.[0]?.message?.content);
    
    if (!genResp.choices?.length) {
      throw new Error('No choices returned from OpenAI');
    }
    
    const genRaw = genResp.choices[0].message.content;
    const genData = stripAndParseJson(genRaw);
    
    console.log('✅ Generated question parsed:', JSON.stringify(genData, null, 2));
    
    return res.status(200).json(genData);
    
  } catch (err) {
    console.error('❌ Question generation error:', err);
    return res.status(502).json({ error: 'Question generation failed' });
  }
}