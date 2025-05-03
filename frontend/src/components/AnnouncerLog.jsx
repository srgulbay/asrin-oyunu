import React, { useEffect, useRef } from 'react';

// Props: announcerLog
function AnnouncerLog({ announcerLog = [] }) {
  const announcerLogRef = useRef(null);

  useEffect(() => {
    // Log değiştiğinde en üste kaydır
    if (announcerLogRef.current) {
      announcerLogRef.current.scrollTop = 0;
    }
  }, [announcerLog]);

  return (
    <div className="announcer-log" ref={announcerLogRef}>
      <h4>🎤 Sunucu</h4>
      {announcerLog.length === 0 && <p className="log-message log-info">Oyunla ilgili mesajlar burada görünecek...</p>}
      {announcerLog.map((log, index) => (
        <p key={`<span class="math-inline">\{log\.timestamp\}\-</span>{index}`} className={`log-message log-${log.type || 'info'}`}>
          <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', second:'2-digit' })}]</span> {log.text}
        </p>
      ))}
    </div>
  );
}

export default AnnouncerLog;
