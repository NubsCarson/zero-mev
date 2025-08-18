'use client';

import { useState, useEffect } from 'react';
import { formatProgramDisplay } from '@/lib/programRegistry';

interface Block {
  slot: number;
  block_time: string;
  validator: string;
  total_invocations: number;
  unique_programs: number;
}

interface LiveBlockStreamProps {
  onBlockClick?: (slot: number) => void;
}

export default function LiveBlockStream({ onBlockClick }: LiveBlockStreamProps) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isLive, setIsLive] = useState(true);

  const fetchLatestBlocks = async () => {
    try {
      const response = await fetch('/api/blocks/current');
      if (response.ok) {
        const data = await response.json();
        setBlocks(data);
      }
    } catch (error) {
      console.error('Error fetching latest blocks:', error);
    }
  };

  useEffect(() => {
    fetchLatestBlocks();
    
    if (isLive) {
      const interval = setInterval(fetchLatestBlocks, 2000); // Update every 2 seconds
      return () => clearInterval(interval);
    }
  }, [isLive]);

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const blockTime = new Date(timestamp);
    const diffMs = now.getTime() - blockTime.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    return `${Math.floor(diffSeconds / 3600)}h ago`;
  };

  const formatValidator = (validator: string) => {
    if (validator === 'unknown') return '❓ Unknown';
    return `🏗️ ${validator.slice(0, 8)}...${validator.slice(-8)}`;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
          <h2 className="text-xl font-semibold">
            {isLive ? 'Live Block Stream' : 'Block Stream (Paused)'}
          </h2>
        </div>
        <button
          onClick={() => setIsLive(!isLive)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            isLive 
              ? 'bg-red-600 hover:bg-red-700 text-white' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isLive ? 'Pause' : 'Resume'}
        </button>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {blocks.map((block, index) => (
          <div
            key={block.slot}
            className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 hover:bg-gray-700/50 ${
              index === 0 && isLive 
                ? 'border-green-500/50 bg-green-900/20' 
                : 'border-gray-600 bg-gray-700/30'
            }`}
            onClick={() => onBlockClick?.(block.slot)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-lg font-mono font-bold text-blue-400">
                  #{block.slot.toLocaleString()}
                </div>
                <div className="text-xs text-gray-400">
                  {formatTimeAgo(block.block_time)}
                </div>
                {index === 0 && isLive && (
                  <span className="px-2 py-1 bg-green-600 text-white text-xs rounded-full">
                    Latest
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <div className="text-green-400 font-semibold">
                    {block.total_invocations.toLocaleString()}
                  </div>
                  <div className="text-gray-500 text-xs">invocations</div>
                </div>
                
                <div className="text-center">
                  <div className="text-blue-400 font-semibold">
                    {block.unique_programs}
                  </div>
                  <div className="text-gray-500 text-xs">programs</div>
                </div>
              </div>
            </div>
            
            <div className="mt-2 text-xs text-gray-400">
              {formatValidator(block.validator)}
            </div>
          </div>
        ))}
      </div>
      
      {blocks.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          Loading blocks...
        </div>
      )}
    </div>
  );
}