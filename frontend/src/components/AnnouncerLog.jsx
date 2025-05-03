import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles'; // Temayı kullanmak için

const MAX_LOG_MESSAGES = 20;

// Mesaj tipine göre stil döndüren yardımcı fonksiyon
const getLogStyle = (theme, type = 'info') => {
  switch (type) {
    case 'join':
    case 'all_correct':
      return { backgroundColor: theme.palette.success.light + '30', color: theme.palette.success.dark, borderLeft: `3px solid ${theme.palette.success.main}` };
    case 'leave':
    case 'combo_break':
    case 'none_correct':
    case 'error':
      return { backgroundColor: theme.palette.error.light + '30', color: theme.palette.error.dark, borderLeft: `3px solid ${theme.palette.error.main}` };
    case 'warning':
    case 'timeout':
       return { backgroundColor: theme.palette.warning.light + '30', color: theme.palette.warning.dark, borderLeft: `3px solid ${theme.palette.warning.main}` };
    case 'combo':
    case 'lead':
    case 'speed':
       return { backgroundColor: theme.palette.secondary.light + '30', color: theme.palette.secondary.dark, borderLeft: `3px solid ${theme.palette.secondary.main}`, fontWeight: '500' };
    case 'question':
         return { borderLeft: `3px solid ${theme.palette.primary.main}`, color: theme.palette.primary.dark };
    case 'gameover':
        return { backgroundColor: theme.palette.info.light + '30', color: theme.palette.info.dark, fontWeight: 'bold', borderLeft: `3px solid ${theme.palette.info.main}` };
    case 'info':
    default:
       // Açık temada hafif gri, koyu temada hafif gri
      const bgColor = theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[800];
      return { backgroundColor: bgColor, color: theme.palette.text.secondary, borderLeft: `3px solid ${theme.palette.grey[500]}` };
  }
};


function AnnouncerLog({ announcerLog = [] }) {
  const scrollableLogRef = useRef(null);
  const theme = useTheme(); // Mevcut temayı al

  useEffect(() => {
    if (scrollableLogRef.current) {
      scrollableLogRef.current.scrollTop = scrollableLogRef.current.scrollHeight;
    }
  }, [announcerLog]);

  return (
    // Paper stilini biraz ayarlayalım
    <Paper variant="outlined" sx={{ p: '8px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Typography variant="h6" component="h4" sx={{ mb: 1, pl: '8px', flexShrink: 0 }}>
        🎤 Sunucu
      </Typography>
      <Box
        ref={scrollableLogRef}
        className="announcer-log-messages"
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          pr: '5px', // Sağ padding
        }}
      >
        {announcerLog.length === 0 && <Typography variant="body2" sx={{ color: 'text.disabled', pl: '8px'}}>Oyunla ilgili mesajlar burada görünecek...</Typography>}
        <AnimatePresence initial={false}>
          {announcerLog.map((log) => (
            <motion.div // p yerine div kullanalım, stil için daha esnek
              key={log.id} // Benzersiz ID kullan
              initial={{ opacity: 0, x: -10 }} // Soldan gel
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              // layout kaldırılmıştı
              // --- Dinamik Stil ---
              style={{ // style prop'u Framer Motion için daha iyi olabilir
                  marginBottom: '4px',
                  padding: '4px 8px',
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                  borderRadius: theme.shape.borderRadius * 0.5, // Temadan gelen yuvarlaklık
                  ...getLogStyle(theme, log.type) // Tipe göre stil al
               }}
            >
              <Typography variant="caption" sx={{ color: 'text.disabled', mr: 1}}> {/* Zaman damgası için Typography */}
                 {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', second:'2-digit' })}
              </Typography>
               {log.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </Box>
    </Paper>
  );
}

export default AnnouncerLog;
