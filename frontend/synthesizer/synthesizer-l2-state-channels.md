# Synthesizer: L2 State Channels

This document provides a complete guide to implementing L2 state channel transactions using Tokamak Synthesizer, including EdDSA signing, Merkle tree state management, and Poseidon hash integration.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Core Components](#core-components)
- [Transaction Flow](#transaction-flow)
- [Cryptographic Primitives](#cryptographic-primitives)
- [State Management](#state-management)
- [Implementation Guide](#implementation-guide)
- [Circuit Generation](#circuit-generation)
- [Testing and Verification](#testing-and-verification)
- [Related Resources](#related-resources)

---

## Overview

### What are L2 State Channels?

**L2 State Channels** enable off-chain transaction execution with on-chain settlement. Tokamak Synthesizer supports state channels through:

1. **EdDSA Signatures** on JubJub curve (efficient in-circuit verification)
2. **Merkle Tree State Management** (4-ary tree, Poseidon hash)
3. **Batch Transaction Execution** (multiple transactions per proof)
4. **Zero-Knowledge Proofs** (privacy-preserving state transitions)

```
┌──────────────────────────────────────────────────────────────────┐
│  L2 State Channel Architecture                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  L1 Contract                                                     │
│  ┌───────────────────────────────────────┐                      │
│  │ Channel State (on-chain)              │                      │
│  │ - Initial Merkle Root                 │                      │
│  │ - Participant Addresses               │                      │
│  │ - Channel Nonce                       │                      │
│  └───────────────────────────────────────┘                      │
│           │                        ▲                             │
│           │ Open                   │ Close/Dispute               │
│           ▼                        │ (with proof)                │
│  ┌───────────────────────────────────────┐                      │
│  │ L2 Execution (off-chain)              │                      │
│  │ ┌───────────────────────────────────┐ │                      │
│  │ │ Tx1 (EdDSA signed)                │ │                      │
│  │ │ State: S0 -> S1                   │ │                      │
│  │ │ Merkle: Root0 -> Root1            │ │                      │
│  │ └───────────────────────────────────┘ │                      │
│  │ ┌───────────────────────────────────┐ │                      │
│  │ │ Tx2 (EdDSA signed)                │ │                      │
│  │ │ State: S1 -> S2                   │ │                      │
│  │ │ Merkle: Root1 -> Root2            │ │                      │
│  │ └───────────────────────────────────┘ │                      │
│  └───────────────────────────────────────┘                      │
│           │                                                      │
│           ▼                                                      │
│  ┌───────────────────────────────────────┐                      │
│  │ Synthesizer                           │                      │
│  │ - Convert Tx1, Tx2 to circuit         │                      │
│  │ - Verify EdDSA signatures             │                      │
│  │ - Verify Merkle state transitions     │                      │
│  │ - Generate proof                      │                      │
│  └───────────────────────────────────────┘                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Key Benefits

- **Privacy**: Transaction details hidden from L1 (only Merkle roots visible)
- **Scalability**: Batch multiple transactions per proof
- **Efficiency**: Poseidon hash (10x cheaper than Keccak256 in circuits)
- **Security**: EdDSA signatures verified in-circuit

---

## Architecture

### Component Overview

```
┌────────────────────────────────────────────────────────────────────┐
│  L2 State Channel Components                                       │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1. Transaction Layer                                              │
│     ┌───────────────────────────────────┐                         │
│     │ TokamakL2Tx                       │                         │
│     │ - EdDSA-signed transactions       │                         │
│     │ - Reinterprets (v, r, s) fields   │                         │
│     └───────────────────────────────────┘                         │
│                    │                                               │
│                    ▼                                               │
│  2. State Management Layer                                         │
│     ┌───────────────────────────────────┐                         │
│     │ TokamakL2StateManager             │                         │
│     │ - 4-ary Merkle tree (depth 4)     │                         │
│     │ - Registered keys (max 64)        │                         │
│     │ - Initial/Final roots             │                         │
│     └───────────────────────────────────┘                         │
│                    │                                               │
│                    ▼                                               │
│  3. Cryptographic Layer                                            │
│     ┌───────────────────────────────────┐                         │
│     │ Cryptographic Primitives          │                         │
│     │ - Poseidon hash (field elements)  │                         │
│     │ - EdDSA sign/verify (JubJub)      │                         │
│     │ - Public key derivation           │                         │
│     └───────────────────────────────────┘                         │
│                    │                                               │
│                    ▼                                               │
│  4. Circuit Generation Layer                                       │
│     ┌───────────────────────────────────┐                         │
│     │ Synthesizer                       │                         │
│     │ - Event-driven hooks              │                         │
│     │ - beforeMessage (sig verify)      │                         │
│     │ - step (opcode processing)        │                         │
│     │ - afterMessage (Merkle finalize)  │                         │
│     └───────────────────────────────────┘                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. TokamakL2Tx

**Purpose**: EdDSA-signed transaction format for L2 state channels

**Source**: [`packages/frontend/synthesizer/src/TokamakL2JS/tx/TokamakL2Tx.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/tx/TokamakL2Tx.ts)

#### Field Reinterpretation

```typescript
// Standard EthereumJS Tx fields (v, r, s) reinterpreted for EdDSA:
{
  v: PublicKeyParity,     // 0 or 1 (EdDSA public key Y coordinate parity)
  r: EddsaPublicKey,      // 32 bytes (EdDSA public key)
  s: EddsaSignature       // 32 bytes (EdDSA signature 's' component)
}

// EdDSA signature components stored in tx.common.customCrypto:
{
  randomizer: Point,      // 'R' point (x, y) in EdDSA signature
  signedHash: bigint      // 's' scalar in EdDSA signature
}
```

#### Creation Example

```typescript
import { TokamakL2Tx } from './TokamakL2JS/tx/TokamakL2Tx';
import { eddsaSign_unsafe } from './TokamakL2JS/crypto';

// Step 1: Create unsigned transaction
const unsignedTx = TokamakL2Tx.fromTxData({
  nonce: 0,
  gasLimit: 1000000,
  to: Address.fromString('0xRECIPIENT_ADDRESS'),
  value: 100n,
  data: Buffer.from('calldata', 'utf8')
});

// Step 2: Sign with EdDSA
const privateKey = Buffer.from('YOUR_PRIVATE_KEY', 'hex');
const messageHash = unsignedTx.getHashedMessageToSign();
const eddsaSignature = eddsaSign_unsafe(messageHash, privateKey);

// Step 3: Create signed transaction
const signedTx = unsignedTx.sign(eddsaSignature);
```

### 2. TokamakL2StateManager

**Purpose**: Merkle tree-based state manager for L2 transactions

**Source**: [`packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts)

#### Configuration

```typescript
{
  arity: 4,              // 4-ary tree (each node has 4 children)
  depth: 4,              // Maximum depth: 4 levels
  maxLeaves: 64,         // Maximum 64 leaves (4^3 = 64)
  hasher: poseidon,      // Poseidon hash function
}
```

#### Merkle Tree Structure

```
                         Root (Level 3)
                           /  |  \  \
                          /   |   \   \
               Level 2:  N0  N1  N2  N3  (4 children each)
                        /|\ /|\ /|\ /|\
           Level 1:   [...16 nodes...]  (4×4 = 16 nodes)
                      /|\ ...
       Level 0:   [64 leaves]           (4×16 = 64 leaves max)

Leaf Structure:
┌──────────────────────────────────────┐
│ Leaf = Poseidon(key, value)          │
│ - key: Storage key (registered)      │
│ - value: Storage value                │
└──────────────────────────────────────┘

Parent Node:
┌──────────────────────────────────────┐
│ Parent = Poseidon(C0, C1, C2, C3)    │
│ - C0, C1, C2, C3: Child hashes       │
│ - Empty child = NULL_POSEIDON_LEVELn │
└──────────────────────────────────────┘
```

#### Key Features

**Registered Keys vs General Storage**:

```typescript
// Registered keys (L2-managed, in Merkle tree)
const registeredKeys = [
  '0x0000...0001',  // Leaf index 0
  '0x0000...0002',  // Leaf index 1
  // ... up to 64 keys
];

// General storage (L1 contract storage, not in Merkle tree)
const generalStorage = {
  '0xANY_KEY': '0xVALUE'  // Not constrained to registered keys
};
```

**L1/L2 Storage Key Hashing**:

```typescript
// For registered keys (L2 user storage):
const l2Key = poseidon(l1ContractAddress, poseidon(l2CallerAddress, rawKey));

// For general keys (L1 contract storage):
const l1Key = keccak256(l1ContractAddress, rawKey);
```

#### Methods

```typescript
class TokamakL2StateManager {
  // Initial Merkle tree (before transaction execution)
  get initialMerkleTree(): MerkleTree4 {
    return this._initialMerkleTree;
  }

  // Final Merkle tree (after transaction execution)
  get finalMerkleTree(): MerkleTree4 {
    return this._finalMerkleTree;
  }

  // Get storage value (from initial state)
  async getStorage(address: Address, key: Buffer): Promise<Buffer> {
    const leafIndex = this._registeredKeys.indexOf(key.toString('hex'));
    if (leafIndex === -1) {
      // General storage (not in Merkle tree)
      return this._generalStorage.get(key) ?? Buffer.alloc(32);
    }
    // Registered key (from Merkle tree)
    return this._initialMerkleTree.leaves[leafIndex].value;
  }

  // Set storage value (updates final state)
  async putStorage(address: Address, key: Buffer, value: Buffer): Promise<void> {
    const leafIndex = this._registeredKeys.indexOf(key.toString('hex'));
    if (leafIndex === -1) {
      // Update general storage
      this._generalStorage.set(key, value);
    } else {
      // Update Merkle tree leaf
      this._finalMerkleTree.leaves[leafIndex].value = value;
      this._finalMerkleTree.recomputeRoot();
    }
  }

  // Get user storage key (L1 address + L2 caller + raw key)
  getUserStorageKey(l2CallerAddress: Address, rawKey: Buffer): Buffer {
    const l1Address = this._l1ContractAddress;
    return poseidon(l1Address, poseidon(l2CallerAddress, rawKey));
  }
}
```

### 3. Cryptographic Primitives

**Source**: [`packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts)

#### Poseidon Hash

```typescript
import { poseidon } from './crypto';

// Hash single value
const hash1 = poseidon(123n);

// Hash multiple values
const hash2 = poseidon(123n, 456n);
const hash4 = poseidon(a, b, c, d); // For 4-ary Merkle tree

// Field modulus (BLS12-381 scalar field)
const R_MOD = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;
```

**Properties**:
- Input/Output: Field elements (mod R_MOD)
- Efficiency: ~10x cheaper than Keccak256 in circuits
- Security: Designed for ZK-SNARKs

#### EdDSA Signing

```typescript
import { eddsaSign_unsafe, eddsaVerify, getEddsaPublicKey } from './crypto';

// Generate key pair
const privateKey = Buffer.from('YOUR_PRIVATE_KEY', 'hex');
const publicKey = getEddsaPublicKey(privateKey); // 32 bytes

// Sign message
const messageHash = poseidon(messageBytes);
const signature = eddsaSign_unsafe(messageHash, privateKey);
// Returns: { randomizer: Point, signedHash: bigint }

// Verify signature
const isValid = eddsaVerify(
  signature,
  messageHash,
  publicKey
);
```

**Curve**: JubJub (Edwards curve over BLS12-381 scalar field)

```
Equation: ax² + y² = 1 + dx²y²
Parameters:
  a = -1
  d = -(10240/10241) mod R_MOD
Base Point:
  x = 0x0e4840ac57f86f5e293b1d67bc8de5d9a12a70a615d0b8e4d2fc5e69ac5db47f
  y = 0x2bcd9508a3dad316105f067219141f4450a32c41aa67e0beb0ad80034eb71aa6
```

---

## Transaction Flow

### Complete L2 Transaction Lifecycle

```
┌────────────────────────────────────────────────────────────────────┐
│  L2 State Channel Transaction Flow                                 │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1. Channel Initialization (on L1)                                 │
│     ┌────────────────────────────────────┐                        │
│     │ Open state channel on L1 contract  │                        │
│     │ - Register participants            │                        │
│     │ - Register storage keys (up to 64) │                        │
│     │ - Initial Merkle root              │                        │
│     └────────────────────────────────────┘                        │
│                    │                                               │
│                    ▼                                               │
│  2. Off-Chain Execution                                            │
│     ┌────────────────────────────────────┐                        │
│     │ User creates TokamakL2Tx           │                        │
│     │ - Sign with EdDSA private key      │                        │
│     │ - Send to counterparty             │                        │
│     └────────────────────────────────────┘                        │
│                    │                                               │
│                    ▼                                               │
│  3. Synthesizer Processing                                         │
│     ┌────────────────────────────────────┐                        │
│     │ A. beforeMessage Phase             │                        │
│     │    - Verify EdDSA signature        │                        │
│     │    - Check initial Merkle root     │                        │
│     └────────────────────────────────────┘                        │
│                    │                                               │
│                    ▼                                               │
│     ┌────────────────────────────────────┐                        │
│     │ B. step Phase                      │                        │
│     │    - Execute EVM opcodes           │                        │
│     │    - SLOAD/SSTORE from Merkle tree │                        │
│     │    - Update state                  │                        │
│     └────────────────────────────────────┘                        │
│                    │                                               │
│                    ▼                                               │
│     ┌────────────────────────────────────┐                        │
│     │ C. afterMessage Phase              │                        │
│     │    - Finalize Merkle tree          │                        │
│     │    - Compute final root            │                        │
│     │    - Export circuit files          │                        │
│     └────────────────────────────────────┘                        │
│                    │                                               │
│                    ▼                                               │
│  4. Proof Generation (Backend)                                     │
│     ┌────────────────────────────────────┐                        │
│     │ Run prover on circuit files        │                        │
│     │ - placement.json                   │                        │
│     │ - wireMap.json                     │                        │
│     │ - Outputs: proof.json              │                        │
│     └────────────────────────────────────┘                        │
│                    │                                               │
│                    ▼                                               │
│  5. On-Chain Settlement (L1)                                       │
│     ┌────────────────────────────────────┐                        │
│     │ Submit proof + final root to L1    │                        │
│     │ - Verifier contract validates      │                        │
│     │ - Update channel state             │                        │
│     └────────────────────────────────────┘                        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Guide

### Step 1: Initialize L2 State Manager

```typescript
import { TokamakL2StateManager } from './TokamakL2JS/stateManager/TokamakL2StateManager';
import { poseidon } from './TokamakL2JS/crypto';

// Define registered storage keys
const registeredKeys = [
  '0x0000000000000000000000000000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000000000000000000000000000002',
  // ... up to 64 keys
];

// Initial state values
const initialState = {
  '0x0000000000000000000000000000000000000000000000000000000000000001': '0x00000000000000000000000000000000000000000000000000000000000000ff',
  '0x0000000000000000000000000000000000000000000000000000000000000002': '0x0000000000000000000000000000000000000000000000000000000000000100',
};

// Create state manager
const stateManager = await TokamakL2StateManager.create({
  l1ContractAddress: Address.fromString('0xL1_CONTRACT_ADDRESS'),
  registeredKeys,
  initialState,
  hasher: poseidon,
  arity: 4,
  depth: 4
});

console.log('Initial Merkle Root:', stateManager.initialMerkleTree.root);
```

### Step 2: Create and Sign L2 Transaction

```typescript
import { TokamakL2Tx } from './TokamakL2JS/tx/TokamakL2Tx';
import { eddsaSign_unsafe, getEddsaPublicKey } from './TokamakL2JS/crypto';

// Step 2.1: Create unsigned transaction
const txData = {
  nonce: 0,
  gasLimit: 1000000,
  to: Address.fromString('0xL1_CONTRACT_ADDRESS'),
  value: 0n,
  data: Buffer.from(
    '0x' +
    'a9059cbb' + // transfer(address,uint256)
    '000000000000000000000000RECIPIENT000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000064', // 100
    'hex'
  )
};

const unsignedTx = TokamakL2Tx.fromTxData(txData);

// Step 2.2: Sign with EdDSA
const privateKey = Buffer.from('YOUR_EDDSA_PRIVATE_KEY', 'hex');
const messageHash = unsignedTx.getHashedMessageToSign();
const eddsaSignature = eddsaSign_unsafe(messageHash, privateKey);

// Step 2.3: Create signed transaction
const signedTx = unsignedTx.sign(eddsaSignature);

console.log('Signed Transaction:', signedTx.serialize().toString('hex'));
```

### Step 3: Initialize Synthesizer with L2 Options

```typescript
import { createSynthesizerOptsForSimulationFromRPC } from './interface/rpc/rpc';
import { EVM } from '@ethereumjs/evm';

// Step 3.1: Create L2-specific options
const synthOpts = await createSynthesizerOptsForSimulationFromRPC({
  // RPC configuration
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY',
  
  // L1 contract information
  l1Address: '0xL1_CONTRACT_ADDRESS',
  l1ChannelNonce: 0,
  
  // L2 transaction information
  l2CallIdx: 0,
  l2TxSerialized: signedTx.serialize().toString('hex'),
  
  // L2 state
  l2State: {
    registeredKeys,
    stateValues: initialState
  },
  
  // Cryptographic configuration
  customCrypto: {
    hasher: poseidon,
    getSigner: () => ({
      privateKey,
      publicKey: getEddsaPublicKey(privateKey)
    })
  },
  
  // Mode
  mode: 'l2-state-channel'
});

// Step 3.2: Create EVM with Synthesizer
const evm = await EVM.create({
  common: synthOpts.common,
  stateManager: synthOpts.stateManager, // TokamakL2StateManager
  enableSynthesizer: true
});

console.log('Synthesizer initialized for L2');
```

### Step 4: Execute Transaction

```typescript
// Execute L2 transaction
const result = await evm.runCall({
  to: synthOpts.to,
  caller: synthOpts.from,
  data: synthOpts.data,
  gasLimit: synthOpts.gasLimit,
  value: synthOpts.value
});

console.log('Execution result:', {
  gasUsed: result.execResult.gasUsed,
  returnValue: result.execResult.returnValue.toString('hex'),
  exceptionError: result.execResult.exceptionError
});

// Access Synthesizer
const synthesizer = evm.synthesizer;
console.log('Total placements:', synthesizer.placements.list.length);
```

### Step 5: Export Circuit Files

```typescript
import fs from 'fs';

// Export placement.json
synthesizer.exportPlacementJSON('./output/placement.json');

// Export wireMap.json
synthesizer.exportWireMapJSON('./output/wireMap.json');

// Verify Merkle tree state transition
const finalRoot = synthesizer._stateManager.finalMerkleTree.root;
console.log('Initial Root:', synthesizer._stateManager.initialMerkleTree.root);
console.log('Final Root:', finalRoot);

// Export summary
const summary = {
  initialRoot: synthesizer._stateManager.initialMerkleTree.root,
  finalRoot,
  placementCount: synthesizer.placements.list.length,
  wireMapSize: Object.keys(synthesizer.wireMap).length,
  registeredKeys: synthesizer._stateManager._registeredKeys.length,
  eddsaPublicKey: getEddsaPublicKey(privateKey).toString('hex')
};

fs.writeFileSync('./output/summary.json', JSON.stringify(summary, null, 2));
console.log('Circuit files exported successfully');
```

---

## Circuit Generation

### Event-Driven Architecture

Synthesizer uses three event hooks for L2 transaction processing:

#### 1. beforeMessage Phase

**Purpose**: Verify EdDSA signature before execution

**Handler**: `_prepareSynthesizeTransaction()`

**Source**: [`packages/frontend/synthesizer/src/synthesizer/handlers/instructionHandler.ts:389-450`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/instructionHandler.ts#L389-L450)

```typescript
// Pseudocode for beforeMessage
async beforeMessage(message) {
  if (tx instanceof TokamakL2Tx) {
    // 1. Load message components as DataPt
    const messagePts = [
      TRANSACTION_NONCE,
      CONTRACT_ADDRESS,
      FUNCTION_SELECTOR,
      TRANSACTION_INPUT0, ...
    ].map(varName => this.getReservedVariableFromBuffer(varName));
    
    // 2. Hash message with Poseidon
    const messageHashPt = this.placeCrypto(
      'PoseidonCircuit9',
      messagePts
    );
    
    // 3. Load EdDSA public key
    const publicKeyPts = [
      this.getReservedVariableFromBuffer('EDDSA_PUBLIC_KEY_X'),
      this.getReservedVariableFromBuffer('EDDSA_PUBLIC_KEY_Y')
    ];
    
    // 4. Load signature components
    const randomizerPts = [
      this.getReservedVariableFromBuffer('EDDSA_RANDOMIZER_X'),
      this.getReservedVariableFromBuffer('EDDSA_RANDOMIZER_Y')
    ];
    const signaturePt = this.getReservedVariableFromBuffer('EDDSA_SIGNATURE');
    
    // 5. Verify EdDSA signature
    const isValidPt = this.placeCrypto(
      'EddsaVerify',
      [messageHashPt, ...publicKeyPts, ...randomizerPts, signaturePt]
    );
    
    // 6. Assert signature is valid (must be 1)
    this.placeArith('SUB', [isValidPt, this.loadAuxin(1n)]);
    // If result != 0, circuit will fail
  }
}
```

#### 2. step Phase

**Purpose**: Execute EVM opcodes with symbolic processing

**Handler**: `_applySynthesizerHandler()`

**Source**: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts)

Example: SLOAD from Merkle tree

```typescript
// SLOAD handler for L2
async SLOAD(runState) {
  const key = runState.stack.pop(); // Storage key
  
  // Check if registered key
  const leafIndex = stateManager.getLeafIndex(key);
  
  if (leafIndex !== -1) {
    // Registered key: Load from Merkle tree
    const value = await stateManager.getStorage(address, key);
    
    // Add to circuit as reserved variable
    const valuePt = synthesizer.addReservedVariableToBufferIn(
      'IN_VALUE',
      value,
      true, // dynamic
      `at MT index ${leafIndex}`
    );
    
    runState.stack.push(valuePt);
  } else {
    // General storage: Load from L1 RPC
    const value = await rpcProvider.getStorageAt(address, key);
    const valuePt = synthesizer.loadEnvInf(value);
    runState.stack.push(valuePt);
  }
}
```

#### 3. afterMessage Phase

**Purpose**: Finalize Merkle tree and export roots

**Handler**: `finalizeStorage()`

**Source**: [`packages/frontend/synthesizer/src/synthesizer/synthesizer.ts:163-278`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/synthesizer.ts#L163-L278)

```typescript
// Pseudocode for afterMessage
finalizeStorage() {
  const stateManager = this._stateManager;
  
  if (stateManager instanceof TokamakL2StateManager) {
    // 1. Verify initial Merkle root
    const iniRootPt = this.getReservedVariableFromBuffer('INI_MERKLE_ROOT');
    // iniRootPt should match initial tree root
    
    // 2. Recompute final Merkle tree from leaves
    const finalTree = stateManager.finalMerkleTree;
    const leafCount = stateManager._registeredKeys.length;
    
    // 3. Build tree bottom-up (4-ary)
    const childrenPts = finalTree.leaves.map(leaf => 
      this.placeCrypto('PoseidonCircuit2', [leaf.keyPt, leaf.valuePt])
    );
    
    // Level 1: 64 leaves -> 16 nodes
    const level1Pts = [];
    for (let i = 0; i < 16; i++) {
      const c0 = childrenPts[i * 4 + 0] || NULL_POSEIDON_LEVEL0;
      const c1 = childrenPts[i * 4 + 1] || NULL_POSEIDON_LEVEL0;
      const c2 = childrenPts[i * 4 + 2] || NULL_POSEIDON_LEVEL0;
      const c3 = childrenPts[i * 4 + 3] || NULL_POSEIDON_LEVEL0;
      
      level1Pts.push(
        this.placeCrypto('PoseidonCircuit4', [c0, c1, c2, c3])
      );
    }
    
    // Level 2: 16 nodes -> 4 nodes
    const level2Pts = [];
    for (let i = 0; i < 4; i++) {
      level2Pts.push(
        this.placeCrypto('PoseidonCircuit4', level1Pts.slice(i * 4, (i + 1) * 4))
      );
    }
    
    // Level 3: 4 nodes -> 1 root
    const finalRootPt = this.placeCrypto('PoseidonCircuit4', level2Pts);
    
    // 4. Export final root as public output
    this.addReservedVariableToBufferOut(
      'RES_MERKLE_ROOT',
      finalRootPt,
      true // dynamic
    );
    
    console.log('Merkle tree finalized');
  }
}
```

### Subcircuit Usage

| Subcircuit          | Purpose                          | Input Wires | Output Wires |
| ------------------- | -------------------------------- | ----------- | ------------ |
| `PoseidonCircuit2`  | Hash 2 field elements (leaf)     | 2           | 1            |
| `PoseidonCircuit4`  | Hash 4 field elements (parent)   | 4           | 1            |
| `PoseidonCircuit9`  | Hash 9 field elements (message)  | 9           | 1            |
| `EddsaVerify`       | Verify EdDSA signature           | 6           | 1 (0 or 1)   |
| `JubjubExp`         | JubJub scalar multiplication     | 3           | 2 (point)    |

---

## Testing and Verification

### Test Checklist

1. **EdDSA Signature**
   - [ ] Sign transaction with private key
   - [ ] Verify signature off-chain
   - [ ] Verify signature in-circuit (EddsaVerify placement)

2. **Merkle Tree State**
   - [ ] Initial root matches on-chain state
   - [ ] Leaf updates reflect SSTORE operations
   - [ ] Final root computed correctly (4-ary, depth 4)
   - [ ] Empty nodes use NULL_POSEIDON_LEVELn constants

3. **Storage Access**
   - [ ] Registered keys load from Merkle tree
   - [ ] General keys load from L1 RPC
   - [ ] Storage writes update final tree
   - [ ] L1/L2 key hashing works correctly

4. **Circuit Generation**
   - [ ] beforeMessage verifies EdDSA signature
   - [ ] step processes EVM opcodes
   - [ ] afterMessage finalizes Merkle tree
   - [ ] Output files (placement.json, wireMap.json) are valid

5. **Proof Generation**
   - [ ] Backend prover accepts circuit files
   - [ ] Proof generation completes (1-2 minutes)
   - [ ] Proof verifies on-chain (Solidity verifier)

### Example Test

```typescript
import { test } from 'vitest';
import { createL2Transaction } from './helpers';

test('L2 transaction with EdDSA and Merkle tree', async () => {
  // 1. Setup
  const privateKey = Buffer.from('TEST_PRIVATE_KEY', 'hex');
  const registeredKeys = ['0x01', '0x02'];
  const initialState = { '0x01': '0xff', '0x02': '0x100' };
  
  // 2. Create signed transaction
  const tx = await createL2Transaction({
    privateKey,
    to: '0xL1_CONTRACT',
    data: '0x...' // ERC-20 transfer
  });
  
  // 3. Initialize Synthesizer
  const { evm, stateManager } = await setupL2Synthesizer({
    tx,
    registeredKeys,
    initialState
  });
  
  // 4. Execute
  const result = await evm.runCall({ /* ... */ });
  
  // 5. Verify results
  expect(result.execResult.exceptionError).toBeUndefined();
  expect(stateManager.finalMerkleTree.root).not.toBe(
    stateManager.initialMerkleTree.root
  );
  
  // 6. Verify circuit files
  const placements = evm.synthesizer.placements.list;
  const eddsaVerifyPlacement = placements.find(p => p.name === 'EddsaVerify');
  expect(eddsaVerifyPlacement).toBeDefined();
  
  const poseidonPlacements = placements.filter(p => 
    p.name.startsWith('PoseidonCircuit')
  );
  expect(poseidonPlacements.length).toBeGreaterThan(0);
  
  console.log('Test passed!');
});
```

---

## Related Resources

### Tokamak zk-EVM Source Code

**L2 Transaction**:
- [TokamakL2Tx](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/tx/TokamakL2Tx.ts)
- [Transaction Signing](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/tx/TokamakL2Tx.ts#L189-L235)

**L2 State Management**:
- [TokamakL2StateManager](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts)
- [Merkle Tree](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/MerkleTree.ts)
- [Storage Key Hashing](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts#L78-L95)

**Cryptographic Primitives**:
- [Poseidon Hash](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts#L10-L35)
- [EdDSA Sign](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts#L37-L68)
- [EdDSA Verify](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts#L70-L95)
- [Public Key Derivation](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts#L97-L110)

**Synthesizer Event Hooks**:
- [beforeMessage (_prepareSynthesizeTransaction)](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/instructionHandler.ts#L389-L450)
- [afterMessage (finalizeStorage)](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/synthesizer.ts#L163-L278)
- [EVM Hooks Registration](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/synthesizer.ts#L110-L141)

**RPC Integration**:
- [createSynthesizerOptsForSimulationFromRPC](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/interface/rpc/rpc.ts)
- [L2 Mode Initialization](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/interface/rpc/rpc.ts#L150-L280)

**Reserved Variables**:
- [L2-Specific Variables](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/types/buffers.ts#L5-L310)
- [Variable Descriptions](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/types/buffers.ts#L326-L587)

### Academic References

- **Tokamak zk-SNARK Paper**: [https://eprint.iacr.org/2024/507](https://eprint.iacr.org/2024/507)
- **EdDSA**: [RFC 8032](https://datatracker.ietf.org/doc/html/rfc8032)
- **Poseidon Hash**: [Poseidon: A New Hash Function for Zero-Knowledge Proof Systems](https://eprint.iacr.org/2019/458)
- **JubJub Curve**: [Zcash Sapling Specification](https://github.com/zcash/zips/blob/main/protocol/protocol.pdf)

### Related Documentation

- [Synthesizer Concepts](./synthesizer-concepts.md)
- [Execution Flow](./synthesizer-execution-flow.md)
- [Architecture](./synthesizer-architecture.md)
- [Data Structures](./synthesizer-data-structure.md)
- [Opcodes](./synthesizer-opcodes.md)

