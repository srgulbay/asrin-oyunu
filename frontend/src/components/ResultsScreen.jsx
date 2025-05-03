import React from 'react';

// Props: gameResults, waitingMessage, currentSocketId
function ResultsScreen({ gameResults, waitingMessage, currentSocketId }) {
  if (!gameResults) return null;
  return (
    <div className="results-display">
      <h2>Oyun Bitti! Sonuçlar:</h2>
      <ol>
        {gameResults.map((result, i) => (
          <li key={result.id} style={result.id === currentSocketId ? { fontWeight: 'bold' } : {}}>
            {i + 1}. {result.name} - {result.score} puan
          </li>
        ))}
      </ol>
      <p>{waitingMessage || 'Yeni oyun yakında başlayabilir...'}</p>
       {/* Belki yeni oyuna katılma butonu? */}
        <button onClick={() => window.location.reload()}> {/* Şimdilik sayfayı yenile */}
           Yeni Oyun?
        </button>
    </div>
  );
}

export default ResultsScreen;
