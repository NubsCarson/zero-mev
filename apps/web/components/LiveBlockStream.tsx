'use client';

import { useState, useEffect } from 'react';
import { Hammer, HelpCircle, BarChart3 } from 'lucide-react';
import { formatProgramDisplay } from '@/lib/programRegistry';

interface Block {
  slot: number;
  block_time: string;
  validator: string;
  total_invocations: number;
  unique_programs: number;
  unique_transactions?: number;
}

interface BlockProgramStats {
  program_id: string;
  name: string;
  count: number;
  percentage: number;
  color: string;
  bgColor: string;
}

interface BlockWithPrograms extends Block {
  programStats?: BlockProgramStats[];
}

interface LiveBlockStreamProps {
  onBlockClick?: (slot: number) => void;
}

export default function LiveBlockStream({ onBlockClick }: LiveBlockStreamProps) {
  const [blocks, setBlocks] = useState<BlockWithPrograms[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [fallbackMode, setFallbackMode] = useState(false);

  const fetchLatestBlocks = async () => {
    try {
      const response = await fetch('/api/blocks/current');
      if (response.ok) {
        const blocksData: Block[] = await response.json();
        
        // Fetch program stats for the first 5 blocks for better coverage
        const blocksWithPrograms = await Promise.all(
          blocksData.slice(0, 5).map(async (block, index) => {
            // Add delay between API calls to prevent spam
            if (index > 0) {
              await new Promise(resolve => setTimeout(resolve, 80));
            }
            const programStats = await fetchBlockProgramStats(block.slot);
            return { ...block, programStats };
          })
        );
        
        // Add remaining blocks without program stats
        const remainingBlocks = blocksData.slice(5).map(block => ({ ...block, programStats: undefined }));
        
        setBlocks([...blocksWithPrograms, ...remainingBlocks]);
        if (fallbackMode) {
          setConnectionStatus('connected');
        }
      }
    } catch (error) {
      console.error('Error fetching latest blocks:', error);
      setConnectionStatus('disconnected');
    }
  };

  const fetchBlockProgramStats = async (slot: number): Promise<BlockProgramStats[]> => {
    try {
      const response = await fetch(`/api/blocks/${slot}/programs`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching block program stats:', error);
      return [];
    }
  };

  useEffect(() => {
    if (!isLive) return;

    if (fallbackMode) {
      // Use polling fallback
      fetchLatestBlocks();
      const interval = setInterval(fetchLatestBlocks, 1000);
      return () => clearInterval(interval);
    }

    let eventSource: EventSource;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    
    const connectStream = () => {
      setConnectionStatus('connecting');
      eventSource = new EventSource('/api/stream/blocks');
      
      eventSource.onopen = () => {
        setConnectionStatus('connected');
        reconnectAttempts = 0;
      };
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            console.error('SSE error from server:', data);
            setConnectionStatus('disconnected');
            return;
          }
          if (Array.isArray(data)) {
            // Process blocks with throttling to reduce API spam
            const processBlocks = async () => {
              // Fetch program stats for the first 5 blocks from SSE for better coverage
              const blocksWithPrograms = await Promise.all(
                data.slice(0, 5).map(async (block: Block, index) => {
                  // Add delay between API calls
                  if (index > 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                  }
                  const programStats = await fetchBlockProgramStats(block.slot);
                  return { ...block, programStats };
                })
              );
              
              // Add remaining blocks without program stats
              const remainingBlocks = data.slice(5).map(block => ({ ...block, programStats: undefined }));
              
              setBlocks([...blocksWithPrograms, ...remainingBlocks]);
            };
            processBlocks();
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };
      
      eventSource.onerror = () => {
        setConnectionStatus('disconnected');
        eventSource.close();
        
        reconnectAttempts++;
        if (reconnectAttempts >= maxReconnectAttempts) {
          console.log('Max SSE reconnect attempts reached, falling back to polling');
          setFallbackMode(true);
          return;
        }
        
        // Reconnect after 2 seconds
        setTimeout(connectStream, 2000);
      };
    };
    
    connectStream();
    
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [isLive, fallbackMode]);

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    
    // Parse the timestamp - ClickHouse returns timestamps in format "YYYY-MM-DD HH:MM:SS"
    let blockTime: Date;
    try {
      // Handle ClickHouse timestamp format: "2025-08-18 23:17:32"
      if (timestamp.includes(' ') && !timestamp.includes('T')) {
        // Convert ClickHouse format to ISO format (ClickHouse returns UTC timestamps)
        const isoTimestamp = timestamp.replace(' ', 'T') + 'Z';
        blockTime = new Date(isoTimestamp);
      } else {
        // Handle ISO format timestamps
        blockTime = new Date(timestamp);
        
        // If the parsed date is invalid, try with 'Z' suffix if not present
        if (isNaN(blockTime.getTime())) {
          blockTime = new Date(timestamp.includes('Z') ? timestamp : timestamp + 'Z');
        }
      }
      
      // If still invalid, log and show raw timestamp
      if (isNaN(blockTime.getTime())) {
        console.error('Invalid timestamp format:', timestamp);
        return timestamp;
      }
    } catch (error) {
      console.error('Error parsing timestamp:', timestamp, error);
      return timestamp;
    }
    
    const diffMs = now.getTime() - blockTime.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    
    // Handle future timestamps (shouldn't happen but just in case)
    if (diffSeconds < 0) {
      return 'just now';
    }
    
    if (diffSeconds < 5) return 'just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  };

  const formatValidator = (validator: string) => {
    if (validator === 'unknown') return (
      <span className="flex items-center gap-1">
        <HelpCircle className="w-3 h-3" />
        Unknown
      </span>
    );
    return (
      <span className="flex items-center gap-1">
        <Hammer className="w-3 h-3" />
        {validator.slice(0, 8)}...{validator.slice(-8)}
      </span>
    );
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 min-h-[800px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            isLive 
              ? connectionStatus === 'connected' 
                ? 'bg-green-500 animate-pulse' 
                : connectionStatus === 'connecting'
                ? 'bg-yellow-500 animate-spin'
                : 'bg-red-500'
              : 'bg-gray-500'
          }`}></div>
          <h2 className="text-xl font-semibold">
            {isLive 
              ? connectionStatus === 'connected' 
                ? fallbackMode 
                  ? 'Live Block Stream (Polling Fallback)' 
                  : 'Live Block Stream (Real-time SSE)'
                : connectionStatus === 'connecting'
                ? 'Connecting to Stream...'
                : 'Stream Disconnected'
              : 'Block Stream (Paused)'
            }
          </h2>
        </div>
        <button
          onClick={() => setIsLive(!isLive)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            isLive 
              ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' 
              : 'bg-success hover:bg-success/90 text-white'
          }`}
        >
          {isLive ? 'Pause' : 'Resume'}
        </button>
      </div>

      {/* Main Content */}
      <div className="h-[700px]">
        <div className="space-y-2 h-full overflow-y-auto">
        {blocks.map((block, index) => (
          <div
            key={block.slot}
            className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 hover:bg-muted/50 ${
              index === 0 && isLive 
                ? 'border-success/50 bg-success/10' 
                : 'border-border bg-muted/30'
            }`}
            onClick={() => onBlockClick?.(block.slot)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-lg font-mono font-bold text-primary">
                  #{block.slot.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatTimeAgo(block.block_time)}
                </div>
                {index === 0 && isLive && (
                  <span className="px-2 py-1 bg-success text-white text-xs rounded-full">
                    Latest
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <div className="text-success font-semibold">
                    {block.total_invocations.toLocaleString()}
                  </div>
                  <div className="text-muted-foreground text-xs">invocations</div>
                </div>
                
                <div className="text-center">
                  <div className="text-primary font-semibold">
                    {block.unique_programs}
                  </div>
                  <div className="text-muted-foreground text-xs">programs</div>
                </div>
              </div>
            </div>
            
            <div className="mt-2 text-xs text-muted-foreground">
              {formatValidator(block.validator)}
            </div>
            
            {/* Program Breakdown */}
            {block.programStats && block.programStats.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-xs text-muted-foreground mb-2">Top Programs:</div>
                <div className="flex flex-wrap gap-2">
                  {block.programStats.slice(0, 6).map((program) => (
                    <div
                      key={program.program_id}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${program.bgColor} border border-opacity-50`}
                    >
                      <span className={`${program.color} font-medium`}>
                        {program.name}
                      </span>
                      <span className="text-muted-foreground">
                        {program.percentage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                  {block.programStats.length > 6 && (
                    <div className="px-2 py-1 bg-muted rounded-full text-xs text-muted-foreground">
                      +{block.programStats.length - 6} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        
        {blocks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            Loading blocks...
          </div>
        )}
        </div>
      </div>
    </div>
  );
}