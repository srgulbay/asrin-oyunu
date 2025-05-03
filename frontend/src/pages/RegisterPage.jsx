import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Box, Button, Container, Paper, TextField, Typography, Link, Grid, CircularProgress, Alert } from '@mui/material';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore"; // Firestore importları
import { auth, db } from '../firebaseConfig'; // db (Firestore instance) import edildi

function RegisterPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(''); // Görünen ad state'i
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');

    if (!displayName.trim()) { // İsim boş mu kontrolü
         setError('Lütfen bir görünen ad girin.');
         return;
     }
    if (password !== confirmPassword) { setError('Şifreler eşleşmiyor!'); return; }
    if (password.length < 6) { setError('Şifre en az 6 karakter olmalıdır.'); return; }

    setLoading(true);

    try {
      // 1. Firebase Auth kullanıcısını oluştur
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('Auth kaydı başarılı:', user.uid, user.email);

      // 2. Firestore'a kullanıcı verisini kaydet
      // users koleksiyonunda user.uid ile aynı ID'ye sahip bir doküman oluştur/güncelle
      const userDocRef = doc(db, "users", user.uid);

      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: displayName.trim(), // Kayıttaki ismi kullan
        createdAt: serverTimestamp(), // Kayıt zamanı
        // İleride eklenecekler:
        // grade: null, // Sınıf bilgisi
        // xp: 0,
        // resources: { wisdom: 0, crystal: 0, energy: 0, culture: 0 }
      };

      await setDoc(userDocRef, userData);
      console.log('Firestore kaydı başarılı:', user.uid);

      // Başarılı kayıt sonrası ana sayfaya yönlendir (onAuthStateChanged zaten state'i güncelleyecek)
      navigate('/');

    } catch (err) {
      console.error("Firebase kayıt/firestore hatası:", err);
      if (err.code === 'auth/email-already-in-use') { setError('Bu e-posta adresi zaten kullanımda.'); }
      else if (err.code === 'auth/weak-password') { setError('Şifre çok zayıf.'); }
      else if (err.code === 'auth/invalid-email') { setError('Geçerli bir e-posta girin.'); }
      else { setError(`Kayıt hatası: ${err.message}`); } // Firestore hatası da olabilir
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Paper elevation={4} sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 4 }}>
        <Typography component="h1" variant="h5"> Kayıt Ol </Typography>
        {error && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={handleRegister} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="displayName"
            label="Görünen Adınız"
            name="displayName"
            autoComplete="name"
            autoFocus // İlk odak burası olsun
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={loading}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="E-posta Adresi"
            name="email"
            autoComplete="email"
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
          <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} disabled={loading} >
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
