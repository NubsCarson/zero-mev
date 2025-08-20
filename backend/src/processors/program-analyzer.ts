import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export interface ProgramUsage {
  programId: string;
  invocationCount: number;
  percentage: number;
  cuConsumed: number;
}

export interface Transaction {
  signature: string;
  meta: {
    computeUnitsConsumed?: number;
    err?: any;
    innerInstructions: Array<{
      instructions: Array<{
        programIdIndex: number;
        accounts: number[];
        data: string;
      }>;
    }>;
  };
  transaction: {
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
      if (tx.meta && !tx.meta.err) {
        // Count main instructions
        for (const instruction of tx.transaction.message.instructions) {
          const programId = tx.transaction.message.accountKeys[instruction.programIdIndex];
          this.incrementProgramUsage(programInvocations, programId);
          totalInstructions++;
        }

        // Count inner instructions
        if (tx.meta.innerInstructions) {
          for (const innerInstructionSet of tx.meta.innerInstructions) {
            for (const innerInstruction of innerInstructionSet.instructions) {
              const programId = tx.transaction.message.accountKeys[innerInstruction.programIdIndex];
              this.incrementProgramUsage(programInvocations, programId);
              totalInstructions++;
            }
          }
        }

        // Track compute units
        const cuConsumed = tx.meta.computeUnitsConsumed || 0;
        totalCuConsumed += cuConsumed;

        // Distribute CU consumption across programs proportionally
        const txProgramCount = this.countTransactionPrograms(tx);
        const cuPerProgram = cuConsumed / Math.max(txProgramCount, 1);

        for (const instruction of tx.transaction.message.instructions) {
          const programId = tx.transaction.message.accountKeys[instruction.programIdIndex];
          this.incrementProgramCu(programCuUsage, programId, cuPerProgram);
        }

        if (tx.meta.innerInstructions) {
          for (const innerInstructionSet of tx.meta.innerInstructions) {
            for (const innerInstruction of innerInstructionSet.instructions) {
              const programId = tx.transaction.message.accountKeys[innerInstruction.programIdIndex];
              this.incrementProgramCu(programCuUsage, programId, cuPerProgram);
            }
          }
        }
      }
    }

    // Calculate percentages and create usage array
    const programUsage: ProgramUsage[] = [];
    for (const [programId, invocationCount] of programInvocations.entries()) {
      const percentage = totalInstructions > 0 ? (invocationCount / totalInstructions) * 100 : 0;
      const cuConsumed = programCuUsage.get(programId) || 0;

      programUsage.push({
        programId,
        invocationCount,
        percentage,
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
    const uniquePrograms = new Set<string>();

    for (const instruction of tx.transaction.message.instructions) {
      const programId = tx.transaction.message.accountKeys[instruction.programIdIndex];
      uniquePrograms.add(programId);
    }

    if (tx.meta.innerInstructions) {
      for (const innerInstructionSet of tx.meta.innerInstructions) {
        for (const innerInstruction of innerInstructionSet.instructions) {
          const programId = tx.transaction.message.accountKeys[innerInstruction.programIdIndex];
          uniquePrograms.add(programId);
        }
      }
    }

    return uniquePrograms.size;
  }

  getProgramName(programId: string): string {
    return this.knownPrograms.get(programId) || `Unknown Program (${programId.slice(0, 8)}...)`;
  }

  // Mock transaction generation for testing
  generateMockTransactions(count: number = 10): Transaction[] {
    const transactions: Transaction[] = [];
    const programIds = Array.from(this.knownPrograms.keys());

    for (let i = 0; i < count; i++) {
      const numInstructions = Math.floor(Math.random() * 5) + 1;
      const instructions = [];
      const accountKeys = programIds.slice(0, numInstructions);

      for (let j = 0; j < numInstructions; j++) {
        instructions.push({
          programIdIndex: j,
          accounts: [0, 1, 2],
          data: bs58.encode(Buffer.from('mock_instruction_data')),
        });
      }

      transactions.push({
        signature: bs58.encode(Buffer.from(`mock_sig_${i}`)),
        meta: {
          computeUnitsConsumed: Math.floor(Math.random() * 200000) + 5000,
          innerInstructions: [],
        },
        transaction: {
          message: {
            accountKeys,
            instructions,
          },
        },
      });
    }

    return transactions;
  }
}

export const programAnalyzer = new ProgramAnalyzer();