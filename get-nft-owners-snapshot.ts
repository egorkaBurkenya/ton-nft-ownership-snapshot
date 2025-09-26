#!/usr/bin/env tsx

import * as fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { Address } from '@ton/ton';

// Types for TonAPI responses
interface TonApiNFTItem {
  address: string;
  index: number;
  owner: {
    address: string;
    is_scam: boolean;
    is_wallet: boolean;
  };
  collection: {
    address: string;
    name?: string;
    description?: string;
  };
  verified: boolean;
  metadata?: {
    name?: string;
    image?: string;
    description?: string;
    attributes?: Array<{
      trait_type: string;
      value: string;
    }>;
  };
}

interface TonApiNFTResponse {
  nft_items: TonApiNFTItem[];
}

interface TonApiEvent {
  event_id: string;
  timestamp: number;
  actions: Array<{
    type: string;
    status: string;
    NftItemTransfer?: {
      nft: string;
      sender?: {
        address: string;
      };
      recipient?: {
        address: string;
      };
    };
  }>;
}

interface TonApiEventsResponse {
  events: TonApiEvent[];
  next_from?: number;
}

interface OwnershipSnapshot {
  date: number;
  targetDate: string;
  collectionAddress: string;
  totalNfts: number;
  ownersCount: number;
  balances: Record<string, number>;
  sortedBalances: Array<[string, number]>;
}

class NFTOwnershipTracker {
  private readonly baseUrl = 'https://tonapi.io/v2';
  private readonly requestDelay = 800; // 0.8 seconds to respect TonAPI rate limits but speed up processing

  constructor() {
    // TonAPI doesn't require API key for basic usage
  }

  /**
   * Normalize address to user-friendly format
   * Accepts both raw format (0:hex) and user-friendly format (EQ...)
   */
  public static normalizeAddress(address: string): string {
    try {
      // Try to parse the address - this handles both formats
      const parsedAddress = Address.parse(address);
      // Return in user-friendly format
      return parsedAddress.toString();
    } catch (error) {
      throw new Error(`Invalid address format: ${address}. Error: ${error}`);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async makeRequest<T>(
    url: string,
    params: Record<string, any> = {},
  ): Promise<T> {
    const urlObj = new URL(url);
    Object.keys(params).forEach((key) => {
      if (params[key] !== undefined && params[key] !== null) {
        urlObj.searchParams.append(key, params[key].toString());
      }
    });

    console.log(`🔄 Making API request: ${urlObj.pathname}`);

    const response = await fetch(urlObj.toString(), {
      headers: {
        accept: 'application/json',
      },
    });

    if (response.status === 429) {
      console.log('⏳ Rate limit hit, waiting 60 seconds...');
      // Show countdown
      for (let i = 60; i > 0; i--) {
        process.stdout.write(`\r⏳ Waiting ${i} seconds for rate limit...`);
        await this.sleep(1000);
      }
      console.log('\n✅ Resuming requests...');
      return this.makeRequest<T>(url, params);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}. Response: ${errorText}`,
      );
    }

    const data = await response.json();

    // Check for TonAPI error format
    if (data.error) {
      throw new Error(`TonAPI error: ${data.error}`);
    }

    // Add delay between requests to respect rate limits
    console.log(`⏱️  Waiting ${this.requestDelay}ms before next request...`);
    await this.sleep(this.requestDelay);

    return data;
  }

  /**
   * Get all NFTs in a collection with pagination
   */
  async getAllNFTs(contractAddress: string): Promise<TonApiNFTItem[]> {
    console.log(`📦 Fetching all NFTs for collection: ${contractAddress}`);

    const allNfts: TonApiNFTItem[] = [];
    let offset = 0;
    const limit = 1000;
    let pageCount = 0;

    while (true) {
      pageCount++;
      console.log(`📄 Fetching NFTs page ${pageCount}...`);

      const params = {
        limit,
        offset,
      };

      const response = await this.makeRequest<TonApiNFTResponse>(
        `${this.baseUrl}/nfts/collections/${contractAddress}/items`,
        params,
      );

      const nftItems = response.nft_items || [];
      allNfts.push(...nftItems);

      console.log(
        `✅ Page ${pageCount}: Found ${nftItems.length} NFTs (Total: ${allNfts.length})`,
      );

      // If we got fewer items than the limit, we've reached the end
      if (nftItems.length < limit) {
        break;
      }

      offset += limit;
    }

    console.log(`🎯 Total NFTs found: ${allNfts.length}`);
    return allNfts;
  }

  /**
   * Get all recent events for the collection account
   */
  async getAllRecentCollectionEvents(
    contractAddress: string,
    targetDateUnix: number,
  ): Promise<TonApiEvent[]> {
    console.log(
      `📚 Fetching recent transaction history for collection: ${contractAddress}`,
    );

    const allEvents: TonApiEvent[] = [];
    let beforeLt: number | undefined;
    let pageCount = 0;

    while (true) {
      pageCount++;
      console.log(`📜 Fetching events page ${pageCount}...`);

      const params: Record<string, any> = {
        limit: 100,
      };

      if (beforeLt) {
        params.before_lt = beforeLt;
      }
      // Get all events from target date to now
      if (!beforeLt) {
        params.start_date = targetDateUnix; // Start from target date
      }

      const response = await this.makeRequest<TonApiEventsResponse>(
        `${this.baseUrl}/accounts/${contractAddress}/events`,
        params,
      );

      const events = response.events || [];

      allEvents.push(...events);

      console.log(
        `✅ Page ${pageCount}: Found ${events.length} events (Total: ${allEvents.length})`,
      );

      // If we got fewer events than the limit or next_from is 0/null, we've reached the end
      if (
        !response.next_from ||
        response.next_from === 0 ||
        events.length === 0
      ) {
        console.log(
          `🏁 Reached end of events (no more pages, next_from: ${response.next_from})`,
        );
        break;
      }

      // next_from in TonAPI is actually the before_lt for next page
      beforeLt = response.next_from;

      // Limit to prevent infinite loops - increased for better coverage
      if (pageCount >= 100) {
        console.log('⚠️  Reached maximum page limit (100), stopping...');
        break;
      }
    }

    console.log(`🎯 Total events found: ${allEvents.length}`);
    return allEvents;
  }

  async getNftHistoryAfterDate(
    nftAddress: string,
    targetDateUnix: number,
  ): Promise<TonApiEvent[]> {
    try {
      // Use NFT history API which is more reliable for individual NFT events
      const response = await this.makeRequest<TonApiEventsResponse>(
        `${this.baseUrl}/nfts/${nftAddress}/history`,
        { limit: 100 },
      );

      const events = response.events || [];

      // Filter events that happened after target date
      const eventsAfterTarget = events.filter(
        (event) => event.timestamp > targetDateUnix,
      );

      return eventsAfterTarget;
    } catch (error) {
      console.warn(
        `Failed to get NFT history for ${nftAddress}: ${error.message}`,
      );
      return this.getAllNftEvents(nftAddress, targetDateUnix);
    }
  }

  async getAllNftEvents(
    nftAddress: string,
    targetDateUnix: number,
  ): Promise<TonApiEvent[]> {
    console.log(`Fetching transaction history for NFT: ${nftAddress}`);

    const allEvents: TonApiEvent[] = [];
    let nextFrom: number | undefined;
    let pageCount = 0;

    while (true) {
      pageCount++;
      console.log(`Fetching events page ${pageCount} for NFT ${nftAddress}...`);

      const params: Record<string, any> = {
        limit: 100,
        end_date: targetDateUnix,
      };

      if (nextFrom) {
        params.start_date = nextFrom;
      }

      const response = await this.makeRequest<TonApiEventsResponse>(
        `${this.baseUrl}/accounts/${nftAddress}/events`,
        params,
      );

      const events = response.events || [];

      const filteredEvents = events.filter(
        (event) => event.timestamp <= targetDateUnix,
      );

      allEvents.push(...filteredEvents);

      console.log(
        `Page ${pageCount}: Found ${events.length} events (${filteredEvents.length} before target date) for NFT ${nftAddress}`,
      );

      if (
        !response.next_from ||
        events.length === 0 ||
        filteredEvents.length < events.length
      ) {
        break;
      }

      nextFrom = response.next_from;

      if (pageCount >= 10) {
        console.log('Reached maximum page limit for NFT, stopping...');
        break;
      }
    }

    console.log(
      `Total events found for NFT ${nftAddress}: ${allEvents.length}`,
    );
    return allEvents;
  }

  /**
   * Reconstruct NFT ownership at a specific date
   */
  async reconstructOwnership(
    events: TonApiEvent[],
    targetDateUnix: number,
    allNfts: TonApiNFTItem[],
  ): Promise<Record<string, string>> {
    console.log(`Reconstructing ownership for timestamp: ${targetDateUnix}`);

    // Filter events after target date and extract NFT transfers
    const nftTransfers: Array<{
      nft: string;
      sender?: string;
      recipient?: string;
      timestamp: number;
    }> = [];

    console.log(`🔍 Processing ${events.length} events for NFT transfers...`);

    for (const event of events) {
      if (event.timestamp > targetDateUnix) {
        for (const action of event.actions) {
          if (action.type === 'NftItemTransfer' && action.NftItemTransfer) {
            const transfer = action.NftItemTransfer;
            nftTransfers.push({
              nft: transfer.nft,
              sender: transfer.sender?.address,
              recipient: transfer.recipient?.address,
              timestamp: event.timestamp,
            });
          }
        }
      }
    }

    console.log(
      `🎯 Found ${nftTransfers.length} NFT transfers after target date (from ${events.length} total events)`,
    );

    // Sort by timestamp ascending (oldest first)
    nftTransfers.sort((a, b) => a.timestamp - b.timestamp);

    const ownershipMap: Record<string, string> = {};

    // Initialize with current owners for NFTs
    console.log(
      `🏗️  Initializing ownership map with ${allNfts.length} NFTs...`,
    );
    for (const nft of allNfts) {
      ownershipMap[nft.address] = nft.owner.address;
    }

    // Reverse transfers that happened after target date to reconstruct ownership at target date
    // For each transfer after target date, set the owner back to the sender
    console.log(
      `⚙️  Processing ${nftTransfers.length} transfers to reconstruct ownership...`,
    );
    let processed = 0;
    const progressStep = Math.max(1, Math.floor(nftTransfers.length / 10)); // Progress every 10%

    for (const transfer of nftTransfers) {
      if (transfer.sender) {
        // Convert addresses to raw format for consistent comparison
        const nftRaw = transfer.nft.startsWith('0:')
          ? transfer.nft
          : Address.parse(transfer.nft).toRawString();

        ownershipMap[nftRaw] = transfer.sender;
      }

      processed++;
      if (processed % progressStep === 0 || processed === nftTransfers.length) {
        const percentage = Math.round((processed / nftTransfers.length) * 100);
        console.log(
          `Processed ${processed}/${nftTransfers.length} transfers (${percentage}%)`,
        );
      }
    }

    // For NFTs that may have recent transfers not captured by collection events,
    // check individual NFT history
    const nftsToCheck = allNfts.filter((nft) => {
      // Check if this NFT had any transfers in collection events
      const hasTransferInCollection = nftTransfers.some(
        (t) => t.nft === nft.address,
      );
      return !hasTransferInCollection;
    });

    if (nftsToCheck.length > 0) {
      console.log(
        `🔍 Checking individual NFT history for ${nftsToCheck.length} NFTs that may have missed transfers...`,
      );

      // Check ALL NFTs to ensure complete accuracy - no sampling!
      const nftsToActuallyCheck = nftsToCheck;

      console.log(
        `📊 Will check ALL ${nftsToActuallyCheck.length} NFTs individually (this ensures 100% accuracy)`,
      );
      console.log(
        `⏱️  Estimated time: ~${Math.round((nftsToActuallyCheck.length * 1.5) / 60)} minutes with rate limiting`,
      );

      let checkedNfts = 0;
      const checkProgressStep = Math.max(
        1,
        Math.floor(nftsToActuallyCheck.length / 20), // More frequent progress updates
      );

      for (const nft of nftsToActuallyCheck) {
        try {
          const nftEvents = await this.getNftHistoryAfterDate(
            nft.address,
            targetDateUnix,
          );
          const transfersAfterTarget = nftEvents;

          if (transfersAfterTarget.length > 0) {
            // Find the earliest transfer after target date
            const allTransfers = transfersAfterTarget
              .flatMap((event) =>
                event.actions
                  .filter(
                    (action) =>
                      action.type === 'NftItemTransfer' &&
                      action.NftItemTransfer,
                  )
                  .map((action) => ({
                    ...action.NftItemTransfer,
                    timestamp: event.timestamp,
                  })),
              )
              .sort((a, b) => a.timestamp - b.timestamp);

            const earliestTransfer = allTransfers[0];

            if (earliestTransfer?.sender?.address) {
              ownershipMap[nft.address] = earliestTransfer.sender.address;
              console.log(
                `🔄 Updated ownership for NFT ${nft.address.slice(-8)}... from ${nft.owner.address.slice(-8)}... to ${earliestTransfer.sender.address.slice(-8)}... (transfer at ${new Date(earliestTransfer.timestamp * 1000).toISOString()})`,
              );
            }
          }
        } catch (error) {
          // Ignore errors for individual NFTs
        }

        checkedNfts++;
        if (
          checkedNfts % checkProgressStep === 0 ||
          checkedNfts === nftsToActuallyCheck.length
        ) {
          const percentage = Math.round(
            (checkedNfts / nftsToActuallyCheck.length) * 100,
          );
          console.log(
            `📈 Checked individual NFT history: ${checkedNfts}/${nftsToActuallyCheck.length} (${percentage}%)`,
          );
        }
      }
    }

    // Convert all NFT addresses to raw format for consistent lookup
    const normalizedOwnership: Record<string, string> = {};
    for (const nft of allNfts) {
      const nftRaw = nft.address;
      normalizedOwnership[nftRaw] = ownershipMap[nftRaw] || nft.owner.address;
    }

    console.log(
      `Ownership reconstructed for ${Object.keys(normalizedOwnership).length} NFTs`,
    );

    return normalizedOwnership;
  }

  /**
   * Aggregate balances by owner
   */
  aggregateBalances(
    ownershipMap: Record<string, string>,
  ): Record<string, number> {
    const balances: Record<string, number> = {};

    for (const [token, owner] of Object.entries(ownershipMap)) {
      if (owner && owner.trim() !== '') {
        balances[owner] = (balances[owner] || 0) + 1;
      }
    }

    return balances;
  }

  /**
   * Get NFT owners snapshot for a specific date
   */
  async getOwnersSnapshot(
    contractAddress: string,
    targetDate: string,
  ): Promise<OwnershipSnapshot> {
    console.log(`\n=== Starting NFT Ownership Snapshot ===`);
    console.log(`Collection: ${contractAddress}`);
    console.log(`Target Date: ${targetDate}`);

    // Convert date to Unix timestamp
    const targetDateObj = new Date(targetDate);
    const targetDateUnix = Math.floor(targetDateObj.getTime() / 1000);
    console.log(`Target Unix Timestamp: ${targetDateUnix}`);

    // Step 1: Get all NFTs in collection
    console.log('Step 1/5: Fetching all NFTs in collection...');
    const allNfts = await this.getAllNFTs(contractAddress);
    console.log(`Found ${allNfts.length} NFTs in collection`);

    // Step 2: Get all recent events for the collection
    console.log('Step 2/5: Fetching recent collection events...');
    const allEvents = await this.getAllRecentCollectionEvents(
      contractAddress,
      targetDateUnix,
    );
    console.log(`Fetched ${allEvents.length} events from collection`);

    // Step 3: Reconstruct ownership
    console.log('Step 3/5: Reconstructing ownership at target date...');
    const ownershipMap = await this.reconstructOwnership(
      allEvents,
      targetDateUnix,
      allNfts,
    );

    // Step 4: Aggregate balances
    console.log('Step 4/5: Aggregating balances by owner...');
    const balances = this.aggregateBalances(ownershipMap);
    console.log(`Found ${Object.keys(balances).length} unique owners`);

    // Step 5: Sort by balance descending
    console.log('Step 5/5: Sorting owners by balance...');
    const sortedBalances = Object.entries(balances).sort(
      ([, a], [, b]) => b - a,
    );

    const snapshot: OwnershipSnapshot = {
      date: targetDateUnix,
      targetDate,
      collectionAddress: contractAddress,
      totalNfts: Object.keys(ownershipMap).length,
      ownersCount: Object.keys(balances).length,
      balances,
      sortedBalances,
    };

    return snapshot;
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(
      'Usage: npx tsx get-nft-owners-snapshot.ts <CONTRACT_ADDRESS> <TARGET_DATE>',
    );
    console.log('');
    console.log('Arguments:');
    console.log(
      '  CONTRACT_ADDRESS - TON NFT collection address (supports both raw and user-friendly formats)',
    );
    console.log(
      '  TARGET_DATE      - Target date in YYYY-MM-DD format (e.g., 2024-01-15)',
    );
    console.log('');
    console.log('Examples:');
    console.log(
      '  npx tsx get-nft-owners-snapshot.ts EQB3s8aBeSg6mhhM8N9B2h1-4W2_1M5w4CUpYI3qD6d6F6xO 2024-01-15',
    );
    console.log(
      '  npx tsx get-nft-owners-snapshot.ts 0:e7798aab4a15a8f804cae771f211d9b5357a8c7cfca016009353d9d7ed2963f2 2024-01-15',
    );
    console.log('');
    console.log(
      "Note: This script uses TonAPI which doesn't require an API key.",
    );
    process.exit(1);
  }

  const [contractAddress, targetDate] = args;

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(targetDate)) {
    console.error('Error: TARGET_DATE must be in YYYY-MM-DD format');
    process.exit(1);
  }

  // Validate that date is not in the future
  const targetDateObj = new Date(targetDate);
  const now = new Date();
  if (targetDateObj > now) {
    console.error('Error: TARGET_DATE cannot be in the future');
    process.exit(1);
  }

  // Normalize contract address to user-friendly format
  let normalizedContractAddress: string;
  try {
    normalizedContractAddress =
      NFTOwnershipTracker.normalizeAddress(contractAddress);

    // Log conversion if the address was in raw format
    if (contractAddress !== normalizedContractAddress) {
      console.log(`\n📋 Address converted:`);
      console.log(`Input:  ${contractAddress}`);
      console.log(`Output: ${normalizedContractAddress}`);
      console.log('');
    }
  } catch (error) {
    console.error('Error: Invalid contract address format');
    console.error(error.message);
    process.exit(1);
  }

  try {
    const tracker = new NFTOwnershipTracker();
    const snapshot = await tracker.getOwnersSnapshot(
      normalizedContractAddress,
      targetDate,
    );

    console.log(`\n=== Ownership Snapshot Results ===`);
    console.log(`Date: ${snapshot.targetDate} (${snapshot.date})`);
    console.log(`Collection: ${snapshot.collectionAddress}`);
    console.log(`Total NFTs: ${snapshot.totalNfts}`);
    console.log(`Unique Owners: ${snapshot.ownersCount}`);
    console.log(`\nTop 10 Owners:`);

    snapshot.sortedBalances.slice(0, 10).forEach(([owner, count], index) => {
      console.log(`${index + 1}. ${owner}: ${count} NFTs`);
    });

    // Save to file
    const filename = `owners_snapshot_${normalizedContractAddress.slice(-8)}_${targetDate.replace(/-/g, '')}.json`;
    fs.writeFileSync(filename, JSON.stringify(snapshot, null, 2));
    console.log(`\nResults saved to: ${filename}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly (ES module check)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if this script is being run directly
if (process.argv[1] === __filename) {
  main().catch(console.error);
}

export { NFTOwnershipTracker, type OwnershipSnapshot, type TonApiNFTItem };
