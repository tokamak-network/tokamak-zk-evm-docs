# Synthesizer: Transaction Flow

This document provides a detailed code-level view of how a transaction flows through the Synthesizer from initialization to circuit output generation.

---

## Complete Transaction Processing Flow

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

## Key Execution Phases

### 1. Initialization (Phase 1)

- EVM and Synthesizer instances created
- StateManager initializes buffer placements (0-3)
- RPC connection established for on-demand state queries

### 2. Execution Setup (Phase 2)

- Interpreter created with dual state (Stack/StackPt, Memory/MemoryPt)
- Message wraps transaction data
- RunState prepared with all necessary references

### 3. Bytecode Execution (Phase 3)

- Each opcode triggers both EVM and Synthesizer handlers
- Arithmetic ops → OperationHandler → Create placements
- Storage ops → DataLoader → Buffer management
- Memory ops → MemoryManager → Aliasing resolution
- Consistency checks ensure EVM and Synthesizer stay synchronized

### 4. Finalization (Phase 4)

- Placements map converted to output files
- Witness calculated for each placement using WASM
- Three JSON files generated for backend prover

---

## Related Documentation

- [Synthesizer Concepts](./synthesizer-concepts.md)
- [Execution Flow](./synthesizer-execution-flow.md)
- [Code Architecture](./synthesizer-architecture.md)
- [Output Files](./synthesizer-output-files.md)
- [Class Structure](./synthesizer-class-structure.md)

