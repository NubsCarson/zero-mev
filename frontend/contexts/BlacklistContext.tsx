'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface BlacklistContextType {
  blacklistedPrograms: Set<string>;
  addToBlacklist: (programId: string) => void;
  removeFromBlacklist: (programId: string) => void;
  isBlacklisted: (programId: string) => boolean;
  clearBlacklist: () => void;
  getBlacklistArray: () => string[];
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

  // Load blacklist from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('program-blacklist');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setBlacklistedPrograms(new Set(parsed));
      } catch (error) {
        console.error('Failed to parse blacklist from localStorage:', error);
      }
    }
  }, []);

  // Save to localStorage whenever blacklist changes
  useEffect(() => {
    localStorage.setItem('program-blacklist', JSON.stringify(Array.from(blacklistedPrograms)));
  }, [blacklistedPrograms]);

  const addToBlacklist = (programId: string) => {
    setBlacklistedPrograms(prev => new Set([...prev, programId]));
  };

  const removeFromBlacklist = (programId: string) => {
    setBlacklistedPrograms(prev => {
      const newSet = new Set(prev);
      newSet.delete(programId);
      return newSet;
    });
  };

  const isBlacklisted = (programId: string) => {
    return blacklistedPrograms.has(programId);
  };

  const clearBlacklist = () => {
    setBlacklistedPrograms(new Set());
  };

  const getBlacklistArray = () => {
    return Array.from(blacklistedPrograms);
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
      }}
    >
      {children}
    </BlacklistContext.Provider>
  );
};