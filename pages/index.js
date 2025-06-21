import { useState } from 'react';

export default function Home() {
  const [grade, setGrade] = useState('');
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [history, setHistory] = useState([]);
  const [content, setContent] = useState(null);

  const [topicsLoading, setTopicsLoading] = useState(false);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [answerInput, setAnswerInput] = useState('');

  // 1) Fetch topics for a grade
  const handleGradeSelect = async (e) => {
    const g = e.target.value;
    console.log('Grade selected:', g);
    setGrade(g);
    setSelectedTopic('');
    setContent(null);
    setTopicsLoading(true);
    try {
      const res = await fetch(`/api/topics?grade=${g}`);
      const data = await res.json();
      console.log('Topics API response:', data);
      setTopics(data.topics || []);
    } catch (err) {
      console.error('Error fetching topics:', err);
      setTopics([]);
    } finally {
      setTopicsLoading(false);
    }
  };

  // 2) Start lesson on a topic
  const handleTopicSelect = async (topic) => {
    console.log('Topic selected:', topic);
    setSelectedTopic(topic);
    setHistory([]);
    setContent(null);
    setAnswerInput('');
    setLessonLoading(true);
    try {
      const res = await fetch('/api/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, topic, history: [] }),
      });
      const data = await res.json();
      console.log('Initial lesson content:', data);
      setContent(data);
    } catch (err) {
      console.error('Error starting lesson:', err);
    } finally {
      setLessonLoading(false);
    }
  };

  // 3) Submit an answer
  const handleAnswerSubmit = async () => {
    if (!answerInput) return;

    // Pick the question the user actually saw
    const questionToLog = content.nextQuestion ?? content.question;
    console.log('Logging question for history:', questionToLog);

    const newHistory = [
      ...history,
      { question: questionToLog, answer: answerInput }
    ];
    console.log('New history:', newHistory);

    setHistory(newHistory);
    setAnswerInput('');
    setLessonLoading(true);

    try {
      const res = await fetch('/api/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, topic: selectedTopic, history: newHistory }),
      });
      const data = await res.json();
      console.log('Lesson follow-up content:', data);
      setContent(data);
    } catch (err) {
      console.error('Error fetching next question:', err);
    } finally {
      setLessonLoading(false);
    }
  };

  // --- UI branches ---

  // A) Grade picker
  if (!grade) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 w-full max-w-md">
          <h1 className="text-3xl font-bold mb-6 text-center">Select Grade</h1>
          <select
            onChange={handleGradeSelect}
            className="w-full border border-gray-300 rounded p-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
            defaultValue=""
          >
            <option value="" disabled>-- Choose Grade --</option>
            {[1,2,3,4,5].map(g => (
              <option key={g} value={g}>{g}th Grade</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  // B) Topics loading
  if (topicsLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-xl font-medium">Loading topics…</p>
      </div>
    );
  }

  // C) Topic list
  if (!selectedTopic) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <h1 className="text-3xl font-bold mb-6 text-center">Choose a Topic</h1>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {topics.map((t,i) => (
            <button
              key={i}
              onClick={() => handleTopicSelect(t)}
              className="bg-white p-4 rounded-lg shadow hover:bg-blue-50 transition text-lg text-center"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // D) Lesson loading
  if (lessonLoading || !content) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-xl font-medium">Loading lesson…</p>
      </div>
    );
  }

  // E) Lesson view
  console.log('Rendering lesson view with content:', content);
  const questionToShow = content.nextQuestion ?? content.question;

  if (!questionToShow) {
    console.error('questionToShow is undefined. content:', content);
    return (
      <div className="min-h-screen bg-gray-100 p-6 flex items-center justify-center">
        <p className="text-red-500 text-lg">Error: Question data missing. Check console.</p>
      </div>
    );
  }

  const isIncorrect = content.status === 'incorrect';
  const feedbackColor = isIncorrect ? 'text-red-600' : 'text-green-600';
  const showExplanation = content.status !== 'incorrect' && Boolean(content.explanation);

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-md p-6 space-y-6">
        {showExplanation && (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <p className="text-lg">{content.explanation}</p>
          </div>
        )}

        {isIncorrect && content.hint && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
            <p className="text-lg">{content.hint}</p>
          </div>
        )}

        <div className="bg-white p-4 border border-gray-200 rounded">
          <p className="text-xl font-semibold">{questionToShow.prompt}</p>
        </div>

        <div>
          {questionToShow.type === 'numeric' ? (
            <div className="flex space-x-4">
              <input
                type="text"
                value={answerInput}
                onChange={e => setAnswerInput(e.target.value)}
                className="flex-1 border border-gray-300 rounded p-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Type your answer..."
              />
              <button
                onClick={handleAnswerSubmit}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-3 rounded-lg transition"
              >
                Submit
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {questionToShow.options?.map((opt,i) => (
                <button
                  key={i}
                  onClick={() => {
                    setAnswerInput(opt);
                    handleAnswerSubmit();
                  }}
                  className="border border-gray-300 p-3 rounded-lg hover:bg-blue-50 text-lg transition"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>

        {content.feedback && (
          <div className={`${feedbackColor} text-lg font-medium`}>
            {content.feedback}
          </div>
        )}
      </div>
    </div>
  );
}
