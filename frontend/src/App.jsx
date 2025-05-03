import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route } from "react-router-dom";
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
// --- Component Imports ---
import JoinScreen from './components/JoinScreen';
import WaitingLobby from './components/WaitingLobby';
import GameInterface from './components/GameInterface';
import ResultsScreen from './components/ResultsScreen';
import PlayerList from './components/PlayerList';
import AnnouncerLog from './components/AnnouncerLog';
import createAppTheme from './theme';
// --- Firebase & State Imports ---
import { auth } from './firebaseConfig';
import { onAuthStateChanged } from "firebase/auth";
import useUserStore from './store/userStore';

const SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
const MAX_LOG_MESSAGES = 20;

function App() {
  // === State Hookları ===
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('Sunucuya bağlanılıyor...');
  const [playerName, setPlayerName] = useState('');
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
  const zustandIsLoading = useUserStore((state) => state.isLoading);
  const zustandSetUser = useUserStore((state) => state.setUser);
  const questionTimerIntervalRef = useRef(null);

  // --- DEBUG: Mount/Unmount Log ---
  useEffect(() => {
    console.log('%c[DEBUG] App component MOUNTED', 'color: green; font-weight: bold;');
    return () => {
      console.log('%c[DEBUG] App component UNMOUNTING!', 'color: red; font-weight: bold;');
    };
  }, []);
  // --------------------------------

  // === Tema Modu ===
  useEffect(() => { const currentHour = new Date().getHours(); const calculatedMode = (currentHour >= 18 || currentHour < 6) ? 'dark' : 'light'; setMode(calculatedMode); }, []);
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  // === PWA Yükleme İstemi Dinleyicisi ===
  useEffect(() => { const handleBeforeInstallPrompt = (event) => { event.preventDefault(); setInstallPromptEvent(event); if (!window.matchMedia('(display-mode: standalone)').matches) { setShowInstallButton(true); } }; window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt); return () => { window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt); }; }, []);

  // === Firebase Auth Durum Dinleyicisi ===
  useEffect(() => {
    console.log("Firebase Auth dinleyicisi kuruluyor...");
    useUserStore.setState({ isLoading: true });
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log("onAuthStateChanged tetiklendi. Firebase User:", firebaseUser);
      zustandSetUser(firebaseUser);
    });
    return () => { console.log("Firebase Auth dinleyicisi kaldırılıyor."); unsubscribe(); }
  }, [zustandSetUser]);

  // === Socket Bağlantısı ve Olayları ===
  useEffect(() => {
    if (!SERVER_URL) { console.error("HATA: VITE_BACKEND_URL tanımlanmamış!"); return; }
    console.log(`%c[DEBUG] Socket useEffect çalışıyor. Sunucu: ${SERVER_URL}`, 'color: purple;');
    const newSocket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    setSocket(newSocket);

    const handleConnect = () => { setIsConnected(true); setConnectionMessage('Sunucuya Bağlandı.'); console.log("Socket ID:", newSocket.id);};
    const handleConnectError = (err) => { setIsConnected(false); setConnectionMessage(`Bağlantı hatası: ${err.message}`); console.error("Bağlantı hatası detayı:", err);};
    const handleDisconnect = (reason) => { setIsConnected(false); setConnectionMessage('Bağlantı kesildi.'); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setIsPlayerReady(false); setAnnouncerLog([]); console.log("Disconnect sebebi:", reason); };
    const handleErrorMessage = (data) => { alert(`Sunucu Hatası: ${data.message}`); };
    const handleResetGame = (data) => { setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setWaitingMessage(data.message || 'Yeni oyun bekleniyor.'); setLastAnswerResult(null); setIsPlayerReady(false); setAnnouncerLog( prev => [{id: crypto.randomUUID(), text: data.message || 'Yeni oyun bekleniyor.', type:'info', timestamp: Date.now()}, ...prev].slice(0, MAX_LOG_MESSAGES) ); };
    const handleInitialState = (data) => { setGameState(data.gameState); setPlayers(data.players || []); const myPlayer = data.players.find(p => p.id === newSocket.id); setIsPlayerReady(myPlayer?.isReady || false); setAnnouncerLog([]); };
    const handleStateUpdate = (data) => { setGameState(data.gameState); setPlayers(data.players || []); if (data.currentQuestionIndex === -1) setCurrentQuestion(null); if (data.gameState === GAME_STATES.WAITING_TOURNAMENT) { setWaitingMessage(''); const myPlayer = data.players.find(p => p.id === newSocket.id); setIsPlayerReady(myPlayer?.isReady || false); } if (data.gameState === GAME_STATES.TOURNAMENT_RUNNING) setIsPlayerReady(false); if (data.gameState !== GAME_STATES.TOURNAMENT_RUNNING) if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
    const handleNewQuestion = (questionData) => { setCurrentQuestion({ ...questionData, answered: false, timedOut: false }); setGameResults(null); setLastAnswerResult(null); setGameState(GAME_STATES.TOURNAMENT_RUNNING); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); let timeLeft = questionData.timeLimit; setTimeRemaining(timeLeft); questionTimerIntervalRef.current = setInterval(() => { setTimeRemaining(prevTime => { if (prevTime <= 1) { clearInterval(questionTimerIntervalRef.current); return 0; } return prevTime - 1; }); }, 1000); };
    const handleQuestionTimeout = (data) => { if (currentQuestion && data.questionIndex === currentQuestion.index) { setCurrentQuestion(prev => ({...prev, timedOut: true})); const currentPlayerScore = players.find(p => p.id === newSocket?.id)?.score || 0; setLastAnswerResult({ timeout: true, questionIndex: data.questionIndex, correct: false, score: currentPlayerScore }); } if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
    const handleAnswerResult = (data) => { if (currentQuestion && data.questionIndex === currentQuestion.index) setLastAnswerResult(data); };
    const handleGameOver = (data) => { setGameState(GAME_STATES.GAME_OVER); setCurrentQuestion(null); setGameResults(data.results); setLastAnswerResult(null); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
    const handleWaitingUpdate = (data) => { if (gameState === GAME_STATES.WAITING_TOURNAMENT) setWaitingMessage(data.message); };
    const handleAnnouncerMessage = (newMessage) => { setAnnouncerLog(prevLog => [{...newMessage, id: newMessage.id || crypto.randomUUID() }, ...prevLog].slice(0, MAX_LOG_MESSAGES)); };

    newSocket.on("connect", handleConnect);
    newSocket.on("connect_error", handleConnectError);
    newSocket.on("disconnect", handleDisconnect);
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

    // Cleanup function
    return () => {
      console.log(`%c[DEBUG] Socket Cleanup Triggered! State: ${gameState}, Connected: ${isConnected}`, "color: orange; font-weight: bold;");
      newSocket.off('connect', handleConnect);
      newSocket.off('connect_error', handleConnectError);
      newSocket.off('disconnect', handleDisconnect);
      newSocket.off('error_message', handleErrorMessage);
      newSocket.off('reset_game', handleResetGame);
      newSocket.off('initial_state', handleInitialState);
      newSocket.off('tournament_state_update', handleStateUpdate);
      newSocket.off('new_question', handleNewQuestion);
      newSocket.off('question_timeout', handleQuestionTimeout);
      newSocket.off('answer_result', handleAnswerResult);
      newSocket.off('game_over', handleGameOver);
      newSocket.off('waiting_update', handleWaitingUpdate);
      newSocket.off('announcer_message', handleAnnouncerMessage);
      if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);
      newSocket.disconnect();
      // State'leri burada sıfırlamak döngüye neden olabilir, disconnect olayında zaten yapılıyor.
      // setIsConnected(false);
      // setSocket(null);
    };
  }, [SERVER_URL]); // Sadece SERVER_URL değiştiğinde yeniden bağlanmalı

  // === Kullanıcı Eylemleri ===
  const handleJoinTournament = useCallback(() => { if (socket && isConnected && playerName.trim()) { socket.emit('join_tournament', { name: playerName.trim() }); setWaitingMessage('Sunucuya katılım isteği gönderildi...'); setIsPlayerReady(false); } else if (!playerName.trim()){ alert('Lütfen katılmak için bir isim girin.'); } else { setConnectionMessage('Önce sunucuya bağlanmalısınız.'); } }, [socket, isConnected, playerName]);
  const handleAnswerSubmit = useCallback((answer) => { if (socket && gameState === GAME_STATES.TOURNAMENT_RUNNING && currentQuestion && !currentQuestion.answered && !currentQuestion.timedOut) { socket.emit('submit_answer', { questionIndex: currentQuestion.index, answer: answer }); setCurrentQuestion(prev => ({...prev, answered: true})); } }, [socket, gameState, currentQuestion]);
  const handlePlayerReady = useCallback(() => { if (socket && isConnected && gameState === GAME_STATES.WAITING_TOURNAMENT && !isPlayerReady) { socket.emit('player_ready'); setIsPlayerReady(true); setWaitingMessage('Hazır olduğunuz belirtildi. Diğerleri bekleniyor...'); } }, [socket, isConnected, gameState, isPlayerReady]);
  const handleInstallClick = useCallback(async () => { if (!installPromptEvent) return; installPromptEvent.prompt(); const { outcome } = await installPromptEvent.userChoice; console.log(`PWA Yükleme sonucu: ${outcome}`); setInstallPromptEvent(null); setShowInstallButton(false); }, [installPromptEvent]);

  // === Render Edilecek Component'i Belirleme ===
  const renderCurrentScreen = () => {
       // --- DEBUG: Render edilen ekranı logla ---
       console.log(`%c[DEBUG] Rendering screen for gameState: ${gameState}`, 'color: green;');
       // -------------------------------------
       if (!isConnected && connectionMessage.includes('Bağlantı hatası')) { return <Typography color="error" align="center" sx={{ mt: 2}}>{connectionMessage}</Typography>; }
       if (zustandIsLoading || (!isConnected && !connectionMessage.includes('Bağlantı hatası'))) { // Auth veya socket bekleniyorsa
            return <Box sx={{ display: 'flex', justifyContent: 'center', padding: 5 }}><CircularProgress /><Typography sx={{ml: 2}}>Yükleniyor...</Typography></Box>;
       }
       if (gameState === GAME_STATES.IDLE || (gameState === GAME_STATES.WAITING_TOURNAMENT && !players.find(p=>p.id === socket?.id))) { return <JoinScreen playerName={playerName} setPlayerName={setPlayerName} handleJoinTournament={handleJoinTournament} isConnected={isConnected} waitingMessage={waitingMessage}/>; }
       if (gameState === GAME_STATES.WAITING_TOURNAMENT) { return <WaitingLobby players={players} handlePlayerReady={handlePlayerReady} isPlayerReady={isPlayerReady} waitingMessage={waitingMessage} currentSocketId={socket?.id}/>; }
       if (gameState === GAME_STATES.TOURNAMENT_RUNNING) { return <GameInterface currentQuestion={currentQuestion} timeRemaining={timeRemaining} handleAnswerSubmit={handleAnswerSubmit} lastAnswerResult={lastAnswerResult}/>; }
       if (gameState === GAME_STATES.GAME_OVER) { return <ResultsScreen gameResults={gameResults} waitingMessage={waitingMessage} currentSocketId={socket?.id}/>; }
       return <Box sx={{ display: 'flex', justifyContent: 'center', padding: 5 }}><CircularProgress /></Box>; // Fallback
  };

  // === Ana Render ===
  const showSidebars = (gameState === GAME_STATES.WAITING_TOURNAMENT || gameState === GAME_STATES.TOURNAMENT_RUNNING || gameState === GAME_STATES.GAME_OVER) && players.length > 0 && isConnected;

  console.log(`%c[DEBUG] App Render. State: ${gameState}, Connected: ${isConnected}, Players: ${players.length}`, 'color: blue;'); // Render logu

  return (
    <ThemeProvider theme={theme}>
       <CssBaseline />
       <Container maxWidth="xl" sx={{ marginTop: 2, paddingBottom: 4 }}>
           <Box sx={{ textAlign: 'center', marginBottom: 1 }}>
               <Typography variant="h1" component="h1" gutterBottom> Asrın Oyunu </Typography>
               <Typography variant="subtitle1" color="text.secondary"> Bağlantı: {connectionMessage} {isConnected ? `(ID: ${socket?.id})` : ''} </Typography>
               {showInstallButton && installPromptEvent && ( <Button variant="outlined" onClick={handleInstallClick} startIcon={<InstallMobileIcon />} size="small" sx={{ mt: 1 }}> Uygulamayı Yükle </Button> )}
           </Box>
           <hr />
           <Grid container spacing={2} sx={{ marginTop: 2 }} alignItems="flex-start">
               {showSidebars && ( <Grid xs={12} md={3} order={{ xs: 2, md: 1 }}> <Box sx={{ position: 'sticky', top: '20px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}> <Paper variant="outlined" sx={{ p: 1, height: '100%' }}> <PlayerList players={players} gameState={gameState} currentSocketId={socket?.id} /> </Paper> </Box> </Grid> )}
                <Grid xs={12} md={ showSidebars ? 6 : 12 } order={{ xs: 1, md: 2 }} >
                   <Box>
                       <Routes>
                           <Route path="/" element={
                               <AnimatePresence mode="wait">
                                   <motion.div
                                       key={gameState} // Key olarak gameState
                                       initial={{ opacity: 0 }}
                                       animate={{ opacity: 1 }}
                                       exit={{ opacity: 0 }}
                                       transition={{ duration: 0.3 }}
                                   >
                                       {renderCurrentScreen()}
                                   </motion.div>
                               </AnimatePresence>
                           } />
                           {/* Diğer Route'lar buraya */}
                       </Routes>
                   </Box>
                </Grid>
               {showSidebars && ( <Grid xs={12} md={3} order={{ xs: 3, md: 3 }}> <Box sx={{ position: 'sticky', top: '20px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}> <Paper variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}> <AnnouncerLog announcerLog={announcerLog} /> </Paper> </Box> </Grid> )}
           </Grid>
        </Container>
    </ThemeProvider>
  );
}

export default App;
