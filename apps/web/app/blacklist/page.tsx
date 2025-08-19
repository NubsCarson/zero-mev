'use client';

import { useState, useEffect } from 'react';
import { ProgramBadge } from '@/components/ProgramTag';
import { formatProgramDisplay } from '@/lib/programRegistry';

interface BlacklistEntry {
  program_id: string;
  reason: string;
  added_at: string;
}

export default function Blacklist() {
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [newProgramId, setNewProgramId] = useState('');
  const [newReason, setNewReason] = useState('');
  const [isLive, setIsLive] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  
  const previewProgram = newProgramId.length >= 32 ? formatProgramDisplay(newProgramId) : null;

  const fetchBlacklist = async (isAutoUpdate = false) => {
    console.log('📋 Frontend: Fetching blacklist...');
    if (!isAutoUpdate) setLoading(true);
    try {
      const response = await fetch('/api/blacklist');
      console.log('📥 Frontend: GET response status:', response.status);
      const data = await response.json();
      console.log('📊 Frontend: GET response data - entries count:', data.length, 'data:', data);
      setEntries(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('💥 Frontend: Error fetching blacklist:', error);
    } finally {
      if (!isAutoUpdate) setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlacklist();
  }, []);

  useEffect(() => {
    if (!isLive) return;

    let eventSource: EventSource;
    
    const connectStream = () => {
      setConnectionStatus('connecting');
      eventSource = new EventSource('/api/stream/blacklist');
      
      eventSource.onopen = () => {
        setConnectionStatus('connected');
      };
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            setEntries(data);
            setLastUpdate(new Date());
          }
        } catch (error) {
          console.error('Error parsing blacklist SSE data:', error);
        }
      };
      
      eventSource.onerror = () => {
        setConnectionStatus('disconnected');
        eventSource.close();
        setTimeout(connectStream, 2000);
      };
    };
    
    connectStream();
    
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [isLive]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProgramId || !newReason) return;

    try {
      const response = await fetch('/api/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_id: newProgramId,
          reason: newReason,
        }),
      });

      if (response.ok) {
        setNewProgramId('');
        setNewReason('');
        fetchBlacklist();
      }
    } catch (error) {
      console.error('Error adding to blacklist:', error);
    }
  };

  const handleRemove = async (programId: string) => {
    console.log('🗑️ Frontend: Starting removal for program:', programId);
    
    try {
      const payload = { program_id: programId };
      console.log('📤 Frontend: Sending DELETE request with payload:', payload);
      
      const response = await fetch('/api/blacklist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('📥 Frontend: DELETE response status:', response.status);
      const responseData = await response.json();
      console.log('📥 Frontend: DELETE response data:', responseData);

      if (response.ok) {
        console.log('✅ Frontend: DELETE successful, refetching blacklist...');
        fetchBlacklist();
      } else {
        console.error('❌ Frontend: DELETE failed with response:', responseData);
      }
    } catch (error) {
      console.error('💥 Frontend: Error removing from blacklist:', error);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Program Blacklist</h1>
          {isLive && lastUpdate && connectionStatus === 'connected' && (
            <div className="flex items-center gap-2 text-green-400 text-sm mt-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              Real-time SSE stream active • Last updated: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
          {isLive && connectionStatus === 'connecting' && (
            <div className="flex items-center gap-2 text-yellow-400 text-sm mt-2">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-spin"></div>
              Connecting to real-time stream...
            </div>
          )}
          {isLive && connectionStatus === 'disconnected' && (
            <div className="flex items-center gap-2 text-red-400 text-sm mt-2">
              <div className="w-2 h-2 bg-red-400 rounded-full"></div>
              Stream disconnected • Reconnecting...
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsLive(!isLive)}
            className={`px-4 py-2 rounded transition-colors flex items-center gap-2 ${
              isLive 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-secondary hover:bg-secondary/90 text-foreground'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${
              isLive 
                ? connectionStatus === 'connected' 
                  ? 'bg-white animate-pulse' 
                  : connectionStatus === 'connecting'
                  ? 'bg-yellow-300 animate-spin'
                  : 'bg-red-300'
                : 'bg-gray-400'
            }`}></div>
            {isLive 
              ? connectionStatus === 'connected' 
                ? 'Live Stream' 
                : connectionStatus === 'connecting'
                ? 'Connecting...'
                : 'Stream Error'
              : 'Static Mode'
            }
          </button>
          <a
            href="/"
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            Back to Dashboard
          </a>
        </div>
      </div>

      <form onSubmit={handleAdd} className="bg-card border border-border p-6 rounded-lg mb-8">
        <h2 className="text-xl font-semibold mb-4">Add to Blacklist</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">Program ID</label>
            <input
              type="text"
              value={newProgramId}
              onChange={(e) => setNewProgramId(e.target.value)}
              placeholder="Enter Solana program ID"
              className="w-full px-3 py-2 bg-muted rounded border border-border focus:border-blue-500 focus:outline-none font-mono"
            />
            {previewProgram && (
              <div className="mt-2 p-2 bg-card rounded border border-border">
                <div className="text-xs text-muted-foreground mb-1">Preview:</div>
                <ProgramBadge programId={newProgramId} />
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Reason</label>
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Reason for blacklisting"
              className="w-full px-3 py-2 bg-muted rounded border border-border focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <button
          type="submit"
          className="px-6 py-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors"
        >
          Add to Blacklist
        </button>
      </form>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-semibold">Current Blacklist</h2>
          {isLive && connectionStatus === 'connected' && (
            <span className="text-xs text-green-400">Real-time SSE stream</span>
          )}
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No blacklisted programs</div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left">Program</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-left">Added At</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.program_id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <ProgramBadge programId={entry.program_id} />
                      <div className="text-xs text-muted-foreground font-mono">
                        {entry.program_id}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{entry.reason}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(entry.added_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleRemove(entry.program_id)}
                      className="px-3 py-1 bg-destructive text-destructive-foreground text-sm rounded hover:bg-destructive/90 transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}