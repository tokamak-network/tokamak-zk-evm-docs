# Synthesizer: Transaction Processing Flow

This document provides a detailed walkthrough of how Synthesizer processes Ethereum transactions, from initialization to finalization, with code-level details at each step.

---

## Overview

The transaction processing follows four main phases:

1. **Initialization** - Create EVM and Synthesizer instances
2. **Execution Setup** - Prepare Interpreter with dual state
3. **Bytecode Execution** - Process each opcode with dual handlers
4. **Finalization** - Generate output files

---

## Complete Execution Flow Diagram

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
     │    │         │         └─►  CREATE PLACEMENT (Circuit Node)
     │    │         │              StateManager.placements.set(4, {
     │    │         │                name: "ALU1",
     │    │         │                usage: "ADD",
     │    │         │                subcircuitId: 4,
     │    │         │                inPts: [selectorPt, x, y],  // Wire connections IN
     │    │         │                outPts: [z]                 // Wire connections OUT
     │    │         │              })
     │    │         │
     │    │         │                 This placement connects:
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
     │    │                   └─►  ADD TO PRV_IN BUFFER (Placement 2)
     │    │                        StateManager.placements.get(2).inPts.push(rawValue)
     │    │                        StateManager.placements.get(2).outPts.push(symbol)
     │    │
     │    │                           This records:
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
     │                   └─►  CREATE RECONSTRUCTION CIRCUIT
     │                        Multiple placements created:
     │                        1. SHR placement: Extract x_low from x
     │                        2. SHR placement: Extract y_low from y
     │                        3. SHL placement: Shift x_low to position
     │                        4. OR placement:  Combine x_low | y_low → result
     │
     │                           Wire connections:
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

---

## Detailed Phase-by-Phase Breakdown

### Phase 1: Initialization

**What happens:**

- EVM and Synthesizer instances created
- StateManager initializes buffer placements (0-3)
- RPC connection established for on-demand state queries

**Key Code:**

```typescript
// constructors.ts:19 - Entry point
export async function createEVM(opts?: EVMOpts) {
  const evm = new EVM(opts);
  return evm;
}

// evm.ts:271 - Synthesizer instantiation
constructor(opts: EVMOpts) {
  // ... original EthereumJS initialization
  this.synthesizer = new Synthesizer();  // 🎯 Tokamak addition
}

// synthesizer/index.ts:37 - StateManager initialization
constructor() {
  this._state = new StateManager();
  this._state._initializePlacements();  // Creates buffer placements 0-3
}
```

**Buffer Placements (IDs 0-3):**

- **Placement 0 (`PUB_IN`)**: Public input buffer (calldata, block info, msg.sender)
- **Placement 1 (`PUB_OUT`)**: Public output buffer (return data, logs)
- **Placement 2 (`PRV_IN`)**: Private input buffer (storage, account state)
- **Placement 3 (`PRV_OUT`)**: Private output buffer (storage updates)

---

### Phase 2: Execution Setup

**What happens:**

- Interpreter created with dual state (Stack/StackPt, Memory/MemoryPt)
- Message wraps transaction data
- RunState prepared with all necessary references

**Key Code:**

```typescript
// evm.ts:858 - Create Interpreter with Synthesizer
async runCall(opts: EVMRunCallOpts): Promise<EVMResult> {
  const interpreter = new Interpreter(
    this,
    this.stateManager,
    // ... other params
    this.synthesizer  // 🎯 Pass Synthesizer to interpreter
  );
  return interpreter.run(message);
}

// interpreter.ts:217 - RunState with dual structures
this._runState = {
  // EVM state
  stack: new Stack(),
  memory: new Memory(),

  // 🎯 Synthesizer state (parallel processing)
  stackPt: new StackPt(),
  memoryPt: new MemoryPt(),
  synthesizer: synthesizer,
};
```

**Dual State Structure:**

- **EVM State**: `Stack`, `Memory` - Track actual execution values
- **Synthesizer State**: `StackPt`, `MemoryPt` - Track symbolic representations
- Both states are maintained in parallel and verified for consistency

---

### Phase 3: Bytecode Execution

**What happens:**

- Each opcode triggers both EVM and Synthesizer handlers
- Arithmetic ops → OperationHandler → Create placements
- Storage ops → DataLoader → Buffer management
- Memory ops → MemoryManager → Aliasing resolution
- Consistency checks ensure EVM and Synthesizer stay synchronized

**Key Code:**

```typescript
// interpreter.ts:400 - Dual execution for each opcode
async runStep(): Promise<void> {
  const opcode = this._runState.code[this._runState.programCounter];

  // 1. Execute EVM handler (original EthereumJS)
  const opFn = this._evm._handlers.get(opcode)!;
  opFn.apply(null, [this._runState, this._common]);

  // 2. Execute Synthesizer handler (Tokamak addition)
  const opFnPt = this._evm._handlersPt.get(opcode)!;
  await opFnPt.apply(null, [this._runState, this._common]);

  // 3. Verify consistency
  const stackVals = this._runState.stack.getStack();
  const stackPtVals = this._runState.stackPt.getStack();
  if (!stackVals.every((val, index) => val === stackPtVals[index].value)) {
    throw new Error('Stack mismatch between EVM and Synthesizer');
  }
}

// Example: ADD operation creates a placement
// operationHandler.ts:80
public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
  const [subcircuitName, selector] = SUBCIRCUIT_MAPPING[name];  // 'ADD' → ['ALU1', 2n]
  const outPt = this.createOutput(name, inPts);

  // 🎯 Record placement in circuit
  this.provider.place(subcircuitName, [selectorPt, ...inPts], [outPt], name);
  return [outPt];
}
```

**Opcode Processing Examples:**

#### Example 1: Arithmetic Operation (ADD)

1. **EVM Handler**: Pops two values from Stack, computes sum, pushes result
2. **Synthesizer Handler**:
   - Pops two symbols from StackPt
   - Maps ADD to ALU1 subcircuit
   - Creates placement with input/output wires
   - Pushes result symbol to StackPt
3. **Consistency Check**: Verifies Stack value equals StackPt symbol value

#### Example 2: Storage Load (SLOAD)

1. **EVM Handler**: Reads value from state storage
2. **Synthesizer Handler**:
   - Checks if key is cached in `storagePt`
   - If not cached: Adds to `PRV_IN` buffer (Placement 2)
   - Returns symbol representing the storage value
3. **Symbol Caching**: Warm storage accesses reuse existing symbols

#### Example 3: Memory Load with Aliasing (MLOAD)

1. **EVM Handler**: Reads 32 bytes from memory
2. **Synthesizer Handler**:
   - Calls `MemoryPt.getDataAlias()` to find overlapping writes
   - Generates SHR, SHL, AND, OR subcircuits to reconstruct value
   - Returns reconstructed symbol
3. **Data Aliasing**: Proves how overlapping memory writes are combined

---

### Phase 4: Finalization

**What happens:**

- Placements map converted to output files
- Witness calculated for each placement using WASM
- Three JSON files generated for backend prover

**Key Code:**

```typescript
// finalizer/index.ts:12
public async exec(_path?: string): Promise<Permutation> {
  // 1. Optimize placements
  const refactored = new PlacementRefactor(this.state).refactor();

  // 2. Generate wire connections and witness
  const permutation = new Permutation(refactored, _path);
  permutation.placementVariables = await permutation.outputPlacementVariables(
    refactored,
    _path,
  );

  // 3. Write output files
  permutation.outputPermutation(_path);  // → permutation.json
  outputInstance(_path);                 // → instance.json
                                         // → placementVariables.json

  return permutation;
}

// permutation.ts:613 - Calculate witness for each placement
async generateSubcircuitWitness(placement: PlacementEntry): Promise<bigint[]> {
  const wasmPath = `./subcircuit${placement.subcircuitId}.wasm`;
  const witness = await witnessCalculator.calculateWitness(inputs);
  return witness;  // All internal circuit values
}
```

**Output Files:**

1. **`permutation.json`** - Circuit topology (wire connections)

   - Describes how wires between placements are connected
   - Used by Setup, Prove, Verify stages
   - Example: `{ row: 13, col: 1, X: 14, Y: 3 }` means wire 13 in Placement 1 connects to wire 14 in Placement 3

2. **`instance.json`** - Public/Private I/O values

   - Public input/output from `PUB_IN`/`PUB_OUT` buffers
   - Private input/output from `PRV_IN`/`PRV_OUT` buffers
   - Complete witness arrays (`a_pub`, `a_prv`)
   - Used by Prove stage

3. **`placementVariables.json`** - Complete witness for all placements
   - All intermediate values for each subcircuit instance
   - Needed by prover to satisfy R1CS constraints
   - Maps to Tokamak zk-SNARK format

---

## Key Concepts

### Dual Execution Model

Synthesizer implements a **dual execution model** where:

- **EVM execution** produces actual values (black box)
- **Synthesizer execution** produces symbolic circuit (transparent proof)
- Both execute in parallel and are verified for consistency

This ensures:

- ✅ Correctness: Synthesizer matches EVM behavior exactly
- ✅ Completeness: Every operation is tracked symbolically
- ✅ Efficiency: No re-execution needed for proof generation

### Symbol Tracking

Every value in Synthesizer is tracked as a **DataPt (symbol)**:

```typescript
{
  source: 4,           // Placement ID that produced this symbol
  wireIndex: 0,        // Wire index within that placement
  value: 15n,          // Actual computed value (for verification)
  sourceSize: 256      // Size in bits
}
```

Symbols form a **dependency graph** where each placement's outputs become inputs to other placements.

### Buffer Placements

Buffer placements (IDs 0-3) act as the **interface** between:

- **External world**: Ethereum state (storage, calldata, logs, etc.)
- **Circuit world**: Symbolic representations (DataPt symbols)

They enable:

- **Public inputs** to be verified by anyone
- **Private inputs** to remain hidden
- **Clear separation** of public vs private data

---

## Related Documentation

- **[Code Architecture](./synthesizer-architecture.md)** - Class structure and design patterns
- **[Data Structures](./synthesizer-data-structure.md)** - DataPt, StackPt, MemoryPt, Placement
- **[Execution Flow](./synthesizer-execution-flow.md)** - User-facing execution flow
- **[Opcodes](./synthesizer-opcodes.md)** - EVM opcode implementation reference
