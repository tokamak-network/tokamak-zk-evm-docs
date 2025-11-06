# Synthesizer Documentation

The Synthesizer is the core frontend of the Tokamak zk-EVM that converts Ethereum transactions into Tokamak zk-SNARK circuits. This documentation is organized into five main sections:

---

### 1. [Concepts](synthesizer/synthesizer-concepts.md)

**Start here if you're new to the Synthesizer**

Learn the fundamental concepts and high-level architecture.

### 2. [Execution Flow](synthesizer/synthesizer-execution-flow.md)

**Understand how transactions are processed**

Follow the step-by-step execution flow from transaction input to output file generation.

### 3. [Code Architecture](synthesizer/synthesizer-architecture.md)

**Deep dive into code structure and implementation**

Explore the detailed code architecture, core classes, and integration points with EthereumJS.

### 4. [Data Structures](synthesizer/synthesizer-data-structure.md)

**Master the core data types**

Understand DataPt, StackPt, MemoryPt, and Placement - the key data structures for symbol processing.

### 5. [Opcodes](synthesizer/synthesizer-opcodes.md)

**Reference guide for EVM opcode implementation**

Detailed opcode-by-opcode reference with circuit generation details and source code links.

---

## Quick Start

### Installation

```bash
npm install @tokamak-network/tokamak-zkevm-synthesizer
```

### Basic Usage (L1 Transaction)

```typescript
import { EVM } from '@ethereumjs/evm';
import { createSynthesizerOptsForSimulationFromRPC } from './interface/rpc/rpc';

// Step 1: Create Synthesizer options from RPC
const synthOpts = await createSynthesizerOptsForSimulationFromRPC({
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY',
  txHash: '0xYOUR_TRANSACTION_HASH',
  mode: 'normal' // L1 standard transaction
});

// Step 2: Initialize EVM with Synthesizer
const evm = await EVM.create({
  common: synthOpts.common,
  stateManager: synthOpts.stateManager,
  enableSynthesizer: true
});

// Step 3: Execute transaction
const result = await evm.runCall({
  to: synthOpts.to,
  caller: synthOpts.from,
  data: synthOpts.data,
  gasLimit: synthOpts.gasLimit,
  value: synthOpts.value
});

// Step 4: Export circuit files
const synthesizer = evm.synthesizer;
synthesizer.exportPlacementJSON('./output/placement.json');
synthesizer.exportWireMapJSON('./output/wireMap.json');
console.log('Circuit generation complete!');
```

### L2 State Channel Usage

For **L2 state channel transactions** with EdDSA signing and Merkle tree state management:

```typescript
// Step 1: Create L2-specific options
const synthOpts = await createSynthesizerOptsForSimulationFromRPC({
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY',
  l1Address: '0xL1_CONTRACT_ADDRESS',
  l1ChannelNonce: 0, // Channel nonce on L1
  l2CallIdx: 0, // Transaction index in L2 batch
  
  // L2 transaction data
  l2TxSerialized: '0x...', // Serialized TokamakL2Tx with EdDSA signature
  l2State: {
    registeredKeys: ['0xkey1', '0xkey2'], // Registered storage keys
    stateValues: {
      '0xkey1': '0xvalue1',
      '0xkey2': '0xvalue2'
    }
  },
  
  // Cryptographic configuration
  customCrypto: {
    hasher: poseidon, // Poseidon hash for Merkle tree
    getSigner: () => eddsaSigner // EdDSA signer
  },
  
  mode: 'l2-state-channel' // L2 mode
});

// Step 2-4: Same as L1 usage
const evm = await EVM.create({
  common: synthOpts.common,
  stateManager: synthOpts.stateManager, // TokamakL2StateManager
  enableSynthesizer: true
});

const result = await evm.runCall({ /* ... */ });
evm.synthesizer.exportPlacementJSON('./output/placement.json');
```

**Key Differences for L2**:
- Uses `TokamakL2StateManager` (Merkle tree-based state)
- Supports EdDSA-signed transactions (`TokamakL2Tx`)
- Poseidon hash for efficient in-circuit verification
- Merkle proof generation for state transitions

### Output Files

After execution, Synthesizer generates:

1. **`placement.json`**: Circuit instance graph (DAG)
   - List of subcircuit instances (placements)
   - Input/output wire connections
   
2. **`wireMap.json`**: Wire connection mapping
   - Maps wires between placements
   - Used by backend for proof generation

For detailed information, see [Execution Flow](synthesizer/synthesizer-execution-flow.md).

---

## Documentation Organization

```
synthesizer/
├── synthesizer-concepts.md          # 🎯 Start here: Core concepts
├── synthesizer-execution-flow.md    # 🔄 Transaction processing flow
├── synthesizer-architecture.md      # 🏗️ Code structure and classes
├── synthesizer-data-structure.md    # 📦 DataPt, StackPt, MemoryPt, Placements
└── synthesizer-opcodes.md           # 📚 Opcode reference
```

**Recommended reading order**:
1. Concepts → 2. Execution Flow → 3. Architecture → 4. Data Structures → 5. Opcodes

---

## Status

🔥 **Alpha** (February 2025)

The Synthesizer is in active development. Some features are not yet supported:
- CREATE, CREATE2, REVERT, SELFDESTRUCT opcodes
- Precompiled contracts
- Full batch transaction processing (infrastructure complete, testing in progress)

See [Concepts: Features not yet implemented](synthesizer/synthesizer-concepts.md#features-not-yet-implemented) for details.

---

## Resources

- **Repository**: [Tokamak-zk-EVM/packages/frontend/synthesizer](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/synthesizer)
- **Paper**: [Tokamak zk-SNARK](https://eprint.iacr.org/2024/507)
- **Contributing**: [CONTRIBUTING.md](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/CONTRIBUTING.md)
- **Issues**: [GitHub Issues](https://github.com/tokamak-network/Tokamak-zk-EVM/issues)
