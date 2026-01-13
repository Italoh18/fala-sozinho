import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { AppState, Scenario, FeedbackResult } from './types';
import { SCENARIOS } from './constants';
import { ScenarioCard } from './components/ScenarioCard';
import { Visualizer } from './components/Visualizer';
import { useGeminiLive } from './hooks/useGeminiLive';

const App: React.FC = () => {
  const [currentState, setCurrentState] = useState<AppState>(AppState.LANDING);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [feedbackResult, setFeedbackResult] = useState<FeedbackResult | null>(null);

  const { connect, disconnect, getTranscript, isConnected, isTalking, volume } = useGeminiLive({
    systemInstruction: selectedScenario?.systemInstruction || '',
    onDisconnect: () => {
       // Handled in End Session manually to ensure feedback generation
    }
  });

  // Timer for session
  useEffect(() => {
    let interval: number;
    if (currentState === AppState.SESSION && isConnected) {
      interval = window.setInterval(() => {
        setSessionDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [currentState, isConnected]);

  const handleStartSession = async (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setCurrentState(AppState.SESSION);
    setSessionDuration(0);
    setFeedbackResult(null);
  };

  const handleEndSession = async () => {
    const transcript = getTranscript();
    disconnect();
    setCurrentState(AppState.ANALYZING);

    try {
      if (transcript.length === 0) {
        setFeedbackResult({
          clarity: 'Pouco Clara',
          suggestion: 'Nenhuma fala detectada. Verifique seu microfone ou tente falar mais alto.'
        });
        setCurrentState(AppState.FEEDBACK);
        return;
      }

      // Generate Feedback using Gemini Flash
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `
        Analise a seguinte transcrição de um treino de habilidades sociais.
        O usuário estava treinando: ${selectedScenario?.title}.
        
        TRANSCRIÇÃO:
        ${JSON.stringify(transcript)}

        TAREFA:
        Avalie a clareza da fala do usuário e dê uma sugestão breve.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              clarity: {
                type: Type.STRING,
                enum: ['Clara', 'Pouco Clara', 'Muito Clara']
              },
              suggestion: {
                type: Type.STRING
              }
            },
            required: ['clarity', 'suggestion']
          }
        }
      });

      const result = response.text ? JSON.parse(response.text) : null;
      
      setFeedbackResult(result || {
        clarity: 'Pouco Clara',
        suggestion: 'Não foi possível gerar análise detalhada. Tente novamente.'
      });

    } catch (e) {
      console.error("Feedback generation error:", e);
      setFeedbackResult({
        clarity: 'Pouco Clara',
        suggestion: 'Erro ao analisar áudio. Tente falar mais devagar.'
      });
    }

    setCurrentState(AppState.FEEDBACK);
  };

  const handleReset = () => {
    disconnect();
    setSelectedScenario(null);
    setCurrentState(AppState.LANDING);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- Views ---

  const renderLanding = () => (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <header className="text-center mb-16">
        <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 mb-6 tracking-tight">
          Fala Sozinho
        </h1>
        <p className="text-xl md:text-2xl text-slate-400 max-w-2xl mx-auto font-light">
          Treine habilidades sociais com <span className="text-white font-medium">Desconforto Controlado</span>.
          Fale em voz alta e enfrente interrupções e silêncios realistas.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {SCENARIOS.map((scenario) => (
          <ScenarioCard 
            key={scenario.id} 
            scenario={scenario} 
            onSelect={handleStartSession} 
          />
        ))}
      </div>
      
      <footer className="mt-20 text-center text-slate-600 text-sm">
        <p>Requer microfone e API Key configurada. Sem armazenamento de dados.</p>
      </footer>
    </div>
  );

  const renderSession = () => {
    if (!selectedScenario) return null;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 relative overflow-hidden">
        {/* Background ambience */}
        <div className={`absolute inset-0 transition-colors duration-1000 ${isTalking ? 'bg-red-900/10' : 'bg-transparent'}`} />

        <div className="z-10 w-full max-w-md text-center">
          <div className="mb-8">
            <span className="text-6xl mb-4 block">{selectedScenario.icon}</span>
            <h2 className="text-2xl font-bold text-white mb-1">{selectedScenario.title}</h2>
            <p className="text-slate-400 text-sm">{formatTime(sessionDuration)}</p>
          </div>

          <div className="relative mb-12 h-80 flex items-center justify-center">
            {isConnected ? (
              <>
                 <Visualizer 
                   isActive={true} 
                   volume={isTalking ? 0.8 : volume} 
                   color={isTalking ? '#f87171' : '#22d3ee'} 
                 />
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className={`text-lg font-mono font-bold tracking-widest transition-colors ${isTalking ? 'text-red-400 animate-pulse' : 'text-cyan-400'}`}>
                      {isTalking ? 'INTERROMPENDO...' : 'ESCUTANDO...'}
                    </p>
                 </div>
              </>
            ) : (
              <button 
                onClick={connect}
                className="w-48 h-48 rounded-full border-4 border-indigo-500 flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 transition-all shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)] active:scale-95"
              >
                <span className="text-xl font-bold">INICIAR</span>
              </button>
            )}
          </div>

          <div className="space-y-4">
             {isConnected && (
               <div className="bg-slate-800/80 p-4 rounded-lg border border-slate-700 text-sm text-slate-300">
                  <p>As interrupções são normais. Continue falando.</p>
               </div>
             )}

            <button
              onClick={handleEndSession}
              className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors border border-slate-600 w-full"
            >
              {isConnected ? 'Encerrar e Avaliar' : 'Voltar'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAnalyzing = () => (
    <div className="flex flex-col items-center justify-center min-h-screen">
       <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
       <h2 className="text-2xl font-bold text-white">Analisando Clareza...</h2>
    </div>
  );

  const renderFeedback = () => (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="mb-8">
        <div className="inline-block p-4 rounded-full bg-green-500/10 mb-4">
          <span className="text-4xl">🏁</span>
        </div>
        <h2 className="text-3xl font-bold text-white mb-4">Sessão Finalizada</h2>
        <p className="text-slate-300">
          Duração: <strong className="text-white">{formatTime(sessionDuration)}</strong>
        </p>
      </div>

      <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 mb-8 text-left shadow-xl">
        <h3 className="text-xl font-bold text-white mb-6 border-b border-slate-700 pb-4">Análise da Fala</h3>
        
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Clareza</p>
          <div className="flex items-center gap-3">
             <span className={`text-2xl font-bold ${
               feedbackResult?.clarity === 'Muito Clara' ? 'text-green-400' : 
               feedbackResult?.clarity === 'Clara' ? 'text-blue-400' : 'text-yellow-400'
             }`}>
               {feedbackResult?.clarity}
             </span>
             {feedbackResult?.clarity === 'Muito Clara' && <span>🌟</span>}
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Sugestão</p>
          <p className="text-lg text-slate-200 leading-relaxed">
            {feedbackResult?.suggestion}
          </p>
        </div>
      </div>

      <button
        onClick={handleReset}
        className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-1 w-full md:w-auto"
      >
        Treinar Novamente
      </button>
    </div>
  );

  return (
    <div className="min-h-screen text-slate-200 selection:bg-indigo-500/30">
      {currentState === AppState.LANDING && renderLanding()}
      {currentState === AppState.SESSION && renderSession()}
      {currentState === AppState.ANALYZING && renderAnalyzing()}
      {currentState === AppState.FEEDBACK && renderFeedback()}
    </div>
  );
};

export default App;
