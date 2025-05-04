import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, Navigate, Link as RouterLink } from "react-router-dom";
import './App.css';
import { io } from "socket.io-client";

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
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';

import JoinScreen from './components/JoinScreen';
import WaitingLobby from './components/WaitingLobby';
import GameInterface from './components/GameInterface';
import ResultsScreen from './components/ResultsScreen';
import PlayerList from './components/PlayerList';
import AnnouncerLog from './components/AnnouncerLog';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import createAppTheme from './theme';

import { auth } from './firebaseConfig';
import { onAuthStateChanged, signOut } from "firebase/auth";
import useUserStore from './store/userStore';
import { motion, AnimatePresence } from 'framer-motion';

const SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
const MAX_LOG_MESSAGES = 20;


function ProtectedRoute({ children }) {
  const isLoggedIn = useUserStore((state) => state.isLoggedIn);
  const isLoading = useUserStore((state) => state.isLoading);

  if (isLoading) {
    console.error("🚨 [ProtectedRoute] Loading state...");
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress /></Box>;
  }

  if (!isLoggedIn) {
    console.error("🚨 [ProtectedRoute] Not logged in, redirecting to login.");
    return <Navigate to="/login" replace />;
  }
  console.log("🚨 [ProtectedRoute] Logged in, rendering children.");
  return children;
}

function GuestRoute({ children }) {
  const isLoggedIn = useUserStore((state) => state.isLoggedIn);
  const isLoading = useUserStore((state) => state.isLoading);

  if (isLoading) {
     console.error("🚨 [GuestRoute] Loading state...");
     return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress /></Box>;
  }

  if (isLoggedIn) {
    console.error("🚨 [GuestRoute] Already logged in, redirecting to home.");
    return <Navigate to="/" replace />;
  }
   console.log("🚨 [GuestRoute] Not logged in, rendering children.");
  return children;
}


function App() {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('Sunucuya bağlanılıyor...');
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

  const { user, isLoggedIn, isLoading, setUser, clearUser } = useUserStore();

  const questionTimerIntervalRef = useRef(null);

  console.log(`🚨 [App.jsx] Render - isLoading: ${isLoading}, isConnected: ${isConnected}, user exists: ${!!user}, user UID: ${user?.uid}`);

  useEffect(() => { const currentHour = new Date().getHours(); const calculatedMode = (currentHour >= 18 || currentHour < 6) ? 'dark' : 'light'; setMode(calculatedMode); }, []);
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  useEffect(() => { const handleBeforeInstallPrompt = (event) => { event.preventDefault(); setInstallPromptEvent(event); if (!window.matchMedia('(display-mode: standalone)').matches) { setShowInstallButton(true); } }; window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt); return () => { window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt); }; }, []);

  useEffect(() => {
    console.log("🚨 [App.jsx] onAuthStateChanged listener kuruluyor.");
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.error("🚨 [App.jsx] onAuthStateChanged tetiklendi! Gelen firebaseUser:", firebaseUser ? { uid: firebaseUser.uid, email: firebaseUser.email } : null);
      console.error("🚨 [App.jsx] setUser çağrılıyor...");
      setUser(firebaseUser);
    });
    return () => {
        console.log("🚨 [App.jsx] onAuthStateChanged listener kaldırılıyor.");
        unsubscribe();
    };
  }, [setUser]);

  useEffect(() => {
    console.log("🚨 [App.jsx] Zustand user state listener kuruluyor.");
    const unsubscribe = useUserStore.subscribe(
      (state) => state.user,
      (newUser, previousUser) => {
        console.error("🚨 [App.jsx] Zustand user state DEĞİŞTİ!", {
           previousUID: previousUser?.uid,
           newUID: newUser?.uid,
           isLoggedInNow: !!newUser,
           newUser: JSON.stringify(newUser, null, 2)
         });
      }
    );
    const initialUser = useUserStore.getState().user;
    console.error("🚨 [App.jsx] Zustand listener kuruldu. Başlangıç user state:", JSON.stringify(initialUser, null, 2));
    return () => {
        console.log("🚨 [App.jsx] Zustand user state listener kaldırılıyor.");
        unsubscribe();
    } ;
  }, []);

  // --- GÜNCELLEME: Socket Bağlantı useEffect ---
  useEffect(() => {
    console.log(`🚨 [App.jsx] Socket bağlantı useEffect KONTROL. Durum: isLoggedIn=${isLoggedIn}, isLoading=${isLoading}`);

    // Sadece yükleme bittiğinde VE kullanıcı giriş yapmışsa bağlanmayı dene
    if (!isLoading && isLoggedIn) {
        if (!socket || !isConnected) { // Zaten bağlı değilse veya socket null ise
            console.log(`%c🚨 [App.jsx] Yükleme bitti, kullanıcı giriş yaptı. Socket bağlantısı kuruluyor: ${SERVER_URL}`, 'color: blue; font-weight: bold;');
            const newSocket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
            setSocket(newSocket); // State'i hemen güncelle

            const handleConnect = () => { setIsConnected(true); setConnectionMessage('Sunucuya Bağlandı.'); console.log("🚨 [App.jsx] Socket Bağlandı! ID:", newSocket.id);};
            const handleConnectError = (err) => { setIsConnected(false); setConnectionMessage(`Bağlantı hatası: ${err.message}`); console.error("🚨 [App.jsx] Socket Bağlantı Hatası:", err);};
            const handleDisconnect = (reason) => { setIsConnected(false); setConnectionMessage('Bağlantı kesildi.'); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setIsPlayerReady(false); setAnnouncerLog([]); console.log("🚨 [App.jsx] Socket Disconnect sebebi:", reason); };
            const handleErrorMessage = (data) => { console.error("🚨 [App.jsx] Sunucu Hatası:", data.message); alert(`Sunucu Hatası: ${data.message}`); };
            const handleResetGame = (data) => { console.log("🚨 [App.jsx] reset_game alındı:", data); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setWaitingMessage(data.message || 'Yeni oyun bekleniyor.'); setLastAnswerResult(null); setIsPlayerReady(false); setAnnouncerLog( prev => [{id: crypto.randomUUID(), text: data.message || 'Yeni oyun bekleniyor.', type:'info', timestamp: Date.now()}, ...prev].slice(0, MAX_LOG_MESSAGES) ); };
            const handleInitialState = (data) => { console.log("🚨 [App.jsx] initial_state alındı:", data); setGameState(data.gameState); setPlayers(data.players || []); const myPlayer = data.players.find(p => p.id === newSocket.id); setIsPlayerReady(myPlayer?.isReady || false); setAnnouncerLog([]); };
            const handleStateUpdate = (data) => { console.log("🚨 [App.jsx] tournament_state_update alındı:", data); setGameState(data.gameState); setPlayers(data.players || []); if (data.currentQuestionIndex === -1) { setCurrentQuestion(null); setLastAnswerResult(null); } if (data.gameState === GAME_STATES.WAITING_TOURNAMENT) { setWaitingMessage(''); const myPlayer = data.players.find(p => p.id === newSocket.id); setIsPlayerReady(myPlayer?.isReady || false); } if (data.gameState === GAME_STATES.TOURNAMENT_RUNNING) setIsPlayerReady(false); if (data.gameState !== GAME_STATES.TOURNAMENT_RUNNING) if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
            const handleNewQuestion = (questionData) => { console.log("🚨 [App.jsx] new_question alındı:", questionData); setCurrentQuestion({ ...questionData, answered: false, timedOut: false }); setGameResults(null); setLastAnswerResult(null); setGameState(GAME_STATES.TOURNAMENT_RUNNING); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); let timeLeft = questionData.timeLimit; setTimeRemaining(timeLeft); questionTimerIntervalRef.current = setInterval(() => { setTimeRemaining(prevTime => { if (prevTime <= 1) { clearInterval(questionTimerIntervalRef.current); return 0; } return prevTime - 1; }); }, 1000); };
            const handleQuestionTimeout = (data) => { console.log("🚨 [App.jsx] question_timeout alındı:", data); if (currentQuestion && data.questionIndex === currentQuestion.index) { setCurrentQuestion(prev => ({...prev, timedOut: true})); const currentPlayerScore = players.find(p => p.id === newSocket?.id)?.score || 0; setLastAnswerResult({ timeout: true, questionIndex: data.questionIndex, correct: false, score: currentPlayerScore }); } if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
            const handleAnswerResult = (data) => { console.log("🚨 [App.jsx] answer_result alındı:", data); if (currentQuestion && data.questionIndex === currentQuestion.index) setLastAnswerResult(data); };
            const handleGameOver = (data) => { console.log("🚨 [App.jsx] game_over alındı:", data); setGameState(GAME_STATES.GAME_OVER); setCurrentQuestion(null); setGameResults(data.results); setLastAnswerResult(null); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
            const handleWaitingUpdate = (data) => { console.log("🚨 [App.jsx] waiting_update alındı:", data); if (gameState === GAME_STATES.WAITING_TOURNAMENT) setWaitingMessage(data.message); };
            const handleAnnouncerMessage = (newMessage) => { console.log("🚨 [App.jsx] announcer_message alındı:", newMessage); setAnnouncerLog(prevLog => [{...newMessage, id: newMessage.id || crypto.randomUUID() }, ...prevLog].slice(0, MAX_LOG_MESSAGES)); };

            newSocket.on('connect', handleConnect);
            newSocket.on('connect_error', handleConnectError);
            newSocket.on('disconnect', handleDisconnect);
            newSocket.on('error_message', handleErrorMessage);
            newSocket.on('reset_game', handleResetGame);
            newSocket.on('initial_state', handleInitialState);
            newSocket.on('tournament_state_update', handleStateUpdate);
            newSocket.on('new_question', handleNewQuestion);
            newSocket.on('question_timeout', handleQuestionTimeout);
            newSocket.on('answer_result', handleAnswerResult);
            newSocket.on('game_over', handleGameOver);
            newSocket.on('waiting_update', handleWaitingUpdate);
            newSocket.on('announcer_message', handleAnnouncerMessage);

            // Cleanup function sadece bu scope içinde tanımlanan newSocket için geçerli
            return () => {
              console.log("🚨 [App.jsx] Socket useEffect cleanup çalışıyor (yeni socket için).");
              newSocket.disconnect();
              setSocket(null); // Önceki socket state'ini temizle
              setIsConnected(false);
            };
        } else {
             console.log("🚨 [App.jsx] Socket zaten bağlı veya null değil, yeniden bağlantı denenmiyor.");
        }

    } else if (socket) { // Yükleme devam ediyorsa veya giriş yapılmamışsa VE socket hala varsa
        console.log("🚨 [App.jsx] Kullanıcı çıkış yaptı veya yükleniyor, mevcut socket bağlantısı kesiliyor.");
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
    } else {
         console.log(`🚨 [App.jsx] Socket bağlantısı için koşullar sağlanmadı (isLoading: ${isLoading}, isLoggedIn: ${isLoggedIn}).`);
    }

  }, [isLoggedIn, isLoading]); // Sadece bu ikisine bağlı

  // ------------------------------------------

  const handleJoinTournament = useCallback(() => {
      const joinName = user?.displayName || user?.email || (user?.uid ? `Oyuncu_${user.uid.substring(0,4)}` : 'Bilinmeyen');
      const userGrade = user?.grade;
      const userUid = user?.uid;

      console.error('🚨 [App.jsx] handleJoinTournament ÇAĞRILDI!');
      console.error('🚨 [App.jsx] Anlık User State:', JSON.stringify(user, null, 2));
      console.error('🚨 [App.jsx] Anlık Gönderilecek UID:', userUid);
      console.error(`🚨 [App.jsx] Kontrol: socket=${!!socket}, isConnected=${isConnected}, user=${!!user}, userUid=${!!userUid}`);

      if (socket && isConnected && user && userUid) {
          console.error('🚨 [App.jsx] Koşul sağlandı, join_tournament emit ediliyor:', { name: joinName, grade: userGrade, uid: userUid });
          socket.emit('join_tournament', {
              name: joinName,
              grade: userGrade,
              uid: userUid
          });
          setWaitingMessage('Sunucuya katılım isteği gönderildi...');
          setIsPlayerReady(false);
      } else if (!user || !userUid) {
          console.error('🚨 [App.jsx] Katılma başarısız: User state içinde UID bulunamadı.');
          alert('Kullanıcı bilgileri tam olarak yüklenemedi. Lütfen sayfayı yenileyip tekrar deneyin veya tekrar giriş yapın.');
      } else if (!isConnected) {
          console.error('🚨 [App.jsx] Katılma başarısız: Socket bağlı değil.');
          alert('Sunucu bağlantısı bekleniyor...');
      } else if (!socket) {
          console.error('🚨 [App.jsx] Katılma başarısız: Socket nesnesi henüz yok.');
           alert('Sunucu bağlantısı kuruluyor, lütfen tekrar deneyin.');
      }
  }, [socket, isConnected, user]);

  const handleAnswerSubmit = useCallback((answer) => {
      if (socket && gameState === GAME_STATES.TOURNAMENT_RUNNING && currentQuestion && !currentQuestion.answered && !currentQuestion.timedOut) {
          socket.emit('submit_answer', { questionIndex: currentQuestion.index, answer: answer });
          setCurrentQuestion(prev => ({...prev, answered: true}));
      }
  }, [socket, gameState, currentQuestion]);

  const handlePlayerReady = useCallback(() => {
      if (socket && isConnected && gameState === GAME_STATES.WAITING_TOURNAMENT && !isPlayerReady) {
          socket.emit('player_ready');
          setIsPlayerReady(true);
          setWaitingMessage('Hazır olduğunuz belirtildi. Diğerleri bekleniyor...');
      }
  }, [socket, isConnected, gameState, isPlayerReady]);

  const handleInstallClick = useCallback(async () => {
      if (!installPromptEvent) return;
      installPromptEvent.prompt();
      const { outcome } = await installPromptEvent.userChoice;
      console.log(`PWA Yükleme sonucu: ${outcome}`);
      setInstallPromptEvent(null);
      setShowInstallButton(false);
  }, [installPromptEvent]);

   const handleLogout = useCallback(async () => {
      if (socket) { socket.disconnect(); }
      try {
          await signOut(auth);
          clearUser();
          console.log("Çıkış yapıldı.");
      } catch (error) {
          console.error("Çıkış hatası:", error);
          alert("Çıkış yapılırken bir hata oluştu.");
      }
   }, [socket, clearUser]);

  const renderGameContent = () => {
       if (isLoading || (!isConnected && isLoggedIn && gameState !== GAME_STATES.IDLE)) {
            return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 5, flexDirection:'column' }}><CircularProgress /><Typography sx={{mt: 2}} color="text.secondary">{isLoading ? "Kullanıcı verisi yükleniyor..." : connectionMessage}</Typography></Box>;
       }

       if (gameState === GAME_STATES.IDLE || (gameState === GAME_STATES.WAITING_TOURNAMENT && !players.find(p=>p.id === socket?.id))) {
            const isAuthLoading = isLoading;
            const isUserUidMissing = !user?.uid;
            const isSocketDisconnected = !isConnected;
            const joinButtonDisabled = isAuthLoading || isSocketDisconnected || isUserUidMissing;
            const joinButtonText = isAuthLoading
                ? 'Yükleniyor...'
                : (isSocketDisconnected
                    ? 'Bağlanıyor...'
                    : (isUserUidMissing
                        ? 'Kullanıcı Bilgisi Bekleniyor...'
                        : 'Turnuvaya Katıl'));

            return (
                <Paper elevation={3} sx={{p:3, textAlign:'center'}}>
                   <Typography variant="h5">Turnuvaya Katılmaya Hazır Mısın?</Typography>
                    <Button
                       variant="contained"
                       size="large"
                       onClick={handleJoinTournament}
                       sx={{mt: 2}}
                       disabled={joinButtonDisabled}
                    >
                       {joinButtonText}
                    </Button>
                   <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{waitingMessage}</Typography>
                </Paper>
            );
       }
       if (gameState === GAME_STATES.WAITING_TOURNAMENT) { return <WaitingLobby players={players} handlePlayerReady={handlePlayerReady} isPlayerReady={isPlayerReady} waitingMessage={waitingMessage} currentSocketId={socket?.id}/>; }
       if (gameState === GAME_STATES.TOURNAMENT_RUNNING) { return <GameInterface currentQuestion={currentQuestion} timeRemaining={timeRemaining} handleAnswerSubmit={handleAnswerSubmit} lastAnswerResult={lastAnswerResult}/>; }
       if (gameState === GAME_STATES.GAME_OVER) { return <ResultsScreen gameResults={gameResults} waitingMessage={waitingMessage} />; }

       return <Box sx={{ display: 'flex', justifyContent: 'center', padding: 5 }}><CircularProgress /></Box>;
  };

  const showSidebars = (gameState === GAME_STATES.WAITING_TOURNAMENT || gameState === GAME_STATES.TOURNAMENT_RUNNING || gameState === GAME_STATES.GAME_OVER) && players.length > 0 && isConnected;

  return (
    <ThemeProvider theme={theme}>
       <CssBaseline />
       <AppBar position="static" elevation={1}>
         <Container maxWidth="xl">
           <Toolbar disableGutters sx={{ justifyContent: 'space-between' }}>
             <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
               Asrın Oyunu
             </Typography>
             {isLoading ? (
                <CircularProgress size={24} color="inherit"/>
             ) : isLoggedIn ? (
               <Box sx={{ display: 'flex', alignItems: 'center'}}>
                 <Button color="inherit" component={RouterLink} to="/profile" startIcon={<AccountCircleIcon/>}>
                     {user?.displayName || user?.email}
                 </Button>
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

       <Container maxWidth="xl" sx={{ marginTop: 2, paddingBottom: 4 }}>
           {showInstallButton && installPromptEvent && ( <Button fullWidth variant="outlined" onClick={handleInstallClick} startIcon={<InstallMobileIcon />} size="small" sx={{ mb: 2 }}> Uygulamayı Yükle </Button> )}
           <Grid container spacing={2} alignItems="flex-start">
               {showSidebars && (
                 <Grid item xs={12} md={3} order={{ xs: 2, md: 1 }}>
                   <Box sx={{ position: 'sticky', top: '80px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
                       <Paper variant="outlined" sx={{ p: 1, height: '100%' }}>
                           <PlayerList players={players} gameState={gameState} currentSocketId={socket?.id} />
                       </Paper>
                   </Box>
                 </Grid>
                )}
               <Grid item xs={12} md={ showSidebars ? 6 : 12 } order={{ xs: 1, md: 2 }} >
                   <Box>
                       <Routes>
                           <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
                           <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
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
                                           {renderGameContent()}
                                       </motion.div>
                                   </AnimatePresence>
                               </ProtectedRoute>
                           }/>
                           <Route path="/profile" element={
                                <ProtectedRoute>
                                    <ProfilePage />
                                </ProtectedRoute>
                           }/>
                       </Routes>
                   </Box>
                </Grid>
               {showSidebars && (
                 <Grid item xs={12} md={3} order={{ xs: 3, md: 3 }}>
                   <Box sx={{ position: 'sticky', top: '80px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
                       <Paper variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                           <AnnouncerLog announcerLog={announcerLog} />
                       </Paper>
                   </Box>
                 </Grid>
               )}
           </Grid>
        </Container>
    </ThemeProvider>
  );
}

export default App;