import React from 'react';
import QuestionDisplay from './QuestionDisplay';
import Box from '@mui/material/Box';

function GameInterface({ currentQuestion, timeRemaining, handleAnswerSubmit, lastAnswerResult }) {
  return (
    // Sadece Box ile sarmalayalım, QuestionDisplay zaten Paper içinde
    <Box className="game-running-section" sx={{ width: '100%' }}>
      <QuestionDisplay
          currentQuestion={currentQuestion}
          timeRemaining={timeRemaining}
          handleAnswerSubmit={handleAnswerSubmit}
          lastAnswerResult={lastAnswerResult}
      />
    </Box>
  );
}

export default GameInterface;
