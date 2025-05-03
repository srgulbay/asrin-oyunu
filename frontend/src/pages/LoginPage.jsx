import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
// --- MUI Imports ---
import { Box, Button, Container, Paper, TextField, Typography, Link, Grid, CircularProgress, Alert } from '@mui/material'; // Grid importu EKLENDİ
// ------------------
import { signInWithEmailAndPassword } from "firebase/auth"; // Firebase importları
import { auth } from '../firebaseConfig';
// import useUserStore from '../store/userStore'; // Giriş sonrası state güncellemesi onAuthStateChanged ile yapılıyor

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // const setUser = useUserStore((state) => state.setUser);

  const handleLogin = async (event) => {
    event.preventDefault(); // Formun sayfayı yenilemesini engelle
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('Giriş başarılı:', userCredential.user.email);
      // Başarılı giriş sonrası ana sayfaya yönlendir (onAuthStateChanged state'i güncelleyecek)
      navigate('/');
    } catch (err) {
      console.error("Firebase giriş hatası:", err);
      // Kullanıcı dostu hata mesajları
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          setError("E-posta veya şifre hatalı.");
      } else if (err.code === 'auth/invalid-email') {
           setError('Lütfen geçerli bir e-posta adresi girin.');
      } else {
           setError("Giriş başarısız oldu. Lütfen tekrar deneyin.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Paper elevation={4} sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 4 }}>
        <Typography component="h1" variant="h5">
          Giriş Yap
        </Typography>
        {error && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={handleLogin} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="E-posta Adresi"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Şifre"
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          {/* TODO: Şifremi unuttum linki eklenebilir */}
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Giriş Yap'}
          </Button>
          {/* Grid importu yapıldığı için bu kısım çalışmalı */}
          <Grid container justifyContent="flex-end">
            <Grid item>
              <Link component={RouterLink} to="/register" variant="body2">
                {"Hesabınız yok mu? Kayıt Olun"}
              </Link>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Container>
  );
}

export default LoginPage;
