# Synthesizer: Code Examples

This document provides detailed code-level examples of how Synthesizer processes different types of EVM operations.

---

## Overview

Each example demonstrates:

- **Files involved**: Which source files participate in the operation
- **Code flow**: Step-by-step execution with actual code snippets
- **Key concepts**: Important implementation details

---

## 1. Arithmetic Operation (ADD)

This example shows how a simple ADD operation flows through the entire Synthesizer system.

### Files Involved

1. `opcodes/functions.ts` - EVM handler
2. `opcodes/synthesizer/handlers.ts` - Synthesizer handler
3. `core/handlers/operationHandler.ts` - Placement creation
4. `core/synthesizer/index.ts` - Facade delegation
5. `core/handlers/stateManager.ts` - State update

### Execution Flow

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

### Key Concepts

- **Dual Execution**: EVM and Synthesizer handlers execute in parallel
- **Symbol Tracking**: Input values become DataPt symbols
- **Subcircuit Mapping**: ADD operation maps to ALU1 subcircuit
- **Placement Creation**: Each operation creates a circuit node

### Output File Generation

After execution completes, the Finalizer generates three output files from the recorded placements:

```typescript
// Finalizer.exec() processes all placements
const finalizer = new Finalizer(synthesizer.state);
await finalizer.exec('./output');

// 1. permutation.json - Wire connections (3-entry cycle per connection)
{
  "permutation": [
    // Connection 1: Wire from Placement 2 (PRV_IN) to Placement 4 (ALU1 input 'a')
    { "row": 100, "col": 2, "X": 619, "Y": 26 },  // Step 1: (100,2) → (619,26)
    { "row": 619, "col": 26, "X": 619, "Y": 27 }, // Step 2: (619,26) → (619,27)
    { "row": 619, "col": 27, "X": 100, "Y": 2 },  // Step 3: (619,27) → (100,2) (cycle back)

    // Connection 2: Another wire from Placement 2 to Placement 4 (input 'b')
    { "row": 101, "col": 2, "X": 620, "Y": 26 },  // Step 1: (101,2) → (620,26)
    { "row": 620, "col": 26, "X": 620, "Y": 27 }, // Step 2: (620,26) → (620,27)
    { "row": 620, "col": 27, "X": 101, "Y": 2 },  // Step 3: (620,27) → (101,2) (cycle back)

    // ... more 3-entry cycles for each wire connection
  ]
}

// 2. instance.json - Public/Private witness
{
  "publicInputBuffer": [5n, 10n],     // Calldata inputs (from PUB_IN)
  "privateInputBuffer": [10n, 20n],   // Storage values (from PRV_IN)
  "a_pub": [...],                      // Public witness array
  "a_prv": [...]                       // Private witness array
}

// 3. placementVariables.json - Complete witness for each placement
[
  {
    "subcircuitId": 4,  // ALU1 subcircuit
    "variables": [
      "0x02",    // selector = ADD
      "0x0a",    // input a = 10
      "0x14",    // input b = 20
      "0x1e",    // output = 30
      // ... internal circuit variables
    ]
  }
]
```

**How it works:**

1. **Placement Record**: During ADD execution, Placement #4 is created with `name: 'ALU1'`, `usage: 'ADD'`, `inPts`, `outPts`
2. **Wire Map**: Finalizer traces `inPts` to find their sources (e.g., `source: 2` → Placement 2)
3. **Cycle Structure**: Each wire connection is represented as a 3-entry cycle:
   - Entry 1: Source wire (row, col) → Destination wire (X, Y)
   - Entry 2: Intermediate connection within subcircuit
   - Entry 3: Final connection that cycles back to the original source
   - This cycle structure ensures proper wire equality constraints in the proof system
4. **Witness Calculation**: Loads `subcircuit4.wasm` and calculates witness with actual values
5. **File Output**: Three JSON files ready for the backend prover

---

## 2. Storage Load (SLOAD)

This example demonstrates external data loading through buffer placements.

### Files Involved

1. `opcodes/functions.ts:54` - SLOAD EVM handler
2. `core/handlers/dataLoader.ts` - loadStorage method
3. `core/handlers/bufferManager.ts` - addWireToInBuffer

### Execution Flow

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

### Key Concepts

- **Buffer Placement**: PRV_IN buffer (Placement 2) converts external values to symbols
- **Caching**: Warm storage accesses reuse existing symbols
- **Symbol Creation**: External values become circuit-compatible DataPt symbols

### Output File Generation

Storage load operations don't create new placements—they use the PRV_IN buffer placement:

```typescript
// During SLOAD execution
const storagePt = synthesizer.loadStorage(address, key, value);
// This adds to PRV_IN buffer (Placement 2), not creating new placement

// After execution, Finalizer processes PRV_IN buffer:

// 1. permutation.json - No new wire connections for SLOAD itself
// (PRV_IN buffer already initialized as Placement 2)

// 2. instance.json - Storage value appears in private input
{
  "privateInputBuffer": [
    "0x64",  // storage value (100)
    // ... other private inputs
  ],
  "a_prv": [
    "0x64",  // First wire from PRV_IN placement
    // ... more private witness values
  ]
}

// 3. placementVariables.json - PRV_IN buffer witness
[
  // ... other placements
  {
    "subcircuitId": 2,  // PRV_IN buffer
    "variables": [
      "0x64",  // storage[key] = 100
      // ... accumulated private inputs
    ]
  }
]
```

**How it works:**

1. **Buffer Accumulation**: Each SLOAD adds a new wire to PRV_IN buffer (Placement 2)
2. **Symbol Return**: Returns DataPt with `source: 2`, `wireIndex: n` (incremental)
3. **Caching**: Subsequent access to same key returns cached symbol (no new wire)
4. **Finalization**: All storage values aggregated in PRV_IN buffer's witness

**Key Difference from ADD:**

- ADD creates **new placement** (circuit node)
- SLOAD adds **new wire** to existing PRV_IN buffer (data input)

---

## 3. Memory Load with Aliasing (MLOAD)

This example shows how Synthesizer handles overlapping memory writes.

### Files Involved

1. `opcodes/functions.ts:51` - MLOAD EVM handler
2. `pointers/memoryPt.ts` - getDataAlias method
3. `core/handlers/memoryManager.ts` - placeMemoryToStack

### Execution Flow

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

### Key Concepts

- **Memory Aliasing**: Tracks overlapping memory writes over time
- **Circuit Reconstruction**: Generates SHR, SHL, AND, OR placements to combine fragments
- **2D Memory Model**: MemoryPt uses (offset × time) to track all writes

### Example Scenario

```
Step 1: MSTORE 0x10, value_x  (writes 32 bytes at 0x10-0x30)
Step 2: MSTORE 0x00, value_y  (writes 32 bytes at 0x00-0x20, overlaps!)
Step 3: MLOAD 0x10              (needs bytes 0x10-0x30)

Result: Bytes 0x10-0x20 come from value_y, bytes 0x20-0x30 from value_x
        Synthesizer generates circuit to reconstruct this relationship
```

### Output File Generation

Memory aliasing creates multiple placements to reconstruct the correct value:

```typescript
// MLOAD triggers circuit reconstruction
const dataAliasInfos = memoryPt.getDataAlias(0x10, 32);
// Returns: [{ dataPt: x, shift: 0, masker: 0xFF...00 },
//           { dataPt: y, shift: -128, masker: 0x00...FF }]

const reconstructedPt = synthesizer.placeMemoryToStack(dataAliasInfos);
// Creates multiple placements: SHR, SHL, AND, OR, Accumulator

// Output files after execution:

// 1. permutation.json - Wire connections for reconstruction circuit (3-entry cycles)
{
  "permutation": [
    // SHR placement: Connect value_y from PRV_IN (Placement 2) to SHR input
    { "row": 104, "col": 2, "X": 616, "Y": 4 },   // Step 1: PRV_IN wire → SHR input
    { "row": 616, "col": 4, "X": 616, "Y": 15 },  // Step 2: Within SHR subcircuit
    { "row": 616, "col": 15, "X": 616, "Y": 33 }, // Step 3: Continue in SHR
    // ... (more steps within SHR subcircuit)
    { "row": 616, "col": 55, "X": 104, "Y": 2 },  // Final: Back to source (cycle)

    // AND placement: Connect SHR output to AND input (masking)
    { "row": 644, "col": 5, "X": 617, "Y": 13 },  // AND gets processed value
    { "row": 617, "col": 13, "X": 107, "Y": 2 },  // Output to next stage

    // Accumulator/OR: Combine all fragments
    { "row": 643, "col": 5, "X": 643, "Y": 14 },  // Fragment 1 input
    { "row": 643, "col": 14, "X": 643, "Y": 41 }, // Fragment 2 input
    { "row": 643, "col": 41, "X": 109, "Y": 2 },  // Combined output (cycle back)

    // ... more 3-entry cycles for each wire connection
  ]
}

// 2. instance.json - Memory values in private witness
{
  "privateInputBuffer": [
    "0x...",  // value_x (original data)
    "0x...",  // value_y (original data)
  ],
  "a_prv": [
    "0x...",  // Reconstructed result
    // ... intermediate values from SHR, SHL, AND, OR
  ]
}

// 3. placementVariables.json - Witness for each reconstruction step
[
  {
    "subcircuitId": 10,  // SHR subcircuit
    "variables": [
      "0x80",    // shift amount (128 bits)
      "0x...",   // input value
      "0x...",   // shifted result
      // ... internal SHR variables
    ]
  },
  {
    "subcircuitId": 11,  // AND subcircuit
    "variables": [
      "0xFF...00",  // mask
      "0x...",      // input
      "0x...",      // masked result
    ]
  },
  {
    "subcircuitId": 13,  // Accumulator (OR) subcircuit
    "variables": [
      "0x...",  // fragment 1
      "0x...",  // fragment 2
      "0x...",  // combined result
    ]
  }
]
```

**How it works:**

1. **Aliasing Detection**: MemoryPt.getDataAlias() identifies 2 overlapping writes
2. **Circuit Generation**: MemoryManager creates 4-5 placements (SHR, SHL, AND, OR, Accumulator)
3. **Wire Tracing**: Each placement's inputs traced to their sources (previous placements or buffers)
4. **Witness Calculation**: WASM calculates witness for each subcircuit with actual values
5. **Proof Readiness**: Complete circuit proving `reconstructed = f(x, y)` where f is traceable

**Circuit Complexity:**

- Simple memory read (no aliasing): 0 placements (direct use of symbol)
- Overlapping read (2 writes): ~4-5 placements (SHR, SHL, AND, OR, Accumulator)
- Multiple overlaps (3+ writes): Scales linearly with number of fragments

---

## Related Documentation

- **[Transaction Flow](./synthesizer-transaction-flow.md)** - Overall execution flow
- **[Class Structure](./synthesizer-class-structure.md)** - Class reference
- **[Opcode Reference](./synthesizer-opcodes.md)** - All implemented opcodes
- **[Data Structures](./synthesizer-data-structure.md)** - DataPt, StackPt, MemoryPt
