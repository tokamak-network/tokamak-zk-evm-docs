# Synthesizer: Repository Structure

This document describes the file and directory structure of the Synthesizer package.

---

## Directory Structure

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

---

## Key Directories

### `synthesizer/`

Core Synthesizer implementation:
- **`synthesizer.ts`**: Main facade class
- **`handlers/`**: Specialized handler classes
- **`dataStructure/`**: DataPt, StackPt, MemoryPt
- **`types/`**: TypeScript type definitions
- **`params/`**: Constants and configuration

### `TokamakL2JS/` (NEW)

L2 state channel components:
- **`tx/`**: EdDSA-signed transaction classes
- **`stateManager/`**: Merkle tree-based state management
- **`crypto/`**: Poseidon hash and EdDSA signatures
- **`utils/`**: Helper utilities

### `interface/`

Public API and integration:
- **`index.ts`**: Public exports
- **`rpc/`**: RPC integration utilities
- **`adapters/`**: Adapter patterns
- **`qapCompiler/`**: QAP compiler integration

### `circuitGenerator/`

Circuit output generation:
- **`circuitGenerator.ts`**: Main generator
- **`witness_calculator.ts`**: WASM witness calculator
- **`handlers/`**: Permutation and variable generators

---

## Key Changes from Old Structure

### Structural Changes

- **Moved from `tokamak/core/` to flat `synthesizer/` directory**
  - Simpler import paths
  - Better organization

- **Added `TokamakL2JS/` for L2 state channel components**
  - EdDSA transaction support
  - Merkle tree state management
  - Poseidon hash integration

- **Added `interface/` for public API and RPC utilities**
  - Cleaner public API surface
  - RPC integration helpers

### Handler Renaming

| Old Name           | New Name              | Location                   |
| ------------------ | --------------------- | -------------------------- |
| `operationHandler` | `arithmeticManager`   | `handlers/arithmeticManager.ts` |
| `dataLoader`       | (removed/integrated)  | integrated into `instructionHandler.ts` |

### New Components

- **`TokamakL2Tx`**: EdDSA-signed transaction class
- **`TokamakL2StateManager`**: Merkle tree-based state manager
- **`createSynthesizerOptsForSimulationFromRPC`**: RPC helper function

---

## Related Documentation

- [Code Architecture](./synthesizer-architecture.md)
- [Class Structure](./synthesizer-class-structure.md)
- [L2 State Channels](./synthesizer-l2-state-channels.md)

