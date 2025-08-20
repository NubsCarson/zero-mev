'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, TrendingUp, Activity, Zap, GitCompare, Users, BarChart3, ChevronUp, ChevronDown, Filter } from 'lucide-react';
import Link from 'next/link';
import { getValidatorStats, getValidatorProgramUsage, triggerValidatorIngestion, ProgramUsage, ValidatorStats } from '@/lib/api';
import { getProgramColor, getProgramName, isProgramKnown } from '@/lib/programs';
import { useBlacklist } from '@/contexts/BlacklistContext';

interface ComparisonData {
  program_id: string;
  validator1_invocations: number; // Actually blocks_used for display
  validator1_percentage: number; // Block coverage percentage
  validator1_cu: number;
  validator1_blocks: number;
  validator2_invocations: number; // Actually blocks_used for display
  validator2_percentage: number; // Block coverage percentage
  validator2_cu: number;
  validator2_blocks: number;
  difference_invocations: number; // Actually blocks difference
  difference_percentage: number; // Block coverage percentage difference
}

export default function ComparePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const validator1Id = params.validator1 as string;
  const validator2Id = params.validator2 as string;
  const timeRange = searchParams.get('timeRange') || '24h';
  
  const [validator1Programs, setValidator1Programs] = useState<ProgramUsage[]>([]);
  const [validator2Programs, setValidator2Programs] = useState<ProgramUsage[]>([]);
  const [validator1Stats, setValidator1Stats] = useState<ValidatorStats | null>(null);
  const [validator2Stats, setValidator2Stats] = useState<ValidatorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyKnown, setShowOnlyKnown] = useState(false);
  const [sortField, setSortField] = useState<'program' | 'validator1' | 'validator2' | 'difference'>('difference');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    fetchData();
  }, [validator1Id, validator2Id, timeRange]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [
        validator1ProgramData,
        validator1StatsData,
        validator2ProgramData,
        validator2StatsData
      ] = await Promise.all([
        getValidatorProgramUsage(validator1Id, timeRange),
        getValidatorStats(validator1Id, timeRange),
        getValidatorProgramUsage(validator2Id, timeRange),
        getValidatorStats(validator2Id, timeRange)
      ]);
      
      // Check if we got data for both validators
      const validator1HasData = validator1ProgramData.length > 0 || validator1StatsData.length > 0;
      const validator2HasData = validator2ProgramData.length > 0 || validator2StatsData.length > 0;
      
      if (!validator1HasData || !validator2HasData) {
        // Trigger ingestion for validators without data
        const ingestionPromises = [];
        
        if (!validator1HasData) {
          console.log(`No data found for validator1 ${validator1Id}, triggering ingestion...`);
          ingestionPromises.push(triggerValidatorIngestion(validator1Id, timeRange));
        }
        
        if (!validator2HasData) {
          console.log(`No data found for validator2 ${validator2Id}, triggering ingestion...`);
          ingestionPromises.push(triggerValidatorIngestion(validator2Id, timeRange));
        }
        
        await Promise.all(ingestionPromises);
        
        // Set current data (might be empty) and show loading message
        setValidator1Programs(validator1ProgramData);
        setValidator1Stats(validator1StatsData[0] || null);
        setValidator2Programs(validator2ProgramData);
        setValidator2Stats(validator2StatsData[0] || null);
        
        // Start polling for both validators
        setIsPolling(true);
        pollForData(!validator1HasData, !validator2HasData);
        
        if (!validator1HasData && !validator2HasData) {
          setError('Data is being fetched for both validators. This should complete in a minute or two.');
        } else if (!validator1HasData) {
          setError('Data is being fetched for the first validator. This should complete in a minute or two.');
        } else {
          setError('Data is being fetched for the second validator. This should complete in a minute or two.');
        }
      } else {
        // We have data for both validators
        setValidator1Programs(validator1ProgramData);
        setValidator1Stats(validator1StatsData[0] || null);
        setValidator2Programs(validator2ProgramData);
        setValidator2Stats(validator2StatsData[0] || null);
      }
    } catch (err) {
      console.error('Error fetching comparison data:', err);
      setError('Failed to fetch validator comparison data');
    } finally {
      setLoading(false);
    }
  };

  const pollForData = async (needsValidator1Data: boolean, needsValidator2Data: boolean) => {
    let attempts = 0;
    const maxAttempts = 30; // Poll for up to 5 minutes (10 second intervals)
    
    const poll = async () => {
      attempts++;
      
      try {
        const [
          validator1ProgramData,
          validator1StatsData,
          validator2ProgramData,
          validator2StatsData
        ] = await Promise.all([
          getValidatorProgramUsage(validator1Id, timeRange),
          getValidatorStats(validator1Id, timeRange),
          getValidatorProgramUsage(validator2Id, timeRange),
          getValidatorStats(validator2Id, timeRange)
        ]);
        
        const validator1HasData = validator1ProgramData.length > 0 || validator1StatsData.length > 0;
        const validator2HasData = validator2ProgramData.length > 0 || validator2StatsData.length > 0;
        
        const hasRequiredData = (!needsValidator1Data || validator1HasData) && (!needsValidator2Data || validator2HasData);
        
        if (hasRequiredData) {
          // Data found! Update the UI
          console.log('✅ Ingestion completed, refreshing comparison data...');
          setIsPolling(false);
          setError(null);
          
          setValidator1Programs(validator1ProgramData);
          setValidator1Stats(validator1StatsData[0] || null);
          setValidator2Programs(validator2ProgramData);
          setValidator2Stats(validator2StatsData[0] || null);
          setLoading(false);
        } else if (attempts < maxAttempts) {
          // No data yet, continue polling
          setTimeout(poll, 10000); // Poll every 10 seconds
        } else {
          // Max attempts reached
          setIsPolling(false);
          setError('Ingestion is taking longer than expected. Please try refreshing the page.');
        }
      } catch (pollError) {
        console.error('Error polling for comparison data:', pollError);
        if (attempts < maxAttempts) {
          // Exponential backoff on errors
          const delay = Math.min(10000 * Math.pow(1.5, Math.min(attempts - 1, 4)), 60000); // Max 60s
          setTimeout(poll, delay);
        } else {
          setIsPolling(false);
          setError('Failed to load data after multiple attempts. Auto-refreshing page...');
          // Auto-refresh page after 5 seconds
          setTimeout(() => {
            window.location.reload();
          }, 5000);
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

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortValue = (comparison: ComparisonData, field: typeof sortField) => {
    switch (field) {
      case 'program':
        return getProgramName(comparison.program_id).toLowerCase();
      case 'validator1':
        return comparison.validator1_invocations;
      case 'validator2':
        return comparison.validator2_invocations;
      case 'difference':
        return Math.abs(comparison.difference_invocations);
      default:
        return 0;
    }
  };

  // Create and filter comparison data
  const createComparisonData = (): ComparisonData[] => {
    const programMap = new Map<string, ComparisonData>();
    
    // Calculate total blocks for each validator for percentage calculation
    const validator1TotalBlocks = validator1Stats?.blocks_produced || 0;
    const validator2TotalBlocks = validator2Stats?.blocks_produced || 0;
    
    // Add validator1 programs
    validator1Programs.forEach(program => {
      const blockCoverage = validator1TotalBlocks > 0 ? (Number(program.blocks_used) / validator1TotalBlocks) * 100 : 0;
      programMap.set(program.program_id, {
        program_id: program.program_id,
        validator1_invocations: Number(program.blocks_used), // Now represents blocks used
        validator1_percentage: blockCoverage,
        validator1_cu: Number(program.total_cu_consumed),
        validator1_blocks: Number(program.blocks_used),
        validator2_invocations: 0,
        validator2_percentage: 0,
        validator2_cu: 0,
        validator2_blocks: 0,
        difference_invocations: 0,
        difference_percentage: 0,
      });
    });
    
    // Add validator2 programs
    validator2Programs.forEach(program => {
      const blockCoverage = validator2TotalBlocks > 0 ? (Number(program.blocks_used) / validator2TotalBlocks) * 100 : 0;
      const existing = programMap.get(program.program_id);
      if (existing) {
        existing.validator2_invocations = Number(program.blocks_used); // Now represents blocks used
        existing.validator2_percentage = blockCoverage;
        existing.validator2_cu = Number(program.total_cu_consumed);
        existing.validator2_blocks = Number(program.blocks_used);
      } else {
        programMap.set(program.program_id, {
          program_id: program.program_id,
          validator1_invocations: 0,
          validator1_percentage: 0,
          validator1_cu: 0,
          validator1_blocks: 0,
          validator2_invocations: Number(program.blocks_used), // Now represents blocks used
          validator2_percentage: blockCoverage,
          validator2_cu: Number(program.total_cu_consumed),
          validator2_blocks: Number(program.blocks_used),
          difference_invocations: 0,
          difference_percentage: 0,
        });
      }
    });
    
    // Calculate differences and sort by total usage
    const comparisonData = Array.from(programMap.values()).map(item => ({
      ...item,
      difference_invocations: item.validator1_invocations - item.validator2_invocations, // Now blocks difference
      difference_percentage: item.validator1_percentage - item.validator2_percentage,
    }));
    
    return comparisonData;
  };

  // Get blacklist hook
  const { isBlacklisted } = useBlacklist();

  // Filter and sort comparison data
  const getFilteredAndSortedData = (): ComparisonData[] => {
    let filteredData = createComparisonData();
    
    // Apply blacklist filter
    filteredData = filteredData.filter(item => !isBlacklisted(item.program_id));
    
    // Apply known programs filter
    if (showOnlyKnown) {
      filteredData = filteredData.filter(item => isProgramKnown(item.program_id));
    }
    
    // Apply sorting
    const sortedData = [...filteredData].sort((a, b) => {
      const aValue = getSortValue(a, sortField);
      const bValue = getSortValue(b, sortField);
      
      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else {
        comparison = Number(aValue) - Number(bValue);
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return sortedData;
  };

  const comparisonData = getFilteredAndSortedData();

  const getDifferenceColor = (diff: number) => {
    if (diff > 0) return 'text-green-400';
    if (diff < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const getDifferenceIcon = (diff: number) => {
    if (diff > 0) return '+';
    if (diff < 0) return '';
    return '=';
  };

  // Sortable header component
  const SortableHeader = ({ field, children, className = "" }: { field: typeof sortField; children: React.ReactNode; className?: string }) => {
    const isActive = sortField === field;
    return (
      <th 
        className={`px-6 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors ${className}`}
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center justify-center space-x-1">
          <span>{children}</span>
          {isActive && (
            sortDirection === 'asc' ? 
              <ChevronUp className="h-3 w-3" /> : 
              <ChevronDown className="h-3 w-3" />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link 
                href={`/validator/${validator1Id}?timeRange=${timeRange}`}
                className="p-2 rounded-md bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-300" />
              </Link>
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gray-800 rounded-md">
                  <GitCompare className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Validator Comparison</h1>
                  <p className="text-sm text-gray-400">Program usage comparison analysis</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Time Range</p>
              <p className="text-lg font-semibold text-white">{timeRange.toUpperCase()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Validator Info Cards */}
      {validator1Stats && validator2Stats && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Validator 1 */}
            <div className="bg-gray-900 rounded-md border border-gray-800 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-gray-800 rounded-md">
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white">Validator A</h3>
                  <p className="text-xs text-gray-400 font-mono truncate">{validator1Id}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Blocks</p>
                  <p className="text-xl font-bold text-white">{formatNumber(validator1Stats.blocks_produced)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Programs</p>
                  <p className="text-lg font-bold text-white">{validator1Programs.length}</p>
                </div>
              </div>
            </div>

            {/* Validator 2 */}
            <div className="bg-gray-900 rounded-md border border-gray-800 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-gray-800 rounded-md">
                  <Users className="h-5 w-5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white">Validator B</h3>
                  <p className="text-xs text-gray-400 font-mono truncate">{validator2Id}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Blocks</p>
                  <p className="text-xl font-bold text-white">{formatNumber(validator2Stats.blocks_produced)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Programs</p>
                  <p className="text-lg font-bold text-white">{validator2Programs.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-gray-900 rounded-md border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Program Usage Comparison</h2>
                <p className="text-sm text-gray-400">
                  Side-by-side comparison of program invocations • {comparisonData.length} unique programs
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={showOnlyKnown}
                    onChange={(e) => setShowOnlyKnown(e.target.checked)}
                    className="rounded border-gray-700 bg-gray-800 text-gray-400 focus:ring-gray-600 focus:ring-offset-gray-900"
                  />
                  <span>Known programs only</span>
                  <Filter className="h-4 w-4 text-gray-400" />
                </label>
              </div>
            </div>
          </div>
          
          {loading ? (
            <div className="p-8 text-center text-gray-400">
              {isPolling ? 'Waiting for blockchain data ingestion to complete...' : 'Loading comparison data...'}
              {isPolling && (
                <div className="mt-2 text-sm text-gray-500">
                  This usually takes 1-2 minutes. The page will auto-refresh when ready.
                </div>
              )}
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">
              {error}
              <div className="mt-4">
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  Refresh Now
                </button>
              </div>
              {isPolling && (
                <div className="mt-2 text-sm text-gray-500">
                  Auto-refreshing in progress...
                </div>
              )}
            </div>
          ) : comparisonData.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No program data available for comparison
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900/50">
                  <tr>
                    <SortableHeader field="program" className="text-left text-gray-400">
                      Program
                    </SortableHeader>
                    <SortableHeader field="validator1" className="text-center text-blue-400">
                      Validator A
                    </SortableHeader>
                    <SortableHeader field="validator2" className="text-center text-purple-400">
                      Validator B
                    </SortableHeader>
                    <SortableHeader field="difference" className="text-center text-gray-400">
                      Difference
                    </SortableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {comparisonData.map((comparison) => {
                    const programName = getProgramName(comparison.program_id);
                    const colorClass = getProgramColor(comparison.program_id);
                    
                    return (
                      <tr key={comparison.program_id} className="hover:bg-gray-800 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${colorClass}`} />
                            <div>
                              <div className="text-sm font-medium text-white">
                                {programName}
                              </div>
                              <div className="text-xs text-gray-400 font-mono">
                                {comparison.program_id.substring(0, 8)}...{comparison.program_id.substring(comparison.program_id.length - 6)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="text-sm text-white font-semibold">
                            {formatNumber(comparison.validator1_invocations)}
                          </div>
                          <div className="text-xs text-gray-400">
                            {formatPercentage(comparison.validator1_percentage)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="text-sm text-white font-semibold">
                            {formatNumber(comparison.validator2_invocations)}
                          </div>
                          <div className="text-xs text-gray-400">
                            {formatPercentage(comparison.validator2_percentage)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className={`text-sm font-semibold ${getDifferenceColor(comparison.difference_invocations)}`}>
                            {getDifferenceIcon(comparison.difference_invocations)}{formatNumber(Math.abs(comparison.difference_invocations))}
                          </div>
                          <div className={`text-xs ${getDifferenceColor(comparison.difference_percentage)}`}>
                            {getDifferenceIcon(comparison.difference_percentage)}{formatPercentage(Math.abs(comparison.difference_percentage))}
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