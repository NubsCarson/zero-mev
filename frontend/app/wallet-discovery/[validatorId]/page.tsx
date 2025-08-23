'use client';

import { useState, useEffect, use, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { searchWallets, WalletSearchResult, triggerValidatorIngestion, getValidatorStats, ValidatorStats } from '@/lib/api';
import { Wallet, User, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface WalletDiscoveryPageProps {
  params: Promise<{
    validatorId: string;
  }>;
}

export default function WalletDiscoveryPage({ params }: WalletDiscoveryPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [wallets, setWallets] = useState<WalletSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(searchParams.get('timeRange') || '24h');
  const [totalTxns, setTotalTxns] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [validatorStats, setValidatorStats] = useState<ValidatorStats | null>(null);
  const walletsPerPage = 50;

  const resolvedParams = use(params);
  const decodedValidatorId = decodeURIComponent(resolvedParams.validatorId);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when loading new data
    loadWallets();
    loadValidatorStats();
  }, [decodedValidatorId, timeRange]);

  const loadValidatorStats = async () => {
    try {
      const stats = await getValidatorStats(decodedValidatorId, timeRange);
      if (stats && stats.length > 0) {
        setValidatorStats(stats[0]);
      }
    } catch (error) {
      console.error('Error loading validator stats:', error);
    }
  };

  const loadWallets = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const results = await searchWallets(decodedValidatorId, timeRange);
      // Sort by slots (blocks_interacted) instead of transaction count
      const sortedResults = results.sort((a, b) => Number(b.blocks_interacted) - Number(a.blocks_interacted));
      setWallets(sortedResults);
      
      // Calculate totals for percentages (sum of wallet activity) - fix string issue
      const txnTotal = results.reduce((sum, w) => sum + Number(w.total_transactions), 0);
      const blockTotal = results.reduce((sum, w) => sum + Number(w.blocks_interacted), 0);
      console.log(`Wallet totals - Txns: ${txnTotal}, Slots: ${blockTotal}, Wallets: ${results.length}`);
      setTotalTxns(txnTotal);
      setTotalBlocks(blockTotal);
      
      if (results.length === 0) {
        // No wallets found, try to trigger historical data ingestion
        console.log(`No wallets found for validator ${decodedValidatorId}, triggering ingestion...`);
        
        try {
          await triggerValidatorIngestion(decodedValidatorId, timeRange);
          
          // Wait a moment for ingestion to start, then retry
          setTimeout(async () => {
            try {
              const retryResults = await searchWallets(decodedValidatorId, timeRange);
              // Sort by slots (blocks_interacted) instead of transaction count
              const sortedRetryResults = retryResults.sort((a, b) => Number(b.blocks_interacted) - Number(a.blocks_interacted));
              setWallets(sortedRetryResults);
              
              // Calculate totals for percentages for retry results - fix string issue
              const retryTxnTotal = retryResults.reduce((sum, w) => sum + Number(w.total_transactions), 0);
              const retryBlockTotal = retryResults.reduce((sum, w) => sum + Number(w.blocks_interacted), 0);
              setTotalTxns(retryTxnTotal);
              setTotalBlocks(retryBlockTotal);
              
              if (retryResults.length === 0) {
                setError('No wallets found interacting with this validator in the selected timeframe. Historical data ingestion has been triggered - please check back in a few minutes.');
              } else {
                setError(null);
              }
            } catch (retryError) {
              console.error('Error on retry:', retryError);
              setError('Historical data ingestion triggered. Please check back in a few minutes for updated results.');
            }
          }, 3000); // Wait 3 seconds before retry
          
          setError('Fetching historical data from blockchain... This may take a few moments.');
        } catch (ingestError) {
          console.error('Failed to trigger ingestion:', ingestError);
          setError('No wallets found interacting with this validator in the selected timeframe');
        }
      }
    } catch (error) {
      console.error('Error loading wallets:', error);
      setError('Failed to load wallets. Please check the validator address and try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };



  const handleTimeRangeChange = (newTimeRange: string) => {
    setTimeRange(newTimeRange);
    // Update URL params
    const params = new URLSearchParams(searchParams.toString());
    params.set('timeRange', newTimeRange);
    router.replace(`/wallet-discovery/${encodeURIComponent(decodedValidatorId)}?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Link 
              href="/wallet-discovery"
              className="flex items-center text-gray-400 hover:text-gray-300 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Wallet Discovery
            </Link>
          </div>
        </div>

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-100 mb-2">
            Wallets Interacting with Validator
          </h1>
          <div className="flex items-center space-x-2 text-gray-400 mb-4">
            <User className="h-4 w-4" />
            <span className="font-mono text-sm">{decodedValidatorId}</span>
            <span className="text-xs">({timeRange})</span>
          </div>
          
          {/* Validator Stats */}
          {validatorStats && (
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-900 border border-gray-800 rounded-lg">
              <div className="text-center">
                <div className="text-xl font-bold text-blue-400">
                  {formatNumber(validatorStats.total_transactions)}
                </div>
                <div className="text-xs text-gray-500">Total Transactions</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-green-400">
                  {formatNumber(wallets.length)}
                </div>
                <div className="text-xs text-gray-500">Unique Wallets</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-yellow-400">
                  {formatNumber(validatorStats.blocks_produced)}
                </div>
                <div className="text-xs text-gray-500">Slots Produced</div>
              </div>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-3 text-gray-400">Loading wallets...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-red-400 text-center py-12 bg-red-950/20 border border-red-800/30 rounded-lg">
            {error}
          </div>
        )}

        {/* Results */}
        {wallets.length > 0 && !loading && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-gray-400">
                Found {formatNumber(wallets.length)} wallets
              </div>
              {wallets.length > walletsPerPage && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm bg-gray-800 text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-400">
                    Page {currentPage} of {Math.ceil(wallets.length / walletsPerPage)}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(Math.ceil(wallets.length / walletsPerPage), currentPage + 1))}
                    disabled={currentPage === Math.ceil(wallets.length / walletsPerPage)}
                    className="px-3 py-1 text-sm bg-gray-800 text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
            
            <div className="space-y-3">
              {wallets
                .slice((currentPage - 1) * walletsPerPage, currentPage * walletsPerPage)
                .map((wallet) => (
                <div
                  key={wallet.wallet_address}
                  className="w-full p-5 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <Wallet className="h-5 w-5 text-gray-500" />
                      <div className="font-mono text-sm text-gray-200">
                        {wallet.wallet_address}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-8">
                      <div className="flex flex-col">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-sm font-medium text-gray-300">
                            {formatNumber(wallet.total_transactions)}
                          </div>
                          {validatorStats && validatorStats.total_transactions > 0 && (
                            <div className="text-sm font-bold text-blue-400">
                              {((Number(wallet.total_transactions) / validatorStats.total_transactions) * 100).toFixed(2)}%
                            </div>
                          )}
                        </div>
                        {validatorStats && validatorStats.total_transactions > 0 && (
                          <div className="w-full bg-gray-800 rounded-full h-2 mb-1">
                            <div 
                              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                              style={{ 
                                width: `${Math.min(100, (Number(wallet.total_transactions) / validatorStats.total_transactions) * 100)}%` 
                              }}
                            ></div>
                          </div>
                        )}
                        <div className="text-xs text-gray-500">Transactions</div>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-sm font-medium text-gray-300">
                            {formatNumber(wallet.blocks_interacted)}
                          </div>
                          {validatorStats && validatorStats.blocks_produced > 0 && (
                            <div className="text-sm font-bold text-green-400">
                              {((Number(wallet.blocks_interacted) / validatorStats.blocks_produced) * 100).toFixed(1)}%
                            </div>
                          )}
                        </div>
                        {validatorStats && validatorStats.blocks_produced > 0 && (
                          <div className="w-full bg-gray-800 rounded-full h-2 mb-1">
                            <div 
                              className="bg-green-500 h-2 rounded-full transition-all duration-300"
                              style={{ 
                                width: `${Math.min(100, (Number(wallet.blocks_interacted) / validatorStats.blocks_produced) * 100)}%` 
                              }}
                            ></div>
                          </div>
                        )}
                        <div className="text-xs text-gray-500">Slots</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}