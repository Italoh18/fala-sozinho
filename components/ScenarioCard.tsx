import React from 'react';
import { Scenario } from '../types';

interface ScenarioCardProps {
  scenario: Scenario;
  onSelect: (scenario: Scenario) => void;
}

export const ScenarioCard: React.FC<ScenarioCardProps> = ({ scenario, onSelect }) => {
  const difficultyColor = {
    low: 'text-green-400 border-green-400/30 bg-green-500/10',
    medium: 'text-yellow-400 border-yellow-400/30 bg-yellow-500/10',
    high: 'text-red-400 border-red-400/30 bg-red-500/10',
  };

  return (
    <button 
      onClick={() => onSelect(scenario)}
      className="group relative w-full text-left flex flex-col p-6 rounded-2xl border border-slate-700 bg-slate-800/40 hover:bg-slate-800 transition-all duration-300 hover:scale-[1.02] hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10 active:scale-95 outline-none focus:ring-2 focus:ring-indigo-500/50"
    >
      <div className="flex justify-between items-start mb-4 w-full">
        <span className="text-4xl filter drop-shadow-md group-hover:scale-110 transition-transform duration-300">{scenario.icon}</span>
        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${difficultyColor[scenario.difficulty]}`}>
          {scenario.difficulty === 'high' ? 'High Pressure' : scenario.difficulty === 'medium' ? 'Medium Pressure' : 'Low Pressure'}
        </span>
      </div>
      <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">
        {scenario.title}
      </h3>
      <p className="text-slate-400 text-sm leading-relaxed mb-4 line-clamp-3">
        {scenario.description}
      </p>
      <div className="mt-auto pt-4 border-t border-slate-700/50 w-full flex justify-between items-center opacity-70 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-slate-500 font-medium group-hover:text-indigo-400 transition-colors">Clique para iniciar</span>
        <span className="text-indigo-400 transform translate-x-0 group-hover:translate-x-1 transition-transform">→</span>
      </div>
    </button>
  );
};