'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Clock, Hash, Hammer, Search, Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import HeaderNav from '@/components/HeaderNav';
import { formatProgramDisplay } from '@/lib/programRegistry';

interface ValidatorSlot {
  slot: number;
  block_time: string;
  total_invocations: number;
  unique_programs: number;
  programs: Array<{
    program_id: string;
    name: string;
    invocations: number;
  }>;
}

interface ValidatorHistory {
  stats: {
    validator: string;
    min_slot: number;
    max_slot: number;
    total_slots: number;
    total_invocations: number;
    unique_programs: number;
    first_block_time: string;
    last_block_time: string;
    slot_range: string;
    duration_days: number;
  } | null;
  programs: Array<{
    program_id: string;
    name: string;
    category: string;
    color: string;
    bgColor: string;
    invocations: number;
    percentage: number;
    slots_used: number;
    slot_percentage: number;
  }>;
}

export default function ValidatorDetailPage() {
  const params = useParams();
  const validator = params.validator as string;
  
  const [slots, setSlots] = useState<ValidatorSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalSlots, setTotalSlots] = useState(0);
  const [excludeBlacklisted, setExcludeBlacklisted] = useState(true);
  const [expandedSlots, setExpandedSlots] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<ValidatorHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showMorePrograms, setShowMorePrograms] = useState(0);
  
  const slotsPerPage = 50;

  const fetchValidatorSlots = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        validator,
        excludeBlacklisted: excludeBlacklisted.toString(),
        limit: slotsPerPage.toString(),
        offset: ((currentPage - 1) * slotsPerPage).toString(),
      });
      
      const response = await fetch(`/api/validator-slots?${params}`);
      const data = await response.json();
      
      if (response.ok) {
        setSlots(data.slots || []);
        setTotalSlots(parseInt(data.total) || 0);
      } else {
        console.error('API error:', data);
        setSlots([]);
      }
    } catch (error) {
      console.error('Error fetching validator slots:', error);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchValidatorHistory = async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        validator,
        excludeBlacklisted: excludeBlacklisted.toString(),
      });
      
      const response = await fetch(`/api/validator-history?${params}`);
      const data = await response.json();
      
      if (response.ok) {
        setHistory(data);
      } else {
        console.error('API error:', data);
        setHistory(null);
      }
    } catch (error) {
      console.error('Error fetching validator history:', error);
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchValidatorSlots();
    fetchValidatorHistory();
    setShowMorePrograms(0); // Reset when filters change
  }, [validator, currentPage, excludeBlacklisted]);

  const totalPages = Math.ceil(totalSlots / slotsPerPage);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const toggleSlotExpansion = (slot: number) => {
    setExpandedSlots(prev => {
      const newSet = new Set(prev);
      if (newSet.has(slot)) {
        newSet.delete(slot);
      } else {
        newSet.add(slot);
      }
      return newSet;
    });
  };

  const formatProgramName = (programId: string) => {
    const { programInfo } = formatProgramDisplay(programId);
    return programInfo.name;
  };

  return (
    <div className="min-h-screen bg-background">
      <HeaderNav 
        title="Validator Slot History"
        subtitle={`All slots processed by validator ${validator.slice(0, 12)}...${validator.slice(-12)}`}
      />
      
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Back button and filters */}
        <div className="bg-card p-6 rounded-lg mb-6 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <Link 
              href="/validators" 
              className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Validators
            </Link>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Hammer className="w-4 h-4" />
              <span className="font-mono">{validator}</span>
            </div>
          </div>

          <div className="flex items-center">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={excludeBlacklisted}
                onChange={(e) => {
                  setExcludeBlacklisted(e.target.checked);
                  setCurrentPage(1);
                }}
                className="mr-2"
              />
              <span className="text-sm">Exclude Blacklisted Programs</span>
            </label>
          </div>
        </div>

        {/* Full-Time History Summary */}
        {historyLoading ? (
          <div className="bg-card rounded-lg border border-border p-6 mb-6">
            <div className="animate-pulse">
              <div className="h-6 bg-muted rounded w-48 mb-4"></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-8 bg-muted rounded"></div>
                    <div className="h-4 bg-muted rounded w-20"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : history?.stats ? (
          <div className="bg-card rounded-lg border border-border mb-6">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5" />
                Full-Time History
              </h2>
              
              {/* Overall Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="text-2xl font-bold text-primary">{history.stats.slot_range}</div>
                  <div className="text-sm text-muted-foreground">Slot Range</div>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="text-2xl font-bold text-success">{formatNumber(history.stats.total_slots)}</div>
                  <div className="text-sm text-muted-foreground">Total Slots</div>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="text-2xl font-bold text-accent">{formatNumber(history.stats.total_invocations)}</div>
                  <div className="text-sm text-muted-foreground">Total Invocations</div>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-400">{history.stats.duration_days}</div>
                  <div className="text-sm text-muted-foreground">Days Active</div>
                </div>
              </div>

              {/* Program Usage */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Program Usage Distribution</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {history.programs.slice(0, 12 + showMorePrograms * 50).map((program) => (
                    <div
                      key={program.program_id}
                      className={`p-3 rounded-lg border ${program.bgColor} border-opacity-50 bg-opacity-30`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-medium ${program.color}`}>
                          {program.name}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${program.bgColor} ${program.color}`}>
                          {program.category}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {formatNumber(program.invocations)} calls
                          </span>
                          <span className="font-bold text-foreground">
                            {program.percentage}%
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {formatNumber(program.slots_used)} slots
                          </span>
                          <span className="font-bold text-foreground">
                            {program.slot_percentage}%
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="w-full bg-muted rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${program.bgColor} opacity-80`}
                              style={{ width: `${Math.min(program.percentage, 100)}%` }}
                            />
                          </div>
                          <div className="w-full bg-muted rounded-full h-1">
                            <div 
                              className={`h-1 rounded-full ${program.bgColor} opacity-60`}
                              style={{ width: `${Math.min(program.slot_percentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {history.programs.length > 12 + showMorePrograms * 50 && (
                  <div className="text-center space-x-2">
                    <button
                      onClick={() => setShowMorePrograms(prev => prev + 1)}
                      className="text-sm text-primary hover:text-primary/80 transition-colors px-4 py-2 rounded border border-border hover:bg-muted"
                    >
                      Show 50 more programs... ({history.programs.length - (12 + showMorePrograms * 50)} remaining)
                    </button>
                    <button
                      onClick={() => setShowMorePrograms(Math.ceil((history.programs.length - 12) / 50))}
                      className="text-sm text-accent hover:text-accent/80 transition-colors px-4 py-2 rounded border border-border hover:bg-muted"
                    >
                      Show all {history.programs.length} programs
                    </button>
                  </div>
                )}
                {showMorePrograms > 0 && (
                  <div className="text-center">
                    <button
                      onClick={() => setShowMorePrograms(0)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded border border-border hover:bg-muted"
                    >
                      Show fewer programs
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Stats summary */}
        {totalSlots > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-card rounded-lg p-4 border border-border">
              <div className="text-2xl font-bold text-primary">{formatNumber(totalSlots)}</div>
              <div className="text-sm text-muted-foreground">Recent Slots</div>
            </div>
            <div className="bg-card rounded-lg p-4 border border-border">
              <div className="text-2xl font-bold text-success">
                {formatNumber(slots.reduce((sum, s) => sum + s.total_invocations, 0))}
              </div>
              <div className="text-sm text-muted-foreground">Recent Invocations</div>
            </div>
            <div className="bg-card rounded-lg p-4 border border-border">
              <div className="text-2xl font-bold text-accent">
                {slots.length > 0 ? formatNumber(Math.max(...slots.map(s => s.unique_programs))) : 0}
              </div>
              <div className="text-sm text-muted-foreground">Max Programs/Slot</div>
            </div>
          </div>
        )}

        {/* Slots table */}
        <div className="bg-card rounded-lg border border-border">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Hash className="w-5 h-5" />
              Slot History
            </h2>
            {totalSlots > 0 && (
              <div className="text-sm text-muted-foreground mt-1">
                Showing {((currentPage - 1) * slotsPerPage) + 1} - {Math.min(currentPage * slotsPerPage, totalSlots)} of {formatNumber(totalSlots)} slots
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-12 text-center text-muted-foreground">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
              Loading slot history...
            </div>
          ) : slots.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Hash className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <div className="text-lg mb-2">No slots found</div>
              <div className="text-sm">This validator has no recorded activity</div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium">Slot</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Block Time</th>
                      <th className="px-4 py-3 text-center text-sm font-medium">Invocations</th>
                      <th className="px-4 py-3 text-center text-sm font-medium">Programs</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Top Programs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {slots.map((slot) => {
                      const isExpanded = expandedSlots.has(slot.slot);
                      const totalInvocations = slot.total_invocations;
                      
                      return (
                        <React.Fragment key={slot.slot}>
                          <tr className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <Link 
                                href={`/explorer?slot=${slot.slot}`}
                                className="font-mono text-primary hover:underline"
                              >
                                {slot.slot.toLocaleString()}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 text-sm">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                {formatTime(slot.block_time)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-primary">
                              {formatNumber(slot.total_invocations)}
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-success">
                              {slot.unique_programs}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex flex-wrap gap-1">
                                  {slot.programs.slice(0, 3).map((program) => {
                                    const { programInfo } = formatProgramDisplay(program.program_id);
                                    return (
                                      <span 
                                        key={program.program_id}
                                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border ${programInfo.color} ${programInfo.bgColor} border-opacity-50`}
                                      >
                                        {programInfo.name} ({formatNumber(program.invocations)})
                                      </span>
                                    );
                                  })}
                                  {slot.programs.length > 3 && (
                                    <span className="text-xs text-muted-foreground">
                                      +{slot.programs.length - 3} more
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => toggleSlotExpansion(slot.slot)}
                                  className="ml-2 p-1 rounded hover:bg-muted transition-colors"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={5} className="px-4 py-4 bg-muted/20">
                                <div className="space-y-2">
                                  <h4 className="text-sm font-medium text-foreground mb-3">
                                    All Programs in Slot {slot.slot.toLocaleString()}
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {slot.programs.map((program) => {
                                      const { programInfo } = formatProgramDisplay(program.program_id);
                                      const actualTotal = slot.programs.reduce((sum, p) => sum + p.invocations, 0);
                                      const percentage = actualTotal > 0 ? (program.invocations / actualTotal) * 100 : 0;
                                      
                                      return (
                                        <div
                                          key={program.program_id}
                                          className={`p-2 rounded border ${programInfo.bgColor} border-opacity-50 bg-opacity-50`}
                                        >
                                          <div className="flex items-center justify-between mb-1">
                                            <span className={`text-xs font-medium ${programInfo.color}`}>
                                              {programInfo.name}
                                            </span>
                                            <span className={`text-xs px-1 py-0.5 rounded ${programInfo.bgColor} ${programInfo.color}`}>
                                              {programInfo.category}
                                            </span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">
                                              {formatNumber(program.invocations)} calls
                                            </span>
                                            <span className="text-xs font-bold text-foreground">
                                              {percentage.toFixed(1)}%
                                            </span>
                                          </div>
                                          <div className="mt-1">
                                            <div className="w-full bg-muted rounded-full h-1">
                                              <div 
                                                className={`h-1 rounded-full ${programInfo.bgColor} opacity-80`}
                                                style={{ width: `${Math.min(percentage, 100)}%` }}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Go to page:</span>
                    <input
                      type="number"
                      min="1"
                      max={totalPages}
                      value={currentPage}
                      onChange={(e) => {
                        const page = parseInt(e.target.value);
                        if (page >= 1 && page <= totalPages) {
                          setCurrentPage(page);
                        }
                      }}
                      className="w-20 px-2 py-1 text-sm bg-input border border-border rounded focus:border-ring focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}