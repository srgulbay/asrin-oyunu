import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
// --- MUI Imports ---
import {
    Box,
    Button,
    Container,
    Paper,
    TextField,
    Typography,
    Link,
    Grid,
    CircularProgress,
    Alert,
    FormControl,  // EKLENDİ
    InputLabel,   // EKLENDİ
    Select,       // EKLENDİ
    MenuItem      // EKLENDİ
} from '@mui/material';
// ------------------
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from '../firebaseConfig';

function RegisterPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [grade, setGrade] = useState(''); // <-- YENİ STATE: Sınıf bilgisi için
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sınıf seçenekleri
  const gradeOptions = [
    'Okul Öncesi', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'
  ];

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');

    // --- GÜNCELLEME: Alan kontrolleri ---
    if (!displayName.trim()) {
      setError('Lütfen bir görünen ad girin.');
      return;
    }
    if (!grade) { // Sınıf seçimi kontrolü
        setError('Lütfen sınıfınızı seçin.');
        return;
    }
    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor!');
      return;
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    // ----------------------------------

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('Auth kaydı başarılı:', user.uid, user.email);

      const userDocRef = doc(db, "users", user.uid);

      // --- GÜNCELLEME: Firestore'a grade ekleniyor ---
      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: displayName.trim(),
        grade: grade, // Seçilen sınıf eklendi
        createdAt: serverTimestamp(),
        // Başlangıç kaynakları ve XP eklenebilir
        resources: {
            bilgelik: 0,
            zekaKristali: 0,
            enerji: 0,
            kultur: 0,
        },
        xp: 0,
        level: 1, // Başlangıç seviyesi
      };
      // ---------------------------------------------

      await setDoc(userDocRef, userData);
      console.log('Firestore kaydı başarılı (sınıf dahil):', user.uid);

      // Başarılı kayıt sonrası kullanıcı doğrudan giriş yapmış sayılacak
      // ve onAuthStateChanged tetiklenerek ana sayfaya yönlendirilecek.
      // navigate('/'); // Bu satıra gerek kalmayabilir, onAuthStateChanged yönlendirecek.

    } catch (err) {
      console.error("Firebase kayıt/firestore hatası:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Bu e-posta adresi zaten kullanımda.');
      } else if (err.code === 'auth/weak-password') {
        setError('Şifre çok zayıf.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Geçerli bir e-posta girin.');
      } else {
        setError(`Kayıt hatası: ${err.message}`);
      }
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
          <TextField margin="normal" required fullWidth id="displayName" label="Görünen Adınız" name="displayName" autoComplete="name" autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={loading} />

          {/* --- YENİ: Sınıf Seçim Alanı --- */}
          <FormControl fullWidth margin="normal" required disabled={loading}>
            <InputLabel id="grade-select-label">Sınıfınız</InputLabel>
            <Select
              labelId="grade-select-label"
              id="grade-select"
              value={grade}
              label="Sınıfınız"
              onChange={(e) => setGrade(e.target.value)}
            >
              {/* Seçenekleri dinamik oluştur */}
              {gradeOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option === 'Okul Öncesi' ? option : `${option}. Sınıf`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {/* ------------------------------ */}

          <TextField margin="normal" required fullWidth id="email" label="E-posta Adresi" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
          <TextField margin="normal" required fullWidth name="password" label="Şifre (en az 6 karakter)" type="password" id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
          <TextField margin="normal" required fullWidth name="confirmPassword" label="Şifre Tekrar" type="password" id="confirmPassword" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} />

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