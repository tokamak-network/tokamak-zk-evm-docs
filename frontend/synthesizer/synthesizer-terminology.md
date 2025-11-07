# Synthesizer: Terminology

This document defines key terms and concepts used throughout the Synthesizer documentation.

---

## Core Concepts

### Symbol
A **symbolic representation** of a value flowing through the circuit. Each symbol tracks its origin (placement ID + wire index) and actual value for simulation.

**Example**: `{source: 4, wireIndex: 0, value: 15n}`

---

### DataPt (Data Point)
The concrete implementation of a **symbol**. Contains:
- `source`: Placement ID where symbol originates
- `wireIndex`: Output wire index from source placement
- `value`: Actual value (for simulation/verification)
- `sourceBitSize`: Bit size of the value

**Purpose**: Track data flow through circuit for wire connections

---

### Placement
A **subcircuit instance** in the circuit graph (DAG). Each placement represents one execution of a pre-compiled subcircuit (e.g., ALU1 for ADD operation).

**Components**:
- `id`: Unique identifier
- `name`: Subcircuit name (ALU1, ALU2, etc.)
- `usage`: Operation (ADD, MUL, etc.)
- `inPts`: Input symbols (wire connections IN)
- `outPts`: Output symbols (wire connections OUT)

---

### Subcircuit
A **pre-compiled Circom circuit** (compiled to R1CS + WASM). Examples:
- ALU1: Basic arithmetic (ADD, MUL, SUB)
- ALU2: Division and modulo
- PoseidonCircuit4: Hash 4 field elements

---

### Wire
A **connection** between placements in the circuit graph. Each wire carries one field element (256-bit value).

---

### StackPt (Symbolic Stack)
The **symbol version** of the EVM stack. Instead of storing values, stores DataPt symbols that represent the data flow.

**Purpose**: Track which placements' outputs are used as inputs to subsequent operations

---

### MemoryPt (Symbolic Memory)
The **symbol version** of EVM memory with time-tracking. Records every write as `(offset, dataPt, time)`.

**Purpose**: Resolve memory aliasing by tracking overlapping writes

---

### Aliasing
When memory regions **overlap** across multiple writes. Example:
- Write 32 bytes at 0x00 (time 0)
- Write 16 bytes at 0x10 (time 1)
- Read 32 bytes at 0x00 → needs data from BOTH writes

**Solution**: MemoryPt tracks all writes with timestamps, reconstructs correct data using subcircuits (SHR, SHL, OR)

---

## Buffer Concepts

### LOAD Buffer (Input)
A **special placement** (IDs 0-3) that converts external values into symbols for use in the circuit.

**Types**:
- `PUB_IN` (ID 0): Public inputs (calldata, block info)
- `PRV_IN` (ID 2): Private inputs (storage, witness data)
- `BLOCK_IN` (ID 4): Block information
- `EVM_IN` (ID 5): Constants (curve points, masks)

---

### RETURN Buffer (Output)
A **special placement** (IDs 1, 3) that converts symbols back to external values for the verifier.

**Types**:
- `PUB_OUT` (ID 1): Public outputs (return data, logs, Merkle roots)
- `PRV_OUT` (ID 3): Private outputs (storage updates)

---

### Reserved Variables
**Predefined buffer slots** with fixed purposes. Examples:
- `INI_MERKLE_ROOT`: Initial Merkle tree root (PUBLIC_IN, wire 0)
- `EDDSA_PUBLIC_KEY_X`: EdDSA public key X coordinate (PUBLIC_IN, wire 1)
- `TRANSACTION_NONCE`: Transaction nonce (PRIVATE_IN, wire 0)

See [Data Structures: Reserved Variables](./synthesizer-data-structure.md#reserved-variables) for complete list.

---

## L2-Specific Terms

### EdDSA (Edwards-curve Digital Signature Algorithm)
Signature scheme on **JubJub curve** (twisted Edwards curve over BLS12-381 scalar field). 

**Advantages**:
- ~200x fewer constraints than ECDSA in circuits
- Deterministic signing (RFC 8032 compliant)

---

### Poseidon Hash
**ZK-SNARK-friendly hash function** using algebraic operations over prime fields.

**Advantages**:
- ~100x fewer constraints than Keccak256 in circuits
- Designed specifically for zk-SNARKs

**Variants**:
- Poseidon-2: Hash 2 inputs (leaf hash)
- Poseidon-4: Hash 4 inputs (4-ary Merkle parent)
- Poseidon-9: Hash 9 inputs (transaction message)

---

### JubJub Curve
**Twisted Edwards curve** over BLS12-381 scalar field used for EdDSA signatures.

**Equation**: \( ax^2 + y^2 = 1 + dx^2y^2 \)

**Parameters**:
- \( a = -1 \)
- \( d = -(10240/10241) \mod R\_MOD \)

---

### Merkle Tree (4-ary)
**State commitment structure** for L2 state channels. Each node has 4 children.

**Configuration**:
- Arity: 4
- Depth: 4
- Max leaves: 64 (4^3)
- Hash function: Poseidon-4

**Purpose**: Compact state representation with efficient proof generation

---

### Registered Keys
**Pre-declared storage keys** (max 64) tracked in the Merkle tree for L2 state channels.

**Hashing**:
- L2 user storage: `Poseidon(l1Contract, Poseidon(l2Caller, rawKey))`
- L1 contract storage: `Keccak256(l1Contract, rawKey)`

---

## Circuit Generation Terms

### Permutation
The **wire connection map** between placements. Maps each input wire to its source (placement + output wire).

**Output**: `permutation.json`

---

### Witness
The **complete set of values** for all wires in the circuit, including intermediate values.

**Output**: `placementVariables.json`

---

### Instance
The **public and private input/output values** visible to the verifier (public) or prover only (private).

**Output**: `instance.json`

---

## Design Patterns

### Facade Pattern
**Synthesizer class** acts as a unified interface, delegating to specialized handlers:
- StateManager
- ArithmeticManager
- InstructionHandler
- MemoryManager
- BufferManager

---

### Event-Driven Architecture
Synthesizer hooks into **EVM message lifecycle**:
- `beforeMessage`: Verify EdDSA signature (L2 only)
- `step`: Process each opcode
- `afterMessage`: Finalize Merkle tree (L2 only)

---

## Related Documentation

- [Synthesizer Concepts](./synthesizer-concepts.md)
- [Data Structures](./synthesizer-data-structure.md)
- [L2 State Channels](./synthesizer-l2-state-channels.md)
- [Cryptographic Primitives](./synthesizer-cryptography.md)

