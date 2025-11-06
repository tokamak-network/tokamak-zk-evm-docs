# Synthesizer L2 State Channel Documentation Update TODO

> **Last Updated**: 2025-01-06  
> **Status**: 🔴 In Progress  
> **Purpose**: Track documentation updates required for Synthesizer's L2 state channel implementation

---

## 📊 Progress Overview

- [x] **Phase 1: Critical Updates** (1/3) ✅
- [ ] **Phase 2: High Priority** (0/3)
- [ ] **Phase 3: Medium Priority** (0/2)
- [ ] **Phase 4: Low Priority** (0/2)

**Total Progress**: 1/10 tasks completed (10%)

---

## 🎯 Phase 1: Critical Updates (MUST DO FIRST)

### ✅ Task 1.1: Update `synthesizer-concepts.md` - L2 Features

**Priority**: 🔥 CRITICAL  
**Status**: ✅ COMPLETED (2025-01-06)  
**Estimated Time**: 3-4 hours

#### Changes Required:

1. **Add Section: "L2 State Channel Transaction Signing"**
   - Location: After "Features not yet implemented"
   - Content:
     - EdDSA (JubJub curve) vs ECDSA comparison
     - Why EdDSA for state channels (circuit efficiency)
     - Transaction signature structure (`v`, `r`, `s` field meanings)
     - Public key recovery process

2. **Add Section: "L2 State Management with Merkle Trees"**
   - Location: Before "Stack, memory, storage, and flow operations"
   - Content:
     - Initial Merkle Root → Execution → Result Merkle Root flow
     - 4-ary Merkle tree structure (depth=4, arity=4)
     - Registered keys (max 64) vs. general storage
     - Poseidon hash for Merkle tree construction
     - Visual diagram of state transition

3. **Update Section: "Arithmetic, comparison, and bitwise logic operations"**
   - Add subsection: "Poseidon Hash Function"
   - Explain: Poseidon replaces Keccak256 for L2 state channels
   - L1 (Keccak256) vs. L2 (Poseidon) usage distinction

4. **Update Section: "Features not yet implemented"**
   - ~~Remove: "Batch transaction execution"~~ → Move to "Implemented Features"
   - Add: Batch transaction infrastructure is ready (needs testing)

#### Reference Files:
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/synthesizer/synthesizer.ts`
  - Lines 163-278: `finalizeStorage()` method
  - Lines 280-328: `synthesizeTX()` method
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/TokamakL2JS/tx/TokamakL2Tx.ts`
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts`

---

### ✅ Task 1.2: Update `synthesizer-execution-flow.md` - New Lifecycle

**Priority**: 🔥 CRITICAL  
**Status**: ⬜ TODO  
**Estimated Time**: 2-3 hours

#### Changes Required:

1. **Rewrite Section: "Code Execution Overview"**
   - Replace entire flow diagram with new event-driven architecture
   - Add 3 phases:
     - Phase 1: `beforeMessage` event → `_prepareSynthesizeTransaction()`
     - Phase 2: `step` event → `_applySynthesizerHandler()` (for each opcode)
     - Phase 3: `afterMessage` event → `finalizeStorage()`

2. **Add Section: "Transaction Signature Verification (beforeMessage)"**
   - Content:
     - EdDSA signature verification placements
     - ORIGIN address recovery from public key
     - Function selector and inputs preparation

3. **Add Section: "Storage Finalization (afterMessage)"**
   - Content:
     - Merkle tree construction algorithm
     - `computeParentsNodePts()` function logic
     - `padLeaves()` padding strategy
     - Initial vs. Final Merkle root verification
     - General storage handling

4. **Update Section: "Initialization Phase"**
   - Add: `createSynthesizerOptsForSimulationFromRPC()` usage
   - Explain: L1 RPC → L2 state conversion
   - Show: User address mapping (L1 → L2 public key)

#### Reference Files:
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/synthesizer/synthesizer.ts:39-139`
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/interface/rpc/rpc.ts:64-101`

---

### ✅ Task 1.3: Update `synthesizer-architecture.md` - Class Structure

**Priority**: 🔥 CRITICAL  
**Status**: ⬜ TODO  
**Estimated Time**: 3-4 hours

#### Changes Required:

1. **Fix Section: "Class Structure" - Handler Names**
   - REMOVE incorrect handlers:
     - ~~`OperationHandler`~~
     - ~~`DataLoader`~~
   - ADD correct handlers:
     - `ArithmeticManager` (`src/synthesizer/handlers/arithmeticManager.ts`)
     - `InstructionHandler` (`src/synthesizer/handlers/instructionHandler.ts`)
     - `BufferManager` (`src/synthesizer/handlers/bufferManager.ts`)
     - `MemoryManager` (`src/synthesizer/handlers/memoryManager.ts`)
     - `StateManager` (`src/synthesizer/handlers/stateManager.ts`)

2. **Update Section: "Repository Structure"**
   - Update all file paths to match new structure:
     ```
     packages/frontend/synthesizer/src/
     ├── synthesizer/
     │   ├── synthesizer.ts           # Main Synthesizer class
     │   ├── handlers/                # Handler classes
     │   ├── dataStructure/           # DataPt, StackPt, MemoryPt
     │   └── types/                   # Type definitions
     ├── TokamakL2JS/                 # NEW: L2 components
     │   ├── tx/                      # TokamakL2Tx class
     │   ├── stateManager/            # TokamakL2StateManager
     │   └── crypto/                  # EdDSA, Poseidon
     └── interface/                   # External interfaces
     ```

3. **Add Section: "L2 Components" (NEW)**
   - `TokamakL2Tx` class architecture
   - `TokamakL2StateManager` class architecture
   - Crypto utilities (EdDSA, Poseidon)

4. **Update Section: "Core Architecture" - Synthesizer Class**
   - Update constructor to show new handler instantiation
   - Fix delegate method names
   - Add: `finalizeStorage()` method signature

5. **Fix ALL Source Code Line Numbers**
   - Current line numbers in document are outdated
   - Update every `[filename.ts:line]` reference
   - Verify each code snippet exists at specified location

#### Reference Files:
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/synthesizer/synthesizer.ts:19-468`
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/synthesizer/handlers/`

---

## 🔥 Phase 2: High Priority

### ✅ Task 2.1: Update `synthesizer-data-structure.md` - Reserved Variables

**Priority**: ⚡ HIGH  
**Status**: ⬜ TODO  
**Estimated Time**: 2-3 hours

#### Changes Required:

1. **Rewrite Section: "Reserved Variables" Table**
   - Create comprehensive table with ALL variables from `buffers.ts`
   - Columns: Variable Name | Buffer | Wire Index | Bit Size | Description | Usage (L1/L2)

2. **Add Variables to PUBLIC_IN Buffer**
   ```
   - INI_MERKLE_ROOT           (wireIndex: 0, 255-bit)
   - EDDSA_PUBLIC_KEY_X        (wireIndex: 1, 255-bit)
   - EDDSA_PUBLIC_KEY_Y        (wireIndex: 2, 255-bit)
   - OTHER_CONTRACT_STORAGE_IN (wireIndex: dynamic, 256-bit)
   ```

3. **Add Variables to PUBLIC_OUT Buffer**
   ```
   - RES_MERKLE_ROOT           (wireIndex: dynamic, 255-bit)
   - OTHER_CONTRACT_STORAGE_OUT (wireIndex: dynamic, 256-bit)
   ```

4. **Add Variables to PRIVATE_IN Buffer**
   ```
   - CONTRACT_ADDRESS          (wireIndex: 0, 160-bit)
   - FUNCTION_SELECTOR         (wireIndex: 1, 255-bit)
   - TRANSACTION_NONCE         (wireIndex: 2, 255-bit)
   - TRANSACTION_INPUT0~8      (wireIndex: 3-11, 255-bit each)
   - EDDSA_SIGNATURE           (wireIndex: 12, 255-bit)
   - EDDSA_RANDOMIZER_X        (wireIndex: 13, 255-bit)
   - EDDSA_RANDOMIZER_Y        (wireIndex: 14, 255-bit)
   - IN_MT_INDEX               (wireIndex: dynamic, 255-bit)
   - IN_MPT_KEY                (wireIndex: dynamic, 255-bit)
   - IN_VALUE                  (wireIndex: dynamic, 255-bit)
   - MERKLE_PROOF              (wireIndex: dynamic, 255-bit)
   ```

5. **Add Variables to EVM_IN Buffer**
   ```
   - ADDRESS_MASK              (wireIndex: 0, 160-bit)
   - JUBJUB_BASE_X/Y           (wireIndex: 1-2, 255-bit)
   - JUBJUB_POI_X/Y            (wireIndex: 3-4, 255-bit)
   - NULL_POSEIDON_LEVEL0~3    (wireIndex: 5-8, 255-bit)
   ```

6. **Add Section: "Buffer System Overview"**
   - Explain 5 buffer types and their purposes
   - Static vs. Dynamic wire indices
   - L2-specific buffers

#### Reference Files:
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/synthesizer/types/buffers.ts:1-587`
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/interface/qapCompiler/importedConstants.ts:25-31`

---

### ✅ Task 2.2: Update `synthesizer.md` (Frontend README) - Usage Examples

**Priority**: ⚡ HIGH  
**Status**: ⬜ TODO  
**Estimated Time**: 1-2 hours

#### Changes Required:

1. **Update Section: "How to use Synthesizer"**
   - Replace old RPC example with new `createSynthesizerOptsForSimulationFromRPC()`
   - Show complete example:
     ```typescript
     import { createSynthesizerOptsForSimulationFromRPC } from './interface/index.ts';
     
     const opts = await createSynthesizerOptsForSimulationFromRPC({
       rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
       blockNumber: 12345678,
       contractAddress: '0x...',
       addressListL1: ['0x...'],
       publicKeyListL2: [pubKeyBytes],
       senderL2PrvKey: privateKeyBytes,
       txNonce: 0n,
       userStorageSlots: [0, 1],
       callData: calldataBytes,
     });
     
     const synthesizer = new Synthesizer(opts);
     const result = await synthesizer.synthesizeTX();
     ```

2. **Add Section: "L2 State Channel Mode"**
   - Explain when to use L2 mode
   - Differences from regular transaction processing
   - EdDSA key generation example

3. **Update Section: "Supported EVM Operations"**
   - No changes needed (table is already accurate from source README)

#### Reference Files:
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/README.md`
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/interface/rpc/rpc.ts`

---

### ✅ Task 2.3: Create NEW Document - `synthesizer-l2-state-channels.md`

**Priority**: ⚡ HIGH  
**Status**: ⬜ TODO  
**Estimated Time**: 4-5 hours

#### Document Outline:

```markdown
# Synthesizer: L2 State Channels

## Overview
- What are state channels?
- Why Tokamak uses Poseidon + EdDSA for L2
- Benefits: Privacy, efficiency, lower gas costs

## Transaction Flow
1. Off-chain transaction creation (EdDSA signing)
2. State channel execution with Merkle tree tracking
3. On-chain settlement (proof verification)

## Merkle Tree State Management
### Structure
- 4-ary tree, depth 4 (max 64 leaves)
- Poseidon hash function
- Leaf format: Poseidon(index, key, value, 0)

### Initial State
- Load from L1 contract storage
- L1 address → L2 public key mapping
- Construct initial Merkle root

### State Transitions
- Track registered keys (user storage)
- Update Merkle tree during execution
- Generate final Merkle root

### Merkle Proof Verification
- In-circuit proof generation
- VerifyMerkleProof subcircuit usage
- Null node handling

## EdDSA Signature Scheme
### Why EdDSA for State Channels?
- Circuit-friendly (vs. ECDSA)
- Smaller constraint count
- JubJub curve (embedded in BLS12-381)

### Signature Process
1. Message construction (nonce, to, selector, inputs)
2. Sign with private key
3. Verification in-circuit (implied, handled by backend)

### TokamakL2Tx Format
- Field descriptions (v, r, s reinterpretation)
- getSenderPublicKey() implementation
- Address derivation from public key

## Storage Key Calculation
### L1 vs. L2
- L1: Keccak256 (Ethereum compatibility)
- L2: Poseidon (circuit efficiency)
- getUserStorageKey() method

## Registered vs. General Storage
### Registered Storage
- Pre-defined in TokamakL2StateManagerOpts
- Tracked in Merkle tree
- Part of public inputs/outputs

### General Storage
- Accessed during execution
- Not in Merkle tree
- Handled via OTHER_CONTRACT_STORAGE_IN/OUT buffers

## Batch Transactions (Future)
- Current: Single transaction per proof
- Planned: Multiple transactions per proof
- State accumulation across transactions

## Example: Opening a State Channel
[Code example showing complete flow]

## Example: Closing a State Channel
[Code example showing settlement]
```

#### Reference Files:
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/TokamakL2JS/`
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/synthesizer/synthesizer.ts:163-278`
- Paper: https://eprint.iacr.org/2024/507

---

## 📌 Phase 3: Medium Priority

### ✅ Task 3.1: Update `synthesizer-opcodes.md` - Cryptographic Operations

**Priority**: 📌 MEDIUM  
**Status**: ⬜ TODO  
**Estimated Time**: 2-3 hours

#### Changes Required:

1. **Add Section: "Cryptographic Operations" (NEW)**
   - Location: After "Arithmetic Operations"
   
2. **Add Entry: Poseidon Hash**
   ```markdown
   ### Poseidon Hash
   **Subcircuit**: `Poseidon`
   **Inputs**: 4 (configurable via POSEIDON_INPUTS)
   **Outputs**: 1
   **Constraints**: ~150 (estimated)
   **Usage**: 
   - State channel storage key hashing
   - Merkle tree node computation
   - Replacement for Keccak256 in L2 mode
   ```

3. **Add Entry: JubJub Scalar Multiplication**
   ```markdown
   ### JubJub Exponentiation
   **Subcircuit**: `JubjubExp`
   **Inputs**: Base point (x, y), scalar, PoI (x, y)
   **Outputs**: Result point (x, y)
   **Constraints**: ~TBD
   **Usage**:
   - EdDSA signature verification
   - Public key derivation
   ```

4. **Add Entry: Merkle Proof Verification**
   ```markdown
   ### Verify Merkle Proof
   **Subcircuit**: `VerifyMerkleProof`
   **Inputs**: 4 children + 1 expected root
   **Outputs**: None (constraint check)
   **Constraints**: ~TBD
   **Usage**:
   - Initial state verification
   - L2 state channel validation
   ```

5. **Update Section: "KECCAK256"**
   - Add note: "In L2 state channel mode, replaced by Poseidon hash"

#### Reference Files:
- Source: `Tokamak-zk-EVM/packages/frontend/qap-compiler/subcircuits/library/` (check for .circom files)
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/interface/qapCompiler/configuredTypes.ts`

---

### ✅ Task 3.2: Create NEW Document - `synthesizer-cryptography.md`

**Priority**: 📌 MEDIUM  
**Status**: ⬜ TODO  
**Estimated Time**: 3-4 hours

#### Document Outline:

```markdown
# Synthesizer: Cryptographic Primitives

## Overview
Why L2 state channels need different cryptography

## Poseidon Hash Function
### Design
- Arithmetic-friendly
- Low constraint count in circuits
- 4-input sponge construction

### Implementation
- poseidon_raw() function
- Folding algorithm for variable-length inputs
- Constants and parameters

### Usage in Synthesizer
- Storage key calculation
- Merkle tree hashing
- State commitment

### Poseidon vs. Keccak256
| Feature | Poseidon | Keccak256 |
|---------|----------|-----------|
| Constraints | ~150 | ~150,000 |
| Circuit-friendly | ✅ Yes | ❌ No |
| Ethereum-compatible | ❌ No | ✅ Yes |
| Usage | L2 state channels | L1 compatibility |

## EdDSA on JubJub Curve
### Why JubJub?
- Embedded in BLS12-381 (pairing-friendly)
- Efficient in Tokamak zk-SNARK
- Twisted Edwards curve

### Curve Parameters
- Base point
- Order
- Point at infinity (PoI)

### Signature Algorithm
1. **Key Generation**: sk → pk = sk * G
2. **Signing**: 
   - r = H(nonce, sk, msg) mod order
   - R = r * G
   - e = H(R, pk, msg)
   - s = r + e*sk mod order
   - signature = (R, s)
3. **Verification**: s*G = R + e*pk

### Implementation Details
- eddsaSign_unsafe() function
- eddsaVerify() function
- nonce generation strategy

### EdDSA vs. ECDSA
| Feature | EdDSA (JubJub) | ECDSA (secp256k1) |
|---------|----------------|-------------------|
| Constraints | ~10,000 | ~500,000 |
| Deterministic | ✅ Yes (with nonce) | ⚠️ Optional |
| Ethereum-compatible | ❌ No | ✅ Yes |
| Usage | L2 state channels | L1 transactions |

## Address Derivation
### L1 (Ethereum)
keccak256(pubkey)[12:] (20 bytes)

### L2 (Tokamak)
poseidon(pubkey_x, pubkey_y, 0, 0)[12:] (20 bytes)

### fromEdwardsToAddress()
Implementation details

## Merkle Tree Construction
### 4-ary Tree
- Why 4 children per node?
- Depth vs. width trade-offs

### Node Hashing
hash = Poseidon(child0, child1, child2, child3)

### Null Nodes
- Precomputed null hashes at each level
- NULL_POSEIDON_LEVEL0~3 constants

### Proof Format
[sibling0, sibling1, sibling2, ...] for each level

## Security Considerations
- Nonce management for EdDSA
- Preimage resistance of Poseidon
- Collision resistance in Merkle trees
```

#### Reference Files:
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts`
- Source: `Tokamak-zk-EVM/packages/frontend/synthesizer/src/synthesizer/params/index.ts`
- Paper: https://eprint.iacr.org/2024/507

---

## 📋 Phase 4: Low Priority (Polish)

### ✅ Task 4.1: Fix All Source Code References

**Priority**: 📋 LOW  
**Status**: ⬜ TODO  
**Estimated Time**: 3-4 hours

#### Changes Required:

Go through ALL existing documentation files and:

1. **Verify every file path reference**
   - Check if file still exists at that path
   - Update to new path if moved

2. **Update every line number reference**
   - Format: `[filename.ts:123]`
   - Verify code still exists at that line
   - Update if line has changed

3. **Fix broken code snippets**
   - Re-copy from actual source
   - Ensure syntax highlighting is correct

4. **Update all import statements in examples**
   - Old: `import { ... } from 'src/tokamak/core/synthesizer'`
   - New: `import { ... } from 'src/synthesizer'`

#### Files to Check:
- [ ] `frontend/synthesizer/synthesizer-concepts.md`
- [ ] `frontend/synthesizer/synthesizer-execution-flow.md`
- [ ] `frontend/synthesizer/synthesizer-architecture.md`
- [ ] `frontend/synthesizer/synthesizer-data-structure.md`
- [ ] `frontend/synthesizer/synthesizer-opcodes.md`
- [ ] `frontend/synthesizer.md`

---

### ✅ Task 4.2: Create NEW Document - `synthesizer-api-reference.md`

**Priority**: 📋 LOW  
**Status**: ⬜ TODO  
**Estimated Time**: 2-3 hours

#### Document Outline:

```markdown
# Synthesizer: API Reference

## Synthesizer Class

### Constructor
### Methods
- synthesizeTX()
- finalizeStorage()
- placeArith()
- placePoseidon()
- placeJubjubExp()
- loadStorage()
- etc.

## TokamakL2Tx Class

### Constructor
### Properties
### Methods
- sign()
- verify()
- getSenderPublicKey()
- getSenderAddress()
- getFunctionSelector()
- getFunctionInput()

## TokamakL2StateManager Class

### Constructor
### Methods
- initTokamakExtendsFromRPC()
- getUserStorageKey()
- getUpdatedMerkleTreeRoot()
- etc.

## Utility Functions

### createSynthesizerOptsForSimulationFromRPC()
### poseidon()
### eddsaSign_unsafe()
### eddsaVerify()
### getEddsaPublicKey()
### fromEdwardsToAddress()
```

#### Reference Files:
- All TypeScript files in `Tokamak-zk-EVM/packages/frontend/synthesizer/src/`

---

## 📝 Notes & Decisions Log

### 2025-01-06: Initial Analysis
- Discovered major architectural changes for L2 state channels
- EdDSA signature scheme completely replaces ECDSA
- Merkle tree state management is core new feature
- Poseidon hash replaces Keccak256 in L2 mode
- Transaction signing moved inside Synthesizer
- Buffer system significantly expanded

### Key Design Decisions Found:
1. **4-ary Merkle tree**: Trade-off between depth and proof size
2. **64 max leaves**: Balances flexibility and circuit size
3. **Poseidon over Keccak**: 1000x reduction in constraints
4. **EdDSA over ECDSA**: 50x reduction in verification cost

### Questions for Team:
- [ ] Is batch transaction feature fully implemented or still in progress?
- [ ] What are the exact constraint counts for new subcircuits?
- [ ] Are there example contracts for L2 state channel usage?
- [ ] Documentation for backend verifier changes needed?

---

## 🔗 Quick Links

**Source Code**:
- [Synthesizer Main](file:///Users/son-yeongseong/Desktop/dev/Tokamak-zk-EVM/packages/frontend/synthesizer/src/synthesizer/synthesizer.ts)
- [TokamakL2Tx](file:///Users/son-yeongseong/Desktop/dev/Tokamak-zk-EVM/packages/frontend/synthesizer/src/TokamakL2JS/tx/TokamakL2Tx.ts)
- [TokamakL2StateManager](file:///Users/son-yeongseong/Desktop/dev/Tokamak-zk-EVM/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts)
- [Crypto Utils](file:///Users/son-yeongseong/Desktop/dev/Tokamak-zk-EVM/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts)

**Documentation**:
- [Current Docs Folder](file:///Users/son-yeongseong/Desktop/dev/tokamak-zk-evm-docs/frontend/synthesizer/)

**External**:
- [Tokamak zk-SNARK Paper](https://eprint.iacr.org/2024/507)
- [GitHub Repository](https://github.com/tokamak-network/Tokamak-zk-EVM)

---

## 📌 How to Use This Document

1. **Start with Phase 1**: These are critical updates that affect understanding of core functionality
2. **Mark tasks as you complete them**: Change `⬜ TODO` to `✅ DONE` with date
3. **Update progress percentages** at the top
4. **Add notes** in the Notes section if you discover new information
5. **Cross-reference** between tasks if dependencies exist

### Status Indicators:
- ⬜ TODO: Not started
- 🔄 IN PROGRESS: Currently working on it
- ✅ DONE: Completed (add date)
- ⏸️ BLOCKED: Waiting for information
- ⏭️ SKIPPED: Decided not to do

---

## 🎯 Success Criteria

Documentation update is complete when:
- [ ] All Phase 1 tasks completed
- [ ] All Phase 2 tasks completed
- [ ] All code references verified and working
- [ ] New documents reviewed by team
- [ ] Examples tested and confirmed working
- [ ] GitBook published and accessible

---

**End of Document**

