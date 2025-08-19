'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  const [currentPage, setCurrentPage] = useState(1);
  const [blocksPerPage] = useState(5);
  
  // Refs for performance optimization
  const eventSourceRef = useRef<EventSource | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const programStatsCache = useRef<Map<number, BlockProgramStats[]>>(new Map());
  const lastProcessedSlot = useRef<number>(0);
  const isProcessing = useRef<boolean>(false);
  
  // Constants for memory management
  const MAX_BLOCKS = 50; // Maximum blocks to keep in memory
  const CACHE_SIZE = 100; // Maximum cached program stats
  const PROGRAM_STATS_BATCH_SIZE = 3; // Only fetch program stats for first N blocks

  // Memory management utilities
  const cleanupOldBlocks = useCallback((newBlocks: BlockWithPrograms[]) => {
    if (newBlocks.length > MAX_BLOCKS) {
      const trimmedBlocks = newBlocks.slice(0, MAX_BLOCKS);
      // Clear cache entries for removed blocks
      const removedSlots = newBlocks.slice(MAX_BLOCKS).map(b => b.slot);
      removedSlots.forEach(slot => programStatsCache.current.delete(slot));
      return trimmedBlocks;
    }
    return newBlocks;
  }, []);

  const cleanupCache = useCallback(() => {
    if (programStatsCache.current.size > CACHE_SIZE) {
      const entries = Array.from(programStatsCache.current.entries());
      const toKeep = entries.slice(-CACHE_SIZE);
      programStatsCache.current.clear();
      toKeep.forEach(([slot, stats]) => {
        programStatsCache.current.set(slot, stats);
      });
    }
  }, []);

  const fetchLatestBlocks = async () => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    
    try {
      const response = await fetch('/api/blocks/current');
      if (response.ok) {
        const blocksData: Block[] = await response.json();
        
        // Only fetch program stats for the first few blocks to reduce API load
        const blocksWithPrograms = await Promise.all(
          blocksData.map(async (block, index) => {
            if (index < PROGRAM_STATS_BATCH_SIZE) {
              // Check cache first
              let programStats = programStatsCache.current.get(block.slot);
              if (!programStats) {
                // Add exponential delay for API calls
                if (index > 0) {
                  await new Promise(resolve => setTimeout(resolve, index * 100));
                }
                programStats = await fetchBlockProgramStats(block.slot);
                programStatsCache.current.set(block.slot, programStats);
              }
              return { ...block, programStats };
            } else {
              // Don't fetch program stats for older blocks to save resources
              return { ...block, programStats: [] };
            }
          })
        );
        
        const cleanedBlocks = cleanupOldBlocks(blocksWithPrograms);
        setBlocks(cleanedBlocks);
        cleanupCache();
        
        // Only reset pagination if we're on page 1 or if significant data changes
        if (fallbackMode) {
          setConnectionStatus('connected');
        }
      }
    } catch (error) {
      console.error('Error fetching latest blocks:', error);
      setConnectionStatus('disconnected');
    } finally {
      isProcessing.current = false;
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

  // Optimized SSE processing with throttling
  const processSSEData = useCallback(async (data: Block[]) => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    try {
      // Filter out already processed blocks
      const newBlocks = data.filter(block => block.slot > lastProcessedSlot.current);
      if (newBlocks.length === 0) {
        isProcessing.current = false;
        return;
      }

      // Update last processed slot
      if (newBlocks.length > 0) {
        lastProcessedSlot.current = Math.max(...newBlocks.map(b => b.slot));
      }

      // Only fetch program stats for the newest blocks to reduce API spam
      const blocksWithPrograms = await Promise.all(
        newBlocks.map(async (block, index) => {
          if (index < PROGRAM_STATS_BATCH_SIZE) {
            // Check cache first
            let programStats = programStatsCache.current.get(block.slot);
            if (!programStats) {
              // Staggered API calls with exponential backoff
              if (index > 0) {
                await new Promise(resolve => setTimeout(resolve, index * 150));
              }
              programStats = await fetchBlockProgramStats(block.slot);
              programStatsCache.current.set(block.slot, programStats);
            }
            return { ...block, programStats };
          } else {
            return { ...block, programStats: [] };
          }
        })
      );

      // Merge with existing blocks and clean up
      setBlocks(prevBlocks => {
        const mergedBlocks = [...blocksWithPrograms, ...prevBlocks];
        const uniqueBlocks = mergedBlocks.filter((block, index, self) => 
          index === self.findIndex(b => b.slot === block.slot)
        );
        const sortedBlocks = uniqueBlocks.sort((a, b) => b.slot - a.slot);
        return cleanupOldBlocks(sortedBlocks);
      });

      cleanupCache();
      
      // Only reset pagination if we're on first page
      if (currentPage === 1) {
        resetPaginationOnNewData();
      }
    } catch (error) {
      console.error('Error processing SSE data:', error);
    } finally {
      isProcessing.current = false;
    }
  }, [cleanupOldBlocks, cleanupCache, currentPage]);

  useEffect(() => {
    if (!isLive) {
      // Clean up when not live
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (fallbackMode) {
      // Use optimized polling fallback
      fetchLatestBlocks();
      intervalRef.current = setInterval(fetchLatestBlocks, 2000); // Reduced frequency
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    
    const connectStream = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      
      setConnectionStatus('connecting');
      eventSourceRef.current = new EventSource('/api/stream/blocks');
      
      eventSourceRef.current.onopen = () => {
        setConnectionStatus('connected');
        reconnectAttempts = 0;
      };
      
      eventSourceRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            console.error('SSE error from server:', data);
            setConnectionStatus('disconnected');
            return;
          }
          if (Array.isArray(data)) {
            // Use throttled processing
            processSSEData(data);
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };
      
      eventSourceRef.current.onerror = () => {
        setConnectionStatus('disconnected');
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        
        reconnectAttempts++;
        if (reconnectAttempts >= maxReconnectAttempts) {
          console.log('Max SSE reconnect attempts reached, falling back to polling');
          setFallbackMode(true);
          return;
        }
        
        // Exponential backoff for reconnection
        setTimeout(connectStream, Math.min(2000 * Math.pow(2, reconnectAttempts), 10000));
      };
    };
    
    connectStream();
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isLive, fallbackMode, processSSEData]);

  // Cleanup effect on unmount
  useEffect(() => {
    return () => {
      // Clean up all resources on unmount
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Clear caches
      programStatsCache.current.clear();
      isProcessing.current = false;
    };
  }, []);

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

  // Optimized pagination reset - only reset when necessary
  const resetPaginationOnNewData = useCallback(() => {
    // Only reset if we're on live mode and have new data that would affect current view
    if (isLive && currentPage === 1) {
      // Already on first page, no need to reset
      return;
    }
    if (isLive && currentPage > 1) {
      // Reset to first page only if we have significant new data
      setCurrentPage(1);
    }
  }, [isLive, currentPage]);

  // Optimized block rendering with memoization
  const paginatedBlocks = useMemo(() => {
    const totalPages = Math.ceil(blocks.length / blocksPerPage);
    const startIndex = (currentPage - 1) * blocksPerPage;
    const endIndex = startIndex + blocksPerPage;
    return {
      blocks: blocks.slice(startIndex, endIndex),
      totalPages,
      startIndex,
      endIndex
    };
  }, [blocks, currentPage, blocksPerPage]);

  // Use optimized pagination from memoized calculation
  const { blocks: currentBlocks, totalPages, startIndex, endIndex } = paginatedBlocks;

  // Navigation functions
  const goToFirstPage = () => setCurrentPage(1);
  const goToPreviousPage = () => setCurrentPage(Math.max(1, currentPage - 1));
  const goToNextPage = () => setCurrentPage(Math.min(totalPages, currentPage + 1));
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToPage = (page: number) => setCurrentPage(Math.max(1, Math.min(totalPages, page)));

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
      <div className="h-[700px] flex flex-col">
        {/* Pagination Info */}
        <div className="flex items-center justify-between mb-4 text-sm text-muted-foreground">
          <span>Showing {startIndex + 1}-{Math.min(endIndex, blocks.length)} of {blocks.length} blocks</span>
          <span>Page {currentPage} of {totalPages}</span>
        </div>

        {/* Blocks Display */}
        <div className="flex-1 space-y-2 overflow-y-auto">
        {currentBlocks.map((block, index) => (
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
            
            {/* Program Breakdown - Only show for blocks with program stats */}
            {block.programStats && block.programStats.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-xs text-muted-foreground mb-2">Top Programs:</div>
                <div className="flex flex-wrap gap-2">
                  {block.programStats.slice(0, 4).map((program) => (
                    <div
                      key={`${block.slot}-${program.program_id}`}
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
                  {block.programStats.length > 4 && (
                    <div className="px-2 py-1 bg-muted rounded-full text-xs text-muted-foreground">
                      +{block.programStats.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Show loading indicator for blocks without program stats */}
            {(!block.programStats || block.programStats.length === 0) && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-xs text-muted-foreground mb-2">Loading programs...</div>
                <div className="flex gap-2">
                  <div className="px-3 py-1 bg-muted/50 rounded-full text-xs text-muted-foreground animate-pulse">
                    ●●●
                  </div>
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

        {/* Pagination Controls */}
        {blocks.length > 0 && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <button
                onClick={goToFirstPage}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                First
              </button>
              <button
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Go to page:</span>
              <select
                value={currentPage}
                onChange={(e) => goToPage(Number(e.target.value))}
                className="px-2 py-1 text-sm bg-muted border border-border rounded focus:border-ring focus:outline-none"
              >
                {Array.from({ length: totalPages }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
              <button
                onClick={goToLastPage}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}