import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Box, Button, Container, Paper, TextField, Typography, Link, Grid, CircularProgress, Alert } from '@mui/material';
import { createUserWithEmailAndPassword } from "firebase/auth"; // Firebase importları
import { auth } from '../firebaseConfig';
// import useUserStore from '../store/userStore'; // Kayıt sonrası otomatik giriş için gerekebilir

function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // const setUser = useUserStore((state) => state.setUser); // Otomatik giriş için

  const handleRegister = async (event) => {
    event.preventDefault();
    setError(''); // Hataları temizle

    // Şifreleri kontrol et
    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor!');
      return;
    }
    if (password.length < 6) {
         setError('Şifre en az 6 karakter olmalıdır.');
         return;
     }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Başarılı kayıt - Kullanıcı otomatik olarak giriş yapmış olur (onAuthStateChanged yakalar)
      console.log('Kayıt başarılı:', userCredential.user.email);
      // İsteğe bağlı: Firestore'a ek kullanıcı bilgileri kaydedilebilir (isim, sınıf vb.)
      // setUser(userCredential.user); // Zustand'ı manuel güncellemeye gerek yok, onAuthStateChanged yapar.
      navigate('/'); // Başarılı kayıt sonrası ana sayfaya yönlendir
    } catch (err) {
      console.error("Firebase kayıt hatası:", err);
      // Daha kullanıcı dostu hata mesajları
      if (err.code === 'auth/email-already-in-use') {
           setError('Bu e-posta adresi zaten kullanımda.');
      } else if (err.code === 'auth/weak-password') {
           setError('Şifre çok zayıf. Daha güçlü bir şifre deneyin.');
      } else if (err.code === 'auth/invalid-email') {
           setError('Lütfen geçerli bir e-posta adresi girin.');
      }
       else {
           setError('Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.');
       }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Paper elevation={4} sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 4 }}>
        <Typography component="h1" variant="h5">
          Kayıt Ol
        </Typography>
        {error && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={handleRegister} noValidate sx={{ mt: 1 }}>
          {/* TODO: İleride Ad, Soyad, Sınıf gibi alanlar eklenebilir */}
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
            label="Şifre (en az 6 karakter)"
            type="password"
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
           <TextField
            margin="normal"
            required
            fullWidth
            name="confirmPassword"
            label="Şifre Tekrar"
            type="password"
            id="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Kayıt Ol'}
          </Button>
          <Grid container justifyContent="flex-end">
            <Grid item>
              <Link component={RouterLink} to="/login" variant="body2">
                Zaten hesabınız var mı? Giriş Yapın
              </Link>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Container>
  );
}

export default RegisterPage;
