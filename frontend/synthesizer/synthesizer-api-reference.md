# Synthesizer: API Reference

Complete API documentation for Tokamak Synthesizer classes and methods.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Core Classes](#core-classes)
  - [Synthesizer](#synthesizer)
  - [StateManager](#statemanager)
  - [ArithmeticManager](#arithmeticmanager)
  - [InstructionHandler](#instructionhandler)
  - [MemoryManager](#memorymanager)
  - [BufferManager](#buffermanager)
- [L2 Classes](#l2-classes)
  - [TokamakL2Tx](#tokamaklal2tx)
  - [TokamakL2StateManager](#tokamaklal2statemanager)
  - [MerkleTree4](#merkletree4)
- [Data Structures](#data-structures)
  - [DataPt](#datapt)
  - [StackPt](#stackpt)
  - [MemoryPt](#memorypt)
  - [Placement](#placement)
- [Utility Functions](#utility-functions)
- [Type Definitions](#type-definitions)

---

## Overview

The Synthesizer API provides a **facade pattern** interface for transaction-to-circuit compilation. The main entry point is the `Synthesizer` class, which delegates to specialized handler classes.

### Architecture

```
Synthesizer (facade)
├── StateManager (placements, storage)
├── ArithmeticManager (arithmetic operations)
├── InstructionHandler (opcode handlers)
├── MemoryManager (memory aliasing)
└── BufferManager (reserved variables)
```

---

## Core Classes

### Synthesizer

**Purpose**: Main facade class that orchestrates transaction processing and circuit generation

**Source**: [`packages/frontend/synthesizer/src/synthesizer/synthesizer.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/synthesizer.ts)

#### Constructor

```typescript
constructor(opts: SynthesizerOpts)
```

**Parameters**:
- `opts`: Synthesizer options
  - `opts.blockInfo`: Block information (coinbase, timestamp, number, etc.)
  - `opts.stateManager`: State manager instance (L1 or L2)

**Example**:
```typescript
const synthesizer = new Synthesizer({
  blockInfo: {
    coinbase: Address.fromString('0x...'),
    timestamp: 1640000000n,
    number: 15000000n,
    // ...
  },
  stateManager: await TokamakL2StateManager.create({ /* ... */ })
});
```

#### Properties

##### `state`

```typescript
get state(): StateManager
```

Access the StateManager instance.

**Returns**: `StateManager`

**Example**:
```typescript
const placements = synthesizer.state.placements;
```

##### `placements`

```typescript
get placements(): Placements
```

Access the placements list (circuit DAG).

**Returns**: `Placements` - Object with `list: PlacementEntry[]`

**Example**:
```typescript
console.log(`Total placements: ${synthesizer.placements.list.length}`);
```

##### `cachedOpts`

```typescript
readonly cachedOpts: SynthesizerOpts
```

Access the cached options passed to constructor.

#### Methods

##### `synthesizeTX()`

```typescript
async synthesizeTX(): Promise<RunTxResult>
```

Execute the transaction and generate circuit files.

**Returns**: `Promise<RunTxResult>` - EthereumJS transaction execution result

**Throws**: Error if transaction execution fails

**Example**:
```typescript
const result = await synthesizer.synthesizeTX();
console.log('Gas used:', result.execResult.gasUsed);
console.log('Return value:', result.execResult.returnValue.toString('hex'));
```

##### `exportPlacementJSON()`

```typescript
exportPlacementJSON(filepath: string): void
```

Export placements to JSON file.

**Parameters**:
- `filepath`: Output file path

**Example**:
```typescript
synthesizer.exportPlacementJSON('./output/placement.json');
```

##### `exportWireMapJSON()`

```typescript
exportWireMapJSON(filepath: string): void
```

Export wire map to JSON file.

**Parameters**:
- `filepath`: Output file path

**Example**:
```typescript
synthesizer.exportWireMapJSON('./output/wireMap.json');
```

##### `placeArith()`

```typescript
placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[]
```

Place an arithmetic subcircuit.

**Parameters**:
- `name`: Operator name (`'ADD'`, `'MUL'`, `'SUB'`, `'DIV'`, etc.)
- `inPts`: Input DataPt array

**Returns**: `DataPt[]` - Output DataPt array (usually length 1)

**Example**:
```typescript
const resultPt = synthesizer.placeArith('ADD', [aPt, bPt])[0];
```

##### `placeExp()`

```typescript
placeExp(inPts: DataPt[]): DataPt
```

Place exponentiation subcircuit (Square-and-Multiply).

**Parameters**:
- `inPts`: `[base, exponent]`

**Returns**: `DataPt` - Result of `base ^ exponent`

**Example**:
```typescript
const resultPt = synthesizer.placeExp([basePt, expPt]);
```

##### `placeCrypto()`

```typescript
placeCrypto(name: CryptoSubcircuit, inPts: DataPt[]): DataPt | DataPt[]
```

Place a cryptographic subcircuit (Poseidon, EdDSA, JubJub).

**Parameters**:
- `name`: Subcircuit name
  - `'PoseidonCircuit2'`, `'PoseidonCircuit4'`, `'PoseidonCircuit9'`
  - `'EddsaVerify'`
  - `'JubjubExp'`
- `inPts`: Input DataPt array

**Returns**: `DataPt` or `DataPt[]` depending on subcircuit

**Example**:
```typescript
// Poseidon hash
const hashPt = synthesizer.placeCrypto('PoseidonCircuit4', [a, b, c, d]);

// EdDSA verify
const isValidPt = synthesizer.placeCrypto('EddsaVerify', [
  messageHashPt,
  publicKeyXPt, publicKeyYPt,
  randomizerXPt, randomizerYPt,
  signaturePt
]);
```

##### `loadAuxin()`

```typescript
loadAuxin(value: bigint, bitSize?: number, desc?: string): DataPt
```

Load a constant value as DataPt (from auxiliary input).

**Parameters**:
- `value`: Constant value
- `bitSize` (optional): Bit size (default: 256)
- `desc` (optional): Description for debugging

**Returns**: `DataPt`

**Example**:
```typescript
const constantPt = synthesizer.loadAuxin(42n, 256, 'answer to everything');
```

##### `getReservedVariableFromBuffer()`

```typescript
getReservedVariableFromBuffer(varName: ReservedVariable): DataPt
```

Get a reserved variable from input buffer.

**Parameters**:
- `varName`: Reserved variable name (see [Data Structures](./synthesizer-data-structure.md#reserved-variables))

**Returns**: `DataPt`

**Example**:
```typescript
const iniRootPt = synthesizer.getReservedVariableFromBuffer('INI_MERKLE_ROOT');
const eddsaPubKeyXPt = synthesizer.getReservedVariableFromBuffer('EDDSA_PUBLIC_KEY_X');
```

##### `addReservedVariableToBufferIn()`

```typescript
addReservedVariableToBufferIn(
  varName: ReservedVariable, 
  value?: bigint, 
  dynamic?: boolean, 
  message?: string
): DataPt
```

Add a reserved variable to input buffer (for dynamic inputs).

**Parameters**:
- `varName`: Reserved variable name
- `value` (optional): Value (default: 0)
- `dynamic` (optional): Whether wire index is dynamic (default: false)
- `message` (optional): Description for debugging

**Returns**: `DataPt`

**Example**:
```typescript
const mtIndexPt = synthesizer.addReservedVariableToBufferIn(
  'IN_MT_INDEX',
  BigInt(leafIndex),
  true,
  `Merkle tree index for leaf ${leafIndex}`
);
```

##### `addReservedVariableToBufferOut()`

```typescript
addReservedVariableToBufferOut(
  varName: ReservedVariable, 
  symbolDataPt: DataPt, 
  dynamic?: boolean, 
  message?: string
): DataPt
```

Add a reserved variable to output buffer.

**Parameters**:
- `varName`: Reserved variable name
- `symbolDataPt`: DataPt to output
- `dynamic` (optional): Whether wire index is dynamic (default: false)
- `message` (optional): Description for debugging

**Returns**: `DataPt`

**Example**:
```typescript
synthesizer.addReservedVariableToBufferOut(
  'RES_MERKLE_ROOT',
  finalRootPt,
  true,
  'Final Merkle tree root after transaction'
);
```

---

### StateManager

**Purpose**: Manages placements and storage operations

**Source**: [`packages/frontend/synthesizer/src/synthesizer/handlers/stateManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/stateManager.ts)

#### Properties

##### `placements`

```typescript
get placements(): Placements
```

Access the placements list.

**Returns**: `Placements`

##### `wireMap`

```typescript
get wireMap(): WireMap
```

Access the wire map (connections between placements).

**Returns**: `WireMap` - `Record<string, number>`

#### Methods

##### `place()`

```typescript
place(
  name: SubcircuitNames, 
  inPts: DataPt[], 
  outPts: DataPt[], 
  usage: string
): void
```

Add a placement to the circuit DAG.

**Parameters**:
- `name`: Subcircuit name (e.g., `'ALU1'`, `'PoseidonCircuit4'`)
- `inPts`: Input DataPt array
- `outPts`: Output DataPt array
- `usage`: Usage string (e.g., `'ADD'`, `'POSEIDON_4'`)

**Example**:
```typescript
stateManager.place('ALU1', [aPt, bPt], [resultPt], 'ADD');
```

##### `loadStorage()`

```typescript
async loadStorage(key: bigint, value?: bigint): Promise<DataPt>
```

Load storage value as DataPt.

**Parameters**:
- `key`: Storage key
- `value` (optional): Override value (for testing)

**Returns**: `Promise<DataPt>`

**Example**:
```typescript
const storagePt = await stateManager.loadStorage(0x01n);
```

---

### ArithmeticManager

**Purpose**: Handles arithmetic operations (ADD, MUL, SUB, DIV, etc.)

**Source**: [`packages/frontend/synthesizer/src/synthesizer/handlers/arithmeticManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/arithmeticManager.ts)

#### Methods

##### `placeArith()`

```typescript
placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[]
```

Place an arithmetic subcircuit.

**Supported Operators**:
- **ALU1**: `ADD`, `MUL`, `SUB`, `EQ`, `ISZERO`, `NOT`
- **ALU2**: `DIV`, `SDIV`, `MOD`, `SMOD`, `ADDMOD`, `MULMOD`
- **ALU3**: `SHL`, `SHR`, `SAR`
- **ALU4**: `LT`, `GT`, `SLT`, `SGT`
- **ALU5**: `SIGNEXTEND`, `BYTE`
- **Bitwise**: `AND`, `OR`, `XOR`

**Example**:
```typescript
const sumPt = arithmeticManager.placeArith('ADD', [aPt, bPt])[0];
const productPt = arithmeticManager.placeArith('MUL', [aPt, bPt])[0];
const isEqualPt = arithmeticManager.placeArith('EQ', [aPt, bPt])[0];
```

##### `placeExp()`

```typescript
placeExp(inPts: DataPt[]): DataPt
```

Place exponentiation subcircuit.

**Example**:
```typescript
const resultPt = arithmeticManager.placeExp([basePt, expPt]);
// Generates SubEXP placements (Square-and-Multiply)
```

##### `placePoseidon()`

```typescript
placePoseidon(inPts: DataPt[]): DataPt
```

Place Poseidon hash subcircuit (auto-detects arity).

**Example**:
```typescript
const hash2Pt = arithmeticManager.placePoseidon([aPt, bPt]);
const hash4Pt = arithmeticManager.placePoseidon([aPt, bPt, cPt, dPt]);
```

##### `placeJubjubExp()`

```typescript
placeJubjubExp(inPts: DataPt[], PoI: DataPt[]): DataPt[]
```

Place JubJub scalar multiplication subcircuit.

**Parameters**:
- `inPts`: `[scalarPt, basePointXPt, basePointYPt]`
- `PoI`: Point at infinity `[xPt, yPt]`

**Returns**: `[resultXPt, resultYPt]`

**Example**:
```typescript
const [resultXPt, resultYPt] = arithmeticManager.placeJubjubExp(
  [scalarPt, baseXPt, baseYPt],
  [poiXPt, poiYPt]
);
```

---

### InstructionHandler

**Purpose**: Maps EVM opcodes to Synthesizer handlers

**Source**: [`packages/frontend/synthesizer/src/synthesizer/handlers/instructionHandler.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/instructionHandler.ts)

#### Properties

##### `synthesizerHandlers`

```typescript
get synthesizerHandlers(): Map<number, SynthesizerOpHandler>
```

Access the opcode handler map.

**Returns**: `Map<number, SynthesizerOpHandler>` - Maps opcode number to handler function

**Example**:
```typescript
const addHandler = instructionHandler.synthesizerHandlers.get(0x01); // ADD
```

#### Methods

Opcode handlers are invoked automatically during EVM execution. See [Opcode Reference](./synthesizer-opcodes.md) for details.

---

### MemoryManager

**Purpose**: Handles memory operations with aliasing tracking

**Source**: [`packages/frontend/synthesizer/src/synthesizer/handlers/memoryManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/memoryManager.ts)

#### Methods

##### `placeMemoryToStack()`

```typescript
placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt
```

Place memory-to-stack circuit (MLOAD).

**Parameters**:
- `dataAliasInfos`: Memory alias information (from `MemoryPt.getDataAlias()`)

**Returns**: `DataPt` - Reconstructed memory value

##### `placeMemoryToMemory()`

```typescript
placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[]
```

Place memory-to-memory circuit (CALLDATACOPY, CODECOPY).

**Returns**: `DataPt[]` - Array of byte DataPts

##### `placeMSTORE()`

```typescript
placeMSTORE(dataPt: DataPt, truncBitSize: number): DataPt
```

Place MSTORE circuit (stack-to-memory).

**Parameters**:
- `dataPt`: Data to store
- `truncBitSize`: Number of bits to truncate (e.g., 8 for MSTORE8)

**Returns**: `DataPt` - Truncated data

##### `copyMemoryPts()`

```typescript
copyMemoryPts(
  target: MemoryPts, 
  srcOffset: bigint, 
  length: bigint, 
  dstOffset?: bigint
): MemoryPts
```

Copy memory region to another MemoryPt.

**Parameters**:
- `target`: Target MemoryPt
- `srcOffset`: Source offset
- `length`: Copy length
- `dstOffset` (optional): Destination offset (default: srcOffset)

**Returns**: `MemoryPts` - Updated target

---

### BufferManager

**Purpose**: Manages reserved variables and buffer I/O

**Source**: [`packages/frontend/synthesizer/src/synthesizer/handlers/bufferManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/bufferManager.ts)

#### Methods

##### `getReservedVariableFromBuffer()`

```typescript
getReservedVariableFromBuffer(varName: ReservedVariable): DataPt
```

Get a reserved variable from input buffer.

See [Synthesizer.getReservedVariableFromBuffer()](#getreservedvariablefrombuffer) for details.

##### `addReservedVariableToBufferIn()`

```typescript
addReservedVariableToBufferIn(
  varName: ReservedVariable, 
  value?: bigint, 
  dynamic?: boolean, 
  message?: string
): DataPt
```

Add a reserved variable to input buffer.

See [Synthesizer.addReservedVariableToBufferIn()](#addreservedvariabletobufferin) for details.

##### `addReservedVariableToBufferOut()`

```typescript
addReservedVariableToBufferOut(
  varName: ReservedVariable, 
  symbolDataPt: DataPt, 
  dynamic?: boolean, 
  message?: string
): DataPt
```

Add a reserved variable to output buffer.

See [Synthesizer.addReservedVariableToBufferOut()](#addreservedvariabletobufferout) for details.

##### `loadArbitraryStatic()`

```typescript
loadArbitraryStatic(value: bigint, bitSize?: number, desc?: string): DataPt
```

Load a constant value as DataPt.

Alias for `loadAuxin()`.

---

## L2 Classes

### TokamakL2Tx

**Purpose**: EdDSA-signed transaction for L2 state channels

**Source**: [`packages/frontend/synthesizer/src/TokamakL2JS/tx/TokamakL2Tx.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/tx/TokamakL2Tx.ts)

#### Static Methods

##### `fromTxData()`

```typescript
static fromTxData(txData: TxData): TokamakL2Tx
```

Create an unsigned L2 transaction.

**Parameters**:
- `txData`: Transaction data (nonce, gasLimit, to, value, data)

**Returns**: `TokamakL2Tx`

**Example**:
```typescript
const unsignedTx = TokamakL2Tx.fromTxData({
  nonce: 0,
  gasLimit: 1000000,
  to: Address.fromString('0x...'),
  value: 100n,
  data: Buffer.from('calldata', 'hex')
});
```

##### `fromSerializedTx()`

```typescript
static fromSerializedTx(serialized: Buffer): TokamakL2Tx
```

Deserialize an L2 transaction.

**Parameters**:
- `serialized`: Serialized transaction (RLP-encoded)

**Returns**: `TokamakL2Tx`

#### Methods

##### `getHashedMessageToSign()`

```typescript
getHashedMessageToSign(): bigint
```

Get the message hash for signing (Poseidon hash of tx fields).

**Returns**: `bigint` - Message hash (255-bit)

**Example**:
```typescript
const messageHash = unsignedTx.getHashedMessageToSign();
```

##### `sign()`

```typescript
sign(signature: EddsaSignature): TokamakL2Tx
```

Sign the transaction with EdDSA signature.

**Parameters**:
- `signature`: EdDSA signature
  - `signature.randomizer`: R point (x, y)
  - `signature.signedHash`: s scalar

**Returns**: `TokamakL2Tx` - Signed transaction

**Example**:
```typescript
const privateKey = Buffer.from('PRIVATE_KEY', 'hex');
const messageHash = unsignedTx.getHashedMessageToSign();
const signature = eddsaSign_unsafe(messageHash, privateKey);
const signedTx = unsignedTx.sign(signature);
```

##### `serialize()`

```typescript
serialize(): Buffer
```

Serialize the transaction (RLP encoding).

**Returns**: `Buffer`

**Example**:
```typescript
const serialized = signedTx.serialize();
console.log('Serialized tx:', serialized.toString('hex'));
```

---

### TokamakL2StateManager

**Purpose**: Merkle tree-based state manager for L2 state channels

**Source**: [`packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts)

#### Static Methods

##### `create()`

```typescript
static async create(opts: TokamakL2StateManagerOpts): Promise<TokamakL2StateManager>
```

Create a new L2 state manager.

**Parameters**:
- `opts.l1ContractAddress`: L1 contract address
- `opts.registeredKeys`: Array of registered storage keys (up to 64)
- `opts.initialState`: Initial state values (key-value map)
- `opts.hasher`: Hash function (Poseidon)
- `opts.arity` (optional): Merkle tree arity (default: 4)
- `opts.depth` (optional): Merkle tree depth (default: 4)

**Returns**: `Promise<TokamakL2StateManager>`

**Example**:
```typescript
const stateManager = await TokamakL2StateManager.create({
  l1ContractAddress: Address.fromString('0xL1_CONTRACT'),
  registeredKeys: [
    '0x0000000000000000000000000000000000000000000000000000000000000001',
    '0x0000000000000000000000000000000000000000000000000000000000000002'
  ],
  initialState: {
    '0x01': '0xff',
    '0x02': '0x100'
  },
  hasher: poseidon,
  arity: 4,
  depth: 4
});
```

#### Properties

##### `initialMerkleTree`

```typescript
get initialMerkleTree(): MerkleTree4
```

Get the initial Merkle tree (before transaction execution).

**Returns**: `MerkleTree4`

##### `finalMerkleTree`

```typescript
get finalMerkleTree(): MerkleTree4
```

Get the final Merkle tree (after transaction execution).

**Returns**: `MerkleTree4`

#### Methods

##### `getStorage()`

```typescript
async getStorage(address: Address, key: Buffer): Promise<Buffer>
```

Get storage value (from initial state).

**Parameters**:
- `address`: Contract address
- `key`: Storage key (32 bytes)

**Returns**: `Promise<Buffer>` - Storage value (32 bytes)

##### `putStorage()`

```typescript
async putStorage(address: Address, key: Buffer, value: Buffer): Promise<void>
```

Set storage value (updates final state).

**Parameters**:
- `address`: Contract address
- `key`: Storage key (32 bytes)
- `value`: Storage value (32 bytes)

##### `getUserStorageKey()`

```typescript
getUserStorageKey(l2CallerAddress: Address, rawKey: Buffer): Buffer
```

Compute L2 user storage key.

**Formula**: `Poseidon(l1ContractAddress, Poseidon(l2CallerAddress, rawKey))`

**Parameters**:
- `l2CallerAddress`: L2 caller address
- `rawKey`: Raw storage key

**Returns**: `Buffer` - Hashed storage key (32 bytes)

---

### MerkleTree4

**Purpose**: 4-ary Merkle tree for L2 state commitment

**Source**: [`packages/frontend/synthesizer/src/TokamakL2JS/stateManager/MerkleTree.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/MerkleTree.ts)

#### Constructor

```typescript
constructor(opts: {
  arity: number,
  depth: number,
  hasher: HashFunction,
  leaves: Leaf[]
})
```

**Parameters**:
- `arity`: Tree arity (children per node, typically 4)
- `depth`: Tree depth (typically 4 for 64 leaves)
- `hasher`: Hash function (Poseidon)
- `leaves`: Initial leaves (key-value pairs)

#### Properties

##### `root`

```typescript
get root(): bigint
```

Get the Merkle tree root hash.

**Returns**: `bigint` - Root hash (255-bit)

##### `leaves`

```typescript
get leaves(): Leaf[]
```

Get the leaves (key-value pairs).

**Returns**: `Leaf[]`

#### Methods

##### `recomputeRoot()`

```typescript
recomputeRoot(): bigint
```

Recompute the Merkle tree root (after leaf updates).

**Returns**: `bigint` - New root hash

**Example**:
```typescript
// Update leaf
tree.leaves[0].value = newValue;

// Recompute root
const newRoot = tree.recomputeRoot();
```

##### `getProof()`

```typescript
getProof(leafIndex: number): MerkleProof
```

Get Merkle proof for a leaf.

**Parameters**:
- `leafIndex`: Leaf index (0-based)

**Returns**: `MerkleProof`
- `siblings`: Array of sibling hashes (for each level)
- `pathIndices`: Array of path indices (which sibling: 0, 1, 2, or 3)

**Example**:
```typescript
const proof = tree.getProof(5);
console.log('Siblings:', proof.siblings);
console.log('Path indices:', proof.pathIndices);
```

---

## Data Structures

### DataPt

**Purpose**: Symbol representing data flowing through the circuit

**Source**: [`packages/frontend/synthesizer/src/synthesizer/dataStructure/dataPt.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/dataStructure/dataPt.ts)

#### Type Definition

```typescript
interface DataPt {
  source: number;        // Placement ID or external source
  wireIndex: number;     // Output wire index from source
  value: bigint;         // Actual value (for simulation)
  sourceBitSize?: number; // Bit size of source
  extSource?: string;    // External source description
  extDest?: string;      // External destination description
}
```

#### Factory Methods

```typescript
class DataPtFactory {
  static createDataPt(opts: {
    source: number,
    wireIndex: number,
    value: bigint,
    sourceBitSize?: number,
    extSource?: string
  }): DataPt;
}
```

**Example**:
```typescript
const dataPt = DataPtFactory.createDataPt({
  source: 42,
  wireIndex: 0,
  value: 123n,
  sourceBitSize: 256,
  extSource: 'Calldata byte 0'
});
```

---

### StackPt

**Purpose**: Symbolic stack for EVM execution

**Source**: [`packages/frontend/synthesizer/src/synthesizer/pointers/stackPt.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/pointers/stackPt.ts)

#### Methods

##### `push()`

```typescript
push(dataPt: DataPt): void
```

Push a DataPt onto the stack.

##### `pop()`

```typescript
pop(): DataPt
```

Pop a DataPt from the stack.

##### `peek()`

```typescript
peek(offset: number = 0): DataPt
```

Peek at stack without popping.

**Parameters**:
- `offset`: Offset from top (0 = top, 1 = second, etc.)

##### `swap()`

```typescript
swap(depth: number): void
```

Swap top with element at depth.

**Parameters**:
- `depth`: Swap depth (1-16)

##### `dup()`

```typescript
dup(depth: number): void
```

Duplicate element at depth to top.

**Parameters**:
- `depth`: Dup depth (1-16)

---

### MemoryPt

**Purpose**: Symbolic memory with aliasing tracking

**Source**: [`packages/frontend/synthesizer/src/synthesizer/pointers/memoryPt.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/pointers/memoryPt.ts)

#### Methods

##### `write()`

```typescript
write(offset: bigint, dataPt: DataPt, length: number = 32): void
```

Write DataPt to memory.

**Parameters**:
- `offset`: Memory offset
- `dataPt`: Data to write
- `length`: Write length in bytes (default: 32)

##### `read()`

```typescript
read(offset: bigint, length: number = 32): Buffer
```

Read bytes from memory (returns actual values for simulation).

**Parameters**:
- `offset`: Memory offset
- `length`: Read length in bytes (default: 32)

**Returns**: `Buffer`

##### `getDataAlias()`

```typescript
getDataAlias(offset: bigint, length: number): DataAliasInfos
```

Get data alias information (for circuit generation).

**Parameters**:
- `offset`: Memory offset
- `length`: Read length in bytes

**Returns**: `DataAliasInfos` - Information about overlapping writes

---

### Placement

**Purpose**: Subcircuit instance in the circuit DAG

#### Type Definition

```typescript
interface PlacementEntry {
  id: number;              // Unique placement ID
  name: SubcircuitNames;   // Subcircuit name (e.g., 'ALU1', 'PoseidonCircuit4')
  usage: string;           // Usage string (e.g., 'ADD', 'POSEIDON_4')
  inPts: DataPt[];         // Input DataPts
  outPts: DataPt[];        // Output DataPts
}
```

**Example**:
```json
{
  "id": 42,
  "name": "ALU1",
  "usage": "ADD",
  "inPts": [
    { "source": 0, "wireIndex": 0, "value": "10" },
    { "source": 0, "wireIndex": 1, "value": "20" }
  ],
  "outPts": [
    { "source": 42, "wireIndex": 0, "value": "30" }
  ]
}
```

---

## Utility Functions

### createSynthesizerOptsForSimulationFromRPC()

**Purpose**: Create Synthesizer options from RPC

**Source**: [`packages/frontend/synthesizer/src/interface/rpc/rpc.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/interface/rpc/rpc.ts)

```typescript
async function createSynthesizerOptsForSimulationFromRPC(opts: {
  rpcUrl: string,
  txHash?: string,
  l1Address?: string,
  l1ChannelNonce?: number,
  l2CallIdx?: number,
  l2TxSerialized?: string,
  l2State?: {
    registeredKeys: string[],
    stateValues: Record<string, string>
  },
  customCrypto?: {
    hasher: HashFunction,
    getSigner: () => EddsaSigner
  },
  mode: 'normal' | 'l2-state-channel'
}): Promise<SynthesizerOpts>
```

**Example (L1)**:
```typescript
const synthOpts = await createSynthesizerOptsForSimulationFromRPC({
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY',
  txHash: '0xYOUR_TX_HASH',
  mode: 'normal'
});
```

**Example (L2)**:
```typescript
const synthOpts = await createSynthesizerOptsForSimulationFromRPC({
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY',
  l1Address: '0xL1_CONTRACT',
  l1ChannelNonce: 0,
  l2CallIdx: 0,
  l2TxSerialized: signedTx.serialize().toString('hex'),
  l2State: {
    registeredKeys: ['0x01', '0x02'],
    stateValues: { '0x01': '0xff', '0x02': '0x100' }
  },
  customCrypto: {
    hasher: poseidon,
    getSigner: () => ({ privateKey, publicKey })
  },
  mode: 'l2-state-channel'
});
```

---

## Type Definitions

### Reserved Variable Types

See [Data Structures: Reserved Variables](./synthesizer-data-structure.md#reserved-variables) for complete list.

```typescript
type ReservedVariable =
  // PUBLIC_OUT
  | 'RES_MERKLE_ROOT'
  | 'OTHER_CONTRACT_STORAGE_OUT'
  // PUBLIC_IN
  | 'INI_MERKLE_ROOT'
  | 'EDDSA_PUBLIC_KEY_X'
  | 'EDDSA_PUBLIC_KEY_Y'
  | 'OTHER_CONTRACT_STORAGE_IN'
  // BLOCK_IN
  | 'COINBASE'
  | 'TIMESTAMP'
  | 'NUMBER'
  | 'PREVRANDAO'
  | 'GASLIMIT'
  | 'CHAINID'
  | 'SELFBALANCE'
  | 'BASEFEE'
  | 'BLOCKHASH_1' | ... | 'BLOCKHASH_256'
  // PRIVATE_IN
  | 'TRANSACTION_NONCE'
  | 'CONTRACT_ADDRESS'
  | 'FUNCTION_SELECTOR'
  | 'TRANSACTION_INPUT0' | ... | 'TRANSACTION_INPUT8'
  | 'EDDSA_SIGNATURE'
  | 'EDDSA_RANDOMIZER_X'
  | 'EDDSA_RANDOMIZER_Y'
  | 'IN_MT_INDEX'
  | 'IN_MPT_KEY'
  | 'IN_VALUE'
  | 'MERKLE_PROOF'
  // EVM_IN
  | 'ADDRESS_MASK'
  | 'JUBJUB_BASE_X'
  | 'JUBJUB_BASE_Y'
  | 'JUBJUB_POI_X'
  | 'JUBJUB_POI_Y'
  | 'NULL_POSEIDON_LEVEL0' | ... | 'NULL_POSEIDON_LEVEL3';
```

### Subcircuit Names

```typescript
type SubcircuitNames =
  | 'ALU1'  // ADD, MUL, SUB, EQ, ISZERO, NOT
  | 'ALU2'  // DIV, SDIV, MOD, SMOD, ADDMOD, MULMOD
  | 'ALU3'  // SHL, SHR, SAR
  | 'ALU4'  // LT, GT, SLT, SGT
  | 'ALU5'  // SIGNEXTEND, BYTE
  | 'AND'
  | 'OR'
  | 'XOR'
  | 'DecToBit'
  | 'Accumulator'
  | 'SubEXP'
  | 'PoseidonCircuit2'
  | 'PoseidonCircuit4'
  | 'PoseidonCircuit9'
  | 'EddsaVerify'
  | 'JubjubExp';
```

### Arithmetic Operators

```typescript
type ArithmeticOperator =
  | 'ADD' | 'MUL' | 'SUB'
  | 'DIV' | 'SDIV' | 'MOD' | 'SMOD' | 'ADDMOD' | 'MULMOD'
  | 'SHL' | 'SHR' | 'SAR'
  | 'LT' | 'GT' | 'SLT' | 'SGT'
  | 'EQ' | 'ISZERO'
  | 'AND' | 'OR' | 'XOR' | 'NOT'
  | 'SIGNEXTEND' | 'BYTE';
```

### Supported Opcodes

See [Opcode Reference](./synthesizer-opcodes.md#all-opcodes) for complete list.

```typescript
type SynthesizerSupportedOpcodes =
  | 'ADD' | 'MUL' | 'SUB' | 'DIV' | 'SDIV' | 'MOD' | 'SMOD' | 'ADDMOD' | 'MULMOD'
  | 'EXP'
  | 'LT' | 'GT' | 'SLT' | 'SGT' | 'EQ' | 'ISZERO'
  | 'AND' | 'OR' | 'XOR' | 'NOT'
  | 'BYTE' | 'SHL' | 'SHR' | 'SAR'
  | 'KECCAK256'
  | 'ADDRESS' | 'BALANCE' | 'ORIGIN' | 'CALLER' | 'CALLVALUE' | 'CALLDATALOAD'
  | 'CALLDATASIZE' | 'CALLDATACOPY' | 'CODESIZE' | 'CODECOPY'
  | 'GASPRICE' | 'RETURNDATASIZE' | 'RETURNDATACOPY'
  | 'BLOCKHASH' | 'COINBASE' | 'TIMESTAMP' | 'NUMBER' | 'PREVRANDAO' | 'DIFFICULTY'
  | 'GASLIMIT' | 'CHAINID' | 'SELFBALANCE' | 'BASEFEE'
  | 'POP' | 'MLOAD' | 'MSTORE' | 'MSTORE8' | 'SLOAD' | 'SSTORE'
  | 'JUMP' | 'JUMPI' | 'PC' | 'MSIZE' | 'GAS' | 'JUMPDEST'
  | 'PUSH1' | ... | 'PUSH32'
  | 'DUP1' | ... | 'DUP16'
  | 'SWAP1' | ... | 'SWAP16'
  | 'LOG0' | 'LOG1' | 'LOG2' | 'LOG3' | 'LOG4'
  | 'CALL' | 'STATICCALL' | 'RETURN' | 'STOP';
```

---

## Related Resources

### Tokamak zk-EVM Source Code

- [Synthesizer (Main)](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/synthesizer.ts)
- [StateManager](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/stateManager.ts)
- [ArithmeticManager](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/arithmeticManager.ts)
- [InstructionHandler](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/instructionHandler.ts)
- [MemoryManager](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/memoryManager.ts)
- [BufferManager](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/synthesizer/handlers/bufferManager.ts)
- [TokamakL2Tx](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/tx/TokamakL2Tx.ts)
- [TokamakL2StateManager](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/TokamakL2StateManager.ts)
- [MerkleTree4](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/stateManager/MerkleTree.ts)

### Related Documentation

- [Synthesizer Concepts](./synthesizer-concepts.md)
- [Execution Flow](./synthesizer-execution-flow.md)
- [Architecture](./synthesizer-architecture.md)
- [Data Structures](./synthesizer-data-structure.md)
- [L2 State Channels](./synthesizer-l2-state-channels.md)
- [Cryptographic Primitives](./synthesizer-cryptography.md)
- [Opcode Reference](./synthesizer-opcodes.md)

