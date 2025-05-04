import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, Navigate, Link as RouterLink } from "react-router-dom";
import './App.css';
import { io } from "socket.io-client";

// MUI Imports
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { Alert } from '@mui/material';

// Page Imports
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage'; // Profil kalsın
import createAppTheme from './theme';

// Firebase & State Imports
import { auth } from './firebaseConfig';
import { onAuthStateChanged, signOut } from "firebase/auth";
import useUserStore from './store/userStore';

const SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// --- Route Koruma Componentleri (Aynı kalabilir) ---
function ProtectedRoute({ children }) {
  const isLoggedIn = useUserStore((state) => state.isLoggedIn);
  const isLoading = useUserStore((state) => state.isLoading);
  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress /></Box>;
  }
  if (!isLoggedIn) { return <Navigate to="/login" replace />; }
  return children;
}
function GuestRoute({ children }) {
  const isLoggedIn = useUserStore((state) => state.isLoggedIn);
  const isLoading = useUserStore((state) => state.isLoading);
  if (isLoading) {
     return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress /></Box>;
  }
  if (isLoggedIn) { return <Navigate to="/" replace />; }
  return children;
}
// ----------------------------------------------------

function App() {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('Sunucuya bağlanılıyor...');
  const [mode, setMode] = useState('light');
  // --- OYUN STATE'LERİ KALDIRILDI ---

  const { user, isLoggedIn, isLoading, setUser, clearUser } = useUserStore();

  console.log(`>>> APP RENDER: isLoading=${isLoading}, isConnected=${isConnected}, isLoggedIn=${isLoggedIn}, userUID=${user?.uid}`);

  useEffect(() => { const currentHour = new Date().getHours(); const calculatedMode = (currentHour >= 18 || currentHour < 6) ? 'dark' : 'light'; setMode(calculatedMode); }, []);
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  // Firebase Auth Listener (Aynı)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.error("🚨 [App.jsx] onAuthStateChanged tetiklendi! Gelen firebaseUser:", firebaseUser ? {uid: firebaseUser.uid, email: firebaseUser.email} : null);
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, [setUser]);

  // Zustand State Listener (Aynı)
  useEffect(() => {
    const unsubscribe = useUserStore.subscribe( (state) => state.user, (newUser, previousUser) => { console.error("🚨 [App.jsx] Zustand user state DEĞİŞTİ!", { newUID: newUser?.uid }); } );
    return unsubscribe;
  }, []);

  // Socket Bağlantısı (Aynı - Sadece oyun olayları kaldırıldı)
  useEffect(() => {
    console.log(`>>> Socket useEffect KONTROL. Durum: isLoggedIn=${isLoggedIn}, isLoading=${isLoading}`);
    let newSocket = null;
    if (!isLoading && isLoggedIn) {
        if (!socket || !isConnected) {
            console.log(`%c>>> Socket bağlantısı kuruluyor: ${SERVER_URL}`, 'color: blue; font-weight: bold;');
            newSocket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
            setSocket(newSocket);

            const handleConnect = () => { setIsConnected(true); setConnectionMessage('Sunucuya Bağlandı.'); console.log(">>> Socket Bağlandı! ID:", newSocket.id);};
            const handleConnectError = (err) => { setIsConnected(false); setConnectionMessage(`Bağlantı hatası: ${err.message}`); console.error(">>> Socket Bağlantı Hatası:", err);};
            const handleDisconnect = (reason) => { setIsConnected(false); setConnectionMessage('Bağlantı kesildi.'); /* Oyun state temizleme kaldırıldı */ console.log(">>> Socket Disconnect sebebi:", reason); };
            const handleErrorMessage = (data) => { console.error(">>> Sunucu Hatası:", data.message); alert(`Sunucu Hatası: ${data.message}`); };

            newSocket.on('connect', handleConnect);
            newSocket.on('connect_error', handleConnectError);
            newSocket.on('disconnect', handleDisconnect);
            newSocket.on('error_message', handleErrorMessage); // Sadece hata mesajını dinle

            return () => {
              console.log(">>> Socket useEffect cleanup çalışıyor.");
              // Olay dinleyicilerini kaldır
              newSocket.off('connect', handleConnect);
              newSocket.off('connect_error', handleConnectError);
              newSocket.off('disconnect', handleDisconnect);
              newSocket.off('error_message', handleErrorMessage);
              newSocket.disconnect();
              setSocket(null);
              setIsConnected(false);
            };
        }
    } else if (socket) {
        console.log(">>> Koşul sağlanmıyor (isLoading veya !isLoggedIn), mevcut socket bağlantısı kesiliyor.");
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
    }
  }, [isLoggedIn, isLoading]); // Bağımlılıklar güncellendi

  // handleJoinTournament (Aynı - Konsol logları ile)
  const handleJoinTournament = useCallback(() => {
      const joinName = user?.displayName || user?.email || (user?.uid ? `Oyuncu_${user.uid.substring(0,4)}` : 'Bilinmeyen');
      const userGrade = user?.grade;
      const userUid = user?.uid;

      console.error('>>> handleJoinTournament ÇAĞRILDI!');
      console.error('>>> Anlık User State:', JSON.stringify(user, null, 2));
      console.error('>>> Anlık Gönderilecek UID:', userUid);
      console.error(`>>> Kontrol: socket=${!!socket}, isConnected=${isConnected}, user=${!!user}, userUid=${!!userUid}`);

      if (socket && isConnected && user && userUid) {
          console.error('>>> Koşul sağlandı, join_tournament emit ediliyor:', { name: joinName, grade: userGrade, uid: userUid });
          socket.emit('join_tournament', { name: joinName, grade: userGrade, uid: userUid });
          alert('Katılma isteği gönderildi (Test).'); // Başarılı olursa bunu gör
          // setWaitingMessage / setIsPlayerReady kaldırıldı
      } else if (!user || !userUid) {
          const reason = !user ? "User nesnesi null/undefined" : (!userUid ? "User nesnesinde UID yok" : "Bilinmeyen durum");
          console.error(`>>> Katılma başarısız: ${reason}. User state:`, JSON.stringify(user, null, 2));
          alert(`Katılma Başarısız!\nSebep: ${reason}\nLütfen sayfayı yenileyip tekrar deneyin.`); // Güncellenmiş Alert
      } else if (!isConnected) {
          console.error('>>> Katılma başarısız: Socket bağlı değil.');
          alert('Sunucu bağlantısı bekleniyor...');
      } else if (!socket) {
          console.error('>>> Katılma başarısız: Socket nesnesi henüz yok.');
           alert('Sunucu bağlantısı kuruluyor, lütfen tekrar deneyin.');
      }
  }, [socket, isConnected, user]);

  // handleLogout (Aynı)
   const handleLogout = useCallback(async () => {
      if (socket) {
          console.log(">>> Logout: Socket bağlantısı kesiliyor.");
          socket.disconnect();
       }
      try {
          await signOut(auth);
          console.log("Çıkış yapıldı (Firebase).");
      } catch (error) {
          console.error("Çıkış hatası:", error);
          alert("Çıkış yapılırken bir hata oluştu.");
      }
   }, [socket]);

  // Basitleştirilmiş Render Fonksiyonu
  const renderContent = () => {
       const isAuthLoading = isLoading;
       const isUserUidMissing = !user?.uid;
       const isSocketDisconnected = !isConnected;
       const joinButtonDisabled = isAuthLoading || isSocketDisconnected || isUserUidMissing;
       const joinButtonText = isAuthLoading ? 'Yükleniyor...' : (isSocketDisconnected ? 'Bağlanıyor...' : (isUserUidMissing ? 'Kullanıcı Bilgisi Bekleniyor...' : 'Turnuvaya Katıl (TEST)'));

       // Eğer yükleniyorsa veya giriş yapmış ama bağlı değilse
       if (isAuthLoading || (isLoggedIn && isSocketDisconnected)) {
            return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 5, flexDirection:'column' }}><CircularProgress /><Typography sx={{mt: 2}} color="text.secondary">{isAuthLoading ? "Kullanıcı verisi yükleniyor..." : connectionMessage}</Typography></Box>;
       }

       // Sadece IDLE durumu (veya katılma ekranı)
        return (
            <Paper elevation={3} sx={{p:3, textAlign:'center'}}>
               <Typography variant="h5">Test Katılma Ekranı</Typography>
                <Button
                   variant="contained"
                   size="large"
                   onClick={handleJoinTournament}
                   sx={{mt: 2}}
                   disabled={joinButtonDisabled}
                >
                   {joinButtonText}
                </Button>
               {/* <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{waitingMessage}</Typography> */}

               {/* GÖRSEL DEBUG KUTUSU */}
               <Box mt={2} p={1} border="1px dashed grey" borderRadius={1} sx={{textAlign: 'left', fontSize: '0.75rem'}}>
                   <Typography variant="caption" display="block" sx={{fontWeight: 'bold'}}>Debug Info:</Typography>
                   <Typography variant="caption" display="block">isLoading: {isLoading.toString()}</Typography>
                   <Typography variant="caption" display="block">isConnected: {isConnected.toString()}</Typography>
                   <Typography variant="caption" display="block">isLoggedIn: {isLoggedIn.toString()}</Typography>
                   <Typography variant="caption" display="block">user exists: {user ? 'Yes' : 'No'}</Typography>
                   <Typography variant="caption" display="block">user UID: {user?.uid || 'Yok'}</Typography>
                   <Typography variant="caption" display="block">Button Disabled: {joinButtonDisabled.toString()}</Typography>
               </Box>
            </Paper>
        );
  };

  return (
    <ThemeProvider theme={theme}>
       <CssBaseline />
       <AppBar position="static" elevation={1}>
         <Container maxWidth="xl">
           <Toolbar disableGutters sx={{ justifyContent: 'space-between' }}>
             <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}> Asrın Oyunu (Basit Test) </Typography>
             {isLoading ? ( <CircularProgress size={24} color="inherit"/> ) : isLoggedIn ? (
               <Box sx={{ display: 'flex', alignItems: 'center'}}>
                 <Button color="inherit" component={RouterLink} to="/profile" startIcon={<AccountCircleIcon/>}> {user?.displayName || user?.email} </Button>
                 <Button color="inherit" onClick={handleLogout} startIcon={<LogoutIcon/>} sx={{ ml: 1 }}>Çıkış Yap</Button>
               </Box>
             ) : (
               <Box>
                 <Button color="inherit" component={RouterLink} to="/login">Giriş Yap</Button>
                 <Button color="inherit" component={RouterLink} to="/register">Kayıt Ol</Button>
               </Box>
             )}
           </Toolbar>
         </Container>
       </AppBar>
       <Container maxWidth="md" sx={{ marginTop: 4, paddingBottom: 4 }}> {/* Daha dar container */}
           <Routes>
               <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
               <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
               <Route path="/" element={ <ProtectedRoute> {renderContent()} </ProtectedRoute> }/>
               <Route path="/profile" element={ <ProtectedRoute> <ProfilePage /> </ProtectedRoute> }/>
           </Routes>
        </Container>
    </ThemeProvider>
  );
}

export default App;