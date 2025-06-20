import { Configuration, OpenAIApi } from 'openai';
const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

export default async function handler(req, res) {
  const { grade } = req.query;
  const response = await openai.createChatCompletion({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are an elementary math curriculum planner.' },
      { role: 'user', content: `List the key topics for grade ${grade} math as a JSON array of strings.` }
    ],
    temperature: 0.7,
  });
  let topics = [];
  try { topics = JSON.parse(response.data.choices[0].message.content); } catch {}
  res.status(200).json({ topics });
}