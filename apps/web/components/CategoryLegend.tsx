'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const categories = [
  { name: 'DEX', color: 'text-blue-400', bgColor: 'bg-blue-500/20', description: 'Decentralized Exchanges' },
  { name: 'AMM', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', description: 'Automated Market Makers' },
  { name: 'System', color: 'text-slate-400', bgColor: 'bg-slate-500/20', description: 'Core Solana Programs' },
  { name: 'Launchpad', color: 'text-orange-400', bgColor: 'bg-orange-500/20', description: 'Token Launch Platforms' },
  { name: 'Staking', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', description: 'Liquid Staking' },
  { name: 'Perp', color: 'text-red-400', bgColor: 'bg-red-500/20', description: 'Perpetual Futures' },
  { name: 'Gaming', color: 'text-pink-400', bgColor: 'bg-pink-500/20', description: 'Gaming & NFTs' },
  { name: 'Infra', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20', description: 'Infrastructure' },
];

interface CategoryLegendProps {
  isDropdown?: boolean;
}

export default function CategoryLegend({ isDropdown = false }: CategoryLegendProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (isDropdown) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-card border border-border rounded-lg px-4 py-3 text-left flex items-center justify-between hover:bg-muted/50 transition-colors"
        >
          <span className="font-medium">Program Categories</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        
        {isOpen && (
          <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-lg p-4 shadow-xl z-50">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {categories.map((category) => (
                <div key={category.name} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${category.bgColor} border border-opacity-50`}></div>
                  <div className="flex flex-col">
                    <span className={category.color}>{category.name}</span>
                    <span className="text-muted-foreground text-xs">{category.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card p-4 rounded-lg border border-border">
      <h3 className="text-sm font-semibold mb-3 text-foreground">Program Categories</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {categories.map((category) => (
          <div key={category.name} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${category.bgColor} border border-opacity-50`}></div>
            <span className={category.color}>{category.name}</span>
            <span className="text-muted-foreground text-xs">({category.description})</span>
          </div>
        ))}
      </div>
    </div>
  );
}