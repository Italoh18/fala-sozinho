import React from 'react';
import { Scenario } from '../types';

interface ScenarioCardProps {
  scenario: Scenario;
  onSelect: (scenario: Scenario) => void;
}

export const ScenarioCard: React.FC<ScenarioCardProps> = ({ scenario, onSelect }) => {
  const difficultyConfig = {
    low: {
      label: 'Baixa Pressão',
      style: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    },
    medium: {
      label: 'Média Pressão',
      style: 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    },
    high: {
      label: 'Alta Pressão',
      style: 'text-rose-400 border-rose-500/30 bg-rose-500/10'
    },
  };

  const config = difficultyConfig[scenario.difficulty];

  return (
    <button 
      onClick={() => onSelect(scenario)}
      className="group relative w-full h-full text-left flex flex-col p-6 rounded-2xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/20 active:scale-95 outline-none focus:ring-2 focus:ring-indigo-500/50"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 to-purple-500/0 group-hover:from-indigo-500/10 group-hover:to-purple-500/5 rounded-2xl transition-all duration-500" />
      
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex justify-between items-start mb-5 w-full">
          <div className="w-14 h-14 flex items-center justify-center rounded-xl bg-slate-900/50 border border-slate-700 text-3xl group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-lg">
            {scenario.icon}
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border shadow-sm ${config.style}`}>
            {config.label}
          </span>
        </div>
        
        <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">
          {scenario.title}
        </h3>
        
        <p className="text-slate-400 text-sm leading-relaxed mb-6 line-clamp-3">
          {scenario.description}
        </p>
        
        <div className="mt-auto pt-4 border-t border-slate-700/50 w-full flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-500 group-hover:text-indigo-400 transition-colors uppercase tracking-wider">
            Começar Treino
          </span>
          <div className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center group-hover:bg-indigo-500 transition-colors duration-300">
             <span className="text-slate-300 group-hover:text-white transform group-hover:translate-x-0.5 transition-transform">→</span>
          </div>
        </div>
      </div>
    </button>
  );
};