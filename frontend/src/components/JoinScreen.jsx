import React from 'react';

// Props: playerName, setPlayerName, handleJoinTournament, isConnected, waitingMessage
function JoinScreen({ playerName, setPlayerName, handleJoinTournament, isConnected, waitingMessage }) {
  return (
    <div className="join-section">
      <h3>Turnuvaya Katıl</h3>
      <input
        type="text"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        placeholder="İsminizi Girin"
        maxLength={20}
        disabled={!isConnected}
        // Stil veya MUI TextField buraya gelecek
      />
      <button
        onClick={handleJoinTournament}
        disabled={!isConnected || !playerName.trim()}
        // Stil veya MUI Button buraya gelecek
      >
        Katıl
      </button>
      {/* IDLE durumundayken mesaj */}
      <p>{waitingMessage || 'Turnuvaya katılmak için isim girin.'}</p>
    </div>
  );
}

export default JoinScreen;
