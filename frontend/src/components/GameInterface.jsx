import React from 'react';
import QuestionDisplay from './QuestionDisplay';
// import AnnouncerLog from './AnnouncerLog'; // Sidebar'da gösteriliyor
// import PlayerList from './PlayerList'; // Sidebar'da gösteriliyor
// import HighlightsDisplay from './HighlightsDisplay'; // Bu da sidebar'a taşınabilir veya burada kalabilir

// Props: currentQuestion, timeRemaining, handleAnswerSubmit, lastAnswerResult
// Props'a highlightMessages ve announcerLog da eklenebilir istenirse
function GameInterface({ currentQuestion, timeRemaining, handleAnswerSubmit, lastAnswerResult }) {
  return (
    <div className="game-running-section">
      {/* Ana oyun alanı sadece soruyu gösterir */}
      <QuestionDisplay
          currentQuestion={currentQuestion}
          timeRemaining={timeRemaining}
          handleAnswerSubmit={handleAnswerSubmit}
          lastAnswerResult={lastAnswerResult}
      />
      {/*
        Highlight'ları burada ayrı göstermek yerine AnnouncerLog'a entegre etmek
        veya AnnouncerLog'u buraya da dahil etmek düşünülebilir.
        Şimdilik sadece QuestionDisplay kalsın.
      */}
    </div>
  );
}

export default GameInterface;
