import React from 'react';
// PlayerList sidebar'da olduğu için buradan kaldırıldı.
// AnnouncerLog da sidebar'da.
// Highlight'lar da kaldırıldı, AnnouncerLog kullanılacak.

// Props: players, handlePlayerReady, isPlayerReady, waitingMessage, currentSocketId
function WaitingLobby({ players, handlePlayerReady, isPlayerReady, waitingMessage, currentSocketId }) {
  // Kendi player objeni bul (butonu disable etmek için vs. kullanılabilir)
  const myPlayer = players.find(p => p.id === currentSocketId);
  // isPlayerReady prop'u App.jsx'ten geldiği için myPlayer'a gerek kalmayabilir.

  return (
    <div className="waiting-section">
      <h2>Oyuncular Bekleniyor...</h2>
      {/* PlayerList burada değil, sidebar'da gösterilecek */}
      <button
        onClick={handlePlayerReady}
        // Zaten hazırsa veya oyun başlamışsa butonu gizle/disable et (App.jsx hallediyor)
        disabled={isPlayerReady}
        className={`ready-button ${isPlayerReady ? 'ready' : ''}`}
        // Stil veya MUI Button buraya gelecek
      >
        {isPlayerReady ? 'Hazırsın!' : 'Hazırım'}
      </button>
      <p>{waitingMessage}</p>
      {/* Highlight mesajları yerine AnnouncerLog kullanılacak (sidebar'da) */}
    </div>
  );
}

export default WaitingLobby;
