import React, { useEffect, useRef } from 'react';
// Framer Motion importları
import { motion, AnimatePresence } from 'framer-motion';

// Props: announcerLog
function AnnouncerLog({ announcerLog = [] }) {
  const announcerLogRef = useRef(null);

  useEffect(() => {
    // Log değiştiğinde en üste kaydır (en yeni mesaj görünsün)
    if (announcerLogRef.current) {
      announcerLogRef.current.scrollTop = 0;
    }
  }, [announcerLog]);

  return (
    <div className="announcer-log" ref={announcerLogRef}>
      <h4>🎤 Sunucu</h4>
      {announcerLog.length === 0 && <p className="log-message log-info">Oyunla ilgili mesajlar burada görünecek...</p>}
      {/* AnimatePresence, listeden eleman çıktığında (limit nedeniyle) çıkış animasyonu sağlar */}
      <AnimatePresence initial={false}>
        {announcerLog.map((log) => (
          <motion.p
            key={`<span class="math-inline">\{log\.timestamp\}\-</span>{log.text}`} // Benzersiz key
            // Basitleştirilmiş Animasyon
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            layout // Diğer mesajların kaymasını sağlar
            className={`log-message log-${log.type || 'info'}`}
          >
            <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', second:'2-digit' })}]</span> {log.text}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default AnnouncerLog;
