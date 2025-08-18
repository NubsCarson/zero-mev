'use client';

import { useState, useEffect } from 'react';
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

  const fetchPrograms = async () => {
    setLoading(true);
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
      } else {
        console.error('API error:', data);
        setPrograms([]);
      }
    } catch (error) {
      console.error('Error fetching programs:', error);
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProgramStats = async (programId: string) => {
    setStatsLoading(true);
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
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrograms();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPrograms();
    if (selectedProgram) {
      fetchProgramStats(selectedProgram);
    }
  };

  const handleProgramClick = (programId: string) => {
    setSelectedProgram(programId);
    fetchProgramStats(programId);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <h1 className="text-3xl font-bold mb-8">Solana Program Tracker</h1>
      
      <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">From Date</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">To Date</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Validator</label>
            <input
              type="text"
              value={validator}
              onChange={(e) => setValidator(e.target.value)}
              placeholder="all or validator pubkey"
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
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
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
          <a
            href="/explorer"
            className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors inline-block text-center"
          >
            🌟 Block Explorer
          </a>
          <a
            href="/blacklist"
            className="px-6 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors inline-block text-center"
          >
            Manage Blacklist
          </a>
        </div>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">Top Programs</h2>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : programs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No programs found</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left">Program</th>
                    <th className="px-4 py-3 text-right">Invocations</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((program, i) => (
                    <tr
                      key={program.program_id}
                      className={`border-t border-gray-700 hover:bg-gray-700/50 cursor-pointer transition-colors ${
                        selectedProgram === program.program_id ? 'bg-gray-700' : ''
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
            {selectedProgram && (
              <button
                onClick={() => setSelectedProgram(null)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors flex items-center gap-1"
              >
                ✕ Close
              </button>
            )}
          </div>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            {!selectedProgram ? (
              <div className="text-center text-gray-500 py-12">
                <div className="text-4xl mb-4">📊</div>
                <div className="text-lg mb-2">Program Timeline</div>
                <div className="text-sm">Click on a program to view its activity timeline</div>
              </div>
            ) : statsLoading ? (
              <div className="text-center text-gray-500 py-12">
                <div className="text-4xl mb-4">⏳</div>
                <div className="text-lg">Loading timeline...</div>
              </div>
            ) : (
              <div>
                {/* Header with program info and stats */}
                <div className="bg-gray-700 p-4 border-b border-gray-600">
                  <div className="flex items-center justify-between mb-3">
                    <ProgramTag 
                      programId={selectedProgram}
                      showFullId={true}
                    />
                  </div>
                  
                  {/* Quick stats */}
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-400">
                        {programStats.reduce((sum, stat) => sum + (stat.cnt || 0), 0).toLocaleString()}
                      </div>
                      <div className="text-gray-400">Total Invocations</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-400">
                        {programStats.length}
                      </div>
                      <div className="text-gray-400">Data Points</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-400">
                        {programStats.length > 0 ? Math.max(...programStats.map(s => s.cnt || 0)).toLocaleString() : '0'}
                      </div>
                      <div className="text-gray-400">Peak Hour</div>
                    </div>
                  </div>
                </div>

                {/* Chart section */}
                <div className="p-4">
                  {programStats.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <div className="text-3xl mb-3">📈</div>
                      <div className="text-lg mb-2">No Data Available</div>
                      <div className="text-sm">No activity found for this program in the selected time range</div>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-4">
                        <h3 className="text-sm font-medium text-gray-400 mb-2">Activity Timeline</h3>
                        <div className="text-xs text-gray-500">
                          Showing activity from {new Date(programStats[0]?.ts).toLocaleDateString()} to {new Date(programStats[programStats.length - 1]?.ts).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-4">
                        <LineChart data={programStats} width={700} height={300} />
                      </div>
                      
                      {/* Recent activity table */}
                      {programStats.length > 0 && (
                        <div className="mt-6">
                          <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Activity</h3>
                          <div className="bg-gray-900 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-800">
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
                                    <tr key={i} className="border-t border-gray-800">
                                      <td className="px-4 py-2 text-gray-300">
                                        {new Date(stat.ts).toLocaleString()}
                                      </td>
                                      <td className="px-4 py-2 text-right font-mono text-blue-400">
                                        {(stat.cnt || 0).toLocaleString()}
                                      </td>
                                      <td className="px-4 py-2 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                          <div className="w-16 bg-gray-700 rounded-full h-2">
                                            <div 
                                              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                                              style={{ width: `${percentage}%` }}
                                            />
                                          </div>
                                          <span className="text-xs text-gray-400 w-8">
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
        
        <div className="mt-8">
          <CategoryLegend />
        </div>
      </div>
    </div>
  );
}