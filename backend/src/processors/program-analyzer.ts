import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export interface ProgramUsage {
  programId: string;
  invocationCount: number;
  cuConsumed: number;
}

export interface Transaction {
  signature?: string;
  meta?: {
    computeUnitsConsumed?: number;
    err?: any;
    innerInstructions?: Array<{
      instructions: Array<{
        programIdIndex: number;
        accounts: number[];
        data: string;
      }>;
    }>;
  };
  transaction?: {
    message: {
      accountKeys: string[];
      instructions: Array<{
        programIdIndex: number;
        accounts: number[];
        data: string;
      }>;
    };
  };
}

export class ProgramAnalyzer {
  private knownPrograms: Map<string, string> = new Map();

  constructor() {
    this.initializeKnownPrograms();
  }

  private initializeKnownPrograms() {
    // System programs
    this.knownPrograms.set('11111111111111111111111111111111', 'System Program');
    this.knownPrograms.set('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'Token Program');
    this.knownPrograms.set('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', 'Associated Token Program');
    this.knownPrograms.set('ComputeBudget111111111111111111111111111111', 'Compute Budget Program');
    
    // DEX programs
    this.knownPrograms.set('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', 'Serum DEX v3');
    this.knownPrograms.set('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', 'Whirlpool');
    this.knownPrograms.set('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', 'Raydium AMM');
    this.knownPrograms.set('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', 'Jupiter');
    
    // Lending programs
    this.knownPrograms.set('So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo', 'Solend');
    this.knownPrograms.set('LendZqTs8gn5CTSJU1jWKhKuVpjFGom45nnwPb2AMTi', 'Port Finance');
    
    // NFT programs
    this.knownPrograms.set('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', 'Metaplex Token Metadata');
    this.knownPrograms.set('cndy3Z4yapfJBmL3ShUp5exZKqR3z33thTzeNMm2gRZ', 'Candy Machine v2');
  }

  analyzeBlock(transactions: Transaction[]): {
    programUsage: ProgramUsage[];
    totalInstructions: number;
    totalCuConsumed: number;
  } {
    const programInvocations = new Map<string, number>();
    const programCuUsage = new Map<string, number>();
    let totalInstructions = 0;
    let totalCuConsumed = 0;

    for (const tx of transactions) {
      if (!tx || !tx.transaction || !tx.transaction.message) {
        continue; // Skip invalid transactions
      }
      
      const hasError = tx.meta && tx.meta.err;
      if (!hasError) {
        // Handle both legacy and versioned transaction formats
        const message = tx.transaction.message;
        const instructions = message.instructions || message.compiledInstructions || [];
        const accountKeys = message.accountKeys || message.staticAccountKeys || [];
        
        if (instructions && Array.isArray(instructions) && accountKeys && Array.isArray(accountKeys)) {
          // Count main instructions
          for (const instruction of instructions) {
            if (instruction.programIdIndex < accountKeys.length) {
              const programId = accountKeys[instruction.programIdIndex];
              if (programId) {
                this.incrementProgramUsage(programInvocations, programId);
                totalInstructions++;
              }
            }
          }

          // Count inner instructions
          if (tx.meta && tx.meta.innerInstructions && Array.isArray(tx.meta.innerInstructions)) {
            for (const innerInstructionSet of tx.meta.innerInstructions) {
              if (innerInstructionSet.instructions && Array.isArray(innerInstructionSet.instructions)) {
                for (const innerInstruction of innerInstructionSet.instructions) {
                  if (innerInstruction.programIdIndex < accountKeys.length) {
                    const programId = accountKeys[innerInstruction.programIdIndex];
                    if (programId) {
                      this.incrementProgramUsage(programInvocations, programId);
                      totalInstructions++;
                    }
                  }
                }
              }
            }
          }

          // Track compute units
          const cuConsumed = (tx.meta && tx.meta.computeUnitsConsumed) || 0;
          totalCuConsumed += cuConsumed;

          // Distribute CU consumption across programs proportionally
          const txProgramCount = this.countTransactionPrograms(tx);
          const cuPerProgram = cuConsumed / Math.max(txProgramCount, 1);

          for (const instruction of instructions) {
            if (instruction.programIdIndex < accountKeys.length) {
              const programId = accountKeys[instruction.programIdIndex];
              if (programId) {
                this.incrementProgramCu(programCuUsage, programId, cuPerProgram);
              }
            }
          }

          if (tx.meta && tx.meta.innerInstructions && Array.isArray(tx.meta.innerInstructions)) {
            for (const innerInstructionSet of tx.meta.innerInstructions) {
              if (innerInstructionSet.instructions && Array.isArray(innerInstructionSet.instructions)) {
                for (const innerInstruction of innerInstructionSet.instructions) {
                  if (innerInstruction.programIdIndex < accountKeys.length) {
                    const programId = accountKeys[innerInstruction.programIdIndex];
                    if (programId) {
                      this.incrementProgramCu(programCuUsage, programId, cuPerProgram);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Create usage array
    const programUsage: ProgramUsage[] = [];
    for (const [programId, invocationCount] of programInvocations.entries()) {
      const cuConsumed = programCuUsage.get(programId) || 0;

      programUsage.push({
        programId,
        invocationCount,
        cuConsumed,
      });
    }

    // Sort by invocation count descending
    programUsage.sort((a, b) => b.invocationCount - a.invocationCount);

    return {
      programUsage,
      totalInstructions,
      totalCuConsumed,
    };
  }

  private incrementProgramUsage(programMap: Map<string, number>, programId: string) {
    programMap.set(programId, (programMap.get(programId) || 0) + 1);
  }

  private incrementProgramCu(programMap: Map<string, number>, programId: string, cuAmount: number) {
    programMap.set(programId, (programMap.get(programId) || 0) + cuAmount);
  }

  private countTransactionPrograms(tx: Transaction): number {
    if (!tx || !tx.transaction || !tx.transaction.message) {
      return 0;
    }
    
    const uniquePrograms = new Set<string>();
    const message = tx.transaction.message;
    const instructions = message.instructions || message.compiledInstructions || [];
    const accountKeys = message.accountKeys || message.staticAccountKeys || [];

    if (instructions && Array.isArray(instructions) && accountKeys && Array.isArray(accountKeys)) {
      for (const instruction of instructions) {
        if (instruction.programIdIndex < accountKeys.length) {
          const programId = accountKeys[instruction.programIdIndex];
          if (programId) {
            uniquePrograms.add(programId);
          }
        }
      }

      if (tx.meta && tx.meta.innerInstructions && Array.isArray(tx.meta.innerInstructions)) {
        for (const innerInstructionSet of tx.meta.innerInstructions) {
          if (innerInstructionSet.instructions && Array.isArray(innerInstructionSet.instructions)) {
            for (const innerInstruction of innerInstructionSet.instructions) {
              if (innerInstruction.programIdIndex < accountKeys.length) {
                const programId = accountKeys[innerInstruction.programIdIndex];
                if (programId) {
                  uniquePrograms.add(programId);
                }
              }
            }
          }
        }
      }
    }

    return uniquePrograms.size;
  }

  getProgramName(programId: string): string {
    return this.knownPrograms.get(programId) || `Unknown Program (${programId.slice(0, 8)}...)`;
  }

  // PRODUCTION: Mock transaction generation disabled
  generateMockTransactions(count: number = 10): Transaction[] {
    // PRODUCTION: Disabled - return empty array
    return [];
  }
}

export const programAnalyzer = new ProgramAnalyzer();