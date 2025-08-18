'use client';

import { useState, useEffect } from 'react';
import { ProgramBadge } from './ProgramTag';
import { formatProgramDisplay } from '@/lib/programRegistry';

interface BlockDetails {
  slot: number;
  block_time: string;
  validator: string;
  total_invocations: number;
  unique_programs: number;
  unique_transactions: number;
}

interface ProgramStats {
  program_id: string;
  invocations: number;
  transactions: number;
}

interface BlockAnalysisData {
  block: BlockDetails;
  programs: ProgramStats[];
}

interface BlockAnalysisProps {
  initialSlot?: number;
}

export default function BlockAnalysis({ initialSlot }: BlockAnalysisProps) {
  const [searchSlot, setSearchSlot] = useState(initialSlot?.toString() || '');
  const [blockData, setBlockData] = useState<BlockAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBlockData = async (slot: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/blocks/${slot}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError('Block not found');
        } else {
          setError('Error fetching block data');
        }
        setBlockData(null);
        return;
      }
      const data = await response.json();
      setBlockData(data);
    } catch (error) {
      console.error('Error fetching block data:', error);
      setError('Network error');
      setBlockData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialSlot) {
      fetchBlockData(initialSlot);
    }
  }, [initialSlot]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const slot = parseInt(searchSlot);
    if (!isNaN(slot) && slot > 0) {
      fetchBlockData(slot);
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const blockTime = new Date(timestamp);
    const diffMs = now.getTime() - blockTime.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  };

  const formatValidator = (validator: string) => {
    if (validator === 'unknown') return 'Unknown Validator';
    return `${validator.slice(0, 12)}...${validator.slice(-12)}`;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Block Analysis</h2>
        
        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="number"
            value={searchSlot}
            onChange={(e) => setSearchSlot(e.target.value)}
            placeholder="Enter block slot number"
            className="flex-1 px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none font-mono"
            min="1"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Searching...' : 'Search Block'}
          </button>
        </form>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Analyzing block...</p>
        </div>
      )}

      {blockData && (
        <div className="space-y-6">
          {/* Block Overview */}
          <div className="bg-gray-700/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              🧱 Block #{blockData.block.slot.toLocaleString()}
              <span className="text-sm text-gray-400">
                {formatTimeAgo(blockData.block.block_time)}
              </span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-800 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-400">
                  {blockData.block.total_invocations.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Total Invocations</div>
              </div>
              
              <div className="bg-gray-800 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {blockData.block.unique_programs}
                </div>
                <div className="text-sm text-gray-400">Unique Programs</div>
              </div>
              
              <div className="bg-gray-800 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {blockData.block.unique_transactions.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Transactions</div>
              </div>
              
              <div className="bg-gray-800 p-4 rounded-lg">
                <div className="text-sm text-gray-400 mb-1">Validator</div>
                <div className="text-sm font-mono break-all">
                  {formatValidator(blockData.block.validator)}
                </div>
              </div>
            </div>
          </div>

          {/* Top Programs */}
          <div className="bg-gray-700/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">📊 Program Activity</h3>
            
            <div className="space-y-3">
              {blockData.programs.map((program, index) => {
                const { programInfo } = formatProgramDisplay(program.program_id);
                const percentage = ((program.invocations / blockData.block.total_invocations) * 100);
                
                return (
                  <div key={program.program_id} className="bg-gray-800 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-gray-400">#{index + 1}</span>
                        <ProgramBadge programId={program.program_id} />
                      </div>
                      
                      <div className="text-right">
                        <div className="text-lg font-semibold text-green-400">
                          {program.invocations.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-400">
                          {percentage.toFixed(1)}% of block
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm text-gray-400">
                      <span>{program.transactions.toLocaleString()} transactions</span>
                      <div className="flex-1 mx-4">
                        <div className="w-full bg-gray-600 rounded-full h-1">
                          <div 
                            className={`h-1 rounded-full ${programInfo.bgColor.replace('/30', '')}`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      <span>{(program.invocations / program.transactions).toFixed(1)} invoc/tx</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}