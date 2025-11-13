# L2 State Channels: Architecture

This document describes the architecture and design of L2 state channels in Tokamak zk-EVM, including component relationships, data flow, and system integration.

---

## 📐 Component Overview

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
│                    │                                               │
│                    ▼                                               │
│  5. Proof Generation Layer                                         │
│     ┌───────────────────────────────────┐                         │
│     │ Backend Prover                    │                         │
│     │ - Read circuit files              │                         │
│     │ - Generate zk-SNARK proof         │                         │
│     │ - Export proof for verifier       │                         │
│     └───────────────────────────────────┘                         │
│                    │                                               │
│                    ▼                                               │
│  6. Verification Layer                                             │
│     ┌───────────────────────────────────┐                         │
│     │ On-Chain Verifier                 │                         │
│     │ - Solidity smart contract         │                         │
│     │ - Verify proof + public inputs    │                         │
│     │ - Update L1 channel state         │                         │
│     └───────────────────────────────────┘                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### Full Transaction Lifecycle

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
│     │ - Compute initial Merkle root      │                        │
│     │ - Store root on-chain              │                        │
│     └────────────────────────────────────┘                        │
│                    │                                               │
│                    ▼                                               │
│  2. Off-Chain Execution                                            │
│     ┌────────────────────────────────────┐                        │
│     │ User creates TokamakL2Tx           │                        │
│     │ - Sign with EdDSA private key      │                        │
│     │ - Send to counterparty             │                        │
│     │ - Execute locally for verification │                        │
│     └────────────────────────────────────┘                        │
│                    │                                               │
│                    ▼                                               │
│  3. Synthesizer Processing (Frontend)                              │
│     ┌────────────────────────────────────┐                        │
│     │ A. beforeMessage Phase             │                        │
│     │    - Parse TokamakL2Tx             │                        │
│     │    - Verify EdDSA signature        │                        │
│     │    - Load initial Merkle root      │                        │
│     │    - Create VerifyEddsaSignature   │                        │
│     └────────────────────────────────────┘                        │
│                    │                                               │
│                    ▼                                               │
│     ┌────────────────────────────────────┐                        │
│     │ B. step Phase (for each opcode)   │                        │
│     │    - Execute EVM opcode            │                        │
│     │    - SLOAD/SSTORE from Merkle tree │                        │
│     │    - Create circuit placements     │                        │
│     │    - Update symbolic state         │                        │
│     └────────────────────────────────────┘                        │
│                    │                                               │
│                    ▼                                               │
│     ┌────────────────────────────────────┐                        │
│     │ C. afterMessage Phase              │                        │
│     │    - Collect storage updates       │                        │
│     │    - Recompute Merkle tree         │                        │
│     │    - Compute final root            │                        │
│     │    - Export circuit files:         │                        │
│     │      * placement.json              │                        │
│     │      * wireMap.json                │                        │
│     └────────────────────────────────────┘                        │
│                    │                                               │
│                    ▼                                               │
│  4. Proof Generation (Backend)                                     │
│     ┌────────────────────────────────────┐                        │
│     │ Run Tokamak Prover                 │                        │
│     │ - Load circuit files               │                        │
│     │ - Run setup (if first time)        │                        │
│     │ - Generate zk-SNARK proof          │                        │
│     │ - Time: 1-2 minutes                │                        │
│     │ - Memory: < 10GB                   │                        │
│     │ - Output: proof.json               │                        │
│     └────────────────────────────────────┘                        │
│                    │                                               │
│                    ▼                                               │
│  5. On-Chain Settlement (L1)                                       │
│     ┌────────────────────────────────────┐                        │
│     │ Submit to L1 Contract              │                        │
│     │ - proof.json                       │                        │
│     │ - Public inputs:                   │                        │
│     │   * Initial Merkle root            │                        │
│     │   * Final Merkle root              │                        │
│     │   * EdDSA public key               │                        │
│     │ - Verifier contract checks:        │                        │
│     │   * Proof valid?                   │                        │
│     │   * Initial root matches?          │                        │
│     │ - If valid: Update channel state   │                        │
│     └────────────────────────────────────┘                        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 🧩 Layer Breakdown

### Layer 1: Transaction

**Component**: [TokamakL2Tx](transaction.md)

**Responsibilities**:
- Extend Ethereum `LegacyTx` with EdDSA signature support
- Reinterpret `v`, `r`, `s` fields for EdDSA components
- Provide signing and verification methods
- Derive L2 address from EdDSA public key

**Key Methods**:
- `fromTxData()` - Create transaction from data
- `getHashedMessageToSign()` - Compute message hash
- `sign(eddsaSignature)` - Add EdDSA signature
- `getSenderPublicKey()` - Extract public key from signature

**Source**: [`TokamakL2Tx.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/tx/TokamakL2Tx.ts)

---

### Layer 2: State Management

**Component**: [TokamakL2StateManager](state-management.md)

**Responsibilities**:
- Manage Merkle tree-based storage (4-ary, depth 4)
- Track registered keys (up to 64)
- Maintain initial and final Merkle trees
- Compute Merkle proofs for storage access
- Hash storage keys with Poseidon

**Key Methods**:
- `getStorage(address, key)` - Read from initial tree
- `putStorage(address, key, value)` - Write to final tree
- `getUserStorageKey(l2Caller, rawKey)` - L2 key hashing
- `getMerkleProof(leafIndex)` - Generate Merkle proof
- `getUpdatedMerkleTreeRoot()` - Compute final root

**Data Structures**:
- `_initialMerkleTree: MerkleTree4` - State before execution
- `_finalMerkleTree: MerkleTree4` - State after execution
- `_registeredKeys: string[]` - Registered storage keys
- `_generalStorage: Map<Buffer, Buffer>` - Non-Merkle storage

**Source**: [`TokamakL2StateManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts)

---

### Layer 3: Cryptography

**Component**: [Cryptographic Primitives](cryptography.md)

**Responsibilities**:
- Provide circuit-friendly hash function (Poseidon)
- Implement EdDSA signing and verification on JubJub curve
- Derive public keys from private keys
- Perform field arithmetic (BLS12-381 scalar field)

**Key Functions**:
- `poseidon(...inputs)` - Hash field elements
- `eddsaSign_unsafe(msgHash, privKey)` - Sign message
- `eddsaVerify(msgHash, pubKey, signature)` - Verify signature
- `getEddsaPublicKey(privKey)` - Derive public key

**Curves & Fields**:
- **Field**: BLS12-381 scalar field (`R_MOD = 0x73eda753...`)
- **Curve**: JubJub twisted Edwards curve
- **Equation**: `ax² + y² = 1 + dx²y²`

**Source**: [`crypto/index.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts)

---

### Layer 4: Circuit Generation

**Component**: [Synthesizer](../frontend/synthesizer.md)

**Responsibilities**:
- Hook into EVM message lifecycle (`beforeMessage`, `step`, `afterMessage`)
- Verify EdDSA signatures in-circuit
- Shadow EVM execution with symbolic processing
- Build Merkle tree commitments
- Export circuit files (`placement.json`, `wireMap.json`)

**Event Hooks**:

1. **beforeMessage** (`synthesizer.ts:48-89`):
   - Verify EdDSA signature
   - Load initial Merkle root → `PUBLIC_IN[0]`
   - Create `VerifyEddsaSignature` placement

2. **step** (`interpreter.ts:384-449`):
   - Execute each EVM opcode
   - Create circuit placements for operations
   - Track stack/memory/storage symbolically

3. **afterMessage** (`synthesizer.ts:163-278`):
   - Finalize Merkle tree
   - Compute final root → `PUBLIC_OUT[0]`
   - Add Merkle tree hash placements

**Key Data Structures**:
- `Placements: Map<ID, Placement>` - All circuit nodes
- `WireMap: { [wireId]: value }` - Wire connections
- `StackPt: DataPt[]` - Symbolic stack
- `MemoryPt: Map<offset, DataPt>` - Symbolic memory
- `StoragePt: Map<key, DataPt>` - Symbolic storage

**Source**: [`synthesizer/synthesizer.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/synthesizer.ts)

---

### Layer 5: Proof Generation

**Component**: Backend Prover

**Responsibilities**:
- Read circuit files from Synthesizer output
- Load trusted setup parameters
- Generate zk-SNARK proof using Tokamak proof system
- Optimize with ICICLE GPU acceleration

**Input Files**:
- `placement.json` - Circuit structure
- `wireMap.json` - Wire values
- `setup.params` - Trusted setup (one-time)

**Output Files**:
- `proof.json` - The zk-SNARK proof
- `public_inputs.json` - Public inputs (Merkle roots, etc.)

**Performance**:
- **Time**: 1-2 minutes per transaction
- **Memory**: < 10GB RAM
- **Acceleration**: ICICLE GPU library

**Source**: [`backend/prove`](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/backend/prove)

---

### Layer 6: Verification

**Component**: On-Chain Verifier

**Responsibilities**:
- Verify zk-SNARK proof on Ethereum L1
- Validate public inputs match expected values
- Update L1 contract state upon successful verification

**Verification Steps**:
1. Check proof validity (pairing-based verification)
2. Check `initial_root` matches on-chain state
3. If valid → update to `final_root`
4. Emit event with state transition

**Smart Contract** (Solidity):
```javascript
contract TokamakL2Verifier {
  mapping(uint256 => bytes32) public channelRoots;
  
  function verifyAndUpdate(
    uint256 channelId,
    bytes calldata proof,
    bytes32 initialRoot,
    bytes32 finalRoot
  ) external {
    require(channelRoots[channelId] == initialRoot, "Invalid initial root");
    require(verifyProof(proof, initialRoot, finalRoot), "Invalid proof");
    
    channelRoots[channelId] = finalRoot;
    emit StateUpdated(channelId, finalRoot);
  }
}
```

**Source**: [`backend/verify`](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/backend/verify)

---

## 🔗 Component Relationships

### Dependency Graph

```
TokamakL2Tx ──────────┐
                       │
                       ▼
                  Synthesizer ──────► Placements + WireMap
                       │                    │
                       ▼                    │
            TokamakL2StateManager           │
                       │                    │
                       ▼                    ▼
            Cryptographic Primitives   Backend Prover
                       │                    │
                       │                    ▼
                       │               Proof + Public Inputs
                       │                    │
                       │                    ▼
                       └───────────► On-Chain Verifier
```

### Cross-Component Data

| Data                     | Producer              | Consumer                | Format          |
| ------------------------ | --------------------- | ----------------------- | --------------- |
| **EdDSA Signature**      | User                  | TokamakL2Tx             | (R, s, pubKey)  |
| **Transaction**          | TokamakL2Tx           | Synthesizer             | Serialized TX   |
| **Initial Merkle Root**  | TokamakL2StateManager | Synthesizer             | 32-byte hash    |
| **Circuit Files**        | Synthesizer           | Backend Prover          | JSON            |
| **Final Merkle Root**    | Synthesizer           | Backend Prover          | 32-byte hash    |
| **zk-SNARK Proof**       | Backend Prover        | On-Chain Verifier       | Compressed      |
| **Public Inputs**        | Backend Prover        | On-Chain Verifier       | Field elements  |

---

## 🛠️ Design Patterns

### 1. Facade Pattern

**Synthesizer** acts as a facade for internal managers:
- `_bufferManager` - LOAD/RETURN buffer operations
- `_operationHandler` - Arithmetic placements
- `_memoryManager` - Memory aliasing
- `_dataLoader` - External data loading

Users interact only with `Synthesizer` class, not internal components.

### 2. Event-Driven Architecture

L2 functionality is added via **hooks** rather than modifying core EVM logic:
- `evm.events.on('beforeMessage', handler)`
- `evm.events.on('step', handler)`
- `evm.events.on('afterMessage', handler)`

This keeps L1 and L2 modes cleanly separated in the same codebase.

### 3. Dual Execution

EVM and Synthesizer run **in parallel**:
- **EVM**: Executes bytecode, updates stack/memory/storage with values
- **Synthesizer**: Shadows execution, updates stack/memory/storage with symbols

Both use the same `RunState` object, ensuring consistency.

### 4. Symbol-Based Processing

All data in Synthesizer is represented as **`DataPt`** symbols:
- `value: bigint` - The actual value (for consistency checks)
- `source: PlacementID` - Which circuit node produced this value
- `wireIndex: number` - Wire index in that placement

This enables **automatic circuit graph construction**.

---

## 📊 Performance Characteristics

### Circuit Complexity (per transaction)

| Operation            | Placements | Constraints |
| -------------------- | ---------- | ----------- |
| **EdDSA Verify**     | 1          | ~4,000      |
| **Poseidon (2 in)**  | 1          | ~100        |
| **Poseidon (4 in)**  | 1          | ~150        |
| **Merkle Tree (64 leaves)** | ~80 | ~12,000     |
| **EVM Operations**   | ~100-1000  | ~50k-500k   |

### Proof Generation Time

| Circuit Size      | Time    | Memory  |
| ----------------- | ------- | ------- |
| **Simple TX**     | 30s     | 2GB     |
| **ERC-20 TX**     | 1-2 min | 5GB     |
| **Complex TX**    | 3-5 min | 10GB    |

---

## 🔍 Related Resources

- [Transaction (TokamakL2Tx)](transaction.md)
- [State Management (Merkle Tree)](state-management.md)
- [Cryptography (Poseidon, EdDSA, JubJub)](cryptography.md)
- [Integration Guide](integration-guide.md)
- [Synthesizer Overview](../frontend/synthesizer.md)

---

**Next**: See [Transaction](transaction.md) to learn about TokamakL2Tx implementation.

