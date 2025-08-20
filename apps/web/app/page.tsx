'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, TrendingUp, Clock } from 'lucide-react';
import ProgramTag from '@/components/ProgramTag';
import LineChart from '@/components/LineChart';
import { getProgramInfo } from '@/lib/programRegistry';

interface ValidatorInfo {
  vote_identity: string;
  name: string;
  image?: string;
  description?: string;
  website?: string;
  commission?: number;
  jito_commission_bps?: number;
  apy_estimate?: number;
  ip_city?: string;
  ip_country?: string;
  activated_stake?: number;
}

interface ProgramUsage {
  program_id: string;
  cnt: number;
  percentage: number;
}



export default function ValidatorSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedValidator, setSelectedValidator] = useState<string>('');
  const [validatorInfo, setValidatorInfo] = useState<ValidatorInfo | null>(null);
  const [validatorsList, setValidatorsList] = useState<ValidatorInfo[]>([]);
  const [programUsage, setProgramUsage] = useState<ProgramUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Load validators list on mount
  useEffect(() => {
    fetch('/validators.json')
      .then(res => res.json())
      .then(data => {
        setValidatorsList(data);
      })
      .catch(err => console.error('Failed to load validators:', err));
  }, []);

  // Filter validators based on search query
  const filteredValidators = useMemo(() => {
    if (!searchQuery) return [];
    return validatorsList.filter(validator => 
      validator.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      validator.vote_identity.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 5);
  }, [searchQuery, validatorsList]);

  // Fetch validator data
  const fetchValidatorData = async (validatorPubkey: string) => {
    setLoading(true);
    try {
      // Find validator info from validators.json
      const info = validatorsList.find(v => v.vote_identity === validatorPubkey);
      setValidatorInfo(info || null);

      console.log('🚀 Fetching fresh data for validator:', validatorPubkey.slice(0, 8) + '...');
      
      // 1. Always fetch fresh data from Solana RPC first
      try {
        const fetchResponse = await fetch('/api/fetch-validator-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ validatorPubkey })
        });
        const fetchResult = await fetchResponse.json();
        
        if (fetchResponse.ok) {
          console.log('✅ Fresh data fetch result:', fetchResult);
        } else {
          console.log('⚠️ Fresh data fetch failed:', fetchResult);
        }
      } catch (fetchError) {
        console.error('❌ Error fetching fresh data:', fetchError);
      }

      // 2. Get program usage from database (last 24 hours)
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // Format dates for ClickHouse (remove milliseconds and Z)
      const fromDate = yesterday.toISOString().split('.')[0];
      const toDate = now.toISOString().split('.')[0];
      
      console.log('🌐 Making API request to:', `/api/top-programs?validator=${validatorPubkey}&from=${fromDate}&to=${toDate}&limit=20&excludeBlacklisted=true`);
      
      const programsResponse = await fetch(`/api/top-programs?validator=${validatorPubkey}&from=${fromDate}&to=${toDate}&limit=20&excludeBlacklisted=true`);
      console.log('📡 Response status:', programsResponse.status, programsResponse.statusText);
      
      const programsData = await programsResponse.json();
      console.log('📥 Response received:', {
        type: typeof programsData,
        isArray: Array.isArray(programsData),
        length: Array.isArray(programsData) ? programsData.length : 'N/A',
        hasError: !!programsData.error
      });
      
      console.log('📊 Raw programs data received:', programsData);
      
      if (Array.isArray(programsData) && programsData.length > 0) {
        // Ensure cnt values are numbers (might come as strings from ClickHouse)
        const normalizedData = programsData.map(p => ({
          ...p,
          cnt: typeof p.cnt === 'string' ? parseInt(p.cnt, 10) : p.cnt
        }));
        
        const total = normalizedData.reduce((sum, p) => sum + p.cnt, 0);
        console.log('📊 Program usage calculation:', {
          validator: validatorPubkey.slice(0, 8) + '...',
          total,
          programs: normalizedData.length,
          rawData: normalizedData.slice(0, 5),
          top3: normalizedData.slice(0, 3).map(p => ({ 
            id: p.program_id.slice(0, 8), 
            cnt: p.cnt, 
            type: typeof p.cnt,
            percent: total > 0 ? (p.cnt / total * 100).toFixed(2) + '%' : '0%'
          }))
        });
        
        const usageWithPercentages = normalizedData.map(p => ({
          ...p,
          percentage: total > 0 ? (p.cnt / total * 100) : 0
        }));
        
        console.log('📊 Final usage with percentages:', usageWithPercentages.slice(0, 3));
        setProgramUsage(usageWithPercentages);
      } else if (Array.isArray(programsData) && programsData.length === 0) {
        console.log('📊 No data for this validator, showing suggestion to try a different validator');
        setProgramUsage([]);
        
        // Show helpful message in the UI about trying a different validator
        setValidatorInfo(prev => prev ? {
          ...prev,
          name: prev.name + ' (No Recent Activity)',
          description: 'This validator has not been a leader recently and has no program usage data to display. Try searching for a different validator.'
        } : null);
      } else {
        console.log('❌ Programs data is not an array:', typeof programsData, programsData);
        setProgramUsage([]);
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching validator data:', error);
    } finally {
      setLoading(false);
    }
  };


  // Auto-refresh data every 30 seconds when a validator is selected
  useEffect(() => {
    if (!selectedValidator) return;

    const interval = setInterval(() => {
      fetchValidatorData(selectedValidator);
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedValidator]);

  const handleValidatorSelect = (validator: ValidatorInfo) => {
    setSelectedValidator(validator.vote_identity);
    setSearchQuery(validator.name);
    fetchValidatorData(validator.vote_identity);
  };

  const handleManualSearch = () => {
    if (searchQuery.length >= 40) { // Likely a pubkey
      setSelectedValidator(searchQuery);
      fetchValidatorData(searchQuery);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="container mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold text-center mb-2">Solana Validator Explorer</h1>
          <p className="text-gray-400 text-center">Search validators and explore their program usage patterns</p>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 max-w-6xl">
        {/* Search Section */}
        <div className="mb-8">
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
              placeholder="Search validators by name or paste validator pubkey..."
              className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            
            {/* Search Suggestions */}
            {filteredValidators.length > 0 && searchQuery && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10">
                {filteredValidators.map((validator) => (
                  <button
                    key={validator.vote_identity}
                    onClick={() => handleValidatorSelect(validator)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg border-b border-gray-700 last:border-b-0"
                  >
                    <div className="flex items-center space-x-3">
                      {validator.image && (
                        <img 
                          src={validator.image} 
                          alt={validator.name}
                          className="w-8 h-8 rounded-full"
                        />
                      )}
                      <div>
                        <div className="font-medium">{validator.name}</div>
                        <div className="text-sm text-gray-400">{validator.vote_identity.slice(0, 12)}...</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {searchQuery.length >= 40 && !filteredValidators.length && (
            <div className="text-center mt-4">
              <button
                onClick={handleManualSearch}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Search Validator
              </button>
            </div>
          )}
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <div className="text-gray-400">Loading validator data...</div>
          </div>
        )}

        {selectedValidator && !loading && (
          <>
            {/* Validator Info Card */}
            {validatorInfo && (
              <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
                <div className="flex items-start space-x-4">
                  {validatorInfo.image && (
                    <img 
                      src={validatorInfo.image} 
                      alt={validatorInfo.name}
                      className="w-16 h-16 rounded-full"
                    />
                  )}
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold mb-2">{validatorInfo.name}</h2>
                    <p className="text-gray-400 mb-4">{validatorInfo.description}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {validatorInfo.commission !== undefined && (
                        <div>
                          <div className="text-gray-400">Commission</div>
                          <div className="font-semibold">{validatorInfo.commission}%</div>
                        </div>
                      )}
                      {validatorInfo.apy_estimate && (
                        <div>
                          <div className="text-gray-400">APY</div>
                          <div className="font-semibold text-green-400">{validatorInfo.apy_estimate.toFixed(2)}%</div>
                        </div>
                      )}
                      {validatorInfo.ip_city && (
                        <div>
                          <div className="text-gray-400">Location</div>
                          <div className="font-semibold">{validatorInfo.ip_city}, {validatorInfo.ip_country}</div>
                        </div>
                      )}
                      {validatorInfo.activated_stake && (
                        <div>
                          <div className="text-gray-400">Stake</div>
                          <div className="font-semibold">{(validatorInfo.activated_stake / 1000).toFixed(0)}K SOL</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Program Usage */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 max-w-4xl mx-auto">
              <div className="p-6 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2 text-blue-400" />
                    Program Usage (24h)
                  </h3>
                  {lastUpdate && (
                    <div className="text-sm text-gray-400">
                      Updated: {lastUpdate.toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-6">
                {programUsage.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    No program usage data available
                  </div>
                ) : (
                  <div className="space-y-3">
                    {programUsage.map((program) => {
                      const programInfo = getProgramInfo(program.program_id);
                      return (
                        <div key={program.program_id} className="flex items-center justify-between p-3 rounded-lg">
                          <div className="flex-1 min-w-0 mr-4">
                            <ProgramTag programId={program.program_id} />
                          </div>
                          <div className="flex items-center space-x-3">
                            <div className="w-32 bg-gray-700 rounded-full h-2">
                              <div 
                                className="h-2 rounded-full transition-all duration-500"
                                style={{ 
                                  width: `${program.percentage}%`,
                                  backgroundColor: (() => {
                                    const colorMap: Record<string, string> = {
                                      'text-blue-400': '#60a5fa',
                                      'text-emerald-400': '#34d399',
                                      'text-red-400': '#f87171',
                                      'text-purple-400': '#c084fc',
                                      'text-orange-400': '#fb923c',
                                      'text-pink-400': '#f472b6',
                                      'text-cyan-400': '#22d3ee',
                                      'text-yellow-400': '#facc15',
                                      'text-gray-400': '#9ca3af',
                                      'text-slate-400': '#94a3b8'
                                    };
                                    return colorMap[programInfo.color] || '#9ca3af';
                                  })()
                                }}
                              />
                            </div>
                            <div className="text-sm font-semibold w-16 text-right">
                              {program.percentage.toFixed(1)}%
                            </div>
                            <div className="text-xs text-gray-400 w-20 text-right">
                              {program.cnt.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Auto-refresh indicator */}
            <div className="mt-8 text-center">
              <div className="inline-flex items-center px-3 py-1 bg-green-900/30 border border-green-500/30 rounded-full text-sm text-green-400">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2"></div>
                Auto-refreshing every 30 seconds
              </div>
            </div>
          </>
        )}

        {!selectedValidator && !loading && (
          <div className="text-center py-12">
            <Search className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <h2 className="text-xl font-semibold mb-2 text-gray-400">Search for a Validator</h2>
            <p className="text-gray-500">Enter a validator name or paste a validator pubkey to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}