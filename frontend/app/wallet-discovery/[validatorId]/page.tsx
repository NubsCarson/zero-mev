'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { searchWallets, WalletSearchResult } from '@/lib/api';
import { Wallet, User, ArrowLeft, Loader2, Copy, Check } from 'lucide-react';
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
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const resolvedParams = use(params);
  const decodedValidatorId = decodeURIComponent(resolvedParams.validatorId);

  useEffect(() => {
    loadWallets();
  }, [decodedValidatorId, timeRange]);

  const loadWallets = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const results = await searchWallets(decodedValidatorId, timeRange, 100);
      setWallets(results);
      
      if (results.length === 0) {
        setError('No wallets found interacting with this validator in the selected timeframe');
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

  const formatAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  const handleCopyAddress = async (walletAddress: string) => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopiedAddress(walletAddress);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
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
          <div className="flex items-center space-x-2 text-gray-400">
            <User className="h-4 w-4" />
            <span className="font-mono text-sm">{formatAddress(decodedValidatorId)}</span>
            <span className="text-xs">({timeRange})</span>
          </div>
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
            <div className="mb-4 text-sm text-gray-400">
              Found {formatNumber(wallets.length)} wallets
            </div>
            
            <div className="space-y-3">
              {wallets.map((wallet) => (
                <div
                  key={wallet.wallet_address}
                  className="w-full p-4 bg-gray-900 border border-gray-800 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Wallet className="h-5 w-5 text-gray-500" />
                      <div className="flex items-center space-x-2">
                        <div className="font-mono text-sm text-gray-200">
                          {formatAddress(wallet.wallet_address)}
                        </div>
                        <button
                          onClick={() => handleCopyAddress(wallet.wallet_address)}
                          className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                          title="Copy wallet address"
                        >
                          {copiedAddress === wallet.wallet_address ? (
                            <Check className="h-4 w-4 text-green-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6 text-right">
                      <div>
                        <div className="text-sm font-medium text-gray-300">
                          {formatNumber(wallet.total_transactions)}
                        </div>
                        <div className="text-xs text-gray-500">Transactions</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-300">
                          {formatNumber(wallet.blocks_interacted)}
                        </div>
                        <div className="text-xs text-gray-500">Blocks</div>
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