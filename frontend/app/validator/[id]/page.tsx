'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, Activity, Zap, Copy, Check, ChevronUp, ChevronDown, GitCompare } from 'lucide-react';
import Link from 'next/link';
import { getValidatorStats, getValidatorProgramUsage, getValidatorStatsQuick, getValidatorProgramUsageQuick, searchValidators, triggerValidatorIngestion, ProgramUsage, ValidatorStats } from '@/lib/api';
import { getProgramColor, getProgramName, isProgramKnown } from '@/lib/programs';
import { useBlacklist } from '@/contexts/BlacklistContext';

export default function ValidatorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const validatorId = params.id as string;
  const timeRange = searchParams.get('timeRange') || '24h';
  
  const [programs, setPrograms] = useState<ProgramUsage[]>([]);
  const [stats, setStats] = useState<ValidatorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [showOnlyKnown, setShowOnlyKnown] = useState(false);
  const [sortField, setSortField] = useState<'program' | 'invocations' | 'percentage' | 'computeUnits' | 'blocksUsed'>('invocations');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [compareValidator, setCompareValidator] = useState('');
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [historicalDataLoaded, setHistoricalDataLoaded] = useState(false);
  const [apiPollingInterval, setApiPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Reset state when validator or timeRange changes
    setHistoricalDataLoaded(false);
    
    // Clear any existing polling interval
    if (apiPollingInterval) {
      clearInterval(apiPollingInterval);
      setApiPollingInterval(null);
    }
    
    fetchData();
  }, [validatorId, timeRange]);


  // API polling effect - starts after historical data is loaded
  useEffect(() => {
    if (!historicalDataLoaded) {
      return;
    }

    console.log(`📊 Starting API polling for regular updates...`);
    
    const pollApiForUpdates = async () => {
      try {
        const [newStatsData, newProgramData] = await Promise.all([
          getValidatorStatsQuick(validatorId, timeRange),
          getValidatorProgramUsageQuick(validatorId, timeRange)
        ]);

        // Update stats if we have new data
        if (newStatsData.length > 0) {
          const newStats = newStatsData[0];
          setStats(prevStats => {
            // Only update if the data has actually changed
            if (!prevStats || 
                Number(newStats.blocks_produced) !== Number(prevStats.blocks_produced) ||
                Number(newStats.total_transactions) !== Number(prevStats.total_transactions)) {
              console.log(`📊 Updated stats: ${newStats.blocks_produced} blocks, ${newStats.total_transactions} transactions`);
              return newStats;
            }
            return prevStats;
          });
        }

        // Update programs if we have new data
        if (newProgramData.length > 0) {
          setPrograms(prevPrograms => {
            // Check if program data has changed
            if (prevPrograms.length !== newProgramData.length) {
              console.log(`📊 Updated programs: ${newProgramData.length} total programs`);
              return newProgramData.sort((a, b) => 
                Number(b.total_invocations) - Number(a.total_invocations)
              );
            }
            
            // Check if any individual program data has changed
            const hasChanges = newProgramData.some(newProgram => {
              const existingProgram = prevPrograms.find(p => p.program_id === newProgram.program_id);
              return !existingProgram || 
                     Number(existingProgram.total_invocations) !== Number(newProgram.total_invocations) ||
                     Number(existingProgram.total_cu_consumed) !== Number(newProgram.total_cu_consumed);
            });
            
            if (hasChanges) {
              console.log(`📊 Updated program data with new invocations/CU`);
              return newProgramData.sort((a, b) => 
                Number(b.total_invocations) - Number(a.total_invocations)
              );
            }
            
            return prevPrograms;
          });
        }
      } catch (error) {
        console.error('Error polling API for updates:', error);
      }
    };

    // Poll every 30 seconds for API updates
    const interval = setInterval(pollApiForUpdates, 30000);
    setApiPollingInterval(interval);

    // Cleanup
    return () => {
      if (interval) {
        clearInterval(interval);
      }
      setApiPollingInterval(null);
    };
  }, [validatorId, timeRange, historicalDataLoaded]);

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      if (apiPollingInterval) {
        clearInterval(apiPollingInterval);
      }
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`🔍 Fetching data for validator ${validatorId} (${timeRange})`);
      
      // Always trigger ingestion first to ensure we have the latest data for the timeframe
      console.log(`📥 Triggering historical data ingestion for ${timeRange}...`);
      await triggerValidatorIngestion(validatorId, timeRange);
      
      // Small delay to let ingestion start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Now try to get data from database
      const [programData, statsData] = await Promise.all([
        getValidatorProgramUsage(validatorId, timeRange),
        getValidatorStats(validatorId, timeRange)
      ]);
      
      // Check if we got any data after ingestion
      const hasData = programData.length > 0 || statsData.length > 0;
      
      if (!hasData) {
        // Still no data, start polling
        console.log(`⏳ Waiting for historical data ingestion to complete...`);
        setError('Fetching historical blockchain data for the selected timeframe. This should complete in a minute or two.');
        
        setIsPolling(true);
        pollForData();
      } else {
        console.log(`✅ Found ${programData.length} programs and ${statsData.length ? 'validator stats' : 'no stats'}`);
        
        // Sort programs by invocation count (descending)
        const sortedPrograms = programData.sort((a, b) => 
          Number(b.total_invocations) - Number(a.total_invocations)
        );
        
        setPrograms(sortedPrograms);
        setStats(statsData[0] || null);
        setLoading(false);
        
        // Data loaded successfully, now we can start API polling
        console.log(`📊 Historical data loaded, starting API polling...`);
        setHistoricalDataLoaded(true);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      
      // Handle timeout specifically
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        console.log(`⏳ Initial data fetch timed out, but ingestion is running. Starting polling...`);
        setError('Data ingestion in progress. This usually takes 1-2 minutes for the initial load.');
        setIsPolling(true);
        pollForData();
      } else {
        setError('Failed to fetch validator data');
        setLoading(false);
      }
    }
  };

  const pollForData = async () => {
    let attempts = 0;
    const maxAttempts = 30; // Poll for up to 5 minutes (10 second intervals)
    
    const poll = async () => {
      attempts++;
      
      try {
        const [statsData, programData] = await Promise.all([
          getValidatorStatsQuick(validatorId, timeRange),
          getValidatorProgramUsageQuick(validatorId, timeRange)
        ]);
        
        const hasData = statsData.length > 0 || programData.length > 0;
        
        if (hasData) {
          // Data found! Update the UI
          console.log('✅ Ingestion completed, refreshing data...');
          setIsPolling(false);
          setError(null);
          
          const sortedPrograms = programData.sort((a, b) => 
            Number(b.total_invocations) - Number(a.total_invocations)
          );
          
          setPrograms(sortedPrograms);
          setStats(statsData[0] || null);
          setLoading(false);
          setHistoricalDataLoaded(true);
        } else if (attempts < maxAttempts) {
          // No data yet, continue polling
          setTimeout(poll, 10000); // Poll every 10 seconds
        } else {
          // Max attempts reached
          setIsPolling(false);
          setError('Ingestion is taking longer than expected. Please try refreshing the page.');
        }
      } catch (pollError) {
        console.error('Error polling for data:', pollError);
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        } else {
          setIsPolling(false);
          setError('Failed to check for new data. Please try refreshing the page.');
        }
      }
    };
    
    // Start polling after 30 seconds to give ingestion time to start
    setTimeout(poll, 30000);
  };

  const formatNumber = (num: string | number) => {
    return Number(num).toLocaleString();
  };

  const formatPercentage = (num: string | number) => {
    return Number(num).toFixed(2) + '%';
  };

  // Calculate percentage based on total invocations
  const calculatePercentage = (program: ProgramUsage, allPrograms: ProgramUsage[]) => {
    const totalInvocations = allPrograms.reduce((sum, p) => sum + Number(p.total_invocations), 0);
    return totalInvocations > 0 ? (Number(program.total_invocations) / totalInvocations) * 100 : 0;
  };

  // Calculate blocks used percentage based on validator's total blocks produced
  const calculateBlocksPercentage = (program: ProgramUsage) => {
    const validatorTotalBlocks = Number(stats?.blocks_produced || 0);
    return validatorTotalBlocks > 0 ? (Number(program.blocks_used) / validatorTotalBlocks) * 100 : 0;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAddress(text);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortValue = (program: ProgramUsage, field: typeof sortField) => {
    switch (field) {
      case 'program':
        return getProgramName(program.program_id).toLowerCase();
      case 'invocations':
        return Number(program.total_invocations);
      case 'percentage':
        return calculatePercentage(program, programs);
      case 'computeUnits':
        return Number(program.total_cu_consumed);
      case 'blocksUsed':
        return calculateBlocksPercentage(program);
      default:
        return 0;
    }
  };

  // Get blacklist hook
  const { isBlacklisted } = useBlacklist();

  // Filter and sort programs
  const filteredAndSortedPrograms = programs
    .filter(program => {
      // Apply blacklist filter
      if (isBlacklisted(program.program_id)) return false;
      // Apply known programs filter
      if (showOnlyKnown && !isProgramKnown(program.program_id)) return false;
      return true;
    })
    .sort((a, b) => {
      // Primary sort: Always by block coverage percentage (highest to lowest)
      const aBlocksPercentage = calculateBlocksPercentage(a);
      const bBlocksPercentage = calculateBlocksPercentage(b);
      
      if (aBlocksPercentage !== bBlocksPercentage) {
        return bBlocksPercentage - aBlocksPercentage; // Higher percentage first
      }
      
      // Secondary sort: Use the current sort field and direction for programs with same percentage
      const aValue = getSortValue(a, sortField);
      const bValue = getSortValue(b, sortField);
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      return sortDirection === 'asc' 
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });

  const SortableHeader = ({ field, children }: { field: typeof sortField, children: React.ReactNode }) => (
    <th 
      className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-300 transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        <div className="flex flex-col">
          <ChevronUp 
            className={`h-3 w-3 ${sortField === field && sortDirection === 'asc' ? 'text-gray-300' : 'text-gray-600'}`} 
          />
          <ChevronDown 
            className={`h-3 w-3 -mt-1 ${sortField === field && sortDirection === 'desc' ? 'text-gray-300' : 'text-gray-600'}`} 
          />
        </div>
      </div>
    </th>
  );

  const handleCompare = async () => {
    if (compareValidator.trim().length === 0) {
      setCompareError('Please enter a validator address to compare');
      return;
    }

    setCompareLoading(true);
    setCompareError(null);
    
    try {
      const compareValidatorId = compareValidator.trim();
      
      // Check if the comparison validator exists
      const validators = await searchValidators(compareValidatorId);
      
      if (validators.length === 0) {
        // Validator not found in database, trigger fresh data ingestion
        console.log(`Validator ${compareValidatorId} not found, triggering ingestion...`);
        
        try {
          await triggerValidatorIngestion(compareValidatorId, timeRange);
          
          // Wait a moment for ingestion to start, then proceed to comparison
          setTimeout(() => {
            router.push(`/compare/${encodeURIComponent(validatorId)}/${encodeURIComponent(compareValidatorId)}?timeRange=${timeRange}`);
          }, 2000);
          
        } catch (ingestError) {
          console.error('Failed to trigger ingestion:', ingestError);
          setCompareError('Failed to fetch validator data. Please check the address and try again.');
        }
      } else {
        // Validator found, navigate to comparison page
        const foundValidatorId = validators[0].validator_identity;
        router.push(`/compare/${encodeURIComponent(validatorId)}/${encodeURIComponent(foundValidatorId)}?timeRange=${timeRange}`);
      }
    } catch (error) {
      console.error('Compare validation error:', error);
      setCompareError('Failed to validate comparison validator. Please try again.');
    } finally {
      setCompareLoading(false);
    }
  };

  const handleCompareKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCompare();
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link 
                href="/"
                className="p-2 rounded-md bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-300" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white">Validator Program Analysis</h1>
                <p className="text-sm text-gray-400 font-mono">{validatorId}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Time Range</p>
              <p className="text-lg font-semibold text-white">{timeRange.toUpperCase()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards Section */}
      {stats && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 rounded-md p-4 border border-gray-800">
              <div>
                <p className="text-gray-400 text-sm">Blocks Produced</p>
                <p className="text-2xl font-bold text-white">
                  {formatNumber(stats?.blocks_produced || 0)}
                </p>
              </div>
            </div>
            <div className="bg-gray-900 rounded-md p-4 border border-gray-800">
              <div>
                <p className="text-gray-400 text-sm">Total Transactions</p>
                <p className="text-2xl font-bold text-white">
                  {formatNumber(stats?.total_transactions || 0)}
                </p>
              </div>
            </div>
            <div className="bg-gray-900 rounded-md p-4 border border-gray-800">
              <div>
                <p className="text-gray-400 text-sm">Unique Programs</p>
                <p className="text-2xl font-bold text-white">{programs.length}</p>
                {apiPollingInterval && (
                  <p className="text-xs text-gray-500">
                    Live data active
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-gray-900 rounded-md border border-gray-800 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-gray-800 rounded-md">
              <GitCompare className="h-5 w-5 text-gray-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Compare Validators</h3>
              <p className="text-sm text-gray-400">Compare program usage patterns with another validator</p>
            </div>
          </div>
          
          <div className="flex flex-col space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={compareValidator}
                  onChange={(e) => {
                    setCompareValidator(e.target.value);
                    setCompareError(null);
                  }}
                  onKeyPress={handleCompareKeyPress}
                  placeholder="Enter validator address to compare against..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-md focus:ring-1 focus:ring-gray-600 focus:border-gray-600 text-gray-100 placeholder-gray-400"
                />
              </div>
              <button
                onClick={handleCompare}
                disabled={compareLoading}
                className="px-6 py-3 bg-gray-800 text-gray-100 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2 border border-gray-700"
              >
                <GitCompare className="h-4 w-4" />
                <span>{compareLoading ? 'Validating...' : 'Compare'}</span>
              </button>
            </div>
            
            {compareError && (
              <div className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-md p-3">
                {compareError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Program List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-gray-900 rounded-md border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Program Block Coverage</h2>
                <p className="text-sm text-gray-400">
                  Sorted by block coverage (high to low), then by {sortField === 'program' ? 'program name' : sortField} ({sortDirection === 'desc' ? 'high to low' : 'low to high'}) • Showing {filteredAndSortedPrograms.length} of {programs.length} programs
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-400">Show only known programs</span>
                <button
                  onClick={() => setShowOnlyKnown(!showOnlyKnown)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    showOnlyKnown ? 'bg-gray-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      showOnlyKnown ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
          
          {loading ? (
            <div className="p-8 text-center text-gray-400">
              {isPolling ? 'Waiting for blockchain data ingestion to complete...' : 'Loading program data...'}
              {isPolling && (
                <div className="mt-2 text-sm text-gray-500">
                  This usually takes 1-2 minutes. The page will auto-refresh when ready.
                </div>
              )}
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">
              {error}
              {isPolling && (
                <div className="mt-2 text-sm text-gray-500">
                  Auto-refreshing in progress...
                </div>
              )}
            </div>
          ) : filteredAndSortedPrograms.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              {showOnlyKnown ? 'No known programs found' : 'No program data available'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <SortableHeader field="program">Program</SortableHeader>
                    <SortableHeader field="blocksUsed">Block Coverage</SortableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredAndSortedPrograms.map((program, index) => {
                    const isKnown = isProgramKnown(program.program_id);
                    const programName = getProgramName(program.program_id);
                    const colorClass = getProgramColor(program.program_id);
                    
                    return (
                      <tr key={program.program_id} className="hover:bg-gray-800 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${colorClass}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-white">
                                {programName}
                              </div>
                              <div className="flex items-center space-x-2 mt-1">
                                <div className="text-xs text-gray-400 font-mono truncate">
                                  {program.program_id}
                                </div>
                                <button
                                  onClick={() => copyToClipboard(program.program_id)}
                                  className="flex-shrink-0 p-1 text-gray-400 hover:text-white transition-colors"
                                  title="Copy address"
                                >
                                  {copiedAddress === program.program_id ? (
                                    <Check className="h-3 w-3 text-gray-400" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="text-sm text-white font-semibold">
                              {formatPercentage(calculateBlocksPercentage(program))}
                            </div>
                            <div className="ml-3 flex-1 max-w-[120px]">
                              <div className="bg-gray-800 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full ${colorClass}`}
                                  style={{ width: `${Math.min(calculateBlocksPercentage(program), 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}