import React from 'react';
import { Scenario } from '../types';

interface ScenarioCardProps {
  scenario: Scenario;
  onSelect: (scenario: Scenario) => void;
}

export const ScenarioCard: React.FC<ScenarioCardProps> = ({ scenario, onSelect }) => {
  const difficultyColor = {
    low: 'text-green-400 border-green-400/30 bg-green-900/10',
    medium: 'text-yellow-400 border-yellow-400/30 bg-yellow-900/10',
    high: 'text-red-400 border-red-400/30 bg-red-900/10',
  };

  return (
    <div 
      onClick={() => onSelect(scenario)}
      className="group relative flex flex-col p-6 rounded-2xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-indigo-500/50 transition-all cursor-pointer shadow-lg hover:shadow-indigo-500/10 active:scale-95"
    >
      <div className="flex justify-between items-start mb-4">
        <span className="text-4xl">{scenario.icon}</span>
        <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${difficultyColor[scenario.difficulty]}`}>
          {scenario.difficulty} Pressure
        </span>
      </div>
      <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">
        {scenario.title}
      </h3>
      <p className="text-slate-400 text-sm leading-relaxed">
        {scenario.description}
      </p>
      <div className="mt-4 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400 text-sm font-semibold flex items-center gap-2">
        Iniciar Simulação <span>→</span>
      </div>
    </div>
  );
};
