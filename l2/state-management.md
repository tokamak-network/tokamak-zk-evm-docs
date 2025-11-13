# L2 State Channels: State Management

This document describes `TokamakL2StateManager`, which provides Merkle tree-based storage for L2 state channels.

---

## 📋 Overview

`TokamakL2StateManager` manages user storage in L2 state channels using a **4-ary Merkle tree** with **Poseidon hash function**. It tracks up to 64 registered storage keys and computes state commitments (Merkle roots) before and after transaction execution.

**Source**: [`TokamakL2StateManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts)

---

## 🌳 Merkle Tree Structure

### Configuration

```typescript
{
  arity: 4,          // 4-ary tree (each node has 4 children)
  depth: 4,          // 4 levels (root = level 3)
  maxLeaves: 64,     // Maximum 64 leaves (4³ = 64)
  hasher: poseidon   // Poseidon hash function
}
```

### Tree Diagram

```
                         Root (Level 3)
                           /  |  \  \
                          /   |   \   \
               Level 2:  N0  N1  N2  N3  (4 nodes)
                        /|\ /|\ /|\ /|\
           Level 1:   [...16 nodes...]  (4×4 = 16 nodes)
                      /|\ ...
       Level 0:   [64 leaves max]       (4×16 = 64 leaves)

Leaf Structure:
┌──────────────────────────────────────┐
│ Leaf = Poseidon(key, value)          │
│ - key: Registered storage key        │
│ - value: Storage value (32 bytes)    │
└──────────────────────────────────────┘

Parent Node:
┌──────────────────────────────────────┐
│ Parent = Poseidon(C0, C1, C2, C3)    │
│ - C0, C1, C2, C3: Child hashes       │
│ - Empty child = NULL_POSEIDON_LEVELn │
└──────────────────────────────────────┘
```

### Null Node Constants

For empty tree positions, predefined constants are used:

```typescript
NULL_POSEIDON_LEVEL0 = poseidon(0, 0);
NULL_POSEIDON_LEVEL1 = poseidon(
  NULL_POSEIDON_LEVEL0, NULL_POSEIDON_LEVEL0,
  NULL_POSEIDON_LEVEL0, NULL_POSEIDON_LEVEL0
);
NULL_POSEIDON_LEVEL2 = poseidon(
  NULL_POSEIDON_LEVEL1, NULL_POSEIDON_LEVEL1,
  NULL_POSEIDON_LEVEL1, NULL_POSEIDON_LEVEL1
);
// ... and so on
```

---

## 🔑 Storage Key Management

### Registered Keys vs General Storage

`TokamakL2StateManager` handles two types of storage:

#### 1. Registered Keys (Merkle Tree)

These are **pre-registered** storage keys managed in the Merkle tree:

```typescript
const registeredKeys = [
  '0x0000000000000000000000000000000000000000000000000000000000000001',  // Leaf 0
  '0x0000000000000000000000000000000000000000000000000000000000000002',  // Leaf 1
  // ... up to 64 keys
];
```

- **Limit**: Max 64 keys
- **Location**: Merkle tree leaves
- **Commitment**: Included in Merkle root
- **Circuit**: All accesses are proven in-circuit

#### 2. General Storage (Non-Merkle)

These are **any other** storage keys not registered:

```typescript
const generalStorage = {
  '0xANY_OTHER_KEY': '0xVALUE'
};
```

- **Limit**: Unlimited
- **Location**: Separate map (not in Merkle tree)
- **Commitment**: Not included in Merkle root
- **Circuit**: Not proven (loaded as external data)

---

## 🧮 Storage Key Hashing

### L1 vs L2 Storage Keys

`TokamakL2StateManager` uses different hashing schemes for L1 contract storage vs L2 user storage:

#### L1 Contract Storage (General Keys)

```typescript
// Standard Ethereum storage key hashing
const l1Key = keccak256(abi.encode(l1ContractAddress, rawKey));
```

**Used for**:
- L1 contract's own state variables
- Non-registered storage keys
- Compatibility with standard Ethereum storage

#### L2 User Storage (Registered Keys)

```typescript
// Poseidon-based hashing for L2 user storage
const l2Key = poseidon(
  l1ContractAddress,
  poseidon(l2CallerAddress, rawKey)
);
```

**Used for**:
- User-specific storage in state channels
- Registered keys in Merkle tree
- Circuit-friendly hashing

**Example**:
```typescript
import { poseidon } from 'synthesizer/crypto';
import { Address } from '@ethereumjs/util';

const l1Contract = Address.fromString('0x123...');
const l2Caller = Address.fromString('0x456...');
const rawKey = 0x01n;

const l2StorageKey = poseidon(
  BigInt(l1Contract.toString()),
  poseidon(BigInt(l2Caller.toString()), rawKey)
);
```

---

## 🏗️ Class Structure

### State Manager Properties

```typescript
class TokamakL2StateManager {
  // L1 contract address (channel identifier)
  private _l1ContractAddress: Address;
  
  // Registered keys (up to 64)
  private _registeredKeys: string[];
  
  // Initial Merkle tree (before TX execution)
  private _initialMerkleTree: MerkleTree4;
  
  // Final Merkle tree (after TX execution)
  private _finalMerkleTree: MerkleTree4;
  
  // General storage (non-Merkle)
  private _generalStorage: Map<string, Buffer>;
  
  // RPC provider for L1 contract queries
  private _rpcProvider: Provider;
}
```

---

## 🔧 API Reference

### Creating a State Manager

```typescript
import { TokamakL2StateManager } from 'synthesizer';
import { Address } from '@ethereumjs/util';

const stateManager = new TokamakL2StateManager({
  l1ContractAddress: Address.fromString('0x123...'),
  registeredKeys: [
    '0x0000000000000000000000000000000000000000000000000000000000000001',
    '0x0000000000000000000000000000000000000000000000000000000000000002',
  ],
  initialStateValues: {
    '0x0000...0001': 100n,
    '0x0000...0002': 200n,
  },
  rpcProvider: alchemyProvider
});
```

---

### Key Methods

#### `getStorage(address: Address, key: Buffer): Promise<Buffer>`

Reads storage value from **initial state** (before TX execution).

```typescript
const value = await stateManager.getStorage(
  contractAddress,
  Buffer.from('0000...0001', 'hex')
);
// Returns: Buffer (32 bytes)
```

**Behavior**:
- If `key` is registered → read from `_initialMerkleTree`
- If `key` is not registered → read from `_generalStorage` or RPC

---

#### `putStorage(address: Address, key: Buffer, value: Buffer): Promise<void>`

Writes storage value to **final state** (after TX execution).

```typescript
await stateManager.putStorage(
  contractAddress,
  Buffer.from('0000...0001', 'hex'),
  Buffer.from('00000000000000000000000000000000000000000000000000000000000000ff', 'hex')
);
```

**Behavior**:
- If `key` is registered → update `_finalMerkleTree` leaf
- If `key` is not registered → update `_generalStorage`

---

#### `getUserStorageKey(l2Caller: Address, rawKey: bigint): bigint`

Computes L2 storage key from user address and raw key.

```typescript
const l2Key = stateManager.getUserStorageKey(
  Address.fromString('0xUSER_ADDRESS'),
  0x01n
);
// Returns: poseidon(l1ContractAddress, poseidon(l2Caller, rawKey))
```

**Used for**:
- Mapping user-specific storage to registered keys
- Ensuring each user has isolated storage slots

---

#### `getMTIndex(key: Buffer): number`

Gets the Merkle tree leaf index for a registered key.

```typescript
const leafIndex = stateManager.getMTIndex(keyBuffer);
// Returns: 0-63 if registered, -1 if not registered
```

---

#### `getMerkleProof(leafIndex: number): Buffer[]`

Generates a Merkle proof for a leaf.

```typescript
const proof = stateManager.getMerkleProof(leafIndex);
// Returns: Array of sibling hashes (length = depth = 4)
```

**Proof Structure**:
```
[
  sibling0,  // Leaf level
  sibling1,  // Level 1
  sibling2,  // Level 2
  sibling3   // Level 3 (root)
]
```

---

#### `getUpdatedMerkleTreeRoot(): Buffer`

Computes the final Merkle root after all storage updates.

```typescript
const finalRoot = stateManager.getUpdatedMerkleTreeRoot();
// Returns: 32-byte Buffer (Poseidon hash)
```

**Used for**:
- Public output in zk-SNARK circuit
- On-chain verification

---

## 💡 Usage Examples

### Example 1: Initialize with Empty State

```typescript
import { TokamakL2StateManager } from 'synthesizer';
import { Address } from '@ethereumjs/util';

const stateManager = new TokamakL2StateManager({
  l1ContractAddress: Address.fromString('0x123...'),
  registeredKeys: [
    '0x0000000000000000000000000000000000000000000000000000000000000001',
    '0x0000000000000000000000000000000000000000000000000000000000000002',
  ],
  initialStateValues: {
    '0x0000...0001': 0n,
    '0x0000...0002': 0n,
  },
  rpcProvider: provider
});

console.log('Initial Root:', stateManager._initialMerkleTree.root.toString('hex'));
```

---

### Example 2: Update Storage

```typescript
// Read initial value
const key1 = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
const initialValue = await stateManager.getStorage(contractAddress, key1);
console.log('Initial:', initialValue.toString('hex')); // 0x00...00

// Execute transaction (Synthesizer calls putStorage internally)
await stateManager.putStorage(
  contractAddress,
  key1,
  Buffer.from('00000000000000000000000000000000000000000000000000000000000000ff', 'hex')
);

// Compute final root
const finalRoot = stateManager.getUpdatedMerkleTreeRoot();
console.log('Final Root:', finalRoot.toString('hex'));
```

---

### Example 3: User-Specific Storage

```typescript
import { poseidon } from 'synthesizer/crypto';

// User A wants to store value in slot 1
const userA = Address.fromString('0xUSER_A');
const userAKey = stateManager.getUserStorageKey(userA, 0x01n);

await stateManager.putStorage(contractAddress, Buffer.from(userAKey.toString(16), 'hex'), Buffer.from('...', 'hex'));

// User B wants to store value in slot 1 (different key!)
const userB = Address.fromString('0xUSER_B');
const userBKey = stateManager.getUserStorageKey(userB, 0x01n);

await stateManager.putStorage(contractAddress, Buffer.from(userBKey.toString(16), 'hex'), Buffer.from('...', 'hex'));

// userAKey !== userBKey (isolated storage)
```

---

## 🔄 State Transition Flow

### During Transaction Execution

```
1. Initialize TokamakL2StateManager
   ├─► Build initial Merkle tree from registeredKeys + initialStateValues
   ├─► Compute initial root → PUBLIC_IN[0]
   └─► Clone initial tree to final tree

2. Execute EVM Bytecode
   ├─► SLOAD → getStorage() → read from _initialMerkleTree
   ├─► SSTORE → putStorage() → write to _finalMerkleTree
   └─► Repeat for all storage operations

3. Finalize Storage (afterMessage phase)
   ├─► Recompute _finalMerkleTree from leaves
   ├─► Compute final root → PUBLIC_OUT[0]
   └─► Generate Merkle proofs for all accessed leaves
```

---

## 📊 Performance Characteristics

### Merkle Tree Complexity

| Operation            | Time Complexity | Circuit Complexity |
| -------------------- | --------------- | ------------------ |
| **Leaf Update**      | O(1)            | 1 Poseidon (2-in)  |
| **Root Computation** | O(depth)        | 4-ary tree hashing |
| **Proof Generation** | O(depth)        | -                  |
| **Proof Verification** | O(depth)      | depth × Poseidon   |

### Circuit Cost (64 leaves, depth 4)

- **Level 0 (leaves)**: 64 Poseidon(2) = ~6,400 constraints
- **Level 1**: 16 Poseidon(4) = ~2,400 constraints
- **Level 2**: 4 Poseidon(4) = ~600 constraints
- **Level 3 (root)**: 1 Poseidon(4) = ~150 constraints
- **Total**: ~9,550 constraints per Merkle tree

---

## 🔗 Related Resources

- [Architecture](architecture.md) - Component overview
- [Transaction](transaction.md) - TokamakL2Tx details
- [Cryptography](cryptography.md) - Poseidon hash function
- [Integration Guide](integration-guide.md) - Full implementation

**Source Code**:
- [TokamakL2StateManager.ts](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts)
- [MerkleTree.ts](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/MerkleTree.ts)

---

**Next**: See [Cryptography](cryptography.md) to learn about Poseidon and EdDSA.


