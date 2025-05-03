import React from 'react';
// Animasyon eklenebilir
import { motion } from 'framer-motion';

// Props: gameResults, waitingMessage, currentSocketId
function ResultsScreen({ gameResults, waitingMessage, currentSocketId }) {
  // Eğer sonuçlar yoksa null döndür
  if (!gameResults || gameResults.length === 0) return <p>Sonuçlar bekleniyor...</p>;

  return (
    <motion.div
       className="results-display"
       initial={{ scale: 0.8, opacity: 0 }}
       animate={{ scale: 1, opacity: 1 }}
       transition={{ duration: 0.5 }}
    >
      <h2>Oyun Bitti! Sonuçlar:</h2>
      <ol>
        {gameResults.map((result, i) => (
          // Sonuçlar için de animasyonlu liste öğesi
          <motion.li
            key={result.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 + 0.3 }} // Sonuçlar sıralı gelsin
            style={result.id === currentSocketId ? { fontWeight: 'bold', color: 'darkgoldenrod' } : {}}
          >
            <span className="rank">{i + 1}.</span> {result.name} - {result.score} puan {i === 0 ? '🏆' : ''} {/* Birinciye kupa */}
          </motion.li>
        ))}
      </ol>
      <p>{waitingMessage || 'Yeni oyun yakında başlayabilir...'}</p>
       {/* Yeni oyun için belki otomatik yönlendirme veya basit bir buton */}
        <button onClick={() => window.location.reload()} style={{marginTop: '20px'}}>
           Yeni Oyun İçin Yenile
        </button>
    </motion.div>
  );
}

export default ResultsScreen;
