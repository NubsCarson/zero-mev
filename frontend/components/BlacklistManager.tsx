'use client';

import React, { useState } from 'react';
import { X, Plus, Trash2, Settings } from 'lucide-react';
import { useBlacklist } from '@/contexts/BlacklistContext';
import { getProgramName } from '@/lib/programs';

interface BlacklistManagerProps {
  className?: string;
}

export const BlacklistManager: React.FC<BlacklistManagerProps> = ({ className = '' }) => {
  const { getBlacklistArray, addToBlacklist, removeFromBlacklist, clearBlacklist } = useBlacklist();
  const [isOpen, setIsOpen] = useState(false);
  const [newProgramId, setNewProgramId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const blacklistedPrograms = getBlacklistArray();

  const handleAddProgram = () => {
    const programId = newProgramId.trim();
    if (!programId) {
      setError('Please enter a program ID');
      return;
    }

    // Basic validation for Solana program ID format (base58, ~44 characters)
    if (programId.length < 32 || programId.length > 44) {
      setError('Invalid program ID format');
      return;
    }

    if (blacklistedPrograms.includes(programId)) {
      setError('Program already blacklisted');
      return;
    }

    addToBlacklist(programId);
    setNewProgramId('');
    setError(null);
  };

  const handleRemoveProgram = (programId: string) => {
    removeFromBlacklist(programId);
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all blacklisted programs?')) {
      clearBlacklist();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddProgram();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 rounded-md border border-gray-700 transition-colors"
      >
        <Settings className="h-4 w-4 text-gray-300" />
        <span className="text-sm text-gray-300">Program Blacklist</span>
        {blacklistedPrograms.length > 0 && (
          <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">
            {blacklistedPrograms.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-96 bg-gray-900 border border-gray-700 rounded-md shadow-lg z-50">
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Program Blacklist</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-700 rounded"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              Hide specific programs from all search results and comparisons
            </p>
            
            <div className="flex space-x-2">
              <input
                type="text"
                value={newProgramId}
                onChange={(e) => setNewProgramId(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter program ID to blacklist..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-sm text-gray-100 text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-600 focus:border-gray-600"
              />
              <button
                onClick={handleAddProgram}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-100 rounded-sm transition-colors border border-gray-700"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            
            {error && (
              <p className="text-red-400 text-sm mt-2">{error}</p>
            )}
          </div>

          <div className="p-4">
            {blacklistedPrograms.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">
                No programs blacklisted
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-300">
                    Blacklisted Programs ({blacklistedPrograms.length})
                  </span>
                  <button
                    onClick={handleClearAll}
                    className="text-red-400 hover:text-red-300 text-sm flex items-center space-x-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Clear All</span>
                  </button>
                </div>
                
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {blacklistedPrograms.map((programId) => (
                    <div
                      key={programId}
                      className="flex items-center justify-between p-2 bg-gray-800 rounded-sm border border-gray-700"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {getProgramName(programId)}
                        </div>
                        <div className="text-xs text-gray-400 font-mono truncate">
                          {programId}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveProgram(programId)}
                        className="ml-2 p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-sm"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};