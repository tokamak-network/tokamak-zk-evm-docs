# Synthesizer: Execution Flow

This document walks through how Synthesizer processes Ethereum transactions, showing the complete execution flow from input to output with practical examples.

## Transaction Lifecycle Overview

The following diagram shows the complete flow of a transaction through Synthesizer:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         SYNTHESIZER TRANSACTION FLOW                          │
└──────────────────────────────────────────────────────────────────────────────┘

    INPUT                       PROCESSING                      OUTPUT

┌─────────────┐            ┌─────────────────┐           ┌──────────────┐
│             │            │                 │           │              │
│  Ethereum   │            │  Initialization │           │              │
│ Transaction │            │                 │           │              │
│   (0x...)   │            │                 │           │              │
│             │            │                 │           │              │
│─────────────│            │                 │           │              │
│             │            │                 │           │              │
│  Subcircuit │            │                 │           │              │
│   Library   │──────────► └────────┬────────┘           │              │
│             │                     │                    │  permutation │
│             │                     ▼                    │     .json    │
│─────────────│            ┌─────────────────┐           │              │
│             │            │                 │           │   instance   │
│   RPC Data  │            │  EVM + Symbol   │           │     .json    │
│             │            │    Execution    │           │              │
│ (On-demand) │            │                 │           │   placement  │
│             │            │                 │           │   Variables  │
└─────────────┘            │                 │           │      .json   │
                           │                 │           │              │
                           │                 │           │              │
                           │                 │           │              │
                           │                 │           │              │
                           │                 │           │              │
                           └────────┬────────┘           │              │
                                    │                    │              │
                                    ▼                    │              │
                           ┌─────────────────┐           │              │
                           │                 │           │              │
                           │  Finalization   │  ───────► │              │
                           │                 │           │              │
                           └─────────────────┘           └──────────────┘
```

**What flows through**:

- **Transaction Hash** → Fetches transaction details and triggers re-execution
- **Subcircuit Library** → Pre-compiled by QAP-compiler; provides circuit templates (.wasm, .ts) that Synthesizer uses
- **RPC Provider** → Supplies blockchain state (storage, balances, code) on-demand throughout execution

The transaction flows through **6 main steps**, which we'll explore in detail below.

---

## Step-by-Step Transaction Processing

### Step 1: Prerequisites & Setup

Before Synthesizer can process a transaction, the environment must be prepared:

```
┌────────────────────────────────────────────────────────┐
│  1. QAP-compiler: Compile Subcircuit Library           │
│     (Prerequisite - one-time setup)                    │
└────────────────────────────────────────────────────────┘
         │
         │  Generates .wasm files (subcircuit0.wasm ... subcircuitN.wasm)
         │  Generates TypeScript definitions (globalWireList.ts, etc.)
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  2. Synthesizer: Configure RPC Provider                │
└────────────────────────────────────────────────────────┘
         │
         │  Set up RPC endpoint for Ethereum Mainnet
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  3. Synthesizer: Provide Transaction Hash              │
└────────────────────────────────────────────────────────┘
         │
         │  TX: 0x123abc...
         │
         ▼
    Ready to process transaction
```

**What happens here:**

1. **Subcircuit Library** (Prerequisite): The [QAP-compiler](synthesizer-terminology.md#qap-compiler) compiles all fundamental subcircuits using Circom:

   - I/O interface buffers (LOAD/RETURN)
   - Arithmetic and bitwise operations (ALU1, ALU2, XOR, etc.)
   - Cryptographic primitives (bitify, etc.)

   These are compiled into WebAssembly files (`.wasm`) that Synthesizer uses as building blocks.

   > **Note**: This is a separate component from Synthesizer. See the QAP-compiler documentation for details (page to be added).

2. **RPC Connection** (Synthesizer): Connect to Ethereum via RPC to access blockchain state. This is essential for:

   - Fetching transaction details (from, to, data, value)
   - Accessing account states at the transaction's block height
   - Querying storage values on-demand during execution
   - Retrieving block information (number, timestamp, coinbase, etc.)

3. **Transaction Selection** (Synthesizer): Provide the transaction hash of an already-executed Ethereum transaction. Synthesizer will re-execute it to generate the circuit.

---

### Step 2: Initialization

When you invoke Synthesizer, it creates the execution environment:

```
┌────────────────────────────────────────────────────────┐
│  createEVM() is called                                 │
└────────────────────────────────────────────────────────┘
         │
         │  Fetch transaction data from RPC
         │  Fetch block data from RPC
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  EVM instance created                                  │
│  - Synthesizer instance attached                       │
│  - Opcode handlers registered                          │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Synthesizer creates internal managers:                │
│  - StateManager (holds Placements map)                 │
│  - OperationHandler (arithmetic ops)                   │
│  - DataLoader (external data)                          │
│  - MemoryManager (memory aliasing)                     │
│  - BufferManager (LOAD/RETURN buffers)                 │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Interpreter created with:                             │
│  - Stack (EVM values)                                  │
│  - StackPt (Synthesizer symbols)                       │
│  - Memory (EVM bytes)                                  │
│  - MemoryPt (Synthesizer symbols with time tracking)   │
└────────────────────────────────────────────────────────┘
         │
         ▼
    Ready to execute bytecode
```

**What happens here:**

The EVM is instantiated with an attached [Synthesizer](synthesizer-terminology.md#synthesizer). Think of it as running two virtual machines in parallel:

- **Standard EVM**: Processes the transaction normally, updating stack/memory/storage
- **Synthesizer**: Shadows the EVM execution, tracking everything as mathematical [symbols](synthesizer-terminology.md#symbol-processing)

At this point:

- The [Placements](synthesizer-terminology.md#placement) map is empty (will be populated during execution)
- [Buffer placements](synthesizer-terminology.md#buffer-placements) (IDs 0-3) are pre-initialized for LOAD and RETURN operations
- Both `Stack` and [StackPt](synthesizer-terminology.md#stackpt) are empty
- Both `Memory` and [MemoryPt](synthesizer-terminology.md#memorypt) are empty

---

### Step 3: Bytecode Execution (Dual Processing)

Now the interpreter begins executing the transaction bytecode. For **every single opcode**, both the EVM and Synthesizer process it in parallel:

```
┌────────────────────────────────────────────────────────────────────┐
│            For each opcode in transaction bytecode:                │
└────────────────────────────────────────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
                 ▼                               ▼
    ┌─────────────────────────┐     ┌─────────────────────────┐
    │   EVM Handler executes  │     │ Synthesizer Handler     │
    │                         │     │      executes           │
    │  • Pop from Stack       │     │  • Pop from StackPt     │
    │  • Compute result       │     │  • Create placement     │
    │  • Push to Stack        │     │    with output symbol   │
    │  • Update Memory/Storage│     │  • Push to StackPt      │
    │                         │     │                         │
    └─────────────┬───────────┘     └───────────┬─────────────┘
                  │                             │
                  └──────────────┬──────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  Consistency Check      │
                    │  Stack == StackPt ?     │
                    │  If not → Error         │
                    └────────────┬────────────┘
                                 │
                                 ▼
                        Continue to next opcode
```

**What happens here:**

This is the core of Synthesizer. For example, when processing `ADD`:

**EVM side:**

1. Pops two values: `a = 10`, `b = 5`
2. Computes: `result = 15`
3. Pushes `15` to Stack

**Synthesizer side:**

1. Pops two symbols: `x`, `y` (where `x.value = 10`, `y.value = 5`)
2. Creates a new [placement](synthesizer-terminology.md#placement): `ADD_placement = ALU1(x, y)`
3. Creates output symbol: `z` (where `z.value = 15`, `z.source = ADD_placement`)
4. Pushes `z` to [StackPt](synthesizer-terminology.md#stackpt)
5. Records: `Placements[4] = { name: "ALU1", usage: "ADD", subcircuitId: 4, inPts: [x, y], outPts: [z] }`

After every opcode, Synthesizer verifies that `Stack[i].value == StackPt[i].value` for all elements. This ensures the symbolic execution matches the actual execution.

**Key insight**: Synthesizer is not simulating the EVM—it's **shadowing** it. The EVM computes the actual values, while Synthesizer builds a mathematical proof of how those values were derived.

---

### Step 4: Symbol Loading & Returning

**This is the heart of Synthesizer**: converting between concrete values and [symbolic representations](synthesizer-terminology.md#symbol-processing).

#### Why This Conversion Is Essential

**The Synthesizer's unique challenge**: Unlike traditional zk-proof systems that work with fixed circuits, Synthesizer must handle **arbitrary EVM transactions** where the computation path is unknown until runtime.

Without [symbol](synthesizer-terminology.md#symbol-processing) conversion, Synthesizer cannot:

1. **Track data flow through EVM opcodes**: When `SLOAD` reads storage, how does that value propagate through `ADD`, `MUL`, and eventually to `SSTORE`? Symbols create a traceable chain.

2. **Distinguish transaction-level privacy**: EVM has no concept of "public" vs "private" data. Synthesizer's buffer system enables selective disclosure at the transaction level—something standard EVMs cannot do.

3. **Generate circuits dynamically**: The circuit structure depends on which opcodes execute. Symbols let Synthesizer build the circuit **while** the EVM runs, not before.

4. **Prove state transitions without exposing state**: Storage values must remain private, but state changes must be provable. Symbols bridge this gap by representing values mathematically.

#### How Symbol Conversion Works

Throughout execution, Synthesizer maintains a bidirectional bridge between two worlds:

```
┌────────────────────────────────────────────────────────┐
│  Loading External Data (LOAD Buffer)                   │
└────────────────────────────────────────────────────────┘
         │
         │  Examples: CALLDATALOAD, SLOAD, BLOCKHASH
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  External value → Symbol conversion                    │
│                                                        │
│  calldata[0] = 0x05  →  x (symbol)                    │
│  storage[key] = 0x0a  →  y (symbol)                   │
│  block.number = 19000  →  z (symbol)                  │
└────────────────────────────────────────────────────────┘
         │
         │  Symbols flow through circuit
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Symbol undergoes transformations                      │
│                                                        │
│  x' = ADD(x, y)                                       │
│  x'' = MUL(x', constant)                              │
│  x''' = AND(x'', mask)                                │
└────────────────────────────────────────────────────────┘
         │
         │  Examples: SSTORE, LOG
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Returning to External World (RETURN Buffer)           │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Symbol → External value conversion                    │
│                                                        │
│  x''' (symbol)  →  storage[key] = 0x14                │
│  y'' (symbol)   →  log.data = 0x...                   │
└────────────────────────────────────────────────────────┘
```

#### The Conversion Process

[Buffers](synthesizer-terminology.md#buffer-placements) act as the **interface** between the external world (Ethereum state) and the internal circuit world (symbols):

**LOAD Buffers** ([Placements](synthesizer-terminology.md#placement) 0, 2): **External Values → Symbols**

When the EVM needs external data, Synthesizer:

1. Fetches the concrete value (e.g., `storage[key] = 0x42`)
2. Creates a [DataPt](synthesizer-terminology.md#datapt-data-point) symbol tracking this value
3. Assigns it a [wire index](synthesizer-terminology.md#wire-index) in the buffer placement
4. Returns the symbol for use in subsequent operations

- **[PUB_IN](synthesizer-terminology.md#pub-in-and-pub-out)** (Placement 0): Public inputs
  - Examples: `msg.sender`, `msg.value`, calldata, block info
  - Visible to everyone during verification
- **[PRV_IN](synthesizer-terminology.md#prv-in-and-prv-out)** (Placement 2): Private inputs
  - Examples: storage values, account balances, nonces
  - Hidden from verifier, known only to prover

**TRANSFORMATION** (Placements 4+): **Symbols → Transformed Symbols**

After loading symbols, they flow through EVM opcodes that create transformation placements:

1. Takes input symbols from previous operations (LOAD buffers or other placements)
2. Creates a new placement representing the operation ([subcircuit](synthesizer-terminology.md#subcircuit) instance)
3. Generates output symbols with new values and wire indices
4. Pushes transformed symbols to [StackPt](synthesizer-terminology.md#stackpt) for subsequent operations

- **Arithmetic Operations**: ADD, MUL, SUB, DIV, MOD
  - Example: `DataPt{value: 100, source: 2}` → ADD → `DataPt{value: 110, source: 4}`
- **Bitwise Operations**: AND, OR, XOR, SHL, SHR
  - Example: `DataPt{value: 0xFF, source: 4}` → AND → `DataPt{value: 0x0F, source: 5}`
- **Comparison Operations**: LT, GT, EQ, ISZERO
  - Example: `DataPt{value: 100, source: 5}` → GT → `DataPt{value: 1, source: 6}`
- **Memory Operations**: MLOAD, MSTORE (may create multiple placements for [data aliasing](synthesizer-terminology.md#data-aliasing))
  - Example: Multiple symbols combined → `DataPt{value: reconstructed, source: 7}`

Each transformation creates a traceable chain: `source` field points to the placement that created the symbol, enabling complete data flow tracking from LOAD to RETURN.

**RETURN Buffers** (Placements 1, 3): **Symbols → External Values**

When the EVM produces outputs, Synthesizer:

1. Takes the final symbol (result of all transformations)
2. Adds it to the buffer placement's input wires
3. Records the concrete value for [witness](synthesizer-terminology.md#witness) generation
4. Maintains the symbol-to-value mapping

- **PUB_OUT** (Placement 1): Public outputs
  - Examples: logs, return data, events
  - Visible to everyone during verification
- **PRV_OUT** (Placement 3): Private outputs
  - Examples: storage updates, internal state changes
  - Hidden from verifier, known only to prover

---

### Step 5: Memory Aliasing Resolution

One of Synthesizer's most complex tasks is tracking overlapping memory writes:

```
┌────────────────────────────────────────────────────────┐
│  Time 0: MSTORE at offset 0x00                         │
│          Store symbol x (32 bytes)                     │
└────────────────────────────────────────────────────────┘
         │
         │  MemoryPt[0x00-0x20] = { time: 0, symbol: x }
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Time 1: MSTORE at offset 0x10                         │
│          Store symbol y (32 bytes)                     │
└────────────────────────────────────────────────────────┘
         │
         │  MemoryPt[0x10-0x30] = { time: 1, symbol: y }
         │  (Overlaps with x at 0x10-0x20!)
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Time 2: MLOAD at offset 0x00-0x20                     │
│          Need to reconstruct the value!                │
└────────────────────────────────────────────────────────┘
         │
         │  Memory region 0x00-0x20 now contains:
         │  - Bytes 0x00-0x0F: from x (unchanged)
         │  - Bytes 0x10-0x1F: from y (overwrote x)
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Synthesizer creates reconstruction circuit:           │
│                                                        │
│  1. Extract first 16 bytes of x                        │
│     x_low = SHR(x, 128) & 0xFFFF...                   │
│                                                        │
│  2. Extract first 16 bytes of y                        │
│     y_low = SHR(y, 128) & 0xFFFF...                   │
│                                                        │
│  3. Combine them                                       │
│     result = SHL(x_low, 128) | y_low                  │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  New placement added for reconstruction                │
│  StackPt.push(result symbol)                           │
└────────────────────────────────────────────────────────┘
```

**What happens here:**

Traditional EVM simply overwrites memory and returns the latest value. But Synthesizer must prove **how** that value was computed from the original symbols.

The 2D structure of [MemoryPt](synthesizer-terminology.md#memorypt) (offset × time) allows Synthesizer to:

1. Track all writes to each memory location
2. Detect overlaps when reading
3. Generate [subcircuits](synthesizer-terminology.md#subcircuit) (using SHR, SHL, AND, OR) to reconstruct the correct value
4. Prove the reconstruction is correct

This is why memory operations can generate multiple [placements](synthesizer-terminology.md#placement)—they need to prove [data aliasing](synthesizer-terminology.md#data-aliasing).

---

### Step 6: Finalization & Output Generation

After bytecode execution completes, Synthesizer generates the final output files:

```
┌────────────────────────────────────────────────────────┐
│  Bytecode execution finished                           │
│  - All opcodes processed                               │
│  - Placements map populated                            │
│  - Symbol graph complete                               │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Finalizer analyzes Placements                         │
│                                                        │
│  For each placement:                                   │
│  - Extract input wire indices                          │
│  - Extract output wire indices                         │
│  - Track wire connections between placements           │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Generate permutation.json                             │
│                                                        │
│  Wire connection map:                                  │
│  [                                                     │
│    { row: 13, col: 1, X: 14, Y: 3 },                  │
│    { row: 27, col: 2, X: 8, Y: 5 },                   │
│    ...                                                 │
│  ]                                                     │
│                                                        │
│  Meaning: Wire 13 of Placement 1 connects to           │
│           Wire 14 of Placement 3                       │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Generate instance.json                                │
│                                                        │
│  Public/Private witness values:                        │
│  {                                                     │
│    "publicInputBuffer": [...],  // From PUB_IN         │
│    "publicOutputBuffer": [...], // From PUB_OUT        │
│    "privateInputBuffer": [...], // From PRV_IN         │
│    "privateOutputBuffer": [...],// From PRV_OUT        │
│    "a_pub": [...],  // Public witness array            │
│    "a_prv": [...]   // Private witness array           │
│  }                                                     │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Generate placementVariables.json                      │
│                                                        │
│  Complete witness for each placement:                  │
│  [                                                     │
│    {                                                   │
│      "subcircuitId": 4,                                │
│      "variables": ["0x01", "0x04", ...]                │
│    },                                                  │
│    ...                                                 │
│  ]                                                     │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Output files ready for backend prover                 │
│  - permutation.json (circuit topology)                 │
│  - instance.json (public/private I/O)                  │
│  - placementVariables.json (complete witness)          │
└────────────────────────────────────────────────────────┘
```

**What happens here:**

The [Finalizer](synthesizer-terminology.md#finalizer) converts the `Placements` map into three critical files:

1. **permutation.json**: Describes the circuit topology

   - How subcircuit [wires](synthesizer-terminology.md#wire) are connected
   - PLONK-style [Permutation](synthesizer-terminology.md#permutation) Argument
   - Used by Prove, Verify stages

2. **instance.json**: Contains the actual input/output values

   - Public values are revealed (anyone can see)
   - Private values remain hidden (only prover knows)
   - Contains both buffer data and complete [witness](synthesizer-terminology.md#witness) arrays

3. **placementVariables.json**: Full [witness](synthesizer-terminology.md#witness) for proof generation
   - All intermediate values for each [subcircuit](synthesizer-terminology.md#subcircuit)
   - Needed by the prover to satisfy constraints
   - Maps to [R1CS](synthesizer-terminology.md#r1cs) format used by Tokamak zk-SNARK

These files are then passed to the backend Rust prover, which generates the actual zero-knowledge proof.
