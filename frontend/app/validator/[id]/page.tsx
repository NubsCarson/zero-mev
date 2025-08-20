'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, Activity, Zap, Copy, Check, ChevronUp, ChevronDown, GitCompare } from 'lucide-react';
import Link from 'next/link';
import { getValidatorStats, getValidatorProgramUsage, searchValidators, triggerValidatorIngestion, ProgramUsage, ValidatorStats } from '@/lib/api';
import { getProgramColor, getProgramName, isProgramKnown } from '@/lib/programs';

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

  useEffect(() => {
    fetchData();
  }, [validatorId, timeRange]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [programData, statsData] = await Promise.all([
        getValidatorProgramUsage(validatorId, timeRange),
        getValidatorStats(validatorId, timeRange)
      ]);
      
      // Check if we got any data
      const hasData = programData.length > 0 || statsData.length > 0;
      
      if (!hasData) {
        // No data found, trigger ingestion
        console.log(`No data found for validator ${validatorId}, triggering ingestion...`);
        
        try {
          await triggerValidatorIngestion(validatorId, timeRange);
          setError('Data is being fetched from the blockchain. This may take a few minutes. Please refresh the page in a moment.');
        } catch (ingestError) {
          console.error('Failed to trigger ingestion:', ingestError);
          setError('Failed to fetch validator data. Please check the address and try again.');
        }
      }
      
      // Sort programs by invocation count (descending)
      const sortedPrograms = programData.sort((a, b) => 
        Number(b.total_invocations) - Number(a.total_invocations)
      );
      
      setPrograms(sortedPrograms);
      setStats(statsData[0] || null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch validator data');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: string | number) => {
    return Number(num).toLocaleString();
  };

  const formatPercentage = (num: string | number) => {
    return Number(num).toFixed(2) + '%';
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
        return Number(program.avg_percentage);
      case 'computeUnits':
        return Number(program.total_cu_consumed);
      case 'blocksUsed':
        return Number(program.blocks_used);
      default:
        return 0;
    }
  };

  // Filter and sort programs
  const filteredAndSortedPrograms = (showOnlyKnown 
    ? programs.filter(program => isProgramKnown(program.program_id))
    : programs
  ).sort((a, b) => {
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
            className={`h-3 w-3 ${sortField === field && sortDirection === 'asc' ? 'text-blue-400' : 'text-gray-600'}`} 
          />
          <ChevronDown 
            className={`h-3 w-3 -mt-1 ${sortField === field && sortDirection === 'desc' ? 'text-blue-400' : 'text-gray-600'}`} 
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link 
                href="/"
                className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 transition-colors"
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

      {/* Stats Cards */}
      {stats && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Blocks Produced</p>
                  <p className="text-2xl font-bold text-white">{formatNumber(stats.blocks_produced)}</p>
                </div>
                <div className="p-3 bg-blue-500/20 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-blue-400" />
                </div>
              </div>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Transactions</p>
                  <p className="text-2xl font-bold text-white">{formatNumber(stats.total_transactions)}</p>
                </div>
                <div className="p-3 bg-green-500/20 rounded-lg">
                  <Activity className="h-6 w-6 text-green-400" />
                </div>
              </div>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Compute Units</p>
                  <p className="text-2xl font-bold text-white">{formatNumber(stats.total_cu_consumed)}</p>
                </div>
                <div className="p-3 bg-purple-500/20 rounded-lg">
                  <Zap className="h-6 w-6 text-purple-400" />
                </div>
              </div>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Unique Programs</p>
                  <p className="text-2xl font-bold text-white">{programs.length}</p>
                </div>
                <div className="p-3 bg-orange-500/20 rounded-lg">
                  <Activity className="h-6 w-6 text-orange-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <GitCompare className="h-5 w-5 text-blue-400" />
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
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-400"
                />
              </div>
              <button
                onClick={handleCompare}
                disabled={compareLoading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                <GitCompare className="h-4 w-4" />
                <span>{compareLoading ? 'Validating...' : 'Compare'}</span>
              </button>
            </div>
            
            {compareError && (
              <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg p-3">
                {compareError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Program List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Program Invocations</h2>
                <p className="text-sm text-gray-400">
                  Sorted by {sortField === 'program' ? 'program name' : 
                           sortField === 'invocations' ? 'invocation count' :
                           sortField === 'percentage' ? 'percentage' :
                           sortField === 'computeUnits' ? 'compute units' : 'blocks used'} ({sortDirection === 'desc' ? 'high to low' : 'low to high'}) • Showing {filteredAndSortedPrograms.length} of {programs.length} programs
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-400">Show only known programs</span>
                <button
                  onClick={() => setShowOnlyKnown(!showOnlyKnown)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    showOnlyKnown ? 'bg-blue-600' : 'bg-gray-600'
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
              Loading program data...
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">
              {error}
            </div>
          ) : filteredAndSortedPrograms.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              {showOnlyKnown ? 'No known programs found' : 'No program data available'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900/50">
                  <tr>
                    <SortableHeader field="program">Program</SortableHeader>
                    <SortableHeader field="invocations">Invocations</SortableHeader>
                    <SortableHeader field="percentage">Percentage</SortableHeader>
                    <SortableHeader field="computeUnits">Compute Units</SortableHeader>
                    <SortableHeader field="blocksUsed">Blocks Used</SortableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredAndSortedPrograms.map((program, index) => {
                    const isKnown = isProgramKnown(program.program_id);
                    const programName = getProgramName(program.program_id);
                    const colorClass = getProgramColor(program.program_id);
                    
                    return (
                      <tr key={program.program_id} className="hover:bg-gray-700/30 transition-colors">
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
                                    <Check className="h-3 w-3 text-green-400" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-white font-semibold">
                            {formatNumber(program.total_invocations)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="text-sm text-white">
                              {formatPercentage(program.avg_percentage)}
                            </div>
                            <div className="ml-2 flex-1 max-w-[100px]">
                              <div className="bg-gray-700 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full ${colorClass}`}
                                  style={{ width: `${Math.min(Number(program.avg_percentage), 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          {formatNumber(program.total_cu_consumed)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          {formatNumber(program.blocks_used)}
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