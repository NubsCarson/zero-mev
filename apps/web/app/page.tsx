'use client';

import { useState, useEffect } from 'react';
import { Star, BarChart3, Clock, TrendingUp, X } from 'lucide-react';
import LineChart from '@/components/LineChart';
import ProgramTag from '@/components/ProgramTag';
import CategoryLegend from '@/components/CategoryLegend';
import { formatProgramDisplay } from '@/lib/programRegistry';

interface Program {
  program_id: string;
  cnt: number;
}

interface ProgramStats {
  ts: string;
  cnt: number;
}

export default function Home() {
  const [from, setFrom] = useState<string>(() => {
    // Default to 7 days ago
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [to, setTo] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [validator, setValidator] = useState<string>('all');
  const [excludeBlacklisted, setExcludeBlacklisted] = useState(true);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [programStats, setProgramStats] = useState<ProgramStats[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  const fetchPrograms = async (isAutoUpdate = false) => {
    if (!isAutoUpdate) setLoading(true);
    try {
      const params = new URLSearchParams({
        validator,
        from: `${from}T00:00:00Z`,
        to: `${to}T23:59:59Z`,
        limit: '50',
        excludeBlacklisted: excludeBlacklisted.toString(),
      });
      
      const response = await fetch(`/api/top-programs?${params}`);
      const data = await response.json();
      
      if (response.ok && Array.isArray(data)) {
        setPrograms(data);
        setLastUpdate(new Date());
      } else {
        console.error('API error:', data);
        setPrograms([]);
      }
    } catch (error) {
      console.error('Error fetching programs:', error);
      setPrograms([]);
    } finally {
      if (!isAutoUpdate) setLoading(false);
    }
  };

  const fetchProgramStats = async (programId: string, isAutoUpdate = false) => {
    if (!isAutoUpdate) setStatsLoading(true);
    try {
      const params = new URLSearchParams({
        programId,
        validator,
        from: `${from}T00:00:00Z`,
        to: `${to}T23:59:59Z`,
        by: 'hour',
      });
      
      const response = await fetch(`/api/program-stats?${params}`);
      const data = await response.json();
      
      if (response.ok && Array.isArray(data)) {
        setProgramStats(data);
      } else {
        console.error('API error:', data);
        setProgramStats([]);
      }
    } catch (error) {
      console.error('Error fetching program stats:', error);
      setProgramStats([]);
    } finally {
      if (!isAutoUpdate) setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrograms();
    setLastUpdate(new Date());
  }, []);

  useEffect(() => {
    if (!isLiveMode) return;

    let programsEventSource: EventSource;
    let statsEventSource: EventSource;
    
    const connectProgramsStream = () => {
      setConnectionStatus('connecting');
      const params = new URLSearchParams({
        validator,
        from: `${from}T00:00:00Z`,
        to: `${to}T23:59:59Z`,
        excludeBlacklisted: excludeBlacklisted.toString(),
      });
      
      programsEventSource = new EventSource(`/api/stream/programs?${params}`);
      
      programsEventSource.onopen = () => {
        setConnectionStatus('connected');
      };
      
      programsEventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            setPrograms(data);
            setLastUpdate(new Date());
          }
        } catch (error) {
          console.error('Error parsing programs SSE data:', error);
        }
      };
      
      programsEventSource.onerror = () => {
        setConnectionStatus('disconnected');
        programsEventSource.close();
        setTimeout(connectProgramsStream, 2000);
      };
    };
    
    const connectStatsStream = () => {
      if (!selectedProgram) return;
      
      const params = new URLSearchParams({
        programId: selectedProgram,
        validator,
        from: `${from}T00:00:00Z`,
        to: `${to}T23:59:59Z`,
      });
      
      statsEventSource = new EventSource(`/api/stream/program-stats?${params}`);
      
      statsEventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            setProgramStats(data);
          }
        } catch (error) {
          console.error('Error parsing stats SSE data:', error);
        }
      };
      
      statsEventSource.onerror = () => {
        statsEventSource.close();
        setTimeout(connectStatsStream, 2000);
      };
    };
    
    connectProgramsStream();
    if (selectedProgram) {
      connectStatsStream();
    }
    
    return () => {
      if (programsEventSource) programsEventSource.close();
      if (statsEventSource) statsEventSource.close();
    };
  }, [isLiveMode, selectedProgram, validator, from, to, excludeBlacklisted]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPrograms();
    if (selectedProgram) {
      fetchProgramStats(selectedProgram);
    }
  };

  const toggleLiveMode = () => {
    setIsLiveMode(!isLiveMode);
    if (!isLiveMode) {
      setLastUpdate(new Date());
    }
  };

  const handleProgramClick = (programId: string) => {
    setSelectedProgram(programId);
    fetchProgramStats(programId);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-4">Solana Program Tracker</h1>
        <p className="text-muted-foreground">Real-time blockchain monitoring and program analysis</p>
      </div>

      {/* Program Categories Dropdown - Moved to top */}
      <div className="mb-6">
        <CategoryLegend isDropdown={true} />
      </div>
      
      <form onSubmit={handleSubmit} className="bg-card p-6 rounded-lg mb-8 border border-border shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">From Date</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 bg-input text-foreground rounded border border-border focus:border-ring focus:outline-none focus-ring"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">To Date</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 bg-input text-foreground rounded border border-border focus:border-ring focus:outline-none focus-ring"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Validator</label>
            <input
              type="text"
              value={validator}
              onChange={(e) => setValidator(e.target.value)}
              placeholder="all or validator pubkey"
              className="w-full px-3 py-2 bg-input text-foreground rounded border border-border focus:border-ring focus:outline-none focus-ring"
            />
          </div>
          
          <div className="flex items-end">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={excludeBlacklisted}
                onChange={(e) => setExcludeBlacklisted(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Exclude Blacklisted</span>
            </label>
          </div>
        </div>
        
        <div className="flex gap-4">
          <button
            type="submit"
            className="px-6 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            Search
          </button>
          <button
            type="button"
            onClick={toggleLiveMode}
            className={`px-6 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              isLiveMode 
                ? 'bg-success hover:bg-success/90 text-white' 
                : 'bg-secondary hover:bg-secondary/90 text-secondary-foreground'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${
              isLiveMode 
                ? connectionStatus === 'connected' 
                  ? 'bg-white animate-pulse' 
                  : connectionStatus === 'connecting'
                  ? 'bg-yellow-300 animate-spin'
                  : 'bg-red-300'
                : 'bg-muted-foreground'
            }`}></div>
            {isLiveMode 
              ? connectionStatus === 'connected' 
                ? 'Live Stream ON' 
                : connectionStatus === 'connecting'
                ? 'Connecting...'
                : 'Stream Error'
              : 'Enable Live Stream'
            }
          </button>
          <a
            href="/explorer"
            className="px-8 py-3 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-lg hover:from-primary/90 hover:to-accent/90 transition-all duration-200 inline-block text-center flex items-center gap-3 shadow-lg hover:shadow-xl transform hover:scale-105 border border-primary/50"
          >
            <Star className="w-5 h-5" />
            <span className="font-semibold text-lg">Block Explorer</span>
          </a>
          <a
            href="/blacklist"
            className="px-6 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/90 transition-colors flex items-center justify-center border border-border"
          >
            Manage Blacklist
          </a>
        </div>
      </form>

      {isLiveMode && lastUpdate && connectionStatus === 'connected' && (
        <div className="mb-4 p-3 bg-green-900/30 border border-green-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-success text-sm">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            Real-time SSE stream active • Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
        </div>
      )}
      
      {isLiveMode && connectionStatus === 'connecting' && (
        <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-300 text-sm">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-spin"></div>
            Connecting to real-time stream...
          </div>
        </div>
      )}
      
      {isLiveMode && connectionStatus === 'disconnected' && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-red-300 text-sm">
            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
            Stream disconnected • Attempting to reconnect...
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Top Programs</h2>
          </div>
          <div className="bg-card rounded-lg overflow-hidden border border-border">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : programs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No programs found</div>
            ) : (
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left">Program</th>
                    <th className="px-4 py-3 text-right">Invocations</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((program) => (
                    <tr
                      key={program.program_id}
                      className={`border-t border-border hover:bg-muted/50 cursor-pointer transition-colors ${
                        selectedProgram === program.program_id ? 'bg-muted' : ''
                      }`}
                      onClick={() => handleProgramClick(program.program_id)}
                    >
                      <td className="px-4 py-3">
                        <ProgramTag 
                          programId={program.program_id}
                          onClick={() => handleProgramClick(program.program_id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {program.cnt.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              {selectedProgram ? 'Program Timeline' : 'Select a Program'}
            </h2>
            <div className="flex items-center gap-3">
              {selectedProgram && isLiveMode && connectionStatus === 'connected' && (
                <span className="text-xs text-muted-foreground">Live</span>
              )}
              {selectedProgram && (
                <button
                  onClick={() => setSelectedProgram(null)}
                  className="px-3 py-1 bg-muted hover:bg-secondary text-foreground rounded text-sm transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Close
                </button>
              )}
            </div>
          </div>
          <div className="bg-card rounded-lg overflow-hidden border border-border">
            {!selectedProgram ? (
              <div className="text-center text-muted-foreground py-12">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <div className="text-lg mb-2">Program Timeline</div>
                <div className="text-sm">Click on a program to view its activity timeline</div>
              </div>
            ) : statsLoading ? (
              <div className="text-center text-muted-foreground py-12">
                <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground animate-spin" />
                <div className="text-lg">Loading timeline...</div>
              </div>
            ) : (
              <div>
                {/* Header with program info and stats */}
                <div className="bg-muted p-4 border-b border-border">
                  <div className="flex items-center justify-between mb-3">
                    <ProgramTag 
                      programId={selectedProgram}
                      showFullId={true}
                    />
                  </div>
                  
                  {/* Quick stats */}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="text-center min-w-0">
                      <div className="text-lg font-bold text-primary truncate">
                        {(() => {
                          const total = programStats.reduce((sum, stat) => sum + (stat.cnt || 0), 0);
                          if (total >= 1000000) return `${(total / 1000000).toFixed(1)}M`;
                          if (total >= 1000) return `${(total / 1000).toFixed(1)}K`;
                          return total.toLocaleString();
                        })()}
                      </div>
                      <div className="text-muted-foreground text-xs">Total Invocations</div>
                    </div>
                    <div className="text-center min-w-0">
                      <div className="text-lg font-bold text-success truncate">
                        {programStats.length}
                      </div>
                      <div className="text-muted-foreground text-xs">Data Points</div>
                    </div>
                    <div className="text-center min-w-0">
                      <div className="text-lg font-bold text-white truncate">
                        {(() => {
                          const peak = programStats.length > 0 ? Math.max(...programStats.map(s => s.cnt || 0)) : 0;
                          if (peak >= 1000000) return `${(peak / 1000000).toFixed(1)}M`;
                          if (peak >= 1000) return `${(peak / 1000).toFixed(1)}K`;
                          return peak.toLocaleString();
                        })()}
                      </div>
                      <div className="text-foreground text-xs">Peak Hour</div>
                    </div>
                  </div>
                </div>

                {/* Chart section */}
                <div className="p-4">
                  {programStats.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                      <div className="text-lg mb-2">No Data Available</div>
                      <div className="text-sm">No activity found for this program in the selected time range</div>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-4">
                        <h3 className="text-sm font-medium text-muted-foreground mb-2">Activity Timeline</h3>
                        <div className="text-xs text-muted-foreground">
                          Showing activity from {new Date(programStats[0]?.ts).toLocaleDateString()} to {new Date(programStats[programStats.length - 1]?.ts).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="bg-secondary rounded-lg p-4 overflow-hidden">
                        <div className="w-full max-w-full">
                          <LineChart data={programStats} width={650} height={300} />
                        </div>
                      </div>
                      
                      {/* Recent activity table */}
                      {programStats.length > 0 && (
                        <div className="mt-6">
                          <h3 className="text-sm font-medium text-muted-foreground mb-3">Recent Activity</h3>
                          <div className="bg-secondary rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-muted">
                                <tr>
                                  <th className="px-4 py-2 text-left">Time</th>
                                  <th className="px-4 py-2 text-right">Invocations</th>
                                  <th className="px-4 py-2 text-right">Activity Level</th>
                                </tr>
                              </thead>
                              <tbody>
                                {programStats.slice(-5).reverse().map((stat, i) => {
                                  const maxCnt = Math.max(...programStats.map(s => s.cnt || 0));
                                  const percentage = maxCnt > 0 ? ((stat.cnt || 0) / maxCnt * 100) : 0;
                                  return (
                                    <tr key={i} className="border-t border-border">
                                      <td className="px-4 py-2 text-foreground">
                                        {new Date(stat.ts).toLocaleString()}
                                      </td>
                                      <td className="px-4 py-2 text-right font-mono text-primary">
                                        {(stat.cnt || 0).toLocaleString()}
                                      </td>
                                      <td className="px-4 py-2 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                          <div className="w-16 bg-muted rounded-full h-2">
                                            <div 
                                              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                                              style={{ width: `${percentage}%` }}
                                            />
                                          </div>
                                          <span className="text-xs text-muted-foreground w-8">
                                            {percentage.toFixed(0)}%
                                          </span>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}