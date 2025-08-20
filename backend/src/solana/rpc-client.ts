import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config/index.js';

export class SolanaRpcClient {
  private connection: Connection;

  constructor() {
    const rpcUrl = process.env.SOL_RPC || 'https://rpc.zeroblock.io';
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  async fetchBlocksForValidator(validatorIdentity: string, startSlot: number, endSlot: number) {
    console.log(`🔍 Fetching blocks for validator ${validatorIdentity} from slot ${startSlot} to ${endSlot}`);
    
    const blocks = [];
    
    // Get blocks in range
    const blockSlots = await this.connection.getBlocks(startSlot, endSlot);
    
    for (const slot of blockSlots) {
      try {
        const block = await this.connection.getBlock(slot, {
          maxSupportedTransactionVersion: 0,
          transactionDetails: 'full',
          rewards: false
        });
        
        if (block && block.blockHeight) {
          // Check if this block was produced by our validator
          const leaderSchedule = await this.connection.getLeaderSchedule(slot);
          let blockValidator = null;
          
          for (const [validator, slots] of Object.entries(leaderSchedule || {})) {
            if (slots.includes(slot)) {
              blockValidator = validator;
              break;
            }
          }
          
          if (blockValidator === validatorIdentity) {
            blocks.push({
              slot,
              block,
              validator: blockValidator
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching block ${slot}:`, error);
      }
    }
    
    return blocks;
  }

  async analyzeBlockPrograms(slot: number) {
    try {
      const block = await this.connection.getBlock(slot, {
        maxSupportedTransactionVersion: 0,
        transactionDetails: 'full',
        rewards: false
      });

      if (!block || !block.transactions) {
        return null;
      }

      const programInvocations = new Map<string, number>();
      const programCUs = new Map<string, number>();

      for (const tx of block.transactions) {
        if (tx.transaction && tx.meta) {
          const message = tx.transaction.message;
          
          // Get all program IDs from the transaction
          const programIds = new Set<string>();
          
          // Add programs from instructions
          if ('compiledInstructions' in message) {
            for (const instruction of message.compiledInstructions) {
              const programId = message.staticAccountKeys[instruction.programIdIndex].toBase58();
              programIds.add(programId);
            }
          }
          
          // Add programs from inner instructions
          if (tx.meta.innerInstructions) {
            for (const inner of tx.meta.innerInstructions) {
              for (const instruction of inner.instructions) {
                if ('programIdIndex' in instruction) {
                  const programId = message.staticAccountKeys[instruction.programIdIndex].toBase58();
                  programIds.add(programId);
                }
              }
            }
          }
          
          // Count invocations and compute units
          const computeUnits = tx.meta.computeUnitsConsumed || 0;
          const programCount = programIds.size || 1;
          const cuPerProgram = Math.floor(computeUnits / programCount);
          
          for (const programId of programIds) {
            programInvocations.set(programId, (programInvocations.get(programId) || 0) + 1);
            programCUs.set(programId, (programCUs.get(programId) || 0) + cuPerProgram);
          }
        }
      }

      return {
        slot,
        blockTime: block.blockTime ? new Date(block.blockTime * 1000) : new Date(),
        transactionCount: block.transactions.length,
        programInvocations: Array.from(programInvocations.entries()).map(([programId, count]) => ({
          programId,
          invocationCount: count,
          cuConsumed: programCUs.get(programId) || 0
        })).sort((a, b) => b.invocationCount - a.invocationCount)
      };
    } catch (error) {
      console.error(`Error analyzing block ${slot}:`, error);
      return null;
    }
  }

  async getRecentBlocksWithPrograms(limit: number = 10) {
    try {
      const slot = await this.connection.getSlot();
      const blocks = [];
      
      for (let i = 0; i < limit; i++) {
        const blockData = await this.analyzeBlockPrograms(slot - i);
        if (blockData) {
          blocks.push(blockData);
        }
      }
      
      return blocks;
    } catch (error) {
      console.error('Error fetching recent blocks:', error);
      return [];
    }
  }

  async getValidatorBlocks(validatorIdentity: string, timeRange: string) {
    const currentSlot = await this.connection.getSlot();
    let startSlot = currentSlot;
    
    // Calculate start slot based on time range
    // Assuming ~400ms per slot
    switch(timeRange) {
      case '1h':
        startSlot = currentSlot - 9000; // ~1 hour
        break;
      case '6h':
        startSlot = currentSlot - 54000; // ~6 hours
        break;
      case '24h':
        startSlot = currentSlot - 216000; // ~24 hours
        break;
      case '7d':
        startSlot = currentSlot - 1512000; // ~7 days
        break;
      case '30d':
        startSlot = currentSlot - 6480000; // ~30 days
        break;
      default:
        startSlot = currentSlot - 216000; // Default to 24h
    }
    
    return this.fetchBlocksForValidator(validatorIdentity, startSlot, currentSlot);
  }
}

export const solanaRpcClient = new SolanaRpcClient();