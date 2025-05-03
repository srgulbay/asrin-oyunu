import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route } from "react-router-dom";
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
import JoinScreen from './components/JoinScreen';
import WaitingLobby from './components/WaitingLobby';
import GameInterface from './components/GameInterface';
import ResultsScreen from './components/ResultsScreen';
import PlayerList from './components/PlayerList';
import AnnouncerLog from './components/AnnouncerLog';
import createAppTheme from './theme';
import { auth } from './firebaseConfig';
import { onAuthStateChanged } from "firebase/auth";
import useUserStore from './store/userStore';
import { motion, AnimatePresence } from 'framer-motion';

const SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
const MAX_LOG_MESSAGES = 20;

function App() {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('Sunucuya bağlanılıyor...');
  const [playerName, setPlayerName] = useState('');
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  const [players, setPlayers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [gameResults, setGameResults] = useState(null);
  const [waitingMessage, setWaitingMessage] = useState('');
  // --- lastAnswerResult GÜNCELLENDİ ---
  // {correct, score, pointsAwarded, combo, comboBroken, questionIndex, timeout?, submittedAnswer?}
  const [lastAnswerResult, setLastAnswerResult] = useState(null);
  // ---------------------------------
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [announcerLog, setAnnouncerLog] = useState([]);
  const [mode, setMode] = useState('light');
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const zustandIsLoading = useUserStore((state) => state.isLoading);
  const zustandSetUser = useUserStore((state) => state.setUser);
  const questionTimerIntervalRef = useRef(null);

  useEffect(() => { const currentHour = new Date().getHours(); const calculatedMode = (currentHour >= 18 || currentHour < 6) ? 'dark' : 'light'; setMode(calculatedMode); }, []);
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  useEffect(() => { const handleBeforeInstallPrompt = (event) => { event.preventDefault(); setInstallPromptEvent(event); if (!window.matchMedia('(display-mode: standalone)').matches) { setShowInstallButton(true); } }; window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt); return () => { window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt); }; }, []);
  useEffect(() => { const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => { zustandSetUser(firebaseUser); }); return () => { unsubscribe(); } }, [zustandSetUser]);

  useEffect(() => {
      if (!SERVER_URL) { console.error("HATA: VITE_BACKEND_URL tanımlanmamış!"); return; }
      const newSocket = io(SERVER_URL, { transports: ['websocket', 'polling'] }); setSocket(newSocket);
      const handleConnect = () => { setIsConnected(true); setConnectionMessage('Sunucuya Bağlandı.'); console.log("Socket ID:", newSocket.id);}; const handleConnectError = (err) => { setIsConnected(false); setConnectionMessage(`Bağlantı hatası: ${err.message}`); console.error("Bağlantı hatası detayı:", err);}; const handleDisconnect = (reason) => { setIsConnected(false); setConnectionMessage('Bağlantı kesildi.'); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setIsPlayerReady(false); setAnnouncerLog([]); console.log("Disconnect sebebi:", reason); }; const handleErrorMessage = (data) => { alert(`Sunucu Hatası: ${data.message}`); }; const handleResetGame = (data) => { setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setWaitingMessage(data.message || 'Yeni oyun bekleniyor.'); setLastAnswerResult(null); setIsPlayerReady(false); setAnnouncerLog( prev => [{id: crypto.randomUUID(), text: data.message || 'Yeni oyun bekleniyor.', type:'info', timestamp: Date.now()}, ...prev].slice(0, MAX_LOG_MESSAGES) ); }; const handleInitialState = (data) => { setGameState(data.gameState); setPlayers(data.players || []); const myPlayer = data.players.find(p => p.id === newSocket.id); setIsPlayerReady(myPlayer?.isReady || false); setAnnouncerLog([]); }; const handleStateUpdate = (data) => { setGameState(data.gameState); setPlayers(data.players || []); if (data.currentQuestionIndex === -1) { setCurrentQuestion(null); /* Soru yoksa cevap sonucunu da temizle */ setLastAnswerResult(null); } if (data.gameState === GAME_STATES.WAITING_TOURNAMENT) { setWaitingMessage(''); const myPlayer = data.players.find(p => p.id === newSocket.id); setIsPlayerReady(myPlayer?.isReady || false); } if (data.gameState === GAME_STATES.TOURNAMENT_RUNNING) setIsPlayerReady(false); if (data.gameState !== GAME_STATES.TOURNAMENT_RUNNING) if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
      const handleNewQuestion = (questionData) => { setCurrentQuestion({ ...questionData, answered: false, timedOut: false }); setGameResults(null); setLastAnswerResult(null); /* Yeni soruda eski cevabı temizle */ setGameState(GAME_STATES.TOURNAMENT_RUNNING); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); let timeLeft = questionData.timeLimit; setTimeRemaining(timeLeft); questionTimerIntervalRef.current = setInterval(() => { setTimeRemaining(prevTime => { if (prevTime <= 1) { clearInterval(questionTimerIntervalRef.current); return 0; } return prevTime - 1; }); }, 1000); };
      const handleQuestionTimeout = (data) => { if (currentQuestion && data.questionIndex === currentQuestion.index) { setCurrentQuestion(prev => ({...prev, timedOut: true})); const currentPlayerScore = players.find(p => p.id === newSocket?.id)?.score || 0; setLastAnswerResult({ timeout: true, questionIndex: data.questionIndex, correct: false, score: currentPlayerScore }); } if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); };
      // --- handleAnswerResult GÜNCELLENDİ ---
      const handleAnswerResult = (data) => { if (currentQuestion && data.questionIndex === currentQuestion.index) setLastAnswerResult(data); /* Gelen tüm datayı sakla */};
      const handleGameOver = (data) => { setGameState(GAME_STATES.GAME_OVER); setCurrentQuestion(null); setGameResults(data.results); setLastAnswerResult(null); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); }; const handleWaitingUpdate = (data) => { if (gameState === GAME_STATES.WAITING_TOURNAMENT) setWaitingMessage(data.message); }; const handleAnnouncerMessage = (newMessage) => { setAnnouncerLog(prevLog => [{...newMessage, id: newMessage.id || crypto.randomUUID() }, ...prevLog].slice(0, MAX_LOG_MESSAGES)); };
      newSocket.on('connect', handleConnect); newSocket.on('connect_error', handleConnectError); newSocket.on('disconnect', handleDisconnect); newSocket.on('error_message', handleErrorMessage); newSocket.on('reset_game', handleResetGame); newSocket.on('initial_state', handleInitialState); newSocket.on('tournament_state_update', handleStateUpdate); newSocket.on('new_question', handleNewQuestion); newSocket.on('question_timeout', handleQuestionTimeout); newSocket.on('answer_result', handleAnswerResult); newSocket.on('game_over', handleGameOver); newSocket.on('waiting_update', handleWaitingUpdate); newSocket.on('announcer_message', handleAnnouncerMessage);
      return () => { newSocket.off('connect'); newSocket.off('connect_error'); newSocket.off('disconnect'); newSocket.off('error_message'); newSocket.off('reset_game'); newSocket.off('initial_state'); newSocket.off('tournament_state_update'); newSocket.off('new_question'); newSocket.off('question_timeout'); newSocket.off('answer_result'); newSocket.off('game_over'); newSocket.off('waiting_update'); newSocket.off('announcer_message'); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); newSocket.disconnect(); };
  }, [SERVER_URL]); // Sadece URL değişince yeniden kurulsun

  const handleJoinTournament = useCallback(() => { if (socket && isConnected && playerName.trim()) { socket.emit('join_tournament', { name: playerName.trim() }); setWaitingMessage('Sunucuya katılım isteği gönderildi...'); setIsPlayerReady(false); } else if (!playerName.trim()){ alert('Lütfen katılmak için bir isim girin.'); } else { setConnectionMessage('Önce sunucuya bağlanmalısınız.'); } }, [socket, isConnected, playerName]);
  const handleAnswerSubmit = useCallback((answer) => { if (socket && gameState === GAME_STATES.TOURNAMENT_RUNNING && currentQuestion && !currentQuestion.answered && !currentQuestion.timedOut) { socket.emit('submit_answer', { questionIndex: currentQuestion.index, answer: answer }); setCurrentQuestion(prev => ({...prev, answered: true})); } }, [socket, gameState, currentQuestion]);
  const handlePlayerReady = useCallback(() => { if (socket && isConnected && gameState === GAME_STATES.WAITING_TOURNAMENT && !isPlayerReady) { socket.emit('player_ready'); setIsPlayerReady(true); setWaitingMessage('Hazır olduğunuz belirtildi. Diğerleri bekleniyor...'); } }, [socket, isConnected, gameState, isPlayerReady]);
  const handleInstallClick = useCallback(async () => { if (!installPromptEvent) return; installPromptEvent.prompt(); const { outcome } = await installPromptEvent.userChoice; console.log(`PWA Yükleme sonucu: ${outcome}`); setInstallPromptEvent(null); setShowInstallButton(false); }, [installPromptEvent]);

  const renderCurrentScreen = () => {
       if (zustandIsLoading) { return <Box sx={{ display: 'flex', justifyContent: 'center', padding: 5 }}><CircularProgress /><Typography sx={{ml: 2}}>Kimlik durumu kontrol ediliyor...</Typography></Box>; }
       if (!isConnected) { return <Box sx={{ display: 'flex', justifyContent: 'center', padding: 5 }}><CircularProgress /><Typography sx={{ml: 2}}>{connectionMessage}</Typography></Box>;} // Bağlantı bekleniyor
       if (gameState === GAME_STATES.IDLE || (gameState === GAME_STATES.WAITING_TOURNAMENT && !players.find(p=>p.id === socket?.id))) { return <JoinScreen playerName={playerName} setPlayerName={setPlayerName} handleJoinTournament={handleJoinTournament} isConnected={isConnected} waitingMessage={waitingMessage}/>; }
       if (gameState === GAME_STATES.WAITING_TOURNAMENT) { return <WaitingLobby players={players} handlePlayerReady={handlePlayerReady} isPlayerReady={isPlayerReady} waitingMessage={waitingMessage} currentSocketId={socket?.id}/>; }
       if (gameState === GAME_STATES.TOURNAMENT_RUNNING) { return <GameInterface currentQuestion={currentQuestion} timeRemaining={timeRemaining} handleAnswerSubmit={handleAnswerSubmit} lastAnswerResult={lastAnswerResult}/>; }
       if (gameState === GAME_STATES.GAME_OVER) { return <ResultsScreen gameResults={gameResults} waitingMessage={waitingMessage} currentSocketId={socket?.id}/>; }
       return <Box sx={{ display: 'flex', justifyContent: 'center', padding: 5 }}><CircularProgress /></Box>;
  };

  const showSidebars = (gameState === GAME_STATES.WAITING_TOURNAMENT || gameState === GAME_STATES.TOURNAMENT_RUNNING || gameState === GAME_STATES.GAME_OVER) && players.length > 0 && isConnected;

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
                           <Route path="/" element={ <AnimatePresence mode="wait"> <motion.div key={gameState} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} > {renderCurrentScreen()} </motion.div> </AnimatePresence> } />
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