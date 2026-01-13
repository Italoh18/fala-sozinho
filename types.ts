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
  SESSION = 'SESSION',
  ANALYZING = 'ANALYZING',
  FEEDBACK = 'FEEDBACK',
}

export interface AudioVisualizerProps {
  isPlaying: boolean;
  volume: number; // 0 to 1
}

export interface FeedbackResult {
  clarity: 'Clara' | 'Pouco Clara' | 'Muito Clara';
  suggestion: string;
}

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
