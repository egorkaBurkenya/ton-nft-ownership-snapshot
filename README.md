# TON NFT Ownership Snapshot Tool

> **Generate accurate historical NFT ownership snapshots for TON blockchain collections at any point in time**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TON](https://img.shields.io/badge/TON-Blockchain-blue)](https://ton.org/)

## 🚀 Features

- ✅ **Historical Accuracy** - Reconstruct exact NFT ownership at any past date
- ✅ **Sale Contract Resolution** - Automatically resolves real owners behind sale contracts
- ✅ **Comprehensive Analysis** - Checks collection events + individual NFT history  
- ✅ **GetGems v3 Support** - Full support for GetGems marketplace sale contracts
- ✅ **Rate Limit Handling** - Built-in TonAPI rate limiting with smart retry logic
- ✅ **No API Key Required** - Uses free TonAPI endpoints
- ✅ **Address Format Support** - Accepts both raw (`0:...`) and user-friendly (`EQ...`) formats
- ✅ **Detailed Progress Tracking** - Real-time progress with ETA estimates
- ✅ **Smart Caching** - Efficient caching for owner resolution to minimize API calls
- ✅ **JSON Output** - Saves results in structured format for further analysis

## 🔍 Problem Statement

When analyzing NFT collections on TON blockchain, you often need to know **who owned what NFTs at a specific date in the past**. This is crucial for:

- 📊 **Airdrop Distribution** - Reward holders as of a snapshot date
- 🎯 **Whitelist Creation** - Generate lists based on historical ownership
- 📈 **Analytics & Research** - Study ownership patterns over time
- 🔄 **Governance Voting** - Determine voting rights based on past holdings
- 💰 **Reward Distribution** - Distribute tokens to historical holders

However, blockchain APIs typically only show **current ownership**, not historical states. Additionally, many NFTs are held by **sale contracts** (marketplaces) rather than their real owners, making ownership analysis even more complex.

This tool solves both problems by:

1. **Fetching current ownership** from TonAPI
2. **Retrieving all transfer events** after your target date
3. **Reversing those transfers** to reconstruct past ownership
4. **Cross-checking individual NFT histories** for complete accuracy
5. **🆕 Resolving real owners** behind sale contracts automatically

## 📦 Installation

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Quick Start

```bash
# Clone the repository
git clone https://github.com/egorkaBurkenya/ton-nft-ownership-snapshot.git
cd ton-nft-ownership-snapshot

# Install dependencies
npm install

# Make the script executable
chmod +x get-nft-owners-snapshot.ts
```

## 🎯 Usage

### Basic Syntax

```bash
npx tsx get-nft-owners-snapshot.ts <COLLECTION_ADDRESS> <TARGET_DATE>
```

### Parameters

- **`COLLECTION_ADDRESS`** - TON NFT collection contract address
  - Supports raw format: `0:abc123...`
  - Supports user-friendly format: `EQAbc123...`
- **`TARGET_DATE`** - Date in `YYYY-MM-DD` format (e.g., `2024-01-15`)

### Examples

```bash
# Get ownership snapshot for January 15, 2024
npx tsx get-nft-owners-snapshot.ts EQB3s8aBeSg6mhhM8N9B2h1-4W2_1M5w4CUpYI3qD6d6F6xO 2024-01-15

# Using raw address format
npx tsx get-nft-owners-snapshot.ts 0:e7798aab4a15a8f804cae771f211d9b5357a8c7cfca016009353d9d7ed2963f2 2024-01-15

# Get snapshot for a date in 2025
npx tsx get-nft-owners-snapshot.ts EQB3s8aBeSg6mhhM8N9B2h1-4W2_1M5w4CUpYI3qD6d6F6xO 2025-03-21

# Note: The tool will automatically resolve sale contracts to real owners
# Example output: "🔄 Resolved 6ac6d3cd... -> 3058413e... (5 NFTs)"
```

### 🎯 What's New: Sale Contract Resolution

This tool now automatically detects and resolves **sale contracts** to their real owners, providing accurate ownership data even when NFTs are listed on marketplaces:

- **Before**: NFT shows as owned by sale contract `0:abc123...`
- **After**: NFT correctly shows as owned by real owner `0:def456...`

This is especially important for:
- **GetGems marketplace** - Automatically resolves GetGems v3 sale contracts
- **Accurate airdrops** - Rewards go to real owners, not marketplace contracts
- **Proper analytics** - See true ownership distribution, not marketplace holdings

## 📊 Output Format

The tool generates a JSON file with the following structure:

```json
{
  "date": 1705276800,
  "targetDate": "2024-01-15",
  "collectionAddress": "EQB3s8aBeSg6mhhM8N9B2h1-4W2_1M5w4CUpYI3qD6d6F6xO",
  "totalNfts": 1500,
  "ownersCount": 245,
  "balances": {
    "0:abc123...": 45,
    "0:def456...": 32,
    "0:ghi789...": 28
  },
  "sortedBalances": [
    ["0:abc123...", 45],
    ["0:def456...", 32],
    ["0:ghi789...", 28]
  ]
}
```

### Output Fields

- **`date`** - Unix timestamp of target date
- **`targetDate`** - Human-readable target date  
- **`collectionAddress`** - Collection contract address
- **`totalNfts`** - Total number of NFTs in collection
- **`ownersCount`** - Number of unique owners at target date
- **`balances`** - Object mapping wallet addresses to NFT counts
- **`sortedBalances`** - Array of [address, count] pairs sorted by count (descending)

## 🔧 How It Works

### The Algorithm

1. **📦 Fetch Collection NFTs** - Get all NFTs in the collection with current owners
2. **📚 Get Collection Events** - Retrieve all transfer events from target date onwards  
3. **🔄 Reverse Transfers** - Apply transfers in reverse to reconstruct historical ownership
4. **🔍 Individual NFT Check** - Verify missed transfers by checking each NFT's history
5. **🎯 Resolve Real Owners** - Automatically detect and resolve sale contracts to real owners
6. **📊 Aggregate Results** - Count NFTs per owner and sort by holdings

### Why This Approach Works

The key insight is that **current ownership + future transfers = past ownership**. By reversing all transfers that happened after your target date, we can accurately reconstruct who owned what at that specific moment.

### Sale Contract Resolution

A major challenge in NFT ownership analysis is that many NFTs are held by **sale contracts** (marketplaces) rather than their actual owners. This tool automatically resolves this issue:

#### Supported Sale Contract Types

- ✅ **GetGems v3** (`nft_sale_getgems_v3`) - Full automatic resolution
- ⚠️ **Custom Contracts** - Detected but kept as-is with warnings

#### Resolution Process

1. **Contract Detection** - Identifies non-wallet addresses using `is_wallet` flag
2. **Interface Analysis** - Checks contract interfaces to determine type
3. **Owner Extraction** - For GetGems v3: calls `get_sale_data()` to get real owner
4. **Recursive Resolution** - Handles cases where owner is also a contract
5. **Smart Caching** - Caches results to minimize API calls

#### Example Resolution

```
🔍 Analyzing contract 6ac6d3cd... with interfaces: [nft_sale_getgems_v3]
🎯 Found real owner of sale contract 6ac6d3cd...: 3058413e...
✅ 3058413e... is a wallet
🔄 Resolved 6ac6d3cd... -> 3058413e... (5 NFTs)
```

### Accuracy Guarantees

- **Collection-level events** catch most transfers efficiently
- **Individual NFT histories** ensure 100% accuracy for edge cases  
- **Sale contract resolution** provides real ownership data
- **Comprehensive validation** against multiple data sources
- **Transfer chronology** properly handles multiple transfers per NFT

## ⚡ Performance & Rate Limits

### TonAPI Rate Limits

- **Free Tier**: 50 requests/minute, 1M requests/month
- **Built-in handling**: Automatic 60-second backoff on rate limits
- **Smart delays**: 800ms between requests to prevent rate limiting

### Execution Time

For a typical collection:
- **Small collections** (< 1K NFTs): ~2-5 minutes  
- **Medium collections** (1K-10K NFTs): ~15-45 minutes
- **Large collections** (> 10K NFTs): ~1-3 hours

Time depends on:
- Collection size
- Number of transfers after target date
- TonAPI response times
- Network conditions

### Progress Tracking

The tool provides real-time progress updates:

```
📦 Fetching all NFTs for collection...
✅ Page 1: Found 1000 NFTs (Total: 1000)
🎯 Total NFTs found: 1157

📚 Fetching recent transaction history...  
✅ Page 5: Found 100 events (Total: 500)
🏁 Reached end of events (no more pages)

🔍 Checking individual NFT history for 1157 NFTs...
⏱️  Estimated time: ~25 minutes with rate limiting
📈 Checked individual NFT history: 58/1157 (5%)

🔍 Step 5/6: Resolving real owners for sale contracts...
📊 Found 245 unique owners, checking for sale contracts...
🔄 Resolved 6ac6d3cd... -> 3058413e... (5 NFTs)
📈 Progress: 123/245 owners processed (50%)

📋 Resolution Summary:
   Total owners: 245
   Sale contracts found: 12
   Successfully resolved: 12
   Final unique owners: 233
```

## 🛠️ Technical Details

### Dependencies

- **`@ton/ton`** - TON blockchain address utilities
- **`tsx`** - TypeScript execution runtime  
- **Node.js built-ins** - `fs`, `fetch` for file operations and HTTP requests

### API Endpoints Used

- `GET /v2/nfts/collections/{address}/items` - Collection NFTs
- `GET /v2/accounts/{address}/events` - Collection transfer events
- `GET /v2/nfts/{address}/history` - Individual NFT history
- `GET /v2/accounts/{address}` - Account information and contract interfaces
- `GET /v2/blockchain/accounts/{address}/methods/get_sale_data` - GetGems sale data

### Error Handling

- **Rate limit recovery** - Automatic retry with countdown
- **API error handling** - Graceful degradation and error messages
- **Address validation** - Supports both TON address formats
- **Date validation** - Ensures valid date format and not in future

## 🔍 Troubleshooting

### Common Issues

1. **`API request failed: 429`** - Rate limit exceeded (script handles automatically)
2. **`Invalid address format`** - Check collection address is valid TON address
3. **`TARGET_DATE must be in YYYY-MM-DD format`** - Use correct date format  
4. **`TARGET_DATE cannot be in the future`** - Choose a past date
5. **`TonAPI error: entity not found`** - Collection address not found
6. **`Could not resolve owner for contract`** - Unknown contract type (kept as-is)
7. **`Failed to get sale data`** - Sale contract method call failed (gracefully handled)

### Performance Tips

- **Use recent dates** - Less historical reconstruction needed
- **Run during off-peak hours** - Better TonAPI response times  
- **Large collections** - Consider running overnight for 10K+ NFT collections
- **Monitor progress** - Script shows detailed progress and ETA estimates

### Memory Usage

For large collections, the script may use significant memory:
- **1K NFTs**: ~50MB RAM
- **10K NFTs**: ~200MB RAM  
- **100K NFTs**: ~1GB RAM

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

### Development Setup

```bash
git clone https://github.com/egorkaBurkenya/ton-nft-ownership-snapshot.git
cd ton-nft-ownership-snapshot
npm install
npm run dev
```

### Testing

```bash
# Test with a small collection
npx tsx get-nft-owners-snapshot.ts EQB3s8aBeSg6mhhM8N9B2h1-4W2_1M5w4CUpYI3qD6d6F6xO 2024-01-01
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [TON Blockchain](https://ton.org/) - The Open Network  
- [TonAPI](https://tonapi.io/) - Free TON blockchain API
- [TON TypeScript SDK](https://github.com/ton-community/ton) - Address utilities

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/egorkaBurkenya/ton-nft-ownership-snapshot/issues)
- **Discussions**: [GitHub Discussions](https://github.com/egorkaBurkenya/ton-nft-ownership-snapshot/discussions)

---

**Built for the TON ecosystem** 🚀 **Accurate historical NFT analysis** 📊 **Production ready** ✅
