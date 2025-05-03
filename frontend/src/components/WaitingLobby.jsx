import React from 'react';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper'; // Eklendi
import Stack from '@mui/material/Stack'; // Eklendi
import Typography from '@mui/material/Typography'; // Eklendi
import CircularProgress from '@mui/material/CircularProgress'; // Yükleniyor ikonu

function WaitingLobby({ players, handlePlayerReady, isPlayerReady, waitingMessage, currentSocketId }) {
  // PlayerList sidebar'da gösteriliyor
  return (
    <Paper
        elevation={3}
        sx={{
            padding: { xs: 2, sm: 3 },
            textAlign: 'center',
            minHeight: '200px', // İçerik azken bile biraz yüksek dursun
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center' // İçeriği dikeyde ortala
        }}
    >
      <Stack spacing={2} alignItems="center">
        <Typography variant="h5" component="h2" gutterBottom>
            Oyuncular Bekleniyor...
        </Typography>
        <CircularProgress size={30} sx={{ my: 1 }} /> {/* Bekleme animasyonu */}
        <Typography variant="body1" color="text.secondary" sx={{ minHeight: '1.5em' }}>
            {waitingMessage || 'Diğer oyuncuların hazır olması bekleniyor...'}
        </Typography>
        <Button
          variant="contained"
          onClick={handlePlayerReady}
          disabled={isPlayerReady}
          color={isPlayerReady ? "success" : "primary"}
          size="large"
          sx={{ minWidth: '150px' }} // Buton biraz geniş olsun
        >
          {isPlayerReady ? 'Hazırsın!' : 'Hazırım'}
        </Button>
      </Stack>
    </Paper>
  );
}

export default WaitingLobby;
