import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  const { grade } = req.query;
  console.log('/api/topics called with grade:', grade);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an elementary math curriculum planner.' },
        { role: 'user', content: `List the key topics for grade ${grade} math as a JSON array of strings.` }
      ],
      temperature: 0.7,
    });

    let content = response.choices[0].message.content;
    console.log('Raw OpenAI topics response:', content);

    // Strip Markdown fences if present
    // This will remove ```json ... ``` or ``` ... ```
    content = content
      .trim()
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```$/, '');

    console.log('Cleaned topics string:', content);

    let topics = [];
    try {
      topics = JSON.parse(content);
    } catch (err) {
      console.error('JSON parse error in topics:', err);
      // Optionally: send back the raw string so you can inspect it in the client
      return res.status(500).json({ error: 'Invalid JSON from LLM', raw: content });
    }

    res.status(200).json({ topics });
  } catch (err) {
    console.error('Error in /api/topics:', err);
    res.status(500).json({ topics: [] });
  }
}
