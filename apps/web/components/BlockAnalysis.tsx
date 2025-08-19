'use client';

import { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
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
    <div className="bg-card rounded-lg p-6 border border-border">
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Block Analysis</h2>
        
        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="number"
            value={searchSlot}
            onChange={(e) => setSearchSlot(e.target.value)}
            placeholder="Enter block slot number"
            className="flex-1 px-4 py-3 bg-muted rounded-lg border border-border focus:border-ring focus:outline-none font-mono"
            min="1"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Searching...' : 'Search Block'}
          </button>
        </form>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/20 border border-destructive/50 rounded-lg text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Analyzing block...</p>
        </div>
      )}

      {blockData && (
        <div className="space-y-6">
          {/* Block Overview */}
          <div className="bg-muted/50 rounded-lg p-6 border border-border">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              Block #{blockData.block.slot.toLocaleString()}
              <span className="text-sm text-muted-foreground">
                {formatTimeAgo(blockData.block.block_time)}
              </span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-card p-4 rounded-lg text-center border border-border">
                <div className="text-2xl font-bold text-success">
                  {blockData.block.total_invocations.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Total Invocations</div>
              </div>
              
              <div className="bg-card p-4 rounded-lg text-center border border-border">
                <div className="text-2xl font-bold text-primary">
                  {blockData.block.unique_programs}
                </div>
                <div className="text-sm text-muted-foreground">Unique Programs</div>
              </div>
              
              <div className="bg-card p-4 rounded-lg text-center border border-border">
                <div className="text-2xl font-bold text-accent-foreground">
                  {blockData.block.unique_transactions.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Transactions</div>
              </div>
              
              <div className="bg-card p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground mb-1">Validator</div>
                <div className="text-sm font-mono break-all">
                  {formatValidator(blockData.block.validator)}
                </div>
              </div>
            </div>
          </div>

          {/* Top Programs */}
          <div className="bg-muted/50 rounded-lg p-6 border border-border">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Program Activity
            </h3>
            
            <div className="space-y-3">
              {blockData.programs.map((program, index) => {
                const { programInfo } = formatProgramDisplay(program.program_id);
                const percentage = ((program.invocations / blockData.block.total_invocations) * 100);
                
                return (
                  <div key={program.program_id} className="bg-card p-4 rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                        <ProgramBadge programId={program.program_id} />
                      </div>
                      
                      <div className="text-right">
                        <div className="text-lg font-semibold text-success">
                          {program.invocations.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {percentage.toFixed(1)}% of block
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                      <span>{program.transactions.toLocaleString()} transactions</span>
                      <div className="flex-1 mx-4">
                        <div className="w-full bg-border rounded-full h-1">
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