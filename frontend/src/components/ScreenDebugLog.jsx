import React, { useRef, useEffect } from 'react';
import { Box, Typography, IconButton, Paper } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

function ScreenDebugLog({ logs = [], onClearLogs }) {
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]); // Loglar değiştiğinde en alta kaydır

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        width: '350px',
        maxWidth: '90vw',
        maxHeight: '300px', // Maksimum yükseklik
        overflow: 'hidden', // İçerik taşmasın
        bgcolor: 'rgba(0, 0, 0, 0.8)', // Koyu yarı saydam arka plan
        color: '#fff', // Beyaz yazı
        p: 1,
        pb: 0, // Alttaki butona yer aç
        zIndex: 1500, // Diğer elementlerin üzerinde kalsın
        display: 'flex',
        flexDirection: 'column',
        fontSize: '0.7rem',
        borderRadius: '8px'
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5, px: 0.5, flexShrink: 0 }}>
        <Typography variant="caption" sx={{ fontWeight: 'bold', color:'lightblue'}}>ON-SCREEN LOG</Typography>
        <IconButton onClick={onClearLogs} size="small" title="Logları Temizle" sx={{color: 'lightgrey', p:0.2}}>
          <CloseIcon fontSize="inherit" />
        </IconButton>
      </Box>
      <Box sx={{ overflowY: 'auto', flexGrow: 1, pr: '5px' }}> {/* Kaydırılabilir alan */}
        {logs.map((log, index) => (
          <Typography key={index} variant="caption" component="pre" sx={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 0.5, borderBottom: '1px solid #444', pb: 0.5 }}>
            {log}
          </Typography>
        ))}
        <div ref={logEndRef} /> {/* En alta kaydırmak için referans */}
      </Box>
    </Paper>
  );
}

export default ScreenDebugLog;