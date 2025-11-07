# Synthesizer: Class Structure

This document provides a detailed reference for all major classes in the Synthesizer, including their roles, responsibilities, and key methods.

---

## Overview

The Synthesizer uses a **Facade pattern** with specialized handler classes:

```
Synthesizer (Facade)
├── StateManager (placements, storage)
├── ArithmeticManager (arithmetic operations)
├── InstructionHandler (opcode handlers)
├── MemoryManager (memory aliasing)
└── BufferManager (reserved variables)
```

---

## Core Classes

### 1. EVM Class

**Location**: [`src/evm.ts:74-1240`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/evm.ts)

**Role**: Top-level coordinator for transaction execution

**Key Responsibilities**:
- Initialize Synthesizer instance
- Create Interpreter with Synthesizer
- Manage transaction lifecycle
- Coordinate state access

**Key Methods**:
```typescript
async runCall(opts: EVMRunCallOpts): Promise<EVMResult>
async runCode(opts: EVMRunCodeOpts): Promise<ExecResult>
```

**Integration Points**:
- Line 164: `public synthesizer: Synthesizer`
- Line 271: `this.synthesizer = new Synthesizer()`
- Line 858: Pass synthesizer to Interpreter

---

### 2. Interpreter Class

**Location**: [`src/interpreter.ts:152-1362`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/interpreter.ts)

**Role**: Bytecode execution engine with dual processing

**Key Responsibilities**:
- Parse and execute bytecode sequentially
- Execute both EVM and Synthesizer handlers for each opcode
- Maintain dual state (Stack/StackPt, Memory/MemoryPt)
- Verify consistency between EVM and Synthesizer

**Key Methods**:
```typescript
async run(message: Message): Promise<InterpreterResult>
async runStep(): Promise<void>  // Execute single opcode
```

**RunState Structure** (line 98-122):
```typescript
export interface RunState {
  // EVM state
  stack: Stack;
  memory: Memory;

  // Synthesizer state
  stackPt: StackPt;
  memoryPt: MemoryPt;
  synthesizer: Synthesizer;

  // Shared state
  programCounter: number;
  gasLeft: bigint;
  code: Uint8Array;
  // ...
}
```

**Consistency Check** (line 441-449):
```typescript
// After each opcode execution
const stackVals = this._runState.stack.getStack();
const stackPtVals = this._runState.stackPt.getStack();
if (!stackVals.every((val, index) => val === stackPtVals[index].value)) {
  throw new Error('Synthesizer: Stack mismatch between EVM and Synthesizer');
}
```

---

### 3. Synthesizer Class (Facade)

**Location**: [`src/synthesizer/synthesizer.ts:19-468`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/synthesizer.ts)

**Role**: Central coordinator using Facade pattern with event-driven architecture

**Architecture**:
```typescript
export class Synthesizer implements SynthesizerInterface {
  protected _state: StateManager;                      // Line 21
  protected _arithmeticManager: ArithmeticManager;     // Line 22
  protected _memoryManager: MemoryManager;             // Line 23
  protected _bufferManager: BufferManager;             // Line 24
  protected _instructionHandlers: InstructionHandler;  // Line 25
  public readonly cachedOpts: SynthesizerOpts;        // Line 26
  protected _prevInterpreterStep: InterpreterStep | null = null;  // Line 27

  constructor(opts: SynthesizerOpts) {
    this.cachedOpts = opts;
    this._state = new StateManager(this);
    this._bufferManager = new BufferManager(this);
    this._arithmeticManager = new ArithmeticManager(this);
    this._memoryManager = new MemoryManager(this);
    this._instructionHandlers = new InstructionHandler(this);
  }

  // Event handlers (synthesizer.ts:39-139)
  private _attachSynthesizerToEVM(evm: EVM): void {
    evm.events.on('beforeMessage', ...) → this._prepareSynthesizeTransaction()
    evm.events.on('step', ...) → this._applySynthesizerHandler()
    evm.events.on('afterMessage', ...) → this.finalizeStorage()
  }

  // Core transaction processing
  public async synthesizeTX(): Promise<RunTxResult> { ... }
  public async finalizeStorage(): Promise<void> { ... }

  // Delegation methods
  public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
    return this._arithmeticManager.placeArith(name, inPts);
  }

  public async loadStorage(key: bigint, value?: bigint): Promise<DataPt> {
    return await this._instructionHandlers.loadStorage(key, value);
  }

  // ... more delegation methods
}
```

**Design**: 
- Facade pattern delegates to specialized handlers
- Event-driven: Hooks into EVM message lifecycle (`beforeMessage`, `step`, `afterMessage`)
- For L2: Integrates with `TokamakL2StateManager` for Merkle tree state tracking

---

### 4. StateManager Class

**Location**: [`src/synthesizer/handlers/stateManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/stateManager.ts)

**Role**: Central state repository

**Key Data Structures**:
```typescript
export class StateManager {
  public placements!: Placements;              // All placement instances
  public auxin!: Auxin;                        // Auxiliary inputs
  public envInf!: Map<string, {...}>;          // Environment info (CALLER, etc.)
  public blkInf!: Map<string, {...}>;          // Block info (NUMBER, etc.)
  public storagePt!: Map<string, DataPt>;      // Storage symbols
  public logPt!: {...}[];                      // Log data
  public keccakPt!: {...}[];                   // Keccak inputs/outputs
  public TStoragePt!: Map<...>;                // Transient storage
  public placementIndex!: number;              // Sequential counter
  public subcircuitInfoByName!: SubcircuitInfoByName;
  public subcircuitNames!: SubcircuitNames[];

  constructor() {
    this._initializeState();                   // Reset all state
    this._initializeSubcircuitInfo();          // Load subcircuit metadata
    this._initializePlacements();              // Create buffer placements (0-3)
    this.placementIndex = INITIAL_PLACEMENT_INDEX;  // Start from 4
  }

  public getNextPlacementIndex(): number {
    return this.placementIndex++;              // Atomic increment
  }
}
```

**Key Points**:
- Single source of truth for all Synthesizer state
- Placements 0-3 reserved for buffers
- Placement IDs start from 4

---

### 5. ArithmeticManager Class

**Location**: [`src/synthesizer/handlers/arithmeticManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/arithmeticManager.ts)

**Role**: Create placements for arithmetic/logic/cryptographic operations

**Key Methods**:
```typescript
public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[]
public placeExp(inPts: DataPt[]): DataPt
public placeJubjubExp(inPts: DataPt[], PoI: DataPt[]): DataPt[]
public placePoseidon(inPts: DataPt[]): DataPt
```

**Example**: `placeArith()`
```typescript
public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
  // 1. Map operation to subcircuit
  const [subcircuitName, selector] = SUBCIRCUIT_MAPPING[name];

  // 2. Create selector DataPt
  const selectorPt = DataPtFactory.create({
    value: selector,
    bitSize: DEFAULT_SOURCE_BIT_SIZE,
  });

  // 3. Create output DataPt with computed value
  const outPt = DataPtFactory.create({
    source: this.state.getNextPlacementIndex(),
    wireIndex: outWireIndex,
    value: computedValue,
  });

  // 4. Place subcircuit in circuit
  this.parent.place(
    subcircuitName,
    [selectorPt, ...inPts],
    [outPt],
    name
  );

  return [outPt];
}
```

---

### 6. InstructionHandler Class

**Location**: [`src/synthesizer/handlers/instructionHandler.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/instructionHandler.ts)

**Role**: Map EVM opcodes to Synthesizer handlers; manage storage and environment data

**Key Responsibilities**:
- Create handler map for all supported opcodes
- Handle storage operations (SLOAD, SSTORE)
- Manage environment information (ORIGIN, CALLER, etc.)
- Handle block information (NUMBER, TIMESTAMP, etc.)
- Prepare call contexts for CALL-family instructions

**Key Methods**:
```typescript
public get synthesizerHandlers(): Map<number, SynthesizerOpHandler>
public async loadStorage(key: bigint, value?: bigint): Promise<DataPt>
public getOriginAddressPt(): DataPt
public preTasksForCalls(op: SynthesizerSupportedOpcodes, step: InterpreterStep): void
```

**Example**: `loadStorage()`
```typescript
public async loadStorage(key: bigint, value?: bigint): Promise<DataPt> {
  // Check cache for warm access
  const cached = this.parent.state.cachedStorage.get(key);
  if (cached && cached.length > 0) {
    return cached[cached.length - 1].valuePt;  // Return latest
  }

  // Cold access: load from state manager
  const storedValue = value ?? await this.cachedOpts.stateManager.getStorage(...);
  
  // Create placement for storage load
  const inPts = [indexPt, keyPt, valuePt];
  const outPts = this.parent.placeArith('LoadStorage', inPts);
  
  // Cache for future accesses
  this.parent.state.cachedStorage.set(key, [{
    indexPt, keyPt, valuePt: outPts[0], access: 'Read'
  }]);

  return outPts[0];
}
```

---

### 7. MemoryManager Class

**Location**: [`src/synthesizer/handlers/memoryManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/memoryManager.ts)

**Role**: Resolve memory aliasing

**Key Method**:
```typescript
public placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt {
  // Generate subcircuits to reconstruct overlapping memory
  // Uses SHR, SHL, AND, OR to combine fragments
  // Returns reconstructed symbol
}
```

**Used by**: `MLOAD`, `CALLDATACOPY`, `KECCAK256`, `LOG`, etc.

---

### 8. BufferManager Class

**Location**: [`src/synthesizer/handlers/bufferManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/bufferManager.ts)

**Role**: Manage LOAD and RETURN buffer placements

**Key Methods**:
```typescript
public addWireToInBuffer(inPt: DataPt, placementId: number): DataPt {
  // Placement 0 (PUB_IN) or 2 (PRV_IN)
  // External value → Symbol conversion

  const outPt = DataPointFactory.create({
    source: placementId,
    wireIndex: nextIndex,
    value: inPt.value,
    // ...
  });

  this.state.placements.get(placementId)!.inPts.push(inPt);
  this.state.placements.get(placementId)!.outPts.push(outPt);

  return outPt;  // Symbol for circuit
}

public addWireToOutBuffer(inPt: DataPt, outPt: DataPt, placementId: number): void {
  // Placement 1 (PUB_OUT) or 3 (PRV_OUT)
  // Symbol → External value conversion

  this.state.placements.get(placementId)!.inPts.push(inPt);
  this.state.placements.get(placementId)!.outPts.push(outPt);
}
```

---

## L2 Components (NEW)

The following components are added for L2 state channel support:

### TokamakL2Tx Class

**Location**: [`src/TokamakL2JS/tx/TokamakL2Tx.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/tx/TokamakL2Tx.ts)

**Role**: EdDSA-signed transaction for L2 state channels

**Key Features**:
```typescript
export class TokamakL2Tx extends LegacyTx {
  // Reinterpret transaction fields for EdDSA
  // v: Always 27n (EdDSA mode indicator)
  // r: EdDSA randomizer (EdwardsPoint serialized)
  // s: EdDSA signature scalar
  
  initSenderPubKey(key: Uint8Array): void
  get senderPubKeyUnsafe(): Uint8Array
  
  override getSenderPublicKey(): Uint8Array  // Verifies EdDSA signature
  override getSenderAddress(): Address       // Derives address from pubkey
  override sign(privateKey: Uint8Array): TokamakL2Tx  // EdDSA signing
  
  getFunctionSelector(): Uint8Array
  getFunctionInput(index: number): Uint8Array
}
```

---

### TokamakL2StateManager Class

**Location**: [`src/TokamakL2JS/stateManager/TokamakL2StateManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts)

**Role**: Merkle tree-based state tracking for L2

**Key Features**:
```typescript
export class TokamakL2StateManager extends MerkleStateManager {
  private _registeredKeys: Uint8Array[] | null
  private _initialMerkleTree: IMT | null
  
  public async initTokamakExtendsFromRPC(
    rpcUrl: string,
    opts: TokamakL2StateManagerOpts
  ): Promise<void>
  
  public get registeredKeys(): Uint8Array[]  // Max 64 keys
  public get initialMerkleTree(): IMT        // 4-ary tree, depth 4
  
  public getUserStorageKey(
    parts: Array<...>,
    usage: 'L1' | 'L2'                       // Keccak256 vs Poseidon
  ): Uint8Array
  
  public async getUpdatedMerkleTreeRoot(): Promise<bigint>
  public getMTIndex(key: bigint): number
}
```

**Usage**: Replaces standard `RPCStateManager` for L2 transactions

---

### Cryptographic Utilities

**Location**: [`src/TokamakL2JS/crypto/index.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts)

**Key Functions**:
```typescript
// Poseidon hash (replaces Keccak256 in L2 mode)
export function poseidon(msg: Uint8Array): Uint8Array

// EdDSA signature operations on JubJub curve
export function eddsaSign_unsafe(
  prvKey: bigint,
  msg: Uint8Array[],
  nonce?: Uint8Array
): {randomizer: EdwardsPoint, signature: bigint}

export function eddsaVerify(
  msg: Uint8Array[],
  pubKey: EdwardsPoint,
  randomizer: EdwardsPoint,
  signature: bigint
): boolean

// Public key recovery (used by EVM ecrecover replacement)
export function getEddsaPublicKey(
  msgHash: Uint8Array,
  v: bigint,
  r: Uint8Array,
  s: Uint8Array
): Uint8Array
```

**Custom Crypto Configuration**:
```typescript
const common = new Common({
  chain: Mainnet,
  customCrypto: {
    keccak256: poseidon,      // Replace hash function
    ecrecover: getEddsaPublicKey  // Replace signature recovery
  }
})
```

This allows L2 transactions to use circuit-friendly cryptography while maintaining compatibility with EthereumJS APIs.

---

## Related Documentation

- [Code Architecture](./synthesizer-architecture.md)
- [Repository Structure](./synthesizer-repository-structure.md)
- [L2 State Channels](./synthesizer-l2-state-channels.md)
- [API Reference](./synthesizer-api-reference.md)

