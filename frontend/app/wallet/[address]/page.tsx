'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Wallet, Activity, Zap, Copy, Check, ChevronUp, ChevronDown, GitCompare, TrendingUp, Clock, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { 
  getWalletStats, 
  getWalletProgramUsage, 
  getWalletTransactions,
  getWalletStatsQuick, 
  getWalletProgramUsageQuick, 
  triggerWalletIngestion,
  WalletStats, 
  WalletProgramUsage,
  WalletTransaction 
} from '@/lib/api';
import { getProgramColor, getProgramName, isProgramKnown } from '@/lib/programs';
import { useBlacklist } from '@/contexts/BlacklistContext';
import { BlacklistManager } from '@/components/BlacklistManager';

export default function WalletPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const walletAddress = params.address as string;
  const timeRange = searchParams.get('timeRange') || '24h';
  
  const [programs, setPrograms] = useState<WalletProgramUsage[]>([]);
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [showOnlyKnown, setShowOnlyKnown] = useState(false);
  const [sortField, setSortField] = useState<'program' | 'transactions'>('transactions');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [compareWallet, setCompareWallet] = useState('');
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);

  useEffect(() => {
    fetchData();
  }, [walletAddress, timeRange]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`🔍 Fetching data for wallet ${walletAddress} (${timeRange})`);
      
      // Trigger ingestion first
      console.log(`📥 Triggering wallet data ingestion...`);
      await triggerWalletIngestion(walletAddress, timeRange);
      
      // Small delay to let ingestion start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Now try to get data
      const [programData, statsData, txData] = await Promise.all([
        getWalletProgramUsage(walletAddress, timeRange),
        getWalletStats(walletAddress, timeRange),
        getWalletTransactions(walletAddress, timeRange, 50)
      ]);
      
      const hasData = programData.length > 0 || statsData.length > 0;
      
      if (!hasData) {
        console.log(`⏳ Waiting for wallet data ingestion to complete...`);
        setError('Wallet data ingestion in progress. Please refresh the page in 1-2 minutes to see results.');
        setLoading(false);
        // Removed polling for accuracy - user should refresh manually
        // setIsPolling(true);
        // pollForData();
      } else {
        console.log(`✅ Found ${programData.length} programs and wallet stats`);
        
        const sortedPrograms = programData.sort((a, b) => 
          Number(b.total_invocations) - Number(a.total_invocations)
        );
        
        setPrograms(sortedPrograms);
        setStats(statsData[0] || null);
        setTransactions(txData);
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        console.log(`⏳ Initial data fetch timed out...`);
        setError('Data ingestion in progress. Please refresh the page in 1-2 minutes.');
        setLoading(false);
        // Removed polling for accuracy - user should refresh manually
        // setIsPolling(true);
        // pollForData();
      } else {
        setError('Failed to fetch wallet data');
        setLoading(false);
      }
    }
  };

  const pollForData = async () => {
    let attempts = 0;
    const maxAttempts = 30;
    
    const poll = async () => {
      attempts++;
      
      try {
        const [statsData, programData] = await Promise.all([
          getWalletStatsQuick(walletAddress, timeRange),
          getWalletProgramUsageQuick(walletAddress, timeRange)
        ]);
        
        const hasData = statsData.length > 0 || programData.length > 0;
        
        if (hasData) {
          console.log('✅ Ingestion completed, refreshing data...');
          setIsPolling(false);
          setError(null);
          
          const sortedPrograms = programData.sort((a, b) => 
            Number(b.total_invocations) - Number(a.total_invocations)
          );
          
          // Fetch transactions too
          const txData = await getWalletTransactions(walletAddress, timeRange, 50);
          
          setPrograms(sortedPrograms);
          setStats(statsData[0] || null);
          setTransactions(txData);
          setLoading(false);
        } else if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        } else {
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
    
    setTimeout(poll, 30000);
  };

  const formatNumber = (num: string | number) => {
    return Number(num).toLocaleString();
  };

  const formatSOL = (lamports: number) => {
    const sol = lamports / 1_000_000_000;
    return sol.toFixed(4);
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

  const getSortValue = (program: WalletProgramUsage, field: typeof sortField) => {
    switch (field) {
      case 'program':
        return getProgramName(program.program_id).toLowerCase();
      case 'transactions':
        const totalWalletTransactions = Number(stats?.total_transactions || 0);
        return totalWalletTransactions > 0 ? (Number(program.transaction_count) / totalWalletTransactions) * 100 : 0;
      default:
        return 0;
    }
  };

  const { isBlacklisted } = useBlacklist();

  const filteredAndSortedPrograms = programs
    .filter(program => {
      if (isBlacklisted(program.program_id)) return false;
      if (showOnlyKnown && !isProgramKnown(program.program_id)) return false;
      return true;
    })
    .sort((a, b) => {
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
    if (compareWallet.trim().length === 0) {
      setCompareError('Please enter a wallet address to compare');
      return;
    }

    setCompareLoading(true);
    setCompareError(null);
    
    router.push(`/wallet-compare/${encodeURIComponent(walletAddress)}/${encodeURIComponent(compareWallet.trim())}?timeRange=${timeRange}`);
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
                href="/wallet"
                className="p-2 rounded-md bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-300" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white">Wallet Analysis</h1>
                <div className="flex items-center space-x-2 mt-1">
                  <p className="text-sm text-gray-400 font-mono">{walletAddress}</p>
                  <button
                    onClick={() => copyToClipboard(walletAddress)}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                  >
                    {copiedAddress === walletAddress ? (
                      <Check className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
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

      {/* Stats Cards */}
      {stats && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-md p-4 border border-gray-800">
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-gray-500" />
                <p className="text-gray-400 text-sm">Transactions</p>
              </div>
              <p className="text-2xl font-bold text-white mt-1">
                {formatNumber(stats?.total_transactions || 0)}
              </p>
            </div>
            <div className="bg-gray-900 rounded-md p-4 border border-gray-800">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-gray-500" />
                <p className="text-gray-400 text-sm">Programs Used</p>
              </div>
              <p className="text-2xl font-bold text-white mt-1">
                {stats?.unique_programs_used || 0}
              </p>
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
              <h3 className="text-lg font-semibold text-white">Compare Wallets</h3>
              <p className="text-sm text-gray-400">Compare program usage patterns with another wallet</p>
            </div>
          </div>
          
          <div className="flex flex-col space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={compareWallet}
                  onChange={(e) => {
                    setCompareWallet(e.target.value);
                    setCompareError(null);
                  }}
                  onKeyPress={handleCompareKeyPress}
                  placeholder="Enter wallet address to compare against..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-md focus:ring-1 focus:ring-gray-600 focus:border-gray-600 text-gray-100 placeholder-gray-400"
                />
              </div>
              <button
                onClick={handleCompare}
                disabled={compareLoading}
                className="px-6 py-3 bg-gray-800 text-gray-100 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2 border border-gray-700"
              >
                <GitCompare className="h-4 w-4" />
                <span>{compareLoading ? 'Loading...' : 'Compare'}</span>
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

      {/* Program Usage List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-gray-900 rounded-md border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Program Transaction Coverage</h2>
                <p className="text-sm text-gray-400">
                  Sorted by {sortField === 'program' ? 'program name' : 'transaction coverage'} ({sortDirection === 'desc' ? 'high to low' : 'low to high'}) • Showing {filteredAndSortedPrograms.length} of {programs.length} programs
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
              {isPolling ? 'Fetching wallet transaction data...' : 'Loading program data...'}
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
                    <SortableHeader field="transactions">Transaction Coverage</SortableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredAndSortedPrograms.map((program) => {
                    const isKnown = isProgramKnown(program.program_id);
                    const programName = getProgramName(program.program_id);
                    const colorClass = getProgramColor(program.program_id);
                    const totalWalletTransactions = Number(stats?.total_transactions || 0);
                    const transactionPercentage = totalWalletTransactions > 0 ? (Number(program.transaction_count) / totalWalletTransactions) * 100 : 0;
                    
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
                              {formatNumber(program.transaction_count)} txns ({transactionPercentage.toFixed(2)}%)
                            </div>
                            <div className="ml-3 flex-1 max-w-[120px]">
                              <div className="bg-gray-800 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full ${colorClass}`}
                                  style={{ width: `${Math.min(transactionPercentage, 100)}%` }}
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

        {/* Blacklist Manager */}
        <div className="flex justify-center mt-8">
          <BlacklistManager />
        </div>
      </div>
    </div>
  );
}