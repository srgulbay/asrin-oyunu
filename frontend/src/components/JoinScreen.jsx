import React from 'react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper'; // Paper eklendi
import Stack from '@mui/material/Stack'; // Stack eklendi
import Typography from '@mui/material/Typography'; // Typography eklendi

function JoinScreen({ playerName, setPlayerName, handleJoinTournament, isConnected, waitingMessage }) {
  return (
    // Paper ile kart görünümü ve Stack ile dikey hizalama/boşluk
    <Paper
      elevation={3} // Daha belirgin gölge
      sx={{
        padding: { xs: 2, sm: 4 }, // İç boşluk (mobil/desktop)
        maxWidth: '450px',       // Max genişlik
        margin: '40px auto',     // Sayfada ortala ve üstten boşluk
        textAlign: 'center'      // İçeriği ortala
      }}
    >
      <Stack spacing={3}> {/* Elemanlar arası dikey boşluk */}
        <Typography variant="h4" component="h2" gutterBottom>
          Turnuvaya Katıl
        </Typography>
        <TextField
          label="İsminizi Girin"
          variant="outlined"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          inputProps={{ maxLength: 20 }}
          disabled={!isConnected}
          fullWidth
        />
        <Button
          variant="contained"
          color="primary" // Tema rengini kullanır
          onClick={handleJoinTournament}
          disabled={!isConnected || !playerName.trim()}
          fullWidth
          size="large"
        >
          Katıl
        </Button>
        {/* waitingMessage veya bağlantı durumu mesajı */}
        <Typography variant="body2" color="text.secondary" sx={{ minHeight: '1.5em' }}>
             {waitingMessage || (isConnected ? 'Turnuvaya katılmak için isim girin.' : 'Sunucuya bağlanılıyor...')}
         </Typography>
      </Stack>
    </Paper>
  );
}

export default JoinScreen;
