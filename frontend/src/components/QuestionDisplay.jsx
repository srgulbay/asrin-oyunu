import React from 'react';

// Props: currentQuestion, timeRemaining, handleAnswerSubmit, lastAnswerResult
function QuestionDisplay({ currentQuestion, timeRemaining, handleAnswerSubmit, lastAnswerResult }) {
  if (!currentQuestion) return null;

  const { index, total, text, options, answered, timedOut } = currentQuestion;
  // Sadece ilgili soruya ait cevap sonucunu kullan
  const relevantResult = (lastAnswerResult && lastAnswerResult.questionIndex === index) ? lastAnswerResult : null;
  const showFeedback = !!relevantResult; // relevantResult null değilse göster

  return (
    <div className="question-display">
      <h3>
         Soru {index + 1} / {total}
         <span className="timer">(Kalan Süre: {timeRemaining}sn)</span>
         {/* Stil veya MUI Progress buraya */}
      </h3>
      <p className="question-text">{text}</p>
      <div className="options">
        {options.map((option, i) => (
          <button
            key={i}
            onClick={() => handleAnswerSubmit(option)}
            disabled={answered || timedOut}
            // Stil veya MUI Button buraya gelecek
          >
            {option}
          </button>
        ))}
      </div>
      {/* Cevap sonucu göstergesi */}
      {showFeedback && (
        <p className={`answer-feedback ${relevantResult.correct ? 'correct' : (relevantResult.timeout ? 'timeout' : 'incorrect')}`}>
          {relevantResult.timeout ? 'Süre Doldu!' : (relevantResult.correct ? `Doğru! +${relevantResult.pointsAwarded || 0} Puan` : 'Yanlış!')}
          {(relevantResult.correct && relevantResult.combo > 1) ? ` (${relevantResult.combo}x Kombo! 🔥)` : ''}
          {relevantResult.comboBroken ? ' (Kombo Bozuldu!)' : ''}
        </p>
      )}
    </div>
  );
}

export default QuestionDisplay;
