'use client';

import { useState } from 'react';
import { Star, Radio, Search, Settings, BarChart3, ArrowLeft } from 'lucide-react';
import LiveBlockStream from '@/components/LiveBlockStream';
import BlockAnalysis from '@/components/BlockAnalysis';
import ValidatorExplorer from '@/components/ValidatorExplorer';
import CategoryLegend from '@/components/CategoryLegend';

export default function BlockExplorer() {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'stream' | 'search' | 'validators'>('stream');

  const handleBlockClick = (slot: number) => {
    setSelectedSlot(slot);
    setActiveTab('search');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Star className="w-6 h-6" />
                Solana Block Explorer
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Real-time blockchain monitoring and analysis
              </p>
            </div>
            <a
              href="/"
              className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/90 transition-colors border border-border flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </a>
          </div>
        </div>
      </div>

      {/* Navigation and Content */}
      <div className="container mx-auto px-6 py-6">
        {/* Program Categories Dropdown */}
        <div className="mb-4">
          <CategoryLegend isDropdown={true} />
        </div>

        {/* Navigation Tabs */}
        <div className="mb-6">
          <div className="flex space-x-1 bg-card p-1 rounded-lg border border-border max-w-2xl">
            <button
              onClick={() => setActiveTab('stream')}
              className={`flex-1 px-4 py-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'stream'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:text-foreground hover:bg-muted/90'
              }`}
            >
              <Radio className="w-5 h-5" />
              Live Stream
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`flex-1 px-4 py-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'search'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:text-foreground hover:bg-muted/90'
              }`}
            >
              <Search className="w-5 h-5" />
              Block Search
            </button>
            <button
              onClick={() => setActiveTab('validators')}
              className={`flex-1 px-4 py-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'validators'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:text-foreground hover:bg-muted/90'
              }`}
            >
              <Settings className="w-5 h-5" />
              Validators
            </button>
          </div>
        </div>

        {/* Full Width Content Area */}
        <div className="w-full">
          {activeTab === 'stream' && (
            <LiveBlockStream onBlockClick={handleBlockClick} />
          )}

          {activeTab === 'search' && (
            <BlockAnalysis initialSlot={selectedSlot || undefined} />
          )}

          {activeTab === 'validators' && (
            <ValidatorExplorer onBlockClick={handleBlockClick} />
          )}
        </div>
      </div>
    </div>
  );
}