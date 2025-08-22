'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  getBlacklistedPrograms, 
  addToBlacklist as apiAddToBlacklist,
  removeFromBlacklist as apiRemoveFromBlacklist,
  clearBlacklist as apiClearBlacklist,
  BlacklistedProgram
} from '@/lib/api';

interface BlacklistContextType {
  blacklistedPrograms: Set<string>;
  addToBlacklist: (programId: string, reason?: string) => Promise<void>;
  removeFromBlacklist: (programId: string) => Promise<void>;
  isBlacklisted: (programId: string) => boolean;
  clearBlacklist: () => Promise<void>;
  getBlacklistArray: () => string[];
  loading: boolean;
  error: string | null;
  refreshBlacklist: () => Promise<void>;
}

const BlacklistContext = createContext<BlacklistContextType | undefined>(undefined);

export const useBlacklist = () => {
  const context = useContext(BlacklistContext);
  if (!context) {
    throw new Error('useBlacklist must be used within a BlacklistProvider');
  }
  return context;
};

export const BlacklistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [blacklistedPrograms, setBlacklistedPrograms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load blacklist from server on mount
  const loadBlacklist = async () => {
    try {
      setLoading(true);
      setError(null);
      const programs = await getBlacklistedPrograms();
      const programIds = programs.map(p => p.program_id);
      setBlacklistedPrograms(new Set(programIds));
    } catch (err: any) {
      console.error('Failed to load blacklist from server:', err);
      setError('Failed to load blacklist');
      // Fallback to localStorage if server fails
      const saved = localStorage.getItem('program-blacklist');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setBlacklistedPrograms(new Set(parsed));
        } catch (localError) {
          console.error('Failed to parse blacklist from localStorage:', localError);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBlacklist();
  }, []);

  // Backup to localStorage for offline access
  useEffect(() => {
    if (!loading) {
      localStorage.setItem('program-blacklist', JSON.stringify(Array.from(blacklistedPrograms)));
    }
  }, [blacklistedPrograms, loading]);

  const addToBlacklist = async (programId: string, reason: string = '') => {
    try {
      await apiAddToBlacklist(programId, reason);
      setBlacklistedPrograms(prev => new Set([...prev, programId]));
      setError(null);
    } catch (err: any) {
      console.error('Failed to add to blacklist:', err);
      setError(err.response?.data?.error || 'Failed to add to blacklist');
      throw err;
    }
  };

  const removeFromBlacklist = async (programId: string) => {
    try {
      await apiRemoveFromBlacklist(programId);
      setBlacklistedPrograms(prev => {
        const newSet = new Set(prev);
        newSet.delete(programId);
        return newSet;
      });
      setError(null);
    } catch (err: any) {
      console.error('Failed to remove from blacklist:', err);
      setError(err.response?.data?.error || 'Failed to remove from blacklist');
      throw err;
    }
  };

  const isBlacklisted = (programId: string) => {
    return blacklistedPrograms.has(programId);
  };

  const clearBlacklist = async () => {
    try {
      await apiClearBlacklist();
      setBlacklistedPrograms(new Set());
      setError(null);
    } catch (err: any) {
      console.error('Failed to clear blacklist:', err);
      setError(err.response?.data?.error || 'Failed to clear blacklist');
      throw err;
    }
  };

  const getBlacklistArray = () => {
    return Array.from(blacklistedPrograms);
  };

  const refreshBlacklist = async () => {
    await loadBlacklist();
  };

  return (
    <BlacklistContext.Provider
      value={{
        blacklistedPrograms,
        addToBlacklist,
        removeFromBlacklist,
        isBlacklisted,
        clearBlacklist,
        getBlacklistArray,
        loading,
        error,
        refreshBlacklist,
      }}
    >
      {children}
    </BlacklistContext.Provider>
  );
};