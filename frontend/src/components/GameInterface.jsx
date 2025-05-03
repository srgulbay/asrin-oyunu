import React from 'react';
import QuestionDisplay from './QuestionDisplay';
// import AnnouncerLog from './AnnouncerLog'; // Sidebar'da olacak
// import PlayerList from './PlayerList'; // Sidebar'da olacak

// Props: currentQuestion, timeRemaining, handleAnswerSubmit, lastAnswerResult
function GameInterface({ currentQuestion, timeRemaining, handleAnswerSubmit, lastAnswerResult }) {
  return (
    <div className="game-running-section">
      {/* PlayerList burada değil, sidebar'da gösterilecek */}
      <QuestionDisplay
          currentQuestion={currentQuestion}
          timeRemaining={timeRemaining}
          handleAnswerSubmit={handleAnswerSubmit}
          lastAnswerResult={lastAnswerResult}
      />
      {/* Highlight'lar da kaldırılıp AnnouncerLog'a entegre edilebilir */}
    </div>
  );
}

export default GameInterface;
