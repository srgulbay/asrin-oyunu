import React from 'react';
import PlayerList from './PlayerList'; // PlayerList'i import et
// import AnnouncerLog from './AnnouncerLog'; // AnnouncerLog sidebar'da olacak

// Props: players, handlePlayerReady, isPlayerReady, waitingMessage, currentSocketId
function WaitingLobby({ players, handlePlayerReady, isPlayerReady, waitingMessage, currentSocketId }) {
  return (
    <div className="waiting-section">
      <h2>Oyuncular Bekleniyor...</h2>
      {/* PlayerList burada değil, sidebar'da gösterilecek */}
      <button
        onClick={handlePlayerReady}
        disabled={isPlayerReady}
        className={`ready-button ${isPlayerReady ? 'ready' : ''}`}
        // Stil veya MUI Button buraya gelecek
      >
        {isPlayerReady ? 'Hazırsın!' : 'Hazırım'}
      </button>
      <p>{waitingMessage}</p>
      {/* Highlight'lar da kaldırılıp AnnouncerLog'a entegre edilebilir */}
    </div>
  );
}

export default WaitingLobby;
