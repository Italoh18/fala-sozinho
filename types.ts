export interface Scenario {
  id: string;
  title: string;
  description: string;
  systemInstruction: string;
  difficulty: 'low' | 'medium' | 'high';
  icon: string;
}

export enum AppState {
  LANDING = 'LANDING',
  CONFIGURING = 'CONFIGURING',
  SESSION = 'SESSION',
  ANALYZING = 'ANALYZING',
  FEEDBACK = 'FEEDBACK',
  HISTORY = 'HISTORY',
}

export interface AudioVisualizerProps {
  isPlaying: boolean;
  volume: number; // 0 to 1
}

export interface FeedbackResult {
  clarity: 'Clara' | 'Pouco Clara' | 'Muito Clara';
  suggestion: string;
  score: number; // 1 to 10
}

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface GenericText {
  id: string;
  title: string;
  content: string;
}

export interface SessionHistoryItem {
  id: string;
  date: string; // ISO String
  scenarioTitle: string;
  durationSeconds: number;
  feedback: FeedbackResult;
}
