import { useState } from 'react';

export default function Home() {
  const [grade, setGrade] = useState('');
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [history, setHistory] = useState([]);
  const [content, setContent] = useState(null);

  const handleGradeSelect = async (e) => {
    const g = e.target.value;
    setGrade(g);
    const res = await fetch(`/api/topics?grade=${g}`);
    const data = await res.json();
    setTopics(data.topics);
  };

  const handleTopicSelect = async (topic) => {
    setSelectedTopic(topic);
    setHistory([]);
    const res = await fetch('/api/lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grade, topic, history: [] }),
    });
    const data = await res.json();
    setContent({ explanation: data.explanation, question: data.question });
  };

  const handleAnswer = async (answer) => {
    const newHistory = [...history, { question: content.question, answer }];
    setHistory(newHistory);
    const res = await fetch('/api/lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grade, topic: selectedTopic, history: newHistory }),
    });
    const data = await res.json();
    setContent({ explanation: data.explanation, question: data.nextQuestion, feedback: data.feedback });
  };

  return (
    <div className="max-w-xl mx-auto p-4">
      {!grade ? (
        <div>
          <h1 className="text-2xl font-bold mb-4">Select Grade</h1>
          <select onChange={handleGradeSelect} className="border p-2">
            <option value="">--Choose Grade--</option>
            {[1,2,3,4,5].map(g => <option key={g} value={g}>{g}th Grade</option>)}
          </select>
        </div>
      ) : !selectedTopic ? (
        <div>
          <h1 className="text-2xl font-bold mb-4">Select Topic</h1>
          <ul>
            {topics.map((t,i) => (
              <li key={i}>
                <button onClick={() => handleTopicSelect(t)} className="text-blue-500 underline">
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div>
          <p className="mb-4">{content.explanation}</p>
          <p className="font-semibold mb-2">{content.question.prompt}</p>
          {content.question.type === 'numeric' ? (
            <input
              type="text"
              onBlur={e => handleAnswer(e.target.value)}
              className="border p-1"
            />
          ) : (
            <ul>
              {content.question.options.map((opt,i) => (
                <li key={i}>
                  <button onClick={() => handleAnswer(opt)} className="border p-2 block my-1">
                    {opt}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {content.feedback && <div className="mt-4 text-green-600">{content.feedback}</div>}
        </div>
      )}
    </div>
  );
}