'use client';

import { useState, useEffect } from 'react';
import { formatProgramDisplay } from '@/lib/programRegistry';

interface Block {
  slot: number;
  block_time: string;
  validator: string;
  total_invocations: number;
  unique_programs: number;
  unique_transactions?: number;
}

interface LiveBlockStreamProps {
  onBlockClick?: (slot: number) => void;
}

export default function LiveBlockStream({ onBlockClick }: LiveBlockStreamProps) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [fallbackMode, setFallbackMode] = useState(false);

  const fetchLatestBlocks = async () => {
    try {
      const response = await fetch('/api/blocks/current');
      if (response.ok) {
        const data = await response.json();
        // Debug: log the first block's timestamp in fallback mode
        if (data.length > 0) {
          console.log('Fallback - First block timestamp:', data[0].block_time, 'parsed as:', new Date(data[0].block_time));
        }
        setBlocks(data);
        if (fallbackMode) {
          setConnectionStatus('connected');
        }
      }
    } catch (error) {
      console.error('Error fetching latest blocks:', error);
      setConnectionStatus('disconnected');
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
            // Debug: log the first block's timestamp
            if (data.length > 0) {
              console.log('First block timestamp:', data[0].block_time, 'parsed as:', new Date(data[0].block_time));
            }
            setBlocks(data);
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
    
    // Parse the timestamp - should now be in ISO format from ClickHouse
    let blockTime: Date;
    try {
      blockTime = new Date(timestamp);
      
      // If the parsed date is invalid, try alternative formats
      if (isNaN(blockTime.getTime())) {
        // Try with 'Z' suffix if not present
        blockTime = new Date(timestamp.includes('Z') ? timestamp : timestamp + 'Z');
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
    
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  };

  const formatValidator = (validator: string) => {
    if (validator === 'unknown') return '❓ Unknown';
    return `🏗️ ${validator.slice(0, 8)}...${validator.slice(-8)}`;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
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