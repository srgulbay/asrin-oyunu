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
import { Alert } from '@mui/material';

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
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress /></Box>;
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function GuestRoute({ children }) {
  const isLoggedIn = useUserStore((state) => state.isLoggedIn);
  const isLoading = useUserStore((state) => state.isLoading);

  if (isLoading) {
     return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress /></Box>;
  }

  if (isLoggedIn) {
    return <Navigate to="/" replace />;
  }
  return children;
}


function App() {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('Giriş bekleniyor...');
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
  const socketRef = useRef(socket); // Ref to hold current socket

  console.log(`>>> APP RENDER: isLoading=${isLoading}, isConnected=${isConnected}, isLoggedIn=${isLoggedIn}, userUID=${user?.uid}`);

  useEffect(() => { const currentHour = new Date().getHours(); const calculatedMode = (currentHour >= 18 || currentHour < 6) ? 'dark' : 'light'; setMode(calculatedMode); }, []);
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  useEffect(() => { const handleBeforeInstallPrompt = (event) => { event.preventDefault(); setInstallPromptEvent(event); if (!window.matchMedia('(display-mode: standalone)').matches) { setShowInstallButton(true); } }; window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt); return () => { window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt); }; }, []);


  const setupSocketListeners = useCallback((socketInstance) => {
      socketInstance.off('connect'); socketInstance.off('connect_error'); socketInstance.off('disconnect');
      socketInstance.off('error_message'); socketInstance.off('reset_game'); socketInstance.off('initial_state');
      socketInstance.off('tournament_state_update'); socketInstance.off('new_question'); socketInstance.off('question_timeout');
      socketInstance.off('answer_result'); socketInstance.off('game_over'); socketInstance.off('waiting_update');
      socketInstance.off('announcer_message');

      const handleConnect = () => { setIsConnected(true); setConnectionMessage('Sunucuya Bağlandı.'); console.log("🚨 [App.jsx] Socket Bağlandı! ID:", socketInstance.id);};
      const handleConnectError = (err) => { setIsConnected(false); setConnectionMessage(`Bağlantı hatası: ${err.message}`); console.error("🚨 [App.jsx] Socket Bağlantı Hatası:", err);};
      const handleDisconnect = (reason) => { setIsConnected(false); setConnectionMessage('Bağlantı kesildi.'); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setIsPlayerReady(false); setAnnouncerLog([]); console.log("🚨 [App.jsx] Socket Disconnect sebebi:", reason); };
      const handleErrorMessage = (data) => { console.error("🚨 [App.jsx] Sunucu Hatası:", data.message); alert(`Sunucu Hatası: ${data.message}`); };
      const handleResetGame = (data) => { console.log("🚨 [App.jsx] reset_game alındı:", data); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setWaitingMessage(data.message || 'Yeni oyun bekleniyor.'); setLastAnswerResult(null); setIsPlayerReady(false); setAnnouncerLog( prev => [{id: crypto.randomUUID(), text: data.message || 'Yeni oyun bekleniyor.', type:'info', timestamp: Date.now()}, ...prev].slice(0, MAX_LOG_MESSAGES) ); };
      const handleInitialState = (data) => { console.log("🚨 [App.jsx] initial_state alındı:", data); setGameState(data.gameState); setPlayers(data.players || []); const myPlayer = data.players.find(p => p.id === socketInstance.id); setIsPlayerReady(myPlayer?.isReady || false); setAnnouncerLog([]); };
      const handleStateUpdate = (data) => { console.log("🚨 [App.jsx] tournament_state_update alındı:", data); setGameState(data.gameState); setPlayers(data.players || []); if (data.currentQuestionIndex === -1) { setCurrentQuestion(null); setLastAnswerResult(null); } if (data.gameState === GAME_STATES.WAITING_TOURNAMENT) { setWaitingMessage(''); const myPlayer = data.players.find(p => p.id === socketInstance.id); setIsPlayerReady(myPlayer?.isReady || false); } if (data.gameState === GAME_STATES.TOURNAMENT_RUNNING) setIsPlayerReady(false); if (data.gameState !== GAME_STATES.TOURNAMENT_RUNNING && questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
      const handleNewQuestion = (questionData) => { console.log("🚨 [App.jsx] new_question alındı:", questionData); setCurrentQuestion({ ...questionData, answered: false, timedOut: false }); setGameResults(null); setLastAnswerResult(null); setGameState(GAME_STATES.TOURNAMENT_RUNNING); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); let timeLeft = questionData.timeLimit; setTimeRemaining(timeLeft); questionTimerIntervalRef.current = setInterval(() => { setTimeRemaining(prevTime => { if (prevTime <= 1) { clearInterval(questionTimerIntervalRef.current); return 0; } return prevTime - 1; }); }, 1000); };
      const handleQuestionTimeout = (data) => { console.log("🚨 [App.jsx] question_timeout alındı:", data); if (currentQuestion && data.questionIndex === currentQuestion.index) { setCurrentQuestion(prev => ({...prev, timedOut: true})); const currentPlayerScore = players.find(p => p.id === socketInstance?.id)?.score || 0; setLastAnswerResult({ timeout: true, questionIndex: data.questionIndex, correct: false, score: currentPlayerScore }); } if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
      const handleAnswerResult = (data) => { console.log("🚨 [App.jsx] answer_result alındı:", data); if (currentQuestion && data.questionIndex === currentQuestion.index) setLastAnswerResult(data); };
      const handleGameOver = (data) => { console.log("🚨 [App.jsx] game_over alındı:", data); setGameState(GAME_STATES.GAME_OVER); setCurrentQuestion(null); setGameResults(data.results); setLastAnswerResult(null); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
      const handleWaitingUpdate = (data) => { console.log("🚨 [App.jsx] waiting_update alındı:", data); if (gameState === GAME_STATES.WAITING_TOURNAMENT) setWaitingMessage(data.message); };
      const handleAnnouncerMessage = (newMessage) => { console.log("🚨 [App.jsx] announcer_message alındı:", newMessage); setAnnouncerLog(prevLog => [{...newMessage, id: newMessage.id || crypto.randomUUID() }, ...prevLog].slice(0, MAX_LOG_MESSAGES)); };

      socketInstance.on('connect', handleConnect);
      socketInstance.on('connect_error', handleConnectError);
      socketInstance.on('disconnect', handleDisconnect);
      socketInstance.on('error_message', handleErrorMessage);
      socketInstance.on('reset_game', handleResetGame);
      socketInstance.on('initial_state', handleInitialState);
      socketInstance.on('tournament_state_update', handleStateUpdate);
      socketInstance.on('new_question', handleNewQuestion);
      socketInstance.on('question_timeout', handleQuestionTimeout);
      socketInstance.on('answer_result', handleAnswerResult);
      socketInstance.on('game_over', handleGameOver);
      socketInstance.on('waiting_update', handleWaitingUpdate);
      socketInstance.on('announcer_message', handleAnnouncerMessage);

  }, [currentQuestion, gameState]); // Bağımlılıkları kontrol et (state okumaları)

  useEffect(() => {
    console.log(">>> Auth Listener useEffect");
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log(">>> onAuthStateChanged Triggered. User:", firebaseUser ? firebaseUser.uid : null);

      if (socketRef.current) {
           console.log(">>> Mevcut socket kapatılıyor (auth state değişti).");
           socketRef.current.disconnect();
           setSocket(null);
           setIsConnected(false);
      }

      if (firebaseUser) {
         let token = null;
         try {
            console.log(`>>> Kullanıcı ${firebaseUser.uid} için ID Token alınıyor...`);
            token = await firebaseUser.getIdToken();
            console.error(`>>> ID TOKEN ALINDI (ilk 15 char): ${token ? token.substring(0, 15) : 'HATA/YOK'}`);
         } catch (error) {
             console.error(">>> ID Token alınırken HATA:", error);
             alert("Kimlik doğrulama token'ı alınamadı, bağlantı kurulamıyor.");
             setUser(null);
             setIsLoading(false);
             return;
         }

         if (token) {
             console.log(`%c>>> Socket bağlantısı deneniyor (Token ile): ${SERVER_URL}`, 'color: blue; font-weight: bold;');
             const newSocket = io(SERVER_URL, {
                 transports: ['websocket', 'polling'],
                 auth: { token }
             });
             setSocket(newSocket);
             window.socket = newSocket; // Debug için
             setupSocketListeners(newSocket);
         } else {
              console.error(">>> Token alınamadı, socket bağlantısı kurulmayacak.");
              setUser(null);
              setIsLoading(false);
         }
         console.log(">>> setUser çağrılıyor (Auth verisiyle)...");
         setUser(firebaseUser);

      } else {
        console.log(">>> Kullanıcı çıkış yaptı, state temizleniyor.");
        setUser(null);
        setIsConnected(false);
        setConnectionMessage('Giriş bekleniyor...');
      }
    });

    return () => {
        console.log(">>> Auth Listener useEffect cleanup.");
        unsubscribe();
        if (socketRef.current) {
             console.log(">>> Component unmount: Socket bağlantısı kesiliyor.");
             socketRef.current.disconnect();
             setSocket(null);
             setIsConnected(false);
        }
    };
 }, [setUser, setupSocketListeners]); // setupSocketListeners eklendi

 useEffect(() => {
    socketRef.current = socket;
 }, [socket]);

 // Zustand State Listener (Debug amaçlı)
 useEffect(() => {
    console.log(">>> Zustand user state listener kuruluyor.");
    const unsubscribe = useUserStore.subscribe(
      (state) => state.user,
      (newUser, previousUser) => {
        console.log(">>> Zustand user state DEĞİŞTİ!", {
           previousUID: previousUser?.uid,
           newUID: newUser?.uid,
           isLoggedInNow: !!newUser,
           // newUser: JSON.stringify(newUser, null, 2) // Çok uzun olabilir, sadece UID'yi loglayalım
         });
      }
    );
    const initialUser = useUserStore.getState().user;
    console.log(">>> Zustand listener kuruldu. Başlangıç user state UID:", initialUser?.uid);
    return () => {
        console.log(">>> Zustand user state listener kaldırılıyor.");
        unsubscribe();
    } ;
  }, []);

  const handleJoinTournament = useCallback(() => {
      const joinName = user?.displayName || user?.email || (user?.uid ? `Oyuncu_${user.uid.substring(0,4)}` : 'Bilinmeyen');
      const userGrade = user?.grade;
      // const userUid = user?.uid; // ARTIK GÖNDERİLMİYOR

      console.log('>>> handleJoinTournament ÇAĞRILDI!'); // Basit log
      console.log('>>> Anlık User State UID:', user?.uid); // Sadece UID'yi logla
      console.log(`>>> Kontrol: socket=${!!socket}, isConnected=${isConnected}, user=${!!user}`);

      if (socket && isConnected && user) { // UID kontrolü kalktı
          console.log('>>> Koşul sağlandı, join_tournament emit ediliyor:', { name: joinName, grade: userGrade });
          socket.emit('join_tournament', {
              name: joinName,
              grade: userGrade
              // uid GÖNDERİLMEDİ
          });
          setWaitingMessage('Sunucuya katılım isteği gönderildi...');
          setIsPlayerReady(false);
      } else if (!user) {
          console.log('>>> Katılma başarısız: User state bulunamadı.');
          // Alert mesajını güncelleyelim
          const reason = !user ? "User nesnesi null/undefined" : "Bilinmeyen durum"; // UID kontrolü kalktığı için sebep user yokluğu
          alert(`Katılma Başarısız!\nSebep: ${reason}\nLütfen sayfayı yenileyip tekrar deneyin.`);
      } else if (!isConnected || !socket) {
          console.log(`>>> Katılma başarısız: Socket bağlı değil (${isConnected}) veya yok (${!!socket}).`);
          alert('Sunucu bağlantısı bekleniyor veya kurulamadı...');
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
      if (socketRef.current) {
          console.log(">>> Logout: Socket bağlantısı kesiliyor.");
          socketRef.current.disconnect();
          setSocket(null);
          setIsConnected(false);
       }
      try {
          await signOut(auth);
          console.log("Çıkış yapıldı (Firebase).");
      } catch (error) {
          console.error("Çıkış hatası:", error);
          alert("Çıkış yapılırken bir hata oluştu.");
      }
   }, []);

  const renderGameContent = () => {
       const isAuthLoading = isLoading;
       const isUserMissing = !user; // Sadece user var mı kontrolü
       const isSocketDisconnected = !isConnected;
       const joinButtonDisabled = isAuthLoading || isSocketDisconnected || isUserMissing; // UID kontrolü kalktı
       const joinButtonText = isAuthLoading
           ? 'Yükleniyor...'
           : (isSocketDisconnected
               ? 'Bağlanıyor...'
               : (isUserMissing // UID yerine user kontrolü
                   ? 'Kullanıcı Bilgisi Bekleniyor...'
                   : 'Turnuvaya Katıl'));

       if (isAuthLoading || (isSocketDisconnected && isLoggedIn && gameState !== GAME_STATES.IDLE)) {
            return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 5, flexDirection:'column' }}><CircularProgress /><Typography sx={{mt: 2}} color="text.secondary">{isAuthLoading ? "Kimlik doğrulanıyor..." : connectionMessage}</Typography></Box>;
       }

       if (gameState === GAME_STATES.IDLE || (gameState === GAME_STATES.WAITING_TOURNAMENT && !players.find(p=>p.id === socket?.id))) {
            if (!isLoggedIn) {
                return (
                    <Paper elevation={3} sx={{p:3, textAlign:'center'}}>
                        <Typography variant="h5">Oynamak için Giriş Yapın</Typography>
                        <Button component={RouterLink} to="/login" variant="contained" sx={{mt: 2}}>Giriş Yap</Button>
                        <Button component={RouterLink} to="/register" variant="outlined" sx={{mt: 2, ml: 1}}>Kayıt Ol</Button>
                    </Paper>
                );
            }
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
                   {/* Debug Info Box: Bu hala faydalı olabilir */}
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