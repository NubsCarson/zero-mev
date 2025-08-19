'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowUpDown, Hammer, HelpCircle, TrendingUp, Users, BarChart3, Search } from 'lucide-react';
import ProgramTag from '@/components/ProgramTag';
import HeaderNav from '@/components/HeaderNav';

interface ValidatorProgram {
  program_id: string;
  name: string;
  invocations: number;
  percentage: number;
  category: string;
  color: string;
  bgColor: string;
}

interface ValidatorStat {
  validator: string;
  total_invocations: number;
  unique_programs: number;
  top_programs: ValidatorProgram[];
}

type SortField = 'total_invocations' | 'unique_programs' | 'validator';
type SortDirection = 'asc' | 'desc';

export default function ValidatorsPage() {
  const [validators, setValidators] = useState<ValidatorStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTop100, setShowTop100] = useState(false);
  const [sortField, setSortField] = useState<SortField>('total_invocations');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [from, setFrom] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [to, setTo] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [excludeBlacklisted, setExcludeBlacklisted] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [validatorsPerPage] = useState(10);
  const [selectedValidator, setSelectedValidator] = useState<string | null>(null);
  const [validatorDetails, setValidatorDetails] = useState<ValidatorProgram[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchedValidator, setSearchedValidator] = useState<ValidatorStat | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDebounceTimer, setSearchDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const fetchValidatorStats = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: `${from}T00:00:00Z`,
        to: `${to}T23:59:59Z`,
        limit: '100',
        excludeBlacklisted: excludeBlacklisted.toString(),
      });
      
      const response = await fetch(`/api/validator-stats?${params}`);
      const data = await response.json();
      
      if (response.ok && Array.isArray(data)) {
        setValidators(data);
        setCurrentPage(1); // Reset to first page on new data
      } else {
        console.error('API error:', data);
        setValidators([]);
      }
    } catch (error) {
      console.error('Error fetching validator stats:', error);
      setValidators([]);
    } finally {
      setLoading(false);
    }
  };

  const searchValidator = useCallback(async (validatorAddress: string) => {
    if (!validatorAddress.trim()) {
      setSearchedValidator(null);
      return;
    }

    setSearchLoading(true);
    try {
      // First get details for the specific validator
      const params = new URLSearchParams({
        validator: validatorAddress,
        from: `${from}T00:00:00Z`,
        to: `${to}T23:59:59Z`,
        excludeBlacklisted: excludeBlacklisted.toString(),
      });
      
      const response = await fetch(`/api/validator-details?${params}`);
      const data = await response.json();
      
      if (response.ok && Array.isArray(data) && data.length > 0) {
        // Calculate total invocations and unique programs from the details
        const totalInvocations = data.reduce((sum: number, p: any) => sum + p.invocations, 0);
        const uniquePrograms = data.length;
        
        // Create a ValidatorStat object for the searched validator
        const validatorStat: ValidatorStat = {
          validator: validatorAddress,
          total_invocations: totalInvocations,
          unique_programs: uniquePrograms,
          top_programs: data.slice(0, 5).map((p: any) => ({
            program_id: p.program_id,
            name: p.name,
            invocations: p.invocations,
            percentage: p.percentage,
            category: p.category,
            color: p.color,
            bgColor: p.bgColor
          }))
        };
        
        setSearchedValidator(validatorStat);
      } else {
        setSearchedValidator(null);
      }
    } catch (error) {
      console.error('Error searching validator:', error);
      setSearchedValidator(null);
    } finally {
      setSearchLoading(false);
    }
  }, [from, to, excludeBlacklisted]);

  const fetchValidatorDetails = async (validatorId: string) => {
    try {
      const params = new URLSearchParams({
        validator: validatorId,
        from: `${from}T00:00:00Z`,
        to: `${to}T23:59:59Z`,
        excludeBlacklisted: excludeBlacklisted.toString(),
      });
      
      const response = await fetch(`/api/validator-details?${params}`);
      const data = await response.json();
      
      if (response.ok && Array.isArray(data)) {
        setValidatorDetails(data);
        setSelectedValidator(validatorId);
      } else {
        console.error('API error:', data);
        setValidatorDetails([]);
      }
    } catch (error) {
      console.error('Error fetching validator details:', error);
      setValidatorDetails([]);
    }
  };

  const handleValidatorClick = (validatorId: string) => {
    if (selectedValidator === validatorId) {
      // Close if clicking the same validator
      setSelectedValidator(null);
      setValidatorDetails([]);
    } else {
      fetchValidatorDetails(validatorId);
    }
  };

  useEffect(() => {
    // Debounce search
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    
    if (searchQuery.trim()) {
      const timer = setTimeout(() => {
        searchValidator(searchQuery.trim());
      }, 500);
      setSearchDebounceTimer(timer);
    } else {
      setSearchedValidator(null);
    }
    
    return () => {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
      }
    };
  }, [searchQuery, searchValidator]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Don't fetch top 100 on search submit, only search for specific validator
    if (searchQuery.trim()) {
      searchValidator(searchQuery.trim());
    }
  };

  const handleLoadTop100 = () => {
    setShowTop100(true);
    fetchValidatorStats();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedValidators = [...validators].sort((a, b) => {
    let aValue: string | number;
    let bValue: string | number;

    switch (sortField) {
      case 'total_invocations':
        aValue = a.total_invocations;
        bValue = b.total_invocations;
        break;
      case 'unique_programs':
        aValue = a.unique_programs;
        bValue = b.unique_programs;
        break;
      case 'validator':
        aValue = a.validator;
        bValue = b.validator;
        break;
      default:
        return 0;
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return sortDirection === 'asc' 
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number);
  });

  // Pagination
  const totalPages = Math.ceil(sortedValidators.length / validatorsPerPage);
  const startIndex = (currentPage - 1) * validatorsPerPage;
  const endIndex = startIndex + validatorsPerPage;
  const paginatedValidators = sortedValidators.slice(startIndex, endIndex);

  const formatValidator = (validator: string) => {
    if (validator === 'unknown') {
      return (
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Unknown Validator</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <Hammer className="w-4 h-4 text-primary" />
        <span className="font-mono text-sm">
          {validator.slice(0, 12)}...{validator.slice(-12)}
        </span>
      </div>
    );
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header Navigation */}
      <HeaderNav 
        title="Validator Statistics"
        subtitle="Analyze which programs are most popular with each validator"
      />
      
      <div className="container mx-auto p-6 max-w-7xl">

      {/* Search Form */}
      <form onSubmit={handleSubmit} className="bg-card p-6 rounded-lg mb-8 border border-border shadow-sm">
        {/* Validator Search - Primary Feature */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-primary">Search Validator by Address</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter validator address (e.g., ABC123def456...)" 
              className="w-full pl-10 pr-3 py-2 bg-input text-foreground rounded border border-border focus:border-ring focus:outline-none"
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">From Date</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 bg-input text-foreground rounded border border-border focus:border-ring focus:outline-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">To Date</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 bg-input text-foreground rounded border border-border focus:border-ring focus:outline-none"
            />
          </div>
          
          <div className="flex items-end">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={excludeBlacklisted}
                onChange={(e) => setExcludeBlacklisted(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Exclude Blacklisted</span>
            </label>
          </div>
        </div>
        
        <div className="flex gap-4">
          <button
            type="submit"
            className="px-6 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            disabled={!searchQuery.trim()}
          >
            Search Validator
          </button>
          {!showTop100 && (
            <button
              type="button"
              onClick={handleLoadTop100}
              className="px-6 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 transition-colors"
            >
              Load Top 100 Validators
            </button>
          )}
        </div>
      </form>

      {/* Search Results - Primary Display */}
      {searchedValidator && (
        <div className="bg-card rounded-lg border-2 border-primary/50 mb-8">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Search className="w-5 h-5" />
              Validator Details
            </h2>
          </div>
          <div className="p-4">
            <div 
              className={`p-4 hover:bg-muted/30 transition-colors cursor-pointer rounded ${
                selectedValidator === searchedValidator.validator ? 'bg-primary/10 border-l-4 border-primary' : ''
              }`}
              onClick={() => handleValidatorClick(searchedValidator.validator)}
            >
              <div className="grid grid-cols-12 gap-4 items-start">
                {/* Validator */}
                <div className="col-span-4">
                  <div className="flex items-center gap-2 mb-1">
                    {formatValidator(searchedValidator.validator)}
                    {selectedValidator === searchedValidator.validator && (
                      <span className="text-xs text-primary font-medium">
                        ▼ Details
                      </span>
                    )}
                  </div>
                </div>

                {/* Total Invocations */}
                <div className="col-span-2 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Invocations</div>
                  <div className="font-semibold text-primary">
                    {formatNumber(searchedValidator.total_invocations)}
                  </div>
                </div>

                {/* Unique Programs */}
                <div className="col-span-2 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Programs</div>
                  <div className="font-semibold text-success">
                    {searchedValidator.unique_programs}
                  </div>
                </div>

                {/* Top Programs */}
                <div className="col-span-4">
                  <div className="text-xs text-muted-foreground mb-2">Top Programs</div>
                  <div className="space-y-2">
                    {searchedValidator.top_programs.slice(0, 3).map((program) => (
                      <div key={program.program_id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border ${program.color} ${program.bgColor} border-opacity-50`}>
                            {program.name}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground ml-2">
                          {formatNumber(program.invocations)} ({program.percentage.toFixed(1)}%)
                        </div>
                      </div>
                    ))}
                    {searchedValidator.top_programs.length > 3 && (
                      <div className="text-xs text-muted-foreground">
                        +{searchedValidator.top_programs.length - 3} more programs
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Detailed View - Show when validator is selected */}
              {selectedValidator === searchedValidator.validator && validatorDetails.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border bg-muted/20 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    All DeFi Programs Used by This Validator
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {validatorDetails.map((program) => (
                      <div
                        key={program.program_id}
                        className={`p-3 rounded-lg border ${program.bgColor} border-opacity-50 bg-opacity-50`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm font-medium ${program.color}`}>
                            {program.name}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full ${program.bgColor} ${program.color}`}>
                            {program.category}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {formatNumber(program.invocations)} calls
                          </span>
                          <span className="text-xs font-bold text-foreground">
                            {program.percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-2">
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div 
                              className={`h-1.5 rounded-full ${program.bgColor} opacity-80`}
                              style={{ width: `${Math.min(program.percentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top 100 Validators - Only show when requested */}
      {showTop100 && (
      <div className="bg-card rounded-lg border border-border">
        {/* Header with stats */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Top 100 Validator Rankings
            </h2>
            {validators.length > 0 && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Total Validators: {validators.length}</span>
                <span>Page {currentPage} of {totalPages}</span>
              </div>
            )}
          </div>
          
          {/* Summary Stats */}
          {validators.length > 0 && (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-lg font-bold text-primary">
                  {formatNumber(validators.reduce((sum, v) => sum + v.total_invocations, 0))}
                </div>
                <div className="text-xs text-muted-foreground">Total Invocations</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-lg font-bold text-success">
                  {validators.reduce((sum, v) => sum + v.unique_programs, 0)}
                </div>
                <div className="text-xs text-muted-foreground">Unique Programs</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-lg font-bold text-accent">
                  {validators.length > 0 ? 
                    formatNumber(Math.max(...validators.map(v => v.total_invocations))) : 0}
                </div>
                <div className="text-xs text-muted-foreground">Top Validator</div>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted-foreground">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            Loading validator statistics...
          </div>
        ) : validators.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <BarChart3 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <div className="text-lg mb-2">No validator data found</div>
            <div className="text-sm">Try adjusting your search parameters</div>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="bg-muted p-4">
              <div className="grid grid-cols-12 gap-4 text-sm font-medium">
                <div className="col-span-4">
                  <button
                    onClick={() => handleSort('validator')}
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    Validator
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </div>
                <div className="col-span-2 text-center">
                  <button
                    onClick={() => handleSort('total_invocations')}
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    Invocations
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </div>
                <div className="col-span-2 text-center">
                  <button
                    onClick={() => handleSort('unique_programs')}
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    Programs
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </div>
                <div className="col-span-4">
                  <span>Top Programs</span>
                </div>
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-border">
              {paginatedValidators.map((validator, index) => (
                <div 
                  key={validator.validator} 
                  className={`p-4 hover:bg-muted/30 transition-colors cursor-pointer ${
                    selectedValidator === validator.validator ? 'bg-primary/10 border-l-4 border-primary' : ''
                  }`}
                  onClick={() => handleValidatorClick(validator.validator)}
                >
                  <div className="grid grid-cols-12 gap-4 items-start">
                    {/* Validator */}
                    <div className="col-span-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground font-bold">
                          #{startIndex + index + 1}
                        </span>
                        {formatValidator(validator.validator)}
                        {selectedValidator === validator.validator && (
                          <span className="text-xs text-primary font-medium">
                            ▼ Details
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Total Invocations */}
                    <div className="col-span-2 text-center">
                      <div className="font-semibold text-primary">
                        {formatNumber(validator.total_invocations)}
                      </div>
                    </div>

                    {/* Unique Programs */}
                    <div className="col-span-2 text-center">
                      <div className="font-semibold text-success">
                        {validator.unique_programs}
                      </div>
                    </div>

                    {/* Top Programs */}
                    <div className="col-span-4">
                      <div className="space-y-2">
                        {validator.top_programs.slice(0, 3).map((program) => (
                          <div key={program.program_id} className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border ${program.color} ${program.bgColor} border-opacity-50`}>
                                {program.name}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground ml-2">
                              {formatNumber(program.invocations)} ({program.percentage.toFixed(1)}%)
                            </div>
                          </div>
                        ))}
                        {validator.top_programs.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            +{validator.top_programs.length - 3} more programs
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Detailed View - Show when validator is selected */}
                  {selectedValidator === validator.validator && validatorDetails.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border bg-muted/20 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" />
                        DeFi Program Usage Details
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {validatorDetails.map((program) => (
                          <div
                            key={program.program_id}
                            className={`p-3 rounded-lg border ${program.bgColor} border-opacity-50 bg-opacity-50`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-sm font-medium ${program.color}`}>
                                {program.name}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded-full ${program.bgColor} ${program.color}`}>
                                {program.category}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {formatNumber(program.invocations)} calls
                              </span>
                              <span className="text-xs font-bold text-foreground">
                                {program.percentage.toFixed(1)}%
                              </span>
                            </div>
                            <div className="mt-2">
                              <div className="w-full bg-muted rounded-full h-1.5">
                                <div 
                                  className={`h-1.5 rounded-full ${program.bgColor} opacity-80`}
                                  style={{ width: `${Math.min(program.percentage, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {validatorDetails.length === 0 && (
                        <div className="text-center py-4 text-muted-foreground">
                          No DeFi program usage found for this validator in the selected time range.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Go to page:</span>
                  <select
                    value={currentPage}
                    onChange={(e) => setCurrentPage(Number(e.target.value))}
                    className="px-2 py-1 text-sm bg-muted border border-border rounded focus:border-ring focus:outline-none"
                  >
                    {Array.from({ length: totalPages }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      )}
      </div>
    </div>
  );
}