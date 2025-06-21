import { useState } from 'react';

export default function Home() {
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [history, setHistory] = useState([]);
  const [content, setContent] = useState(null);

  const [topicsLoading, setTopicsLoading] = useState(false);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [answerInput, setAnswerInput] = useState('');
  const [attempts, setAttempts] = useState(0);

  // 1) Subject selection
  const handleSubjectSelect = (subj) => {
    console.log('Subject selected:', subj);
    setSubject(subj);
  };

  // 2) Fetch topics for a grade
  const handleGradeSelect = async (e) => {
    const g = e.target.value;
    console.log('Grade selected:', g);
    setGrade(g);
    setSelectedTopic('');
    setContent(null);
    setTopicsLoading(true);
    try {
      const res = await fetch(`/api/topics?grade=${g}&subject=${subject}`);
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

  // 3) Start lesson on a topic
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
        body: JSON.stringify({ grade, subject, topic, history: [] }),
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
  const handleAnswerSubmit = async (submittedAnswer) => {
    const answer = submittedAnswer ?? answerInput;
    if (!answer) return;

    // Pick the question the user actually saw
    const questionToLog = content.nextQuestion ?? content.question;
    console.log('Logging question for history:', questionToLog);

    const newHistory = [
      ...history,
      {
        question: questionToLog,
        explanation: content.explanation,
        answer
      }
    ];
    console.log('New history:', newHistory);

    setHistory(newHistory);
    setAnswerInput('');
    setLessonLoading(true);

    try {
      const res = await fetch('/api/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, subject, topic: selectedTopic, history: newHistory }),
      });
      const data = await res.json();
      console.log('Lesson follow-up content:', data);
      setContent(data);
      // track incorrect attempts
      if (data.status === 'incorrect') {
        setAttempts(prev => prev + 1);
      } else {
        setAttempts(0);
      }
    } catch (err) {
      console.error('Error fetching next question:', err);
    } finally {
      setLessonLoading(false);
    }
  };
  
  // reveal answer handler
  const handleReveal = async () => {
    setLessonLoading(true);
    try {
      const res = await fetch('/api/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, subject, topic: selectedTopic, history, reveal: true }),
      });
      const data = await res.json();
      console.log('Reveal content:', data);
      setContent(data);
      setAttempts(0);
    } catch (err) {
      console.error('Error revealing answer:', err);
    } finally {
      setLessonLoading(false);
    }
  };

  // --- UI branches ---

  // A) Subject picker
  if (!subject) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 w-full max-w-md space-y-4">
          <h1 className="text-3xl font-bold mb-6 text-center">Select Subject</h1>
          <div className="grid grid-cols-2 gap-4">
            {['math','science','spanish','hindi'].map(s => (
              <button
                key={s}
                onClick={() => handleSubjectSelect(s)}
                className="bg-blue-500 hover:bg-blue-600 text-white p-3 rounded"
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // B) Grade picker
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
          <button
            onClick={() => { setSubject(''); setGrade(''); }}
            className="mt-4 text-blue-500 hover:underline"
          >
            ← Back to Subject
          </button>
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
        {/* Back to grade selection */}
        <button
          onClick={() => { setGrade(''); setTopics([]); }}
          className="mb-2 text-blue-500 hover:underline"
        >
          ← Back to Grade
        </button>
        <button
          onClick={() => { setSubject(''); setGrade(''); setTopics([]); }}
          className="mb-4 text-blue-500 hover:underline ml-2"
        >
          ← Back to Subject
        </button>
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
    <div className="min-h-screen bg-gradient-to-br from-yellow-100 to-blue-100 p-6 flex flex-col items-center">
      {/* Back to topics */}
      <button
        onClick={() => { setSelectedTopic(''); }}
        className="self-start mb-4 text-blue-500 hover:underline font-bold text-lg"
      >
        ← Back to Topics
      </button>

      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-lg p-8 space-y-8 border-4 border-yellow-200">
        {/* Show image if available */}
        {questionToShow.imageUrl && (
          <div className="flex justify-center mb-4">
            <img
              src={questionToShow.imageUrl}
              alt="Fun lesson scene"
              className="rounded-xl border-2 border-blue-200 shadow-md max-h-64 object-contain"
            />
          </div>
        )}
        {/* Show detailed solution when revealed */}
        {content.status === 'revealed' && content.solution && (
          <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded">
            <p className="text-lg font-medium">{content.solution}</p>
          </div>
        )}
        {/* Show feedback above the next question */}
        {content.feedback && (
          <div className={`${feedbackColor} text-lg font-medium`}>{content.feedback}</div>
        )}
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
        <div className="bg-white p-4 border-2 border-blue-100 rounded-xl">
          <p className="text-xl font-semibold text-blue-800 drop-shadow-sm">{questionToShow.prompt}</p>
        </div>
        <div>
          {questionToShow.type === 'numeric' ? (
            <div className="flex space-x-4">
              <input
                type="text"
                value={answerInput}
                onChange={e => setAnswerInput(e.target.value)}
                className="flex-1 border-2 border-yellow-300 rounded-xl p-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-yellow-50"
                placeholder="Type your answer..."
              />              <button
                onClick={() => handleAnswerSubmit()}
                className="bg-gradient-to-r from-yellow-400 to-blue-400 hover:from-yellow-500 hover:to-blue-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg transition"
              >
                Submit
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {questionToShow.options?.map((opt,i) => (
                <button
                  key={i}
                  onClick={() => handleAnswerSubmit(opt)}
                  className="border-2 border-yellow-300 p-3 rounded-xl hover:bg-blue-50 text-lg font-semibold transition bg-yellow-50 shadow"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
         {/* reveal button after two incorrect attempts */}
         {attempts >= 2 && content.status === 'incorrect' && (
           <button
             onClick={handleReveal}
             className="mt-4 bg-pink-200 hover:bg-pink-300 text-pink-800 font-bold px-4 py-2 rounded-xl shadow"
           >
             Reveal Answer
           </button>
         )}
        </div>
      </div>
    </div>
  );
}
