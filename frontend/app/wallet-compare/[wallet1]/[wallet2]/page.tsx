'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, GitCompare, Users, BarChart3, ChevronUp, ChevronDown, Filter, Wallet } from 'lucide-react';
import Link from 'next/link';
import { 
  getWalletStats, 
  getWalletProgramUsage, 
  triggerWalletIngestion, 
  WalletProgramUsage, 
  WalletStats 
} from '@/lib/api';
import { getProgramColor, getProgramName, isProgramKnown } from '@/lib/programs';
import { useBlacklist } from '@/contexts/BlacklistContext';
import { BlacklistManager } from '@/components/BlacklistManager';

interface ComparisonData {
  program_id: string;
  wallet1_invocations: number;
  wallet1_cu: number;
  wallet1_transactions: number;
  wallet2_invocations: number;
  wallet2_cu: number;
  wallet2_transactions: number;
  difference_invocations: number;
}

export default function WalletComparePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const wallet1Address = params.wallet1 as string;
  const wallet2Address = params.wallet2 as string;
  const timeRange = searchParams.get('timeRange') || '24h';
  
  const [wallet1Programs, setWallet1Programs] = useState<WalletProgramUsage[]>([]);
  const [wallet2Programs, setWallet2Programs] = useState<WalletProgramUsage[]>([]);
  const [wallet1Stats, setWallet1Stats] = useState<WalletStats | null>(null);
  const [wallet2Stats, setWallet2Stats] = useState<WalletStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyKnown, setShowOnlyKnown] = useState(false);
  const [sortField, setSortField] = useState<'program' | 'wallet1' | 'wallet2' | 'difference'>('difference');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    fetchData();
  }, [wallet1Address, wallet2Address, timeRange]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Trigger ingestion for both wallets
      await Promise.all([
        triggerWalletIngestion(wallet1Address, timeRange),
        triggerWalletIngestion(wallet2Address, timeRange)
      ]);

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      const [
        wallet1ProgramData,
        wallet1StatsData,
        wallet2ProgramData,
        wallet2StatsData
      ] = await Promise.all([
        getWalletProgramUsage(wallet1Address, timeRange),
        getWalletStats(wallet1Address, timeRange),
        getWalletProgramUsage(wallet2Address, timeRange),
        getWalletStats(wallet2Address, timeRange)
      ]);
      
      const wallet1HasData = wallet1ProgramData.length > 0 || wallet1StatsData.length > 0;
      const wallet2HasData = wallet2ProgramData.length > 0 || wallet2StatsData.length > 0;
      
      if (!wallet1HasData || !wallet2HasData) {
        setWallet1Programs(wallet1ProgramData);
        setWallet1Stats(wallet1StatsData[0] || null);
        setWallet2Programs(wallet2ProgramData);
        setWallet2Stats(wallet2StatsData[0] || null);
        
        setIsPolling(true);
        pollForData(!wallet1HasData, !wallet2HasData);
        
        if (!wallet1HasData && !wallet2HasData) {
          setError('Data is being fetched for both wallets. This should complete in a minute or two.');
        } else if (!wallet1HasData) {
          setError('Data is being fetched for the first wallet. This should complete in a minute or two.');
        } else {
          setError('Data is being fetched for the second wallet. This should complete in a minute or two.');
        }
      } else {
        setWallet1Programs(wallet1ProgramData);
        setWallet1Stats(wallet1StatsData[0] || null);
        setWallet2Programs(wallet2ProgramData);
        setWallet2Stats(wallet2StatsData[0] || null);
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch wallet comparison data');
      setLoading(false);
    }
  };

  const pollForData = async (pollWallet1: boolean, pollWallet2: boolean) => {
    let attempts = 0;
    const maxAttempts = 30;
    
    const poll = async () => {
      attempts++;
      
      try {
        const promises = [];
        
        if (pollWallet1) {
          promises.push(
            getWalletStats(wallet1Address, timeRange),
            getWalletProgramUsage(wallet1Address, timeRange)
          );
        }
        
        if (pollWallet2) {
          promises.push(
            getWalletStats(wallet2Address, timeRange),
            getWalletProgramUsage(wallet2Address, timeRange)
          );
        }
        
        const results = await Promise.all(promises);
        
        let resultsIndex = 0;
        
        if (pollWallet1) {
          const wallet1StatsData = results[resultsIndex++];
          const wallet1ProgramData = results[resultsIndex++];
          
          if (wallet1StatsData.length > 0 || wallet1ProgramData.length > 0) {
            setWallet1Stats(wallet1StatsData[0] || null);
            setWallet1Programs(wallet1ProgramData);
            pollWallet1 = false;
          }
        }
        
        if (pollWallet2) {
          const wallet2StatsData = results[resultsIndex++];
          const wallet2ProgramData = results[resultsIndex++];
          
          if (wallet2StatsData.length > 0 || wallet2ProgramData.length > 0) {
            setWallet2Stats(wallet2StatsData[0] || null);
            setWallet2Programs(wallet2ProgramData);
            pollWallet2 = false;
          }
        }
        
        if (!pollWallet1 && !pollWallet2) {
          setIsPolling(false);
          setError(null);
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

  // Create comparison data
  const createComparisonData = (): ComparisonData[] => {
    const allPrograms = new Set([
      ...wallet1Programs.map(p => p.program_id),
      ...wallet2Programs.map(p => p.program_id)
    ]);

    return Array.from(allPrograms).map(programId => {
      const wallet1Program = wallet1Programs.find(p => p.program_id === programId);
      const wallet2Program = wallet2Programs.find(p => p.program_id === programId);

      return {
        program_id: programId,
        wallet1_invocations: wallet1Program?.total_invocations || 0,
        wallet1_cu: wallet1Program?.total_cu_consumed || 0,
        wallet1_transactions: wallet1Program?.transaction_count || 0,
        wallet2_invocations: wallet2Program?.total_invocations || 0,
        wallet2_cu: wallet2Program?.total_cu_consumed || 0,
        wallet2_transactions: wallet2Program?.transaction_count || 0,
        difference_invocations: (wallet1Program?.total_invocations || 0) - (wallet2Program?.total_invocations || 0)
      };
    });
  };

  const formatNumber = (num: string | number) => {
    return Number(num).toLocaleString();
  };

  const formatSOL = (lamports: number) => {
    const sol = lamports / 1_000_000_000;
    return sol.toFixed(4);
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortValue = (data: ComparisonData, field: typeof sortField) => {
    switch (field) {
      case 'program':
        return getProgramName(data.program_id).toLowerCase();
      case 'wallet1':
        const wallet1TotalTxns = Number(wallet1Stats?.total_transactions || 0);
        return wallet1TotalTxns > 0 ? (data.wallet1_transactions / wallet1TotalTxns) * 100 : 0;
      case 'wallet2':
        const wallet2TotalTxns = Number(wallet2Stats?.total_transactions || 0);
        return wallet2TotalTxns > 0 ? (data.wallet2_transactions / wallet2TotalTxns) * 100 : 0;
      case 'difference':
        const w1Total = Number(wallet1Stats?.total_transactions || 0);
        const w2Total = Number(wallet2Stats?.total_transactions || 0);
        const w1Coverage = w1Total > 0 ? (data.wallet1_transactions / w1Total) * 100 : 0;
        const w2Coverage = w2Total > 0 ? (data.wallet2_transactions / w2Total) * 100 : 0;
        return Math.abs(w1Coverage - w2Coverage);
      default:
        return 0;
    }
  };

  const { isBlacklisted } = useBlacklist();

  const comparisonData = createComparisonData();
  
  const filteredAndSortedData = comparisonData
    .filter(data => {
      if (isBlacklisted(data.program_id)) return false;
      if (showOnlyKnown && !isProgramKnown(data.program_id)) return false;
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
                <h1 className="text-xl font-bold text-white flex items-center space-x-2">
                  <GitCompare className="h-5 w-5" />
                  <span>Wallet Comparison</span>
                </h1>
                <p className="text-sm text-gray-400 mt-1">
                  Comparing program usage between two wallets
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Time Range</p>
              <p className="text-lg font-semibold text-white">{timeRange.toUpperCase()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Wallet 1 Card */}
          <div className="bg-gray-900 rounded-md p-6 border border-gray-800">
            <div className="flex items-center space-x-2 mb-4">
              <Wallet className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Wallet 1</h3>
            </div>
            <p className="text-xs text-gray-400 font-mono mb-4">
              {wallet1Address}
            </p>
            {wallet1Stats && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Transactions</p>
                  <p className="text-xl font-bold text-white">
                    {formatNumber(wallet1Stats.total_transactions)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Programs Used</p>
                  <p className="text-xl font-bold text-white">
                    {wallet1Stats.unique_programs_used}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Compute Units</p>
                  <p className="text-xl font-bold text-white">
                    {formatNumber(wallet1Stats.total_cu_consumed)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Fees Paid</p>
                  <p className="text-xl font-bold text-white">
                    {formatSOL(wallet1Stats.total_fees_paid)} SOL
                  </p>
                </div>
              </div>
            )}
            <Link
              href={`/wallet/${wallet1Address}?timeRange=${timeRange}`}
              className="mt-4 inline-flex items-center text-sm text-blue-400 hover:text-blue-300"
            >
              View Details →
            </Link>
          </div>

          {/* Wallet 2 Card */}
          <div className="bg-gray-900 rounded-md p-6 border border-gray-800">
            <div className="flex items-center space-x-2 mb-4">
              <Wallet className="h-5 w-5 text-green-400" />
              <h3 className="text-lg font-semibold text-white">Wallet 2</h3>
            </div>
            <p className="text-xs text-gray-400 font-mono mb-4">
              {wallet2Address}
            </p>
            {wallet2Stats && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Transactions</p>
                  <p className="text-xl font-bold text-white">
                    {formatNumber(wallet2Stats.total_transactions)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Programs Used</p>
                  <p className="text-xl font-bold text-white">
                    {wallet2Stats.unique_programs_used}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Compute Units</p>
                  <p className="text-xl font-bold text-white">
                    {formatNumber(wallet2Stats.total_cu_consumed)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Fees Paid</p>
                  <p className="text-xl font-bold text-white">
                    {formatSOL(wallet2Stats.total_fees_paid)} SOL
                  </p>
                </div>
              </div>
            )}
            <Link
              href={`/wallet/${wallet2Address}?timeRange=${timeRange}`}
              className="mt-4 inline-flex items-center text-sm text-green-400 hover:text-green-300"
            >
              View Details →
            </Link>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-gray-900 rounded-md border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Program Usage Comparison</h2>
                <p className="text-sm text-gray-400">
                  Showing {filteredAndSortedData.length} of {comparisonData.length} programs
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
              {isPolling ? 'Fetching wallet data...' : 'Loading comparison data...'}
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">
              {error}
            </div>
          ) : filteredAndSortedData.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No programs to compare
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <SortableHeader field="program">Program</SortableHeader>
                    <SortableHeader field="wallet1">
                      <span className="text-blue-400">Wallet 1 Coverage</span>
                    </SortableHeader>
                    <SortableHeader field="wallet2">
                      <span className="text-green-400">Wallet 2 Coverage</span>
                    </SortableHeader>
                    <SortableHeader field="difference">Difference</SortableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredAndSortedData.map((data) => {
                    const programName = getProgramName(data.program_id);
                    const colorClass = getProgramColor(data.program_id);
                    
                    // Calculate transaction coverage percentages
                    const wallet1TotalTxns = Number(wallet1Stats?.total_transactions || 0);
                    const wallet2TotalTxns = Number(wallet2Stats?.total_transactions || 0);
                    const wallet1Coverage = wallet1TotalTxns > 0 ? (data.wallet1_transactions / wallet1TotalTxns) * 100 : 0;
                    const wallet2Coverage = wallet2TotalTxns > 0 ? (data.wallet2_transactions / wallet2TotalTxns) * 100 : 0;
                    const coverageDiff = wallet1Coverage - wallet2Coverage;
                    
                    return (
                      <tr key={data.program_id} className="hover:bg-gray-800 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${colorClass}`} />
                            <div>
                              <div className="text-sm font-medium text-white">
                                {programName}
                              </div>
                              <div className="text-xs text-gray-400 font-mono">
                                {data.program_id.slice(0, 8)}...
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="text-sm text-white font-semibold">
                              {wallet1Coverage.toFixed(2)}%
                            </div>
                            <div className="ml-3 flex-1 max-w-[80px]">
                              <div className="bg-gray-800 rounded-full h-2">
                                <div 
                                  className="h-2 rounded-full bg-blue-500"
                                  style={{ width: `${Math.min(wallet1Coverage, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="text-sm text-white font-semibold">
                              {wallet2Coverage.toFixed(2)}%
                            </div>
                            <div className="ml-3 flex-1 max-w-[80px]">
                              <div className="bg-gray-800 rounded-full h-2">
                                <div 
                                  className="h-2 rounded-full bg-green-500"
                                  style={{ width: `${Math.min(wallet2Coverage, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm font-semibold ${
                            coverageDiff > 0 ? 'text-blue-400' : 
                            coverageDiff < 0 ? 'text-green-400' : 
                            'text-gray-400'
                          }`}>
                            {coverageDiff > 0 && '+'}
                            {coverageDiff.toFixed(2)}%
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