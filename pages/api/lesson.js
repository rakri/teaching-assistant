import { Configuration, OpenAIApi } from 'openai';
const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

export default async function handler(req, res) {
  const { grade, topic, history } = req.body;
  const isFirst = history.length === 0;
  const messages = isFirst
    ? [
        { role: 'system', content: `You are a friendly ${grade}th-grade math tutor.` },
        { role: 'user', content: `Teach "${topic}" with a 2-sentence explanation, then one practice question. Return JSON {explanation:string,question:{id:string,prompt:string,type:"numeric"|"mcq",options?:string[]}}.` }
      ]
    : [
        { role: 'system', content: 'You are a smart tutor adjusting difficulty.' },
        { role: 'user', content: `History: ${JSON.stringify(history)}. Provide feedback and nextQuestion JSON {feedback:string,nextQuestion:{id:string,prompt:string,type:"numeric"|"mcq",options?:string[]}}.` }
      ];
  const response = await openai.createChatCompletion({ model: 'gpt-4o-mini', messages, temperature: 0.7 });
  let data = {};
  try { data = JSON.parse(response.data.choices[0].message.content); } catch {}
  res.status(200).json(data);
}