'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SearchBar from '@/components/SearchBar';
import TimeRangeSelector from '@/components/TimeRangeSelector';
import { WalletBlacklistManager } from '@/components/WalletBlacklistManager';

export default function WalletDiscoveryPage() {
  const [timeRange, setTimeRange] = useState('24h');
  const router = useRouter();

  const handleValidatorSelect = (validatorId: string) => {
    router.push(`/wallet-discovery/${validatorId}?timeRange=${timeRange}`);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <div className="flex flex-col space-y-8">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-semibold text-gray-100 mb-3">
              Wallet Discovery
            </h1>
            <p className="text-gray-400 text-base">
              Enter a validator address to discover wallets that interacted with blocks from that validator
            </p>
            <div className="mt-4">
              <Link 
                href="/"
                className="inline-flex items-center px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-md text-sm text-gray-300 transition-colors"
              >
                ← Switch to Validator Search
              </Link>
            </div>
          </div>
          
          {/* Search and Time Range */}
          <div className="flex flex-col space-y-4">
            <SearchBar 
              timeRange={timeRange} 
              onValidatorSelect={handleValidatorSelect}
              placeholder="Enter validator address to discover wallets..."
            />
            <div className="flex justify-center">
              <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            </div>
          </div>
          
          {/* Blacklist Manager */}
          <div className="flex justify-center">
            <WalletBlacklistManager />
          </div>
        </div>
      </div>
    </div>
  );
}