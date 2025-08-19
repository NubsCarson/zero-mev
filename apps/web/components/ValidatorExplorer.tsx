'use client';

import { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';

interface ValidatorStats {
  validator: string;
  blocks_processed: number;
  total_invocations: number;
  unique_programs: number;
  first_block_time: string;
  last_block_time: string;
}

interface ValidatorBlock {
  slot: number;
  block_time: string;
  validator: string;
  total_invocations: number;
  unique_programs: number;
  unique_transactions: number;
}

interface ValidatorBlocksData {
  blocks: ValidatorBlock[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface ValidatorExplorerProps {
  onBlockClick?: (slot: number) => void;
}

export default function ValidatorExplorer({ onBlockClick }: ValidatorExplorerProps) {
  const [validators, setValidators] = useState<ValidatorStats[]>([]);
  const [selectedValidator, setSelectedValidator] = useState<string>('');
  const [searchValidator, setSearchValidator] = useState<string>('');
  const [validatorBlocks, setValidatorBlocks] = useState<ValidatorBlocksData | null>(null);
  const [loading, setLoading] = useState(false);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  const pageSize = 10;

  useEffect(() => {
    fetchValidatorStats();
  }, []);

  useEffect(() => {
    if (selectedValidator) {
      fetchValidatorBlocks(selectedValidator, 0);
    }
  }, [selectedValidator]);

  const fetchValidatorStats = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/validators/stats');
      if (response.ok) {
        const data = await response.json();
        setValidators(data);
      }
    } catch (error) {
      console.error('Error fetching validator stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchValidatorBlocks = async (validator: string, page: number) => {
    setBlocksLoading(true);
    try {
      const offset = page * pageSize;
      const response = await fetch(`/api/validators/${encodeURIComponent(validator)}/blocks?limit=${pageSize}&offset=${offset}`);
      if (response.ok) {
        const data = await response.json();
        setValidatorBlocks(data);
        setCurrentPage(page);
      }
    } catch (error) {
      console.error('Error fetching validator blocks:', error);
    } finally {
      setBlocksLoading(false);
    }
  };

  const handleValidatorSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValidator.trim()) {
      setSelectedValidator(searchValidator.trim());
      setCurrentPage(0);
    }
  };

  const handleValidatorSelect = (validator: string) => {
    setSelectedValidator(validator);
    setSearchValidator(validator);
    setCurrentPage(0);
  };

  const formatValidator = (validator: string) => {
    if (validator === 'unknown') return 'Unknown Validator';
    return `${validator.slice(0, 8)}...${validator.slice(-8)}`;
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Validator Search */}
      <div className="bg-card rounded-lg p-6 border border-border">
        <h2 className="text-xl font-semibold mb-4">Validator Explorer</h2>
        
        <form onSubmit={handleValidatorSearch} className="flex gap-3 mb-6">
          <input
            type="text"
            value={searchValidator}
            onChange={(e) => setSearchValidator(e.target.value)}
            placeholder="Enter validator public key"
            className="flex-1 px-4 py-3 bg-muted rounded-lg border border-border focus:border-ring focus:outline-none font-mono text-sm"
          />
          <button
            type="submit"
            disabled={blocksLoading}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Search
          </button>
        </form>

        {/* Top Validators */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Top Validators
          </h3>
          
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-muted-foreground">Loading validators...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {validators.slice(0, 25).map((validator) => (
                <div
                  key={validator.validator}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                    selectedValidator === validator.validator 
                      ? 'border-primary bg-primary/20' 
                      : 'border-border'
                  }`}
                  onClick={() => handleValidatorSelect(validator.validator)}
                >
                  <div className="text-sm font-mono text-primary mb-1">
                    {formatValidator(validator.validator)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {validator.blocks_processed.toLocaleString()} blocks
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Validator Blocks */}
      {selectedValidator && (
        <div className="bg-card rounded-lg p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Blocks by Validator</h3>
            <div className="text-sm text-muted-foreground font-mono">
              {formatValidator(selectedValidator)}
            </div>
          </div>

          {blocksLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-muted-foreground">Loading blocks...</p>
            </div>
          ) : validatorBlocks ? (
            <div className="space-y-4">
              {/* Pagination Info */}
              <div className="text-sm text-muted-foreground">
                Showing {validatorBlocks.pagination.offset + 1}-{Math.min(
                  validatorBlocks.pagination.offset + validatorBlocks.pagination.limit,
                  validatorBlocks.pagination.total
                )} of {validatorBlocks.pagination.total.toLocaleString()} blocks
              </div>

              {/* Blocks List */}
              <div className="space-y-2">
                {validatorBlocks.blocks.map((block) => (
                  <div
                    key={block.slot}
                    className="p-4 bg-muted/50 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => onBlockClick?.(block.slot)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-lg font-mono font-bold text-primary">
                          #{block.slot.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTimeAgo(block.block_time)}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-center">
                          <div className="text-success font-semibold">
                            {block.total_invocations.toLocaleString()}
                          </div>
                          <div className="text-muted-foreground text-xs">invocations</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-primary font-semibold">
                            {block.unique_programs}
                          </div>
                          <div className="text-muted-foreground text-xs">programs</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-accent-foreground font-semibold">
                            {block.unique_transactions.toLocaleString()}
                          </div>
                          <div className="text-muted-foreground text-xs">transactions</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => fetchValidatorBlocks(selectedValidator, currentPage - 1)}
                  disabled={currentPage === 0}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                
                <span className="text-sm text-muted-foreground">
                  Page {currentPage + 1} of {Math.ceil(validatorBlocks.pagination.total / pageSize)}
                </span>
                
                <button
                  onClick={() => fetchValidatorBlocks(selectedValidator, currentPage + 1)}
                  disabled={!validatorBlocks.pagination.hasMore}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No blocks found for this validator
            </div>
          )}
        </div>
      )}
    </div>
  );
}