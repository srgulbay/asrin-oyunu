import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, Navigate, Link as RouterLink } from "react-router-dom"; // Navigate ve RouterLink eklendi
import './App.css';
import { io } from "socket.io-client";

// --- MUI Imports ---
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';
import AppBar from '@mui/material/AppBar'; // Navbar için
import Toolbar from '@mui/material/Toolbar'; // Navbar için
import LogoutIcon from '@mui/icons-material/Logout'; // Logout ikonu
// --- Component Imports ---
import JoinScreen from './components/JoinScreen';
import WaitingLobby from './components/WaitingLobby';
import GameInterface from './components/GameInterface';
import ResultsScreen from './components/ResultsScreen';
import PlayerList from './components/PlayerList';
import AnnouncerLog from './components/AnnouncerLog';
import LoginPage from './pages/LoginPage'; // Yeni sayfalar
import RegisterPage from './pages/RegisterPage'; // Yeni sayfalar
import createAppTheme from './theme';
// --- Firebase & State Imports ---
import { auth } from './firebaseConfig';
import { onAuthStateChanged, signOut } from "firebase/auth"; // signOut eklendi
import useUserStore from './store/userStore'; // Zustand store'unu import et
import { motion, AnimatePresence } from 'framer-motion';

const SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
const MAX_LOG_MESSAGES = 20;

// --- Route Koruma Componentleri ---
// Sadece giriş yapmış kullanıcıların erişebileceği sayfalar için sarmalayıcı
function ProtectedRoute({ children }) {
  const isLoggedIn = useUserStore((state) => state.isLoggedIn);
  const isLoading = useUserStore((state) => state.isLoading);

  if (isLoading) {
    // Auth durumu kontrol edilirken yükleniyor ekranı
    return <Box sx={{ display: 'flex', justifyContent: 'center', padding: 5 }}><CircularProgress /></Box>;
  }

  if (!isLoggedIn) {
    // Giriş yapmamışsa Login sayfasına yönlendir
    return <Navigate to="/login" replace />;
  }
  // Giriş yapmışsa istenen sayfayı göster
  return children;
}

// Sadece giriş yapmamış kullanıcıların erişebileceği sayfalar için sarmalayıcı (Login, Register)
function GuestRoute({ children }) {
  const isLoggedIn = useUserStore((state) => state.isLoggedIn);
  const isLoading = useUserStore((state) => state.isLoading);

  if (isLoading) {
     return <Box sx={{ display: 'flex', justifyContent: 'center', padding: 5 }}><CircularProgress /></Box>;
  }

  if (isLoggedIn) {
    // Giriş yapmışsa ana sayfaya yönlendir
    return <Navigate to="/" replace />;
  }
  // Giriş yapmamışsa istenen sayfayı göster
  return children;
}
// ---------------------------------


function App() {
  // === State Hookları ===
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('Sunucuya bağlanılıyor...');
  const [playerName, setPlayerName] = useState(''); // Bu artık Zustand'dan gelecek: user.displayName
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  const [players, setPlayers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [gameResults, setGameResults] = useState(null);
  const [waitingMessage, setWaitingMessage] = useState('');
  const [lastAnswerResult, setLastAnswerResult] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [announcerLog, setAnnouncerLog] = useState([]);
  const [mode, setMode] = useState('light');
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  // === Zustand Store Erişim ===
  const { user, isLoggedIn, isLoading, setUser, clearUser } = useUserStore(); // Tüm gerekli state ve action'lar

  const questionTimerIntervalRef = useRef(null);

  // Tema Modu...
  useEffect(() => { const currentHour = new Date().getHours(); const calculatedMode = (currentHour >= 18 || currentHour < 6) ? 'dark' : 'light'; setMode(calculatedMode); }, []);
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  // PWA Yükleme İstemi...
  useEffect(() => { const handleBeforeInstallPrompt = (event) => { event.preventDefault(); setInstallPromptEvent(event); if (!window.matchMedia('(display-mode: standalone)').matches) { setShowInstallButton(true); } }; window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt); return () => { window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt); }; }, []);

  // Firebase Auth Durum Dinleyicisi (Zustand'ı günceller)
  useEffect(() => {
    useUserStore.setState({ isLoading: true }); //isLoading'i zustand içinde yönetelim
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser); // Zustand action'ını çağır (isLoading'i de false yapar)
      if(firebaseUser){
          console.log("Firebase user logged in:", firebaseUser.uid);
          // Kullanıcı giriş yapınca playerName'i de ayarla (eğer varsa)
          setPlayerName(firebaseUser.displayName || `Oyuncu_${firebaseUser.uid.substring(0,4)}`);
      } else {
           console.log("Firebase user logged out.");
           setPlayerName(''); // Çıkış yapınca ismi temizle
      }
    });
    return () => unsubscribe();
  }, [setUser]); // setUser değişmez ama dependency olarak eklemek iyi pratik

  // Socket Bağlantısı (Sadece giriş yapmışsa bağlan)
  useEffect(() => {
      let newSocket = null;
      if (isConnected || !isLoggedIn || isLoading || !SERVER_URL) {
           // Eğer zaten bağlıysa, giriş yapmamışsa, auth yükleniyorsa veya URL yoksa bağlanma/işlem yapma
           // Mevcut bağlantıyı kopar (eğer varsa ve artık giriş yapılmamışsa)
           if(socket && !isLoggedIn && !isLoading){
                console.log("Kullanıcı çıkış yaptı, socket bağlantısı kesiliyor.");
                socket.disconnect();
                setSocket(null);
           }
           return;
      }

      console.log(`%c[DEBUG] Giriş yapıldı, Socket bağlantısı kuruluyor. Sunucu: ${SERVER_URL}`, 'color: purple;');
      newSocket = io(SERVER_URL, { transports: ['websocket', 'polling'] }); setSocket(newSocket);
      const handleConnect = () => { setIsConnected(true); setConnectionMessage('Sunucuya Bağlandı.'); console.log("Socket ID:", newSocket.id);}; const handleConnectError = (err) => { setIsConnected(false); setConnectionMessage(`Bağlantı hatası: ${err.message}`); console.error("Bağlantı hatası detayı:", err);}; const handleDisconnect = (reason) => { setIsConnected(false); setConnectionMessage('Bağlantı kesildi.'); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setIsPlayerReady(false); setAnnouncerLog([]); console.log("Disconnect sebebi:", reason); }; const handleErrorMessage = (data) => { alert(`Sunucu Hatası: ${data.message}`); }; const handleResetGame = (data) => { setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setWaitingMessage(data.message || 'Yeni oyun bekleniyor.'); setLastAnswerResult(null); setIsPlayerReady(false); setAnnouncerLog( prev => [{id: crypto.randomUUID(), text: data.message || 'Yeni oyun bekleniyor.', type:'info', timestamp: Date.now()}, ...prev].slice(0, MAX_LOG_MESSAGES) ); }; const handleInitialState = (data) => { setGameState(data.gameState); setPlayers(data.players || []); const myPlayer = data.players.find(p => p.id === newSocket.id); setIsPlayerReady(myPlayer?.isReady || false); setAnnouncerLog([]); }; const handleStateUpdate = (data) => { setGameState(data.gameState); setPlayers(data.players || []); if (data.currentQuestionIndex === -1) { setCurrentQuestion(null); setLastAnswerResult(null); } if (data.gameState === GAME_STATES.WAITING_TOURNAMENT) { setWaitingMessage(''); const myPlayer = data.players.find(p => p.id === newSocket.id); setIsPlayerReady(myPlayer?.isReady || false); } if (data.gameState === GAME_STATES.TOURNAMENT_RUNNING) setIsPlayerReady(false); if (data.gameState !== GAME_STATES.TOURNAMENT_RUNNING) if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); }; const handleNewQuestion = (questionData) => { setCurrentQuestion({ ...questionData, answered: false, timedOut: false }); setGameResults(null); setLastAnswerResult(null); setGameState(GAME_STATES.TOURNAMENT_RUNNING); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); let timeLeft = questionData.timeLimit; setTimeRemaining(timeLeft); questionTimerIntervalRef.current = setInterval(() => { setTimeRemaining(prevTime => { if (prevTime <= 1) { clearInterval(questionTimerIntervalRef.current); return 0; } return prevTime - 1; }); }, 1000); }; const handleQuestionTimeout = (data) => { if (currentQuestion && data.questionIndex === currentQuestion.index) { setCurrentQuestion(prev => ({...prev, timedOut: true})); const currentPlayerScore = players.find(p => p.id === newSocket?.id)?.score || 0; setLastAnswerResult({ timeout: true, questionIndex: data.questionIndex, correct: false, score: currentPlayerScore }); } if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); }; const handleAnswerResult = (data) => { if (currentQuestion && data.questionIndex === currentQuestion.index) setLastAnswerResult(data); }; const handleGameOver = (data) => { setGameState(GAME_STATES.GAME_OVER); setCurrentQuestion(null); setGameResults(data.results); setLastAnswerResult(null); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); }; const handleWaitingUpdate = (data) => { if (gameState === GAME_STATES.WAITING_TOURNAMENT) setWaitingMessage(data.message); }; const handleAnnouncerMessage = (newMessage) => { setAnnouncerLog(prevLog => [{...newMessage, id: newMessage.id || crypto.randomUUID() }, ...prevLog].slice(0, MAX_LOG_MESSAGES)); };
      newSocket.on('connect', handleConnect); newSocket.on('connect_error', handleConnectError); newSocket.on('disconnect', handleDisconnect); newSocket.on('error_message', handleErrorMessage); newSocket.on('reset_game', handleResetGame); newSocket.on('initial_state', handleInitialState); newSocket.on('tournament_state_update', handleStateUpdate); newSocket.on('new_question', handleNewQuestion); newSocket.on('question_timeout', handleQuestionTimeout); newSocket.on('answer_result', handleAnswerResult); newSocket.on('game_over', handleGameOver); newSocket.on('waiting_update', handleWaitingUpdate); newSocket.on('announcer_message', handleAnnouncerMessage);
      // Cleanup function
      return () => {
        console.log(`%c[DEBUG] Socket Cleanup Triggered! (isLoggedIn: ${isLoggedIn}, isLoading: ${isLoading})`, "color: orange; font-weight: bold;");
        newSocket.off('connect'); newSocket.off('connect_error'); newSocket.off('disconnect'); newSocket.off('error_message'); newSocket.off('reset_game'); newSocket.off('initial_state'); newSocket.off('tournament_state_update'); newSocket.off('new_question'); newSocket.off('question_timeout'); newSocket.off('answer_result'); newSocket.off('game_over'); newSocket.off('waiting_update'); newSocket.off('announcer_message'); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);
        newSocket.disconnect();
        setSocket(null); // Socket state'ini temizle
        setIsConnected(false); // Bağlantı state'ini temizle
      };
  }, [SERVER_URL, isLoggedIn, isLoading]); // Sadece URL, giriş durumu veya yüklenme durumu değiştiğinde çalıştır

  // === Kullanıcı Eylemleri ===
  // handleJoinTournament'da artık playerName'i state'ten değil userStore'dan alabiliriz
  // handleJoinTournament'ı şimdilik oyun mantığı için bırakalım, gerçek katılım farklı olacak
  const handleJoinTournament = useCallback(() => { if (socket && isConnected && user) { /* Kullanıcı adı store'dan alınacak */ socket.emit('join_tournament', { name: user.displayName || user.email || `Oyuncu_${user.uid.substring(0,4)}` }); setWaitingMessage('Sunucuya katılım isteği gönderildi...'); setIsPlayerReady(false); } else if (!user){ alert('Lütfen önce giriş yapın.'); } else { setConnectionMessage('Önce sunucuya bağlanmalısınız.'); } }, [socket, isConnected, user]);
  const handleAnswerSubmit = useCallback((answer) => { if (socket && gameState === GAME_STATES.TOURNAMENT_RUNNING && currentQuestion && !currentQuestion.answered && !currentQuestion.timedOut) { socket.emit('submit_answer', { questionIndex: currentQuestion.index, answer: answer }); setCurrentQuestion(prev => ({...prev, answered: true})); } }, [socket, gameState, currentQuestion]);
  const handlePlayerReady = useCallback(() => { if (socket && isConnected && gameState === GAME_STATES.WAITING_TOURNAMENT && !isPlayerReady) { socket.emit('player_ready'); setIsPlayerReady(true); setWaitingMessage('Hazır olduğunuz belirtildi. Diğerleri bekleniyor...'); } }, [socket, isConnected, gameState, isPlayerReady]);
  const handleInstallClick = useCallback(async () => { if (!installPromptEvent) return; installPromptEvent.prompt(); const { outcome } = await installPromptEvent.userChoice; console.log(`PWA Yükleme sonucu: ${outcome}`); setInstallPromptEvent(null); setShowInstallButton(false); }, [installPromptEvent]);
  const handleLogout = useCallback(async () => {
      if (socket) { socket.disconnect(); } // Önce socket bağlantısını kes
      try {
          await signOut(auth); // Firebase Auth çıkış
          clearUser(); // Zustand store'unu temizle
          console.log("Çıkış yapıldı.");
          // Yönlendirme (Navigate component'i daha iyi olabilir ama şimdilik bu)
          // window.location.href = '/login';
      } catch (error) {
          console.error("Çıkış hatası:", error);
          alert("Çıkış yapılırken bir hata oluştu.");
      }
   }, [socket, clearUser]); // clearUser'ı dependency ekle


  // === Render Edilecek Ana Oyun Component'i (Artık Route içinde) ===
  // Bu fonksiyon artık direkt render edilmeyecek, Route içinde element olarak verilecek
  // İsim değişikliği: renderGameContent
  const renderGameContent = () => {
       // Auth yükleniyorsa veya socket bağlı değilse yükleniyor göster
       if (isLoading || !isConnected) {
            return <Box sx={{ display: 'flex', justifyContent: 'center', padding: 5 }}><CircularProgress /><Typography sx={{ml: 2}}>Yükleniyor...</Typography></Box>;
       }
       // Oyun state'lerine göre componentleri döndür
       if (gameState === GAME_STATES.IDLE || (gameState === GAME_STATES.WAITING_TOURNAMENT && !players.find(p=>p.id === socket?.id))) {
           // JoinScreen yerine belki bir Lobi/Ana Ekran gösterilmeli
           // Şimdilik Join tuşu gibi bir şey yapalım
            return (
                <Paper elevation={3} sx={{p:3, textAlign:'center'}}>
                    <Typography variant="h5">Turnuvaya Katılmaya Hazır Mısın?</Typography>
                    <Button variant="contained" size="large" onClick={handleJoinTournament} sx={{mt: 2}}>
                       Turnuvaya Katıl
                    </Button>
                     <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{waitingMessage}</Typography>
                </Paper>
            );
       }
       if (gameState === GAME_STATES.WAITING_TOURNAMENT) { return <WaitingLobby players={players} handlePlayerReady={handlePlayerReady} isPlayerReady={isPlayerReady} waitingMessage={waitingMessage} currentSocketId={socket?.id}/>; }
       if (gameState === GAME_STATES.TOURNAMENT_RUNNING) { return <GameInterface currentQuestion={currentQuestion} timeRemaining={timeRemaining} handleAnswerSubmit={handleAnswerSubmit} lastAnswerResult={lastAnswerResult}/>; }
       if (gameState === GAME_STATES.GAME_OVER) { return <ResultsScreen gameResults={gameResults} waitingMessage={waitingMessage} currentSocketId={socket?.id}/>; }
       return <Box sx={{ display: 'flex', justifyContent: 'center', padding: 5 }}><CircularProgress /></Box>; // Fallback
  };

  // === Ana Render ===
  const showSidebars = (gameState === GAME_STATES.WAITING_TOURNAMENT || gameState === GAME_STATES.TOURNAMENT_RUNNING || gameState === GAME_STATES.GAME_OVER) && players.length > 0 && isConnected;

  return (
    <ThemeProvider theme={theme}>
       <CssBaseline />
       {/* Basit AppBar/Toolbar */}
       <AppBar position="static" elevation={1}>
         <Container maxWidth="xl">
           <Toolbar disableGutters sx={{ justifyContent: 'space-between' }}>
             <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
               Asrın Oyunu
             </Typography>
             {isLoading ? (
                <CircularProgress size={24} color="inherit"/>
             ) : isLoggedIn ? (
               <Box>
                 <Typography variant="body2" component="span" sx={{ mr: 2 }}>
                   Hoşgeldin, {user?.displayName || user?.email}
                 </Typography>
                 <Button color="inherit" onClick={handleLogout} startIcon={<LogoutIcon/>}>Çıkış Yap</Button>
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

       {/* Ana İçerik Container'ı */}
       <Container maxWidth="xl" sx={{ marginTop: 2, paddingBottom: 4 }}>
           {showInstallButton && installPromptEvent && ( <Button fullWidth variant="outlined" onClick={handleInstallClick} startIcon={<InstallMobileIcon />} size="small" sx={{ mb: 2 }}> Uygulamayı Yükle </Button> )}
           {/* Ana Grid */}
           <Grid container spacing={2} alignItems="flex-start">
               {/* Sol Sidebar */}
               {showSidebars && ( <Grid xs={12} md={3} order={{ xs: 2, md: 1 }}> <Box sx={{ position: 'sticky', top: '80px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}> <Paper variant="outlined" sx={{ p: 1, height: '100%' }}> <PlayerList players={players} gameState={gameState} currentSocketId={socket?.id} /> </Paper> </Box> </Grid> )}
               {/* Orta Alan (Route Edilmiş İçerik) */}
               <Grid xs={12} md={ showSidebars ? 6 : 12 } order={{ xs: 1, md: 2 }} >
                   <Box>
                       <Routes>
                           <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
                           <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
                           {/* Ana sayfa ve oyun içeriği korunmuş route'da */}
                           <Route path="/" element={
                               <ProtectedRoute>
                                   <AnimatePresence mode="wait">
                                       <motion.div
                                           key={gameState}
                                           initial={{ opacity: 0 }}
                                           animate={{ opacity: 1 }}
                                           exit={{ opacity: 0 }}
                                           transition={{ duration: 0.3 }}
                                       >
                                           {renderGameContent()} {/* Fonksiyon adı değişti */}
                                       </motion.div>
                                   </AnimatePresence>
                               </ProtectedRoute>
                           }/>
                           {/* Diğer korunmuş route'lar buraya eklenebilir */}
                           {/* <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} /> */}
                       </Routes>
                   </Box>
                </Grid>
               {/* Sağ Sidebar */}
               {showSidebars && ( <Grid xs={12} md={3} order={{ xs: 3, md: 3 }}> <Box sx={{ position: 'sticky', top: '80px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}> <Paper variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}> <AnnouncerLog announcerLog={announcerLog} /> </Paper> </Box> </Grid> )}
           </Grid>
        </Container>
    </ThemeProvider>
  );
}

export default App;
