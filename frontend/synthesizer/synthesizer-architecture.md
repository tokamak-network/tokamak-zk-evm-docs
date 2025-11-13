# Synthesizer: Code Architecture

This document provides a detailed technical view of Synthesizer's internal structure, class relationships, and code-level implementation.

**Related Documentation:**

- [Transaction Processing Flow](./synthesizer-transaction-flow.md) - Detailed execution flow with code walkthrough
- [Repository Structure](./synthesizer-repository-structure.md) - Codebase organization and file structure
- [Class Structure](./synthesizer-class-structure.md) - Detailed class structure and relationships
- [Code Examples](./synthesizer-code-examples.md) - Step-by-step code examples for key operations
- [Output Files](./synthesizer-output-files.md) - How to read and interpret generated output files

---

## Core Architecture

### Extended EthereumJS Foundation

Synthesizer is built **on top of** [EthereumJS](https://github.com/ethereumjs/ethereumjs-monorepo), the most widely used JavaScript/TypeScript implementation of the Ethereum Virtual Machine. Rather than reimplementing the EVM from scratch, Synthesizer extends EthereumJS to add circuit generation capabilities.

**Why build on EthereumJS?**

1. **Battle-tested correctness**: EthereumJS has been audited and tested across thousands of real-world transactions
2. **Automatic EVM compatibility**: New EIPs and opcodes are inherited automatically
3. **Reduced maintenance burden**: No need to track EVM specification changes manually
4. **Dual execution for free**: EVM computes actual values, Synthesizer tracks symbolic flow

**Architecture Overview:**

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Application                            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
         ┌────────────────────────────────────────┐
         │         EthereumJS EVM                 │
         │  ┌──────────────────────────────────┐  │
         │  │     Interpreter                  │  │
         │  │  - Parse bytecode                │  │
         │  │  - Execute opcodes               │  │
         │  │  - Update Stack/Memory/Storage   │  │
         │  └────────────┬─────────────────────┘  │
         │               │                        │
         │               │ Event Hooks            │
         │               │ (beforeMessage,        │
         │               │  step,                 │
         │               │  afterMessage)         │
         │               ▼                        │
         │  ┌──────────────────────────────────┐  │
         │  │  Synthesizer (Tokamak Addition)  │  │
         │  │  - Shadow EVM execution          │  │
         │  │  - Track symbolic data flow      │  │
         │  │  - Generate placements           │  │
         │  │  - Build circuit topology        │  │
         │  └──────────────────────────────────┘  │
         └────────────────────────────────────────┘
                          │
                          ▼
         ┌────────────────────────────────────────┐
         │  Circuit Output Files                  │
         │  - permutation.json                    │
         │  - instance.json                       │
         │  - placementVariables.json             │
         └────────────────────────────────────────┘
```

---

### Integration with EthereumJS

Synthesizer integrates with three key EthereumJS components:

#### 1. EVM Class

**Location**: [`packages/frontend/synthesizer/src/evm.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/evm.ts)

**Role**: Top-level coordinator that owns both the standard EVM execution and the Synthesizer instance.

**Key Integration Points**:

```typescript
// evm.ts:164
export class EVM {
  public synthesizer: Synthesizer;  // Tokamak addition

  constructor(opts: EVMOpts) {
    // ... standard EthereumJS initialization ...

    // Tokamak: Initialize Synthesizer
    this.synthesizer = new Synthesizer(opts.synthesizerOpts);
  }

  async runCall(opts: EVMRunCallOpts): Promise<EVMResult> {
    // ... create Interpreter with Synthesizer ...
    const interpreter = new Interpreter(
      this,
      this.stateManager,
      this.blockchain,
      this.events,
      this.synthesizer  // Pass to Interpreter
    );

    return interpreter.run(message);
  }
}
```

#### 2. Interpreter Class

**Location**: [`packages/frontend/synthesizer/src/interpreter.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/interpreter.ts)

**Role**: Bytecode execution engine that runs **both** EVM handlers and Synthesizer handlers for each opcode.

**Dual State Structure**:

```typescript
// interpreter.ts:98-122
export interface RunState {
  // ========== Standard EthereumJS State ==========
  stack: Stack;           // Actual EVM values
  memory: Memory;         // Actual EVM memory

  // ========== Tokamak Synthesizer State ==========
  stackPt: StackPt;       // Symbolic representations
  memoryPt: MemoryPt;     // Symbolic memory with time-tracking
  synthesizer: Synthesizer;  // Reference to circuit builder

  // ========== Shared State ==========
  programCounter: number;
  gasLeft: bigint;
  code: Uint8Array;
  // ...
}
```

**Opcode Execution**:

```typescript
// interpreter.ts:384-449
async runStep(): Promise<void> {
  const opcode = this._runState.code[this._runState.programCounter];

  // Look up opcode handler (contains BOTH EVM + Synthesizer logic)
  const handler = this.getOpHandler(opcode);

  // Execute unified handler
  await handler(this._runState, this.common);

  // Verify consistency: EVM values must match Synthesizer symbolic values
  const stackVals = this._runState.stack.getStack();
  const stackPtVals = this._runState.stackPt.getStack();
  if (!stackVals.every((val, i) => val === stackPtVals[i].value)) {
    throw new Error('Stack mismatch between EVM and Synthesizer');
  }
}
```

#### 3. Unified Opcode Handlers

**Location**: [`packages/frontend/synthesizer/src/opcodes/functions.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts)

**Key Design**: Unlike traditional architectures that separate EVM and circuit logic, Synthesizer uses **unified handlers** that execute both in a single function.

**Example: ADD Opcode**:

```typescript
// opcodes/functions.ts:95
export const handlers: Map<number, OpHandler> = new Map([
  [
    0x01,  // ADD
    function (runState) {
      // ========== 1. EVM Execution (EthereumJS) ==========
      const [a, b] = runState.stack.popN(2);
      const result = mod(a + b, TWO_POW256);
      runState.stack.push(result);

      // ========== 2. Synthesizer Execution (Tokamak) ==========
      const [aPt, bPt] = runState.stackPt.popN(2);
      const [resultPt] = runState.synthesizer.placeArith('ADD', [aPt, bPt]);
      runState.stackPt.push(resultPt);

      // Result: EVM computes value, Synthesizer records circuit structure
    },
  ],
  // ... more opcodes
]);
```

**Benefits of Unified Handlers**:

- **Guaranteed synchronization**: EVM and Synthesizer execute in lockstep
- **Single source of truth**: One opcode definition for both execution paths
- **Automatic consistency checks**: Values are verified at every step

---

## Design Patterns

Synthesizer employs three core architectural patterns to achieve its dual execution model:

### 1. Facade Pattern

**Problem**: Circuit generation involves complex coordination between state management, arithmetic operations, memory aliasing, buffer management, and finalization.

**Solution**: The `Synthesizer` class acts as a **unified interface** that delegates to specialized handlers.

**Structure**:

```typescript
// synthesizer/synthesizer.ts
export class Synthesizer {
  // Hidden complexity: specialized handlers
  private _state: StateManager;
  private _arithmeticManager: ArithmeticManager;
  private _instructionHandler: InstructionHandler;
  private _memoryManager: MemoryManager;
  private _bufferManager: BufferManager;

  // Simplified public API
  public placeArith(op: string, inputs: DataPt[]): DataPt[] {
    return this._arithmeticManager.placeArith(op, inputs);
  }

  public async loadStorage(key: bigint, value?: bigint): Promise<DataPt> {
    return this._instructionHandler.loadStorage(key, value);
  }

  // ... more delegation methods
}
```

**Benefits**:

- **Simplified client code**: Opcode handlers only interact with `Synthesizer`, not individual managers
- **Encapsulation**: Internal complexity is hidden behind a clean interface
- **Flexibility**: Can change handler implementations without affecting clients

---

### 2. Dual Execution Pattern

**Problem**: Need to both (1) execute transactions correctly and (2) prove execution correctness.

**Solution**: Run **two virtual machines in parallel** with synchronized state.

**How it works**:

```
┌──────────────────────────────────────────────────────────────┐
│  Single Opcode Execution (e.g., ADD)                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  EVM Side:                     Synthesizer Side:              │
│  ┌─────────────────────┐      ┌─────────────────────┐       │
│  │ 1. Pop Stack: 10, 5 │      │ 1. Pop StackPt: x, y│       │
│  │ 2. Compute: 10+5=15 │      │ 2. Create placement:│       │
│  │ 3. Push Stack: 15   │      │    ADD(x, y) → z    │       │
│  └─────────────────────┘      │ 3. Push StackPt: z  │       │
│           │                    └─────────────────────┘       │
│           │                             │                     │
│           └──────────┬──────────────────┘                     │
│                      ▼                                        │
│           ┌────────────────────┐                             │
│           │  Verify Consistency │                             │
│           │  Stack[0] == z.value│                             │
│           │  (15 == 15) ✓       │                             │
│           └────────────────────┘                             │
└──────────────────────────────────────────────────────────────┘
```

**Benefits**:

- **Correctness guarantee**: If EVM is correct, symbolic execution is correct
- **Automatic verification**: Every opcode validates symbolic vs. actual values
- **No separate simulation**: Circuit is built during actual execution

---

### 3. Event-Driven Architecture (NEW for L2)

**Problem**: L2 state channels require additional processing **before** and **after** transaction execution (EdDSA signature verification, Merkle tree finalization).

**Solution**: Hook into EVM's message lifecycle events to inject L2-specific logic.

**Event Hooks**:

```typescript
// synthesizer/synthesizer.ts:39-139
private _attachSynthesizerToEVM(evm: EVM): void {
  // ========== Phase 1: Pre-execution (L2 only) ==========
  evm.events.on('beforeMessage', async (message: Message) => {
    await this._prepareSynthesizeTransaction(message);
    // For L2: Verify EdDSA signature, prepare initial Merkle tree
  });

  // ========== Phase 2: Execution (Every opcode) ==========
  evm.events.on('step', async (step: InterpreterStep) => {
    await this._applySynthesizerHandler(step);
    // Process opcode, create placements
  });

  // ========== Phase 3: Post-execution (L2 only) ==========
  evm.events.on('afterMessage', async (result: EVMResult) => {
    await this.finalizeStorage();
    // For L2: Finalize Merkle tree, compute final root
  });
}
```

**L2-Specific Processing**:

1. **`beforeMessage`** (synthesizer.ts:48-89):

   ```typescript
   private async _prepareSynthesizeTransaction(message: Message): Promise<void> {
     if (this.cachedOpts.mode === 'l2-state-channel') {
       // Verify EdDSA signature
       const tx = message.tx as TokamakL2Tx;
       const isValid = eddsaVerify(
         tx.getHashedMessageToSign(),
         tx.senderPubKey,
         tx.eddsaRandomizer,
         tx.eddsaSignature
       );

       if (!isValid) {
         throw new Error('Invalid EdDSA signature');
       }

       // Create VerifyEddsaSignature placement
       this._state.placements.set(this._state.getNextPlacementIndex(), {
         name: 'VerifyEddsaSignature',
         usage: 'EDDSA_VERIFY',
         inPts: [pubKeyX, pubKeyY, msgHash, randomizer, signature],
         outPts: [isValidPt]
       });
     }
   }
   ```

2. **`afterMessage`** (synthesizer.ts:163-278):
   ```typescript
   public async finalizeStorage(): Promise<void> {
     if (this.cachedOpts.mode === 'l2-state-channel') {
       const stateManager = this.cachedOpts.stateManager as TokamakL2StateManager;

       // Update Merkle tree with new storage values
       for (const [key, value] of this._state.storagePt.entries()) {
         const leafIndex = stateManager.getMTIndex(key);
         stateManager.updateLeaf(leafIndex, value);
       }

       // Compute final Merkle root
       const finalRoot = stateManager.getUpdatedMerkleTreeRoot();

       // Add final root to PUBLIC_OUT buffer
       this._bufferManager.addWireToOutBuffer(
         finalRootPt,
         PUBLIC_OUT_PLACEMENT_ID
       );
     }
   }
   ```

**Benefits**:

- **Clean separation**: L2 logic doesn't pollute core EVM execution
- **Extensibility**: New event hooks can be added without modifying existing code
- **Composability**: Different modes (L1, L2) can coexist using the same architecture

---

## L2 Custom Cryptography

For L2 state channels, Synthesizer replaces standard Ethereum cryptographic primitives with **circuit-friendly alternatives**.

### Why Replace Keccak256 and ECDSA?

Standard Ethereum uses:

- **Keccak256**: SHA-3 based hash function (~150,000 constraints in circuits)
- **ECDSA**: secp256k1 elliptic curve signatures (~500,000 constraints)

These are **extremely expensive** in zk-SNARK circuits. For L2 state channels where every operation must be proven, we need more efficient alternatives.

### Circuit-Friendly Alternatives

**Poseidon Hash** (replaces Keccak256):

- Algebraic hash function designed specifically for zk-SNARKs
- Uses only field arithmetic (additions and multiplications)
- **~1,500 constraints** (~100x reduction)
- Used for: Merkle tree hashing, storage key hashing, message hashing

**EdDSA on JubJub Curve** (replaces ECDSA):

- Edwards curve over BLS12-381 scalar field
- Native field arithmetic (no modular reduction)
- **~2,500 constraints** (~200x reduction)
- Used for: Transaction signature verification

### Custom Crypto Configuration

EthereumJS allows replacing cryptographic functions via `customCrypto` option:

```typescript
// interface/rpc/rpc.ts
import { poseidon } from '../TokamakL2JS/crypto';
import { getEddsaPublicKey } from '../TokamakL2JS/crypto';

const common = new Common({
  chain: Mainnet,
  customCrypto: {
    // Replace Keccak256 with Poseidon
    keccak256: (msg: Uint8Array) => poseidon(msg),

    // Replace ECDSA ecrecover with EdDSA public key recovery
    ecrecover: (msgHash, v, r, s) => getEddsaPublicKey(msgHash, v, r, s)
  }
});
```

**How it works**:

1. **Transaction Hashing**: When EVM calls `keccak256(abi.encode(...))`, it actually calls `poseidon(...)`
2. **Signature Recovery**: When EVM calls `ecrecover(msgHash, v, r, s)`, it calls `getEddsaPublicKey(...)`
3. **Transparent to EVM**: All EVM opcodes work normally, unaware of the substitution
4. **Circuit-compatible**: Every cryptographic operation now has an efficient circuit representation

**Implementation Details**:

```typescript
// TokamakL2JS/crypto/index.ts

// Poseidon hash with multiple arities
export function poseidon(inputs: Uint8Array | Uint8Array[]): Uint8Array {
  if (Array.isArray(inputs)) {
    // Poseidon-N: hash N inputs
    const fieldElements = inputs.map(bytesToFieldElement);
    const hash = poseidonHash(fieldElements);
    return fieldElementToBytes(hash);
  } else {
    // Poseidon-1: hash single input
    const fieldElement = bytesToFieldElement(inputs);
    const hash = poseidonHash([fieldElement]);
    return fieldElementToBytes(hash);
  }
}

// EdDSA public key recovery (replaces ecrecover)
export function getEddsaPublicKey(
  msgHash: Uint8Array,
  v: bigint,  // EdDSA mode indicator (27n)
  r: Uint8Array,  // EdDSA randomizer (EdwardsPoint)
  s: Uint8Array   // EdDSA signature scalar
): Uint8Array {
  // Verify v indicates EdDSA mode
  if (v !== 27n) {
    throw new Error('Invalid EdDSA mode indicator');
  }

  // Deserialize randomizer and signature
  const randomizer = EdwardsPoint.fromBytes(r);
  const signature = bytesToBigInt(s);

  // Recover public key from signature
  // Formula: pubKey = (randomizer - s * G) / msgHash
  const pubKey = recoverEddsaPubKey(msgHash, randomizer, signature);

  // Convert to Ethereum address format
  return pubKeyToAddress(pubKey);
}
```

**Result**: L2 transactions can use efficient cryptography while remaining compatible with standard EVM semantics.

---

## Next Steps

For detailed information about specific components, see:

- **[Class Structure](./synthesizer-class-structure.md)** - Detailed class-by-class reference
- **[Repository Structure](./synthesizer-repository-structure.md)** - File organization and directory layout
- **[Transaction Flow](./synthesizer-transaction-flow.md)** - Step-by-step execution walkthrough
- **[L2 State Channels](./synthesizer-l2-state-channels.md)** - Complete L2 implementation guide
