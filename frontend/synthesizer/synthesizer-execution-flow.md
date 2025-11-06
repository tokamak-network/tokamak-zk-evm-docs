# Synthesizer: Execution Flow

This document walks through how Synthesizer processes Ethereum transactions, showing the complete execution flow from input to output with practical examples.

## What This Document Covers

For detailed code references and implementation details, see the [Architecture documentation](./synthesizer/architecture.md) (coming soon).

For conceptual explanations (What/Why), see the [main Synthesizer documentation](./synthesizer.md).

## Transaction Lifecycle Overview

The following diagram shows the complete flow of a transaction through Synthesizer:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         SYNTHESIZER TRANSACTION FLOW                          │
└──────────────────────────────────────────────────────────────────────────────┘

    📥 INPUT                    ⚙️ PROCESSING                   📤 OUTPUT

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
│ (Block info)│            │   Execution     │           │              │
│ (On-demand) │            │                 │           │   placement  │
│             │            │                 │           |   Variables  │
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
- **Subcircuit Library** → Provides circuit templates (.wasm, .ts) used during execution
- **RPC Provider** → Supplies blockchain state (storage, balances, code) on-demand throughout execution

The transaction flows through **6 main steps**, which we'll explore in detail below.

---

## Step-by-Step Transaction Processing

### Step 1: Setup & Preparation

Before processing the transaction, Synthesizer prepares its environment:

```
┌────────────────────────────────────────────────────────┐
│  1. Compile Subcircuit Library (One-time setup)        │
└────────────────────────────────────────────────────────┘
         │
         │
         │
         │
         ▼
    Generate .wasm files (subcircuit0.wasm ... subcircuitN.wasm)
    Generate TypeScript definitions (globalWireList.ts, subcircuitInfo.ts)
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  2. Configure RPC Provider                             │
└────────────────────────────────────────────────────────┘
         │
         │  Set up RPC endpoint for Ethereum Mainnet
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  3. Provide Transaction Hash                           │
└────────────────────────────────────────────────────────┘
         │
         │  TX: 0x123abc...
         │
         ▼
    Ready to process transaction
```

**What happens here:**

1. **Subcircuit Library Compilation**: Circom compiles all the fundamental circuits (ALU1, bitify, XOR, etc.) into WebAssembly files. These are the building blocks that Synthesizer will use to construct the transaction-specific circuit.

2. **RPC Connection**: Synthesizer connects to Ethereum Mainnet via RPC to access blockchain state. This connection is essential because Synthesizer needs to:

   - Fetch transaction details (from, to, data, value)
   - Access account states at the transaction's block height
   - Query storage values on-demand during execution
   - Retrieve block information (number, timestamp, coinbase, etc.)

3. **Transaction Selection**: You provide the transaction hash of an already-executed Ethereum transaction. Synthesizer will re-execute this transaction to generate the circuit.

**Important**: The RPC connection remains active throughout execution, not just during initialization. When the EVM encounters `SLOAD`, `BALANCE`, `EXTCODESIZE`, etc., it queries the blockchain state through RPC in real-time.

---

### Step 2: Initialization

When you invoke Synthesizer, it creates the execution environment. The initialization process differs between standard L1 transactions and L2 state channel transactions.

#### Standard L1 Initialization

For regular Ethereum transactions:

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
│  - ArithmeticManager (arithmetic ops)                  │
│  - InstructionHandler (opcode handlers)                │
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

#### L2 State Channel Initialization

For L2 state channel transactions, use `createSynthesizerOptsForSimulationFromRPC()`:

```typescript
import { createSynthesizerOptsForSimulationFromRPC } from './interface/index.ts';

const opts = await createSynthesizerOptsForSimulationFromRPC({
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
  blockNumber: 12345678,
  contractAddress: '0x...',              // L1 contract address
  addressListL1: ['0x...'],              // L1 user addresses
  publicKeyListL2: [pubKeyBytes],        // Corresponding L2 public keys
  senderL2PrvKey: privateKeyBytes,       // EdDSA private key
  txNonce: 0n,
  userStorageSlots: [0, 1],              // Registered storage slots
  callData: calldataBytes,
});

const synthesizer = new Synthesizer(opts);
```

This initialization:

1. **Fetches L1 State**: Queries registered storage values from L1 contract
2. **Maps L1→L2**: Converts L1 addresses to L2 public keys  
3. **Constructs Initial Merkle Tree**: Builds 4-ary tree from registered keys
4. **Signs Transaction**: Creates EdDSA signature with provided private key
5. **Configures Custom Crypto**: Sets Poseidon as hash function (replaces Keccak256)

The result is a `TokamakL2StateManager` that tracks state transitions via Merkle tree updates.

**Reference**: See `interface/rpc/rpc.ts:64-101` for implementation.

**What happens in both modes:**

The EVM is instantiated with an attached Synthesizer. Think of it as running two virtual machines in parallel:

- **Standard EVM**: Processes the transaction normally, updating stack/memory/storage
- **Synthesizer**: Shadows the EVM execution, tracking everything as mathematical symbols

At this point:

- The `Placements` map is initialized with 5 buffer placements (IDs 0-4)
- Both `Stack` and `StackPt` are empty
- Both `Memory` and `MemoryPt` are empty
- For L2: Initial Merkle root is set as public input

---

### Step 3: Event-Driven Execution

Synthesizer uses an **event-driven architecture** that hooks into the EVM's message lifecycle. The execution is divided into three phases, each triggered by EVM events:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EVENT-DRIVEN EXECUTION FLOW                       │
└─────────────────────────────────────────────────────────────────────┘

    📨 beforeMessage Event              🔄 step Event (repeated)           📬 afterMessage Event
           │                                     │                                  │
           ▼                                     ▼                                  ▼
┌──────────────────────────┐      ┌──────────────────────────┐      ┌──────────────────────────┐
│ _prepareSynthesizeTransaction │   │  _applySynthesizerHandler │      │   finalizeStorage()      │
│                          │      │                          │      │                          │
│ • Verify EdDSA signature │      │  For EACH opcode:        │      │ • Construct final        │
│ • Recover ORIGIN address │      │  ┌─────────────────────┐ │      │   Merkle tree            │
│ • Setup function selector│      │  │ EVM Handler         │ │      │ • Verify initial root    │
│ • Prepare calldata cache │      │  │ • Execute opcode    │ │      │ • Output final root      │
│                          │      │  │ • Update Stack      │ │      │ • Handle general storage │
└──────────────────────────┘      │  └─────────────────────┘ │      └──────────────────────────┘
           │                      │  ┌─────────────────────┐ │                  │
           │                      │  │ Synthesizer Handler │ │                  │
           ▼                      │  │ • Pop from StackPt  │ │                  ▼
    Transaction ready             │  │ • Create placement  │ │         Circuit complete
    for execution                 │  │ • Push to StackPt   │ │         with state proof
                                  │  └─────────────────────┘ │
                                  │  ┌─────────────────────┐ │
                                  │  │ Consistency Check   │ │
                                  │  │ Stack == StackPt?   │ │
                                  │  └─────────────────────┘ │
                                  └──────────────────────────┘
```

#### Phase 1: beforeMessage Event

**Triggered**: Once, before transaction execution begins  
**Handler**: `_prepareSynthesizeTransaction()` (`synthesizer.ts:142-161`)

This phase prepares the transaction for execution:

1. **Clear Call Stack**: Reset `callMemoryPtsStack` for new transaction context
2. **Setup Function Interface**: 
   - Extract function selector from calldata (first 4 bytes)
   - Extract 9 function inputs (bytes 4-292, each 32 bytes)
   - Store in `callMemoryPtsStack[0]` for main context access
3. **Signature Verification** (L2 only):
   - Recover sender's public key from EdDSA signature
   - Verify signature matches transaction message
   - Derive sender address from public key
4. **Cache ORIGIN**: Store recovered/verified address as `cachedOrigin`

**Key Point**: For L2 transactions, this phase performs signature verification **inside the circuit** by placing verification subcircuits. The signature validity becomes part of the zero-knowledge proof.

#### Phase 2: step Event

**Triggered**: For every opcode execution  
**Handler**: `_applySynthesizerHandler()` (`synthesizer.ts:330-343`)

This is the core execution loop. For **each opcode**, both the EVM and Synthesizer process it:

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

**Example**: Processing `ADD` instruction:

**EVM side:**
1. Pops two values: `a = 10`, `b = 5`
2. Computes: `result = 15`
3. Pushes `15` to Stack

**Synthesizer side:**
1. Pops two symbols: `x`, `y` (where `x.value = 10`, `y.value = 5`)
2. Creates a new placement: `ADD_placement = ALU1(selector, x, y)`
3. Creates output symbol: `z` (where `z.value = 15`, `z.source = ADD_placement`)
4. Pushes `z` to StackPt
5. Records: `Placements[N] = { name: "ALU1", usage: "ADD", inPts: [sel, x, y], outPts: [z] }`

After every opcode, Synthesizer verifies that `Stack[i].value == StackPt[i].value` for all elements. This ensures the symbolic execution matches the actual execution.

**Special Handling**: The `_preTasksForCalls()` method handles CALL-family instructions, setting up memory buffers for context switches.

**Key insight**: Synthesizer is not simulating the EVM—it's **shadowing** it. The EVM computes the actual values, while Synthesizer builds a mathematical proof of how those values were derived.

#### Phase 3: afterMessage Event

**Triggered**: Once, after all opcodes complete  
**Handler**: `finalizeStorage()` (`synthesizer.ts:163-278`)

This phase finalizes the transaction's state changes:

1. **Complete Registered Storage Access**:
   - For each registered key that wasn't accessed, perform cold read
   - Ensures all registered slots are tracked in circuit

2. **Build Initial Merkle Tree**:
   ```
   For each registered key:
     leaf = Poseidon(index, key, initial_value, 0)
   
   Compute tree bottom-up:
     Level 0: 64 leaves → 16 nodes (Poseidon of 4 leaves each)
     Level 1: 16 nodes → 4 nodes
     Level 2: 4 nodes → 1 node (would be root, but we pad to 4)
     Level 3: Verify 4 padded nodes match INI_MERKLE_ROOT
   ```

3. **Verify Initial Root**:
   - Place `VerifyMerkleProof` subcircuit
   - Constrain computed root equals `INI_MERKLE_ROOT` (public input)

4. **Build Final Merkle Tree**:
   - Use same process but with **final** storage values
   - Compute root from updated leaves

5. **Output Final Root**:
   - Add final root to `RES_MERKLE_ROOT` buffer (public output)
   - This proves the state transition is valid

6. **Handle General Storage**:
   - For non-registered keys, find last write operation
   - Add to `OTHER_CONTRACT_STORAGE_OUT` buffer

**Null Node Optimization**: Empty leaves are replaced with precomputed null hashes (`NULL_POSEIDON_LEVEL0` through `NULL_POSEIDON_LEVEL3`), avoiding redundant Poseidon computations.

**Key Point**: This phase creates a cryptographic proof of state transition. Verifiers can confirm:
- Initial state matches expected (via `INI_MERKLE_ROOT`)
- Final state is correctly computed (via `RES_MERKLE_ROOT`)
- All state changes are accounted for

---

### Step 4: Symbol Loading & Returning

Throughout execution, Synthesizer needs to convert between external values and internal symbols:

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

**What happens here:**

Buffers act as the **interface** between the external world (Ethereum state) and the internal circuit world (symbols):

- **LOAD Buffer** (Placement IDs 0, 2): Takes concrete values and produces symbols

  - Public inputs: calldata, block info, msg.sender (Placement 0)
  - Private inputs: storage values, account states (Placement 2)

- **RETURN Buffer** (Placement IDs 1, 3): Takes symbols and produces concrete outputs
  - Public outputs: logs, return data (Placement 1)
  - Private outputs: storage updates (Placement 3)

This is crucial for zero-knowledge proofs: public inputs/outputs are revealed, while private inputs/outputs remain hidden.

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

The 2D structure of `MemoryPt` (offset × time) allows Synthesizer to:

1. Track all writes to each memory location
2. Detect overlaps when reading
3. Generate subcircuits (using SHR, SHL, AND, OR) to reconstruct the correct value
4. Prove the reconstruction is correct

This is why memory operations can generate multiple placements—they need to prove data aliasing.

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

The Finalizer converts the `Placements` map into three critical files:

1. **permutation.json**: Describes the circuit topology

   - How subcircuit wires are connected
   - PLONK-style Permutation Argument
   - Used by Prove, Verify stages

2. **instance.json**: Contains the actual input/output values

   - Public values are revealed (anyone can see)
   - Private values remain hidden (only prover knows)
   - Contains both buffer data and complete witness arrays

3. **placementVariables.json**: Full witness for proof generation
   - All intermediate values for each subcircuit
   - Needed by the prover to satisfy constraints
   - Maps to R1CS format used by Tokamak zk-SNARK

These files are then passed to the backend Rust prover, which generates the actual zero-knowledge proof.
