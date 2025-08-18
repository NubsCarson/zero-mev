'use client';

import { useState } from 'react';
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
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">🌟 Solana Block Explorer</h1>
            <p className="text-gray-400">
              Explore live blocks, analyze program activity, and discover validator patterns
            </p>
          </div>
          <a
            href="/"
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6">
        <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('stream')}
            className={`flex-1 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'stream'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            📡 Live Stream
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'search'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            🔍 Block Search
          </button>
          <button
            onClick={() => setActiveTab('validators')}
            className={`flex-1 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'validators'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            🏗️ Validators
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          {activeTab === 'stream' && (
            <div>
              <LiveBlockStream onBlockClick={handleBlockClick} />
              <div className="mt-6">
                <div className="bg-gray-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-3">💡 How to Use</h3>
                  <div className="space-y-2 text-sm text-gray-400">
                    <p>• <strong>Live Stream:</strong> Watch blocks being processed in real-time</p>
                    <p>• <strong>Click any block</strong> to analyze its program activity</p>
                    <p>• <strong>Pause/Resume</strong> the stream using the toggle button</p>
                    <p>• <strong>Latest blocks</strong> appear at the top with a green highlight</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'search' && (
            <BlockAnalysis initialSlot={selectedSlot || undefined} />
          )}

          {activeTab === 'validators' && (
            <ValidatorExplorer onBlockClick={handleBlockClick} />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Program Categories Legend */}
          <CategoryLegend />

          {/* Quick Stats */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">📊 Quick Stats</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Network:</span>
                <span className="text-green-400">Mainnet</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Update Frequency:</span>
                <span>Every 2s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Data Source:</span>
                <span>Real-time RPC</span>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">🚀 Features</h3>
            <div className="space-y-3 text-sm text-gray-400">
              <div className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span>Live block progression with auto-refresh</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span>Detailed program activity analysis</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span>Validator performance tracking</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span>Color-coded program categories</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span>Search by block slot or validator</span>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 border border-blue-500/20 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-3 text-blue-300">💡 Pro Tips</h3>
            <div className="space-y-2 text-sm text-blue-200">
              <p>• Use the validator explorer to find patterns in block production</p>
              <p>• Look for spikes in program activity during high network usage</p>
              <p>• Compare program diversity across different validators</p>
              <p>• Monitor transaction efficiency (invocations per transaction)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}