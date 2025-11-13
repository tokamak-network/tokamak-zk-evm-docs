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

Synthesizer supports two initialization modes depending on transaction type:

#### Standard L1 Initialization

For regular Ethereum mainnet transactions:

```
┌────────────────────────────────────────────────────────┐
│  createSynthesizerOptsForSimulationFromRPC()           │
│  - mode: 'normal'                                      │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────────────┐
         │  Fetch transaction from RPC           │
         │  - txHash: 0x...                      │
         │  - Parse: from, to, data, value       │
         └───────────────┬───────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────────────┐
         │  Create RPCStateManager               │
         │  - Connect to Ethereum RPC            │
         │  - Fetch block at tx height           │
         └───────────────┬───────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────────────┐
         │  Create EVM with Synthesizer          │
         │  - Standard crypto: Keccak256, ECDSA  │
         │  - StateManager: RPCStateManager      │
         └───────────────┬───────────────────────┘
                         │
                         ▼
                  Ready to execute
```

#### L2 State Channel Initialization

For L2 transactions with EdDSA signatures and Merkle tree state:

```
┌────────────────────────────────────────────────────────┐
│  createSynthesizerOptsForSimulationFromRPC()           │
│  - mode: 'l2-state-channel'                           │
│  - l1Address, l1ChannelNonce, l2CallIdx               │
│  - l2TxSerialized (EdDSA-signed)                      │
│  - l2State: {registeredKeys, stateValues}             │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────────────┐
         │  Parse TokamakL2Tx                    │
         │  - Extract EdDSA signature (v,r,s)    │
         │  - Extract sender public key          │
         └───────────────┬───────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────────────┐
         │  Create TokamakL2StateManager         │
         │  - Connect to L1 contract via RPC     │
         │  - Load registered keys (max 64)      │
         │  - Build initial Merkle tree (4-ary)  │
         │  - Compute initial root               │
         └───────────────┬───────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────────────┐
         │  Create EVM with custom crypto        │
         │  - keccak256 → poseidon               │
         │  - ecrecover → getEddsaPublicKey      │
         │  - StateManager: TokamakL2StateManager│
         └───────────────┬───────────────────────┘
                         │
                         ▼
                  Ready to execute
```

**Key Differences**:

| Aspect              | L1 (Standard)           | L2 (State Channel)        |
| ------------------- | ----------------------- | ------------------------- |
| **Transaction Type** | Standard Ethereum TX    | TokamakL2Tx (EdDSA)       |
| **State Manager**    | RPCStateManager         | TokamakL2StateManager     |
| **Hash Function**    | Keccak256               | Poseidon                  |
| **Signature Scheme** | ECDSA (secp256k1)       | EdDSA (JubJub)            |
| **State Tracking**   | Full Ethereum state     | Merkle tree (64 leaves)   |
| **Pre-execution**    | None                    | Verify EdDSA signature    |
| **Post-execution**   | None                    | Finalize Merkle tree      |

**What happens in both modes:**

The EVM is instantiated with an attached [Synthesizer](synthesizer-terminology.md#synthesizer). Think of it as running two virtual machines in parallel:

- **Standard EVM**: Processes the transaction normally, updating stack/memory/storage
- **Synthesizer**: Shadows the EVM execution, tracking everything as mathematical [symbols](synthesizer-terminology.md#symbol-processing)

At this point:

- The [Placements](synthesizer-terminology.md#placement) map is empty (will be populated during execution)
- [Buffer placements](synthesizer-terminology.md#buffer-placements) (IDs 0-3) are pre-initialized for LOAD and RETURN operations
- Both `Stack` and [StackPt](synthesizer-terminology.md#stackpt) are empty
- Both `Memory` and [MemoryPt](synthesizer-terminology.md#memorypt) are empty

---

### Step 3: Event-Driven Execution

Synthesizer uses an **event-driven architecture** that hooks into the EVM's message lifecycle. Transaction execution is divided into three phases:

```
┌─────────────────────────────────────────────────────────────────────┐
│                  TRANSACTION EXECUTION LIFECYCLE                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 1: Pre-Execution (beforeMessage event)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  EVM fires: beforeMessage(message)                                  │
│       │                                                              │
│       ▼                                                              │
│  Synthesizer._prepareSynthesizeTransaction()                        │
│       │                                                              │
│       ├─► For L1: No action                                         │
│       │                                                              │
│       └─► For L2:                                                   │
│           ├─► Parse TokamakL2Tx from message                        │
│           ├─► Extract EdDSA signature (v, r, s)                     │
│           ├─► Verify signature with eddsaVerify()                   │
│           ├─► Create VerifyEddsaSignature placement                 │
│           └─► Load initial Merkle tree root → PUBLIC_IN buffer      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 2: Bytecode Execution (step event, fired for EACH opcode)   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  For each opcode in transaction bytecode:                           │
│                                                                      │
│  EVM fires: step(interpreterStep)                                   │
│       │                                                              │
│       ▼                                                              │
│  Synthesizer._applySynthesizerHandler()                             │
│       │                                                              │
│       ├─► Extract opcode and RunState                               │
│       │                                                              │
│       └─► Execute unified handler (EVM + Synthesizer):              │
│           │                                                          │
│           ├─► EVM Side:                                             │
│           │    ├─ Pop from Stack                                    │
│           │    ├─ Compute result (e.g., ADD: 10+5=15)               │
│           │    ├─ Push to Stack                                     │
│           │    └─ Update Memory/Storage                             │
│           │                                                          │
│           ├─► Synthesizer Side:                                     │
│           │    ├─ Pop from StackPt (get symbols)                    │
│           │    ├─ Create placement (e.g., ALU1 for ADD)             │
│           │    ├─ Generate output symbol                            │
│           │    └─ Push to StackPt                                   │
│           │                                                          │
│           └─► Verify Consistency:                                   │
│                Stack[i].value == StackPt[i].value for all i         │
│                                                                      │
│  Continue to next opcode...                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 3: Post-Execution (afterMessage event)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  EVM fires: afterMessage(result)                                    │
│       │                                                              │
│       ▼                                                              │
│  Synthesizer.finalizeStorage()                                      │
│       │                                                              │
│       ├─► For L1: No action                                         │
│       │                                                              │
│       └─► For L2:                                                   │
│           ├─► Iterate storagePt entries                             │
│           ├─► Update Merkle tree leaves with new values             │
│           ├─► Recompute Merkle tree from bottom to top              │
│           ├─► Compute final Merkle root                             │
│           └─► Add final root → PUBLIC_OUT buffer                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                          Execution Complete
```

**Key Phases Explained:**

#### Phase 1: Pre-Execution (`beforeMessage`)

**Location**: `synthesizer.ts:48-89`

**Purpose**: Prepare for transaction execution, verify signatures (L2 only)

**For L1 transactions**: This phase does nothing—standard Ethereum transactions are verified by the EVM's built-in ECDSA verification.

**For L2 transactions**: 
1. Parse `TokamakL2Tx` from the message
2. Extract EdDSA signature components (`v`, `r`, `s`)
3. Verify signature using `eddsaVerify(msgHash, pubKey, randomizer, signature)`
4. If invalid → throw error
5. If valid → Create `VerifyEddsaSignature` [placement](synthesizer-terminology.md#placement) in circuit
6. Load initial Merkle tree root from `TokamakL2StateManager`
7. Add initial root to `PUBLIC_IN` buffer (wire index 0)

**Example code**:
```typescript
if (this.cachedOpts.mode === 'l2-state-channel') {
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
  
  // Create placement for signature verification
  this._state.placements.set(placementId, {
    name: 'VerifyEddsaSignature',
    usage: 'EDDSA_VERIFY',
    inPts: [pubKeyX, pubKeyY, msgHash, randomizer, signature],
    outPts: [isValidPt]
  });
}
```

---

#### Phase 2: Bytecode Execution (`step`)

**Location**: `interpreter.ts:384-449` (EVM) + opcode handlers

**Purpose**: Execute each opcode with dual EVM + Synthesizer processing

**Fired**: Once for **every single opcode** in the transaction bytecode

**Process**:
1. EVM parses the current opcode
2. Looks up the **unified handler** (contains both EVM and Synthesizer logic)
3. Executes handler:
   - **EVM side**: Updates `Stack`, `Memory`, `Storage` with actual values
   - **Synthesizer side**: Creates [placements](synthesizer-terminology.md#placement), updates [StackPt](synthesizer-terminology.md#stackpt), [MemoryPt](synthesizer-terminology.md#memorypt) with symbols
4. Verifies consistency: `Stack[i].value == StackPt[i].value` for all positions
5. Increments program counter, continues to next opcode

**Example: ADD opcode**

```typescript
// opcodes/functions.ts
[0x01, function (runState) {
  // ========== EVM Side ==========
  const [a, b] = runState.stack.popN(2);  // Pop actual values
  const result = (a + b) % (2n ** 256n);  // Compute
  runState.stack.push(result);            // Push result

  // ========== Synthesizer Side ==========
  const [aPt, bPt] = runState.stackPt.popN(2);  // Pop symbols
  const [resultPt] = runState.synthesizer.placeArith('ADD', [aPt, bPt]);
  runState.stackPt.push(resultPt);  // Push result symbol
  
  // Record placement:
  // Placements[4] = {
  //   name: "ALU1",
  //   usage: "ADD",
  //   inPts: [selectorPt, aPt, bPt],
  //   outPts: [resultPt]
  // }
}]
```

**Key insight**: Every opcode creates circuit nodes (placements) **while** the EVM executes. Synthesizer is not simulating—it's **shadowing** the EVM in real-time.

---

#### Phase 3: Post-Execution (`afterMessage`)

**Location**: `synthesizer.ts:163-278`

**Purpose**: Finalize circuit generation, compute final state commitment (L2 only)

**For L1 transactions**: This phase does nothing—the circuit is complete after bytecode execution.

**For L2 transactions**:
1. Retrieve all modified storage entries from `storagePt`
2. For each registered key:
   - Get leaf index in Merkle tree
   - Update leaf with new storage value
3. Recompute Merkle tree from leaves to root
4. Compute final Merkle root
5. Add final root to `PUBLIC_OUT` buffer (visible to verifier)

**Example code**:
```typescript
if (this.cachedOpts.mode === 'l2-state-channel') {
  const stateManager = this.cachedOpts.stateManager as TokamakL2StateManager;
  
  // Update all modified storage
  for (const [key, valuePt] of this._state.storagePt.entries()) {
    const leafIndex = stateManager.getMTIndex(key);
    stateManager.updateLeaf(leafIndex, valuePt.value);
  }
  
  // Compute final root
  const finalRoot = stateManager.getUpdatedMerkleTreeRoot();
  
  // Add to PUBLIC_OUT buffer
  const finalRootPt = DataPointFactory.create({
    value: finalRoot,
    source: PUBLIC_OUT_PLACEMENT_ID,
    wireIndex: 0
  });
  
  this._bufferManager.addWireToOutBuffer(finalRootPt, PUBLIC_OUT_PLACEMENT_ID);
}
```

**Result**: The circuit now contains:
- `PUBLIC_IN[0]` = Initial Merkle root
- `PUBLIC_OUT[0]` = Final Merkle root
- Verifier can confirm the state transition is valid without seeing individual storage operations

---

**Why Event-Driven Architecture?**

1. **Clean separation**: L2 logic doesn't pollute core EVM execution
2. **Extensibility**: New transaction modes can be added via new event handlers
3. **Composability**: L1 and L2 modes coexist using the same codebase
4. **Correctness**: Pre/post hooks ensure signature verification and state finalization happen at the right times

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

### Step 5: Data Aliasing Resolution

One of Synthesizer's most complex tasks is resolving **data aliasing**—when the same memory region is referenced in different ways. This occurs in three main scenarios:

#### Scenario 1: Overlapping Memory Writes

When multiple writes affect the same memory location:

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

#### Scenario 2: Offset Mismatch (No Overlapping)

Even without overlapping writes, offset differences require aliasing resolution:

```
MSTORE(0x03, X)  // Stores 32 bytes at 0x03-0x23
MLOAD(0x00)      // Loads 32 bytes from 0x00-0x20

Memory Layout:
0x00 0x01 0x02 [0x03 ... 0x1F] 0x20 0x21 0x22 0x23
[??  ??  ??] [    X (32 bytes)    ] [??  ??  ??]
[        Y (32 bytes)         ]

Result Y = [3 garbage bytes] + [first 29 bytes of X]
```

The loaded value Y is **not** the same as X, even though there's no overlapping. Synthesizer must:

1. Detect the 3-byte offset difference
2. Extract the relevant portion of X
3. Combine with uninitialized memory (garbage bytes)
4. Generate circuits to prove the reconstruction

#### Scenario 3: Calldata Chunking (Reverse Process)

When calldata exceeds 32 bytes, it must be chunked into multiple DataPts:

```javascript
// Solidity function
function transfer(address to, uint256 amount) {
    // Calldata: 68 bytes total
    // 0x00-0x04: function selector (4 bytes)
    // 0x04-0x24: to address (32 bytes)
    // 0x24-0x44: amount (32 bytes)
}

// Problem: DataPt can only handle 32 bytes!
```

**Current Implementation (Alpha)**:

The current Synthesizer uses EVM's chunked result as an oracle without proving the chunking process:

```typescript
// See: instructionHandlers.ts:606
case 'CALLDATALOAD': {
  // Uses EVM result directly (oracle approach)
  dataPt = runState.synthesizer.loadEnvInf(
    runState.env.address.toString(),
    'Calldata(User)',
    runState.stack.peek(1)[0],  // EVM's computed value
    i,
  );
}
```

**Limitation**: This approach doesn't prove how calldata was chunked, making it an incomplete zk-proof.

**Next Version (Beta - In Development)**:

The upcoming version will create a dedicated CallData MemoryPt to store function selector and arguments as separate DataPts, enabling complete proof of the chunking process:

```typescript
// Beta approach (in development)
calldataMemoryPt.write(0x00, 4, functionSelectorPt);   // Provable!
calldataMemoryPt.write(0x04, 32, addressPt);           // Provable!
calldataMemoryPt.write(0x24, 32, amountPt);            // Provable!

// CALLDATALOAD(0x04) → calldataMemoryPt.getDataAlias(0x04, 32) → addressPt
```

**Reference**: [CALLDATALOAD implementation](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/eb0073488d5db6ca5219fc911b676869267c521f/packages/frontend/synthesizer/src/tokamak/core/synthesizer/handlers/instructionHandlers.ts#L606)

#### Scenario 4: Multi-Chunk Memory Operations

When operations like **KECCAK256** or **LOG** need to read more than 32 bytes, the memory is chunked into multiple 32-byte segments, each requiring separate aliasing resolution:

```
KECCAK256(offset=0x00, length=0x50)  // Hash 80 bytes

Chunking process:
Chunk 1: getDataAlias(0x00, 32) → DataPt A
Chunk 2: getDataAlias(0x20, 32) → DataPt B
Chunk 3: getDataAlias(0x40, 16) → DataPt C (partial chunk)

Each chunk independently resolves aliasing!
```

**Key characteristics**:

- Memory divided into 32-byte chunks (last chunk may be smaller)
- Each chunk calls `getDataAlias` independently
- Multiple placements may be generated for a single operation
- Used by: KECCAK256, LOG0-LOG4

**Implementation**: See [chunkMemory function](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/tokamak/utils/functions.ts#L8-L38)

#### Scenario 5: Memory-to-Memory Copy Operations

Operations like **MCOPY**, **CODECOPY**, **EXTCODECOPY**, and **RETURNDATACOPY** copy data from one memory region to another, potentially causing aliasing in both source and destination:

```
Memory before:
0x00-0x20: DataPt X (32 bytes)
0x20-0x40: DataPt Y (32 bytes)

MCOPY(dst=0x10, src=0x00, length=0x30)
// Copies 48 bytes from 0x00-0x30 to 0x10-0x40

Result after copy:
0x10-0x20: Partial X (offset mismatch!)
0x20-0x30: Rest of X + partial Y (overlapping!)
0x30-0x40: Rest of Y
```

**Key characteristics**:

- Both source and destination can have aliasing issues
- Uses `placeMemoryToMemory` instead of `placeMemoryToStack`
- Source region aliasing must be resolved before copying
- Destination region may overlap with source (e.g., MCOPY with overlapping regions)

**Implementation**: See [copyMemoryRegion](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/tokamak/pointers/memoryPt.ts#L90-L132)

#### Scenario 6: External Code Copy with Chunking

**EXTCODECOPY** copies external contract bytecode to memory, chunking it into manageable pieces:

```typescript
// Copying 100 bytes of external contract code
EXTCODECOPY(address, memOffset=0x00, codeOffset=0x00, length=0x64)

Chunking process:
while (chunkedLength > 0) {
  chunkSize = min(chunkedLength, 32);
  dataPt = prepareEXTCodePt(address, codeOffset, chunkSize);
  memoryPt.write(memOffset, chunkSize, dataPt);

  chunkedLength -= chunkSize;
  memOffset += chunkSize;
  codeOffset += chunkSize;
}
```

**Key characteristics**:

- External code is fetched and chunked into 32-byte pieces
- Each chunk is written to memory as a separate DataPt
- Subsequent MLOAD operations may need to resolve aliasing across these chunks

#### Scenario 7: Uninitialized Memory Access (Edge Case)

**Note**: This is technically not "aliasing resolution" but rather a **default value handling mechanism** when no DataPts exist for the requested memory region.

When **MLOAD** reads from memory that has never been written to, `getDataAlias` returns an empty array, and a zero value is loaded:

```
// No MSTORE operations performed
MLOAD(0x00)  // Reading uninitialized memory

getDataAlias(0x00, 32) returns []
→ loadAuxin(0) is used (zero value)
```

**Key characteristics**:

- `dataAliasInfos.length === 0` indicates uninitialized memory
- Synthesizer loads auxiliary input with value 0
- Represents "garbage" or uninitialized memory in EVM semantics
- **No subcircuit generation** (unlike Scenarios 1-6)
- Simple default value provision, not aliasing resolution

**Why it's different from aliasing resolution**:

- **Scenarios 1-6**: Multiple DataPts exist → resolve relationships → generate subcircuits
- **Scenario 7**: No DataPts exist → provide default value → no subcircuits

#### How Aliasing Resolution Works

Traditional EVM simply overwrites memory and returns the latest value. But Synthesizer must prove **how** that value was computed from the original [symbols](synthesizer-terminology.md#symbol-processing).

The 2D structure of [MemoryPt](synthesizer-terminology.md#memorypt) (offset × time) allows Synthesizer to:

1. Track all writes to each memory location with timestamps
2. Detect overlaps and offset mismatches when reading
3. Generate [subcircuits](synthesizer-terminology.md#subcircuit) (using SHR, SHL, AND, OR) to reconstruct the correct value
4. Prove the reconstruction is mathematically correct

This is why memory operations can generate multiple [placements](synthesizer-terminology.md#placement)—they need to prove [data aliasing](synthesizer-terminology.md#data-aliasing) resolution in all its forms.

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
