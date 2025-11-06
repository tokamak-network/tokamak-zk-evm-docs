# Synthesizer: Code Architecture

This document provides a detailed technical view of Synthesizer's internal structure, class relationships, and code-level implementation.

## What This Document Covers

- Code execution flow from initialization to finalization
- Class structure and relationships
- Design patterns and architectural decisions
- Key code paths with file references
- Implementation details for core mechanisms

For conceptual explanations, see the [main Synthesizer documentation](./synthesizer.md).

For execution flow and examples, see the [Execution Flow documentation](./synthesizer-execution-flow.md).

---

## Table of Contents

1. [Code Execution Overview](#code-execution-overview)
2. [Repository Structure](#repository-structure)
3. [Core Architecture](#core-architecture)
4. [Class Structure](#class-structure)
5. [Key Components](#key-components)
6. [Design Patterns](#design-patterns)
7. [Code Paths](#code-paths)

---

## Code Execution Overview

### Transaction Processing Flow

This diagram shows the complete code execution path from transaction input to circuit output:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: INITIALIZATION                                                 │
└─────────────────────────────────────────────────────────────────────────┘

  User Call
     │
     ▼
  createEVM()                           [constructors.ts:19]
     │
     ├─► Create EVM instance            [evm.ts:74]
     │    └─► new Synthesizer()         [evm.ts:271]
     │         └─► new StateManager()   [synthesizer/index.ts:37]
     │              ├─► initializeState()
     │              ├─► initializeSubcircuitInfo()
     │              └─► initializePlacements()  (IDs 0-3: Buffers)
     │
     └─► Create RPCStateManager         [constructors.ts:30]
          └─► Fetch transaction & block data from RPC


┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: EXECUTION SETUP                                                │
└─────────────────────────────────────────────────────────────────────────┘

  EVM.runCall()                         [evm.ts:858]
     │
     ├─► Create Message                 [message.ts:48]
     │
     ├─► Create Interpreter             [interpreter.ts:152]
     │    └─► Initialize RunState       [interpreter.ts:217]
     │         ├─► Stack (EVM)
     │         ├─► StackPt (Synthesizer)
     │         ├─► Memory (EVM)
     │         ├─► MemoryPt (Synthesizer)
     │         └─► synthesizer reference
     │
     └─► Interpreter.run()              [interpreter.ts:300]


┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: BYTECODE EXECUTION (Loop for each opcode)                      │
└─────────────────────────────────────────────────────────────────────────┘

  Interpreter.runStep()                 [interpreter.ts:400]
     │
     ├─► Parse opcode from bytecode
     │
     ├─► Execute EVM Handler            [opcodes/functions.ts]
     │    └─► Update Stack, Memory, Storage
     │
     ├─► Execute Synthesizer Handler    [opcodes/synthesizer/handlers.ts]
     │    │
     │    ├─► Example: ADD operation
     │    │    └─► synthesizerArith()   [handlers.ts:15]
     │    │         │
     │    │         ├─► 1. Pop input symbols from StackPt
     │    │         │     StackPt: [x, y, ...] → Pop x, y
     │    │         │     Where x = {source: 2, wireIndex: 3, value: 10n}
     │    │         │           y = {source: 2, wireIndex: 4, value: 5n}
     │    │         │
     │    │         ├─► 2. Synthesizer.placeArith()  [synthesizer/index.ts:60]
     │    │         │    └─► OperationHandler.placeArith()  [operationHandler.ts:80]
     │    │         │         │
     │    │         │         ├─► Map operation to subcircuit
     │    │         │         │    SUBCIRCUIT_MAPPING['ADD'] → ['ALU1', selector: 2n]
     │    │         │         │
     │    │         │         ├─► Create output DataPt symbol
     │    │         │         │    z = {
     │    │         │         │      source: 4,           // New placement ID
     │    │         │         │      wireIndex: 0,        // First output wire
     │    │         │         │      value: 15n,          // Computed result
     │    │         │         │      sourceSize: 256
     │    │         │         │    }
     │    │         │         │
     │    │         │         └─► 🎯 CREATE PLACEMENT (Circuit Node)
     │    │         │              StateManager.placements.set(4, {
     │    │         │                name: "ALU1",
     │    │         │                usage: "ADD",
     │    │         │                subcircuitId: 4,
     │    │         │                inPts: [selectorPt, x, y],  // Wire connections IN
     │    │         │                outPts: [z]                 // Wire connections OUT
     │    │         │              })
     │    │         │
     │    │         │              🔗 This placement connects:
     │    │         │                 Placement 2 (PRV_IN) --wire[3]-→ Placement 4 (ALU1)
     │    │         │                 Placement 2 (PRV_IN) --wire[4]-→ Placement 4 (ALU1)
     │    │         │                 Placement 4 (ALU1)   --wire[0]-→ (next placement)
     │    │         │
     │    │         └─► 3. Push output symbol to StackPt
     │    │              StackPt: [...] → Push z
     │    │              (Symbol z now available for next operations)
     │    │
     │    ├─► Example: SLOAD operation
     │    │    └─► Synthesizer.loadStorage()  [synthesizer/index.ts:80]
     │    │         └─► DataLoader.loadStorage()  [dataLoader.ts:45]
     │    │              │
     │    │              ├─► Check cache (storagePt)
     │    │              │    If cached: return existing symbol
     │    │              │
     │    │              └─► If not cached:
     │    │                   BufferManager.addWireToInBuffer()  [bufferManager.ts:30]
     │    │                   │
     │    │                   └─► 🎯 ADD TO PRV_IN BUFFER (Placement 2)
     │    │                        StateManager.placements.get(2).inPts.push(rawValue)
     │    │                        StateManager.placements.get(2).outPts.push(symbol)
     │    │
     │    │                        🔗 This records:
     │    │                           External storage value → Buffer Placement 2 → Symbol
     │    │                           (Symbol will be pushed to StackPt for use in circuit)
     │    │
     │    └─► Example: MLOAD with aliasing
     │         └─► MemoryPt.getDataAlias()  [memoryPt.ts:150]
     │              │
     │              ├─► Analyze overlapping memory writes
     │              │    Example: Need bytes 0x00-0x20
     │              │    - Bytes 0x00-0x0F from symbol x (time 0)
     │              │    - Bytes 0x10-0x1F from symbol y (time 1)
     │              │
     │              └─► MemoryManager.placeMemoryToStack()  [memoryManager.ts:60]
     │                   │
     │                   └─► 🎯 CREATE RECONSTRUCTION CIRCUIT
     │                        Multiple placements created:
     │                        1. SHR placement: Extract x_low from x
     │                        2. SHR placement: Extract y_low from y
     │                        3. SHL placement: Shift x_low to position
     │                        4. OR placement:  Combine x_low | y_low → result
     │
     │                        🔗 Wire connections:
     │                           x --→ SHR --→ SHL --→ OR --→ result
     │                           y --→ SHR --→ OR ------↗
     │
     │                        (Result symbol pushed to StackPt)
     │
     └─► Consistency Check               [interpreter.ts:441-449]
          └─► Verify Stack values == StackPt values
               For each position i:
                 Stack[i] (actual value) == StackPt[i].value ?
               If mismatch → Throw error


┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: FINALIZATION                                                   │
└─────────────────────────────────────────────────────────────────────────┘

  Finalizer.exec()                      [finalizer/index.ts:12]
     │
     ├─► PlacementRefactor.refactor()   [placementRefactor.ts:30]
     │    └─► Optimize wire sizes
     │
     ├─► new Permutation()               [permutation.ts:84]
     │    ├─► Build permutation groups   [permutation.ts:92]
     │    └─► Generate permutation.json  [permutation.ts:120]
     │
     ├─► outputPlacementVariables()      [permutation.ts:123]
     │    ├─► For each placement:
     │    │    ├─► Load subcircuitN.wasm
     │    │    ├─► generateSubcircuitWitness()  [permutation.ts:613]
     │    │    │    └─► witnessCalculator.calculateWitness()  [witness_calculator.ts:180]
     │    │    └─► Validate outputs
     │    └─► Write placementVariables.json
     │
     └─► outputInstance()                [instance.ts]
          └─► Write instance.json


┌─────────────────────────────────────────────────────────────────────────┐
│  OUTPUT FILES                                                            │
└─────────────────────────────────────────────────────────────────────────┘

  📄 permutation.json        Circuit topology (wire connections)
  📄 instance.json           Public/Private I/O values
  📄 placementVariables.json Complete witness for all placements
```

### Key Execution Phases

1. **Initialization (Lines 1-20)**

   - EVM and Synthesizer instances created
   - StateManager initializes buffer placements (0-3)
   - RPC connection established for on-demand state queries

2. **Execution Setup (Lines 22-30)**

   - Interpreter created with dual state (Stack/StackPt, Memory/MemoryPt)
   - Message wraps transaction data
   - RunState prepared with all necessary references

3. **Bytecode Execution (Lines 32-60)**

   - Each opcode triggers both EVM and Synthesizer handlers
   - Arithmetic ops → OperationHandler → Create placements
   - Storage ops → DataLoader → Buffer management
   - Memory ops → MemoryManager → Aliasing resolution
   - Consistency checks ensure EVM and Synthesizer stay synchronized

4. **Finalization (Lines 62-75)**
   - Placements map converted to output files
   - Witness calculated for each placement using WASM
   - Three JSON files generated for backend prover

---

## Repository Structure

```
packages/frontend/synthesizer/src/
├── synthesizer/
│   ├── synthesizer.ts             # Main Synthesizer class (Facade)
│   ├── constructors.ts            # Synthesizer factory functions
│   ├── handlers/
│   │   ├── stateManager.ts        # State management & Placements
│   │   ├── arithmeticManager.ts   # Arithmetic/logic operations
│   │   ├── instructionHandler.ts  # Opcode handler mapping
│   │   ├── memoryManager.ts       # Memory aliasing resolution
│   │   └── bufferManager.ts       # LOAD/RETURN buffer management
│   ├── dataStructure/
│   │   ├── dataPt.ts              # DataPt factory & types
│   │   ├── stackPt.ts             # Symbolic stack
│   │   ├── memoryPt.ts            # 2D memory tracker with time
│   │   └── arithmeticOperations.ts # Arithmetic helpers
│   ├── types/
│   │   ├── synthesizer.ts         # SynthesizerOpts, Interface
│   │   ├── buffers.ts             # Reserved variables & buffers
│   │   ├── dataStructure.ts       # DataPt, MemoryPts types
│   │   ├── instructions.ts        # Opcode types
│   │   └── placements.ts          # Placement types
│   └── params/
│       └── index.ts               # Constants (Poseidon, etc.)
├── TokamakL2JS/                   # NEW: L2 Components
│   ├── tx/
│   │   ├── TokamakL2Tx.ts         # EdDSA transaction class
│   │   └── constructors.ts        # TX factory functions
│   ├── stateManager/
│   │   ├── TokamakL2StateManager.ts # Merkle tree state manager
│   │   ├── constructors.ts        # State manager factories
│   │   └── types.ts               # State manager types
│   ├── crypto/
│   │   └── index.ts               # EdDSA, Poseidon hash
│   └── utils/
│       └── index.ts               # Address derivation, etc.
├── interface/
│   ├── index.ts                   # Public API exports
│   ├── rpc/
│   │   └── rpc.ts                 # createSynthesizerOptsForSimulationFromRPC
│   ├── adapters/
│   │   └── synthesizerAdapter.ts  # Adapter utilities
│   └── qapCompiler/
│       ├── configuredTypes.ts     # Subcircuit name mappings
│       ├── importedConstants.ts   # From qap-compiler package
│       ├── types.ts               # QAP compiler types
│       └── utils.ts               # QAP utilities
├── circuitGenerator/
│   ├── circuitGenerator.ts        # Generates permutation map
│   ├── witness_calculator.ts      # WASM witness calculator
│   └── handlers/
│       ├── permutationGenerator.ts # Permutation logic
│       └── variableGenerator.ts   # Variable mapping
└── types/
    └── (various shared type definitions)
```

**Key Changes from Old Structure**:
- Moved from `tokamak/core/` to flat `synthesizer/` directory
- Added `TokamakL2JS/` for L2 state channel components
- Renamed handlers: `operationHandler` → `arithmeticManager`, `dataLoader` → removed (integrated into instructionHandler)
- Added `interface/` for public API and RPC utilities

---

## Core Architecture

### Extended EthereumJS Foundation

Synthesizer is built as a **non-invasive extension** of EthereumJS EVM:

**File**: `src/evm.ts`

```typescript
export class EVM implements EVMInterface {
  // Original EthereumJS fields
  public stateManager: StateManagerInterface;
  public blockchain: EVMMockBlockchainInterface;
  public common: Common;

  // 🎯 Tokamak Addition: Synthesizer integration (line 164)
  public synthesizer: Synthesizer;

  constructor(opts: EVMOpts) {
    // Original EthereumJS initialization...

    // 🎯 Tokamak Addition: Create Synthesizer instance (line 271)
    this.synthesizer = new Synthesizer();
  }

  async runCall(opts: EVMRunCallOpts): Promise<EVMResult> {
    // Standard EVM execution with Synthesizer shadowing
    const interpreter = new Interpreter(
      this,
      // ...
      this.synthesizer  // Pass Synthesizer to interpreter
    );

    return interpreter.run(message);
  }
}
```

**Key Points**:

- Preserves all original EthereumJS functionality
- Adds Synthesizer as a parallel processing layer
- No modification to core EVM logic

### Synthesizer Class Hierarchy

```
┌───────────────────────────────────────────────────────────────┐
│                      EVM (Extended)                            │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │           Synthesizer (Facade)                           │ │
│  │           [synthesizer/synthesizer.ts:19-468]            │ │
│  │  ┌────────────────────────────────────────────────────┐ │ │
│  │  │  StateManager                                       │ │ │
│  │  │  [handlers/stateManager.ts]                         │ │ │
│  │  │  - placements: Map<number, PlacementEntry>         │ │ │
│  │  │  - cachedStorage: Map<bigint, StorageCache[]>      │ │ │
│  │  │  - cachedOrigin: DataPt | undefined                │ │ │
│  │  │  - callMemoryPtsStack: MemoryPts[][]               │ │ │
│  │  └────────────────────────────────────────────────────┘ │ │
│  │  ┌────────────────────────────────────────────────────┐ │ │
│  │  │  ArithmeticManager                                  │ │ │
│  │  │  [handlers/arithmeticManager.ts]                    │ │ │
│  │  │  - placeArith(name, inPts)                          │ │ │
│  │  │  - placeExp(inPts)                                  │ │ │
│  │  │  - placeJubjubExp(inPts, PoI)                       │ │ │
│  │  │  - placePoseidon(inPts)                             │ │ │
│  │  └────────────────────────────────────────────────────┘ │ │
│  │  ┌────────────────────────────────────────────────────┐ │ │
│  │  │  InstructionHandler                                 │ │ │
│  │  │  [handlers/instructionHandler.ts]                   │ │ │
│  │  │  - synthesizerHandlers: Map<number, Handler>        │ │ │
│  │  │  - loadStorage(key, value)                          │ │ │
│  │  │  - getOriginAddressPt()                             │ │ │
│  │  │  - preTasksForCalls(op, step)                       │ │ │
│  │  └────────────────────────────────────────────────────┘ │ │
│  │  ┌────────────────────────────────────────────────────┐ │ │
│  │  │  MemoryManager                                      │ │ │
│  │  │  [handlers/memoryManager.ts]                        │ │ │
│  │  │  - placeMemoryToStack(aliasInfos)                   │ │ │
│  │  │  - placeMemoryToMemory(aliasInfos)                  │ │ │
│  │  │  - placeMSTORE(dataPt, truncBitSize)                │ │ │
│  │  │  - copyMemoryPts(target, src, len, dst)             │ │ │
│  │  └────────────────────────────────────────────────────┘ │ │
│  │  ┌────────────────────────────────────────────────────┐ │ │
│  │  │  BufferManager                                      │ │ │
│  │  │  [handlers/bufferManager.ts]                        │ │ │
│  │  │  - getReservedVariableFromBuffer(varName)           │ │ │
│  │  │  - addReservedVariableToBufferIn(varName, ...)      │ │ │
│  │  │  - addReservedVariableToBufferOut(varName, ...)     │ │ │
│  │  │  - loadArbitraryStatic(value, bitSize)              │ │ │
│  │  └────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │         TokamakL2StateManager (for L2)                   │ │
│  │         [TokamakL2JS/stateManager/]                      │ │
│  │  - registeredKeys: Uint8Array[]                          │ │
│  │  - initialMerkleTree: IMT                                │ │
│  │  - getUserStorageKey(parts, usage)                       │ │
│  │  - getUpdatedMerkleTreeRoot()                            │ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

**Key Changes**:
- `OperationHandler` → `ArithmeticManager` (handles arithmetic operations)
- `DataLoader` → Integrated into `InstructionHandler` (storage, environment data)
- Added `TokamakL2StateManager` for L2 state channel support
- Updated method signatures to match actual implementation
- Added file path references for each component

---

## Class Structure

### 1. EVM Class

**Location**: `src/evm.ts:74-1240`

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

**Location**: `src/interpreter.ts:152-1362`

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

**Location**: `src/synthesizer/synthesizer.ts:19-468`

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

**Location**: `src/tokamak/core/handlers/stateManager.ts:24-102`

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

**Location**: `src/synthesizer/handlers/arithmeticManager.ts`

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

**Location**: `src/synthesizer/handlers/instructionHandler.ts`

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

**Location**: `src/tokamak/core/handlers/memoryManager.ts`

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

**Location**: `src/tokamak/core/handlers/bufferManager.ts`

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

### 9. Finalizer Class

**Location**: `src/tokamak/core/finalizer/index.ts:5-26`

**Role**: Generate output files

**Execution Flow**:

```typescript
export class Finalizer {
  private state: StateManager;

  constructor(stateManager: StateManager) {
    this.state = stateManager;
  }

  public async exec(_path?: string, writeToFS: boolean = true): Promise<Permutation> {
    // 1. Refactor placements (optimize wire sizes)
    const placementRefactor = new PlacementRefactor(this.state);
    const refactoriedPlacements = placementRefactor.refactor();

    // 2. Generate permutation and witness
    const permutation = new Permutation(refactoriedPlacements, _path);
    permutation.placementVariables = await permutation.outputPlacementVariables(
      refactoriedPlacements,
      _path,
    );

    // 3. Write permutation.json
    permutation.outputPermutation(_path);

    return permutation;
  }
}
```

---

### 10. L2 Components (NEW)

The following components are added for L2 state channel support:

#### TokamakL2Tx Class

**Location**: `src/TokamakL2JS/tx/TokamakL2Tx.ts`

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

#### TokamakL2StateManager Class

**Location**: `src/TokamakL2JS/stateManager/TokamakL2StateManager.ts`

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

#### Cryptographic Utilities

**Location**: `src/TokamakL2JS/crypto/index.ts`

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

## Design Patterns

### 1. Facade Pattern

**Used in**: Synthesizer class

**Purpose**: Provide simplified interface to complex subsystems

```typescript
// Client code
synthesizer.placeArith('ADD', [a, b]);

// Internally delegates to
operationHandler.placeArith('ADD', [a, b]);
  → Maps to subcircuit
  → Creates placement
  → Updates state
```

**Benefits**:

- Hides complexity from opcode handlers
- Single entry point for all operations
- Easy to extend with new handlers

---

### 2. Factory Pattern

**Used in**: DataPointFactory

**Purpose**: Centralized symbol creation with validation

```typescript
export class DataPointFactory {
  static create(raw: DataPtRaw): DataPt {
    // Validation
    // Normalization
    // Return immutable DataPt
  }
}
```

**Benefits**:

- Consistent symbol creation
- Validation in one place
- Easy to add new symbol types

---

### 3. Observer Pattern

**Used in**: Dual execution (Interpreter)

**Purpose**: Synthesizer observes EVM execution

```
EVM executes opcode → Synthesizer observes → Creates circuit
```

**Implementation**:

```typescript
// In interpreter.ts:runStep()
const opFn = this._evm._handlers.get(opCode)!;
opFn.apply(null, [this._runState, this._common]);  // EVM handler

// Immediately after
const opFnPt = this._evm._handlersPt.get(opCode)!;
await opFnPt.apply(null, [this._runState, this._common]);  // Synthesizer handler
```

---

### 4. Strategy Pattern

**Used in**: Opcode handlers

**Purpose**: Different strategies for different opcodes

```typescript
// Each opcode has its own strategy
const handlers = new Map([
  [0x01, addHandler],      // ADD strategy
  [0x02, mulHandler],      // MUL strategy
  [0x54, sloadHandler],    // SLOAD strategy
  // ...
]);
```

---

## Code Paths

### 1. Arithmetic Operation (ADD)

**Files involved**:

1. `opcodes/functions.ts` - EVM handler
2. `opcodes/synthesizer/handlers.ts` - Synthesizer handler
3. `core/handlers/operationHandler.ts` - Placement creation
4. `core/synthesizer/index.ts` - Facade delegation
5. `core/handlers/stateManager.ts` - State update

**Flow**:

```typescript
// 1. EVM handler (opcodes/functions.ts:15-20)
[0x01, function (runState) {
  const [a, b] = runState.stack.popN(2);
  const r = (a + b) % TWO_POW256;
  runState.stack.push(r);
}]

// 2. Synthesizer handler (opcodes/synthesizer/handlers.ts:45-60)
[0x01, async function (runState) {
  const [a, b] = runState.stackPt.popN(2);
  const r = mod(a.value + b.value, TWO_POW256);
  synthesizerArith('ADD', [a.value, b.value], r, runState);
}]

// 3. synthesizerArith (opcodes/synthesizer/handlers.ts:15-40)
export const synthesizerArith = (
  op: ArithmeticOperator, ins: bigint[], out: bigint, runState: RunState
): void => {
  const inPts = runState.stackPt.popN(ins.length);
  const outPts = runState.synthesizer.placeArith(op, inPts);
  runState.stackPt.push(outPts[0]);
};

// 4. Synthesizer.placeArith (core/synthesizer/index.ts:60)
public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
  return this.operationHandler.placeArith(name, inPts);
}

// 5. OperationHandler.placeArith (core/handlers/operationHandler.ts:80)
public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
  // Map to subcircuit, create placement, return output symbol
}

// 6. StateManager records placement (core/handlers/stateManager.ts:48)
this.state.placements.set(this.state.getNextPlacementIndex(), placement);
```

---

### 2. Storage Load (SLOAD)

**Files involved**:

1. `opcodes/functions.ts:54` - SLOAD EVM handler
2. `core/handlers/dataLoader.ts` - loadStorage method
3. `core/handlers/bufferManager.ts` - addWireToInBuffer

**Flow**:

```typescript
// 1. SLOAD handler (opcodes/functions.ts:54)
async function (runState) {
  const key = runState.stack.pop();
  const value = await runState.stateManager.getStorage(...);
  runState.stack.push(value);

  // Synthesizer part
  runState.stackPt.push(
    runState.synthesizer.loadStorage(
      runState.env.address.toString(),
      key,
      value
    )
  );
}

// 2. DataLoader.loadStorage (core/handlers/dataLoader.ts:45)
public loadStorage(codeAddress: string, key: bigint, value: bigint): DataPt {
  // Check cache
  if (this.state.storagePt.has(keyString)) {
    return this.state.storagePt.get(keyString)!;
  }

  // Load from PRV_IN buffer
  const inPt = DataPointFactory.create({ value, ... });
  const outPt = this.provider.addWireToInBuffer(inPt, PRV_IN_PLACEMENT_INDEX);

  // Cache
  this.state.storagePt.set(keyString, outPt);
  return outPt;
}

// 3. BufferManager.addWireToInBuffer (core/handlers/bufferManager.ts:30)
public addWireToInBuffer(inPt: DataPt, placementId: number): DataPt {
  // Create symbol from external value
  const outPt = DataPointFactory.create({
    source: placementId,
    wireIndex: nextIndex,
    value: inPt.value,
  });

  // Record in buffer placement
  this.state.placements.get(placementId)!.inPts.push(inPt);
  this.state.placements.get(placementId)!.outPts.push(outPt);

  return outPt;
}
```

---

### 3. Memory Load with Aliasing (MLOAD)

**Files involved**:

1. `opcodes/functions.ts:51` - MLOAD EVM handler
2. `pointers/memoryPt.ts` - getDataAlias method
3. `core/handlers/memoryManager.ts` - placeMemoryToStack

**Flow**:

```typescript
// 1. MLOAD handler
function (runState) {
  const pos = runState.stack.pop();
  const word = runState.memory.read(Number(pos), 32);
  runState.stack.push(bytesToBigInt(word));

  // Synthesizer part
  const posPt = runState.stackPt.pop();
  const dataAliasInfos = runState.memoryPt.getDataAlias(posPt.value, 32);
  const reconstructedPt = runState.synthesizer.placeMemoryToStack(dataAliasInfos);
  runState.stackPt.push(reconstructedPt);
}

// 2. MemoryPt.getDataAlias
public getDataAlias(offset: bigint, size: number): DataAliasInfos {
  // Find all overlapping memory writes
  const overlaps = this._viewMemoryConflict(offset, size);

  // For each overlap, calculate shift and mask
  return overlaps.map(entry => ({
    dataPt: entry.dataPt,
    shift: calculateShift(...),
    masker: generateMasker(...)
  }));
}

// 3. MemoryManager.placeMemoryToStack
public placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt {
  // Generate reconstruction circuit
  // Uses SHR, AND, SHL, OR subcircuits
  // Returns final reconstructed symbol
}
```

---

## Summary

This architecture document provides a comprehensive technical view of Synthesizer's implementation:

1. **Execution Flow**: From initialization through bytecode execution to finalization
2. **Non-invasive Extension**: Built on top of EthereumJS without modifying core logic
3. **Facade Pattern**: Synthesizer delegates to specialized handlers
4. **Dual Execution**: EVM and Synthesizer process opcodes in parallel
5. **Modular Design**: Clear separation of concerns across handlers

---

## Related Documentation

- **[Data Structures](./synthesizer-data-structure.md)** - Detailed explanation of DataPt, StackPt, MemoryPt, and Placement
- **[Execution Flow](./synthesizer-execution-flow.md)** - Usage examples and practical applications
- **[Concepts](./synthesizer-concepts.md)** - Conceptual background and high-level architecture
- **[Opcodes](./synthesizer-opcodes.md)** - EVM opcode implementation reference
