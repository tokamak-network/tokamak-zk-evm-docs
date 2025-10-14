# Synthesizer Opcode Reference

**Inspired by [evm.codes](https://www.evm.codes/)**

This document describes how the Tokamak Synthesizer handles each EVM opcode, comparing standard EVM behavior with circuit generation.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Opcode Categories](#opcode-categories)
- [Arithmetic Operations](#arithmetic-operations)
- [Comparison & Bitwise Operations](#comparison--bitwise-operations)
- [Cryptographic Operations](#cryptographic-operations)
- [Environmental Information](#environmental-information)
- [Block Information](#block-information)
- [Stack, Memory & Storage](#stack-memory--storage)
- [Control Flow & System](#control-flow--system)
- [Implementation Status](#implementation-status)

---

## Overview

### Standard EVM vs Synthesizer

```typescript
// Standard EVM (Value Processing)
0x01 ADD: pop(a, b) → push(a + b)  // Black box

// Synthesizer (Symbol Processing + Circuit Generation)
0x01 ADD: pop(a, b) → place(ALU1, [selector, a, b], [result]) → push(result)  // Transparent
```

### Key Differences

| Aspect           | Standard EVM               | Synthesizer                               |
| ---------------- | -------------------------- | ----------------------------------------- |
| **Processing**   | Value-based computation    | Symbol-based circuit generation           |
| **Traceability** | Black box (input → output) | Transparent (input → placements → output) |
| **Output**       | Final computation result   | Circuit representation + result           |
| **Purpose**      | Execute transaction        | Generate zk-SNARK proof                   |

### Subcircuit Types

The Synthesizer uses pre-compiled subcircuits from the [QAP Compiler](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/qap-compiler):

- **ALU1**: Basic arithmetic (ADD, MUL, SUB, EQ, ISZERO, NOT)
- **ALU2**: Modular arithmetic (DIV, SDIV, MOD, SMOD, ADDMOD, MULMOD)
- **ALU3**: Shift operations (SHL, SHR, SAR)
- **ALU4**: Comparisons (LT, GT, SLT, SGT)
- **ALU5**: Specialized operations (SIGNEXTEND, BYTE)
- **AND/OR/XOR**: Bitwise operations
- **DecToBit**: Decimal to bit decomposition
- **Accumulator**: Multi-input accumulation

---

## Opcode Categories

### By Functionality

```
0x00-0x0b   Arithmetic Operations
0x10-0x1d   Comparison & Bitwise Operations
0x20        Cryptographic Operations
0x30-0x3f   Environmental Information
0x40-0x48   Block Information
0x50-0x5f   Stack, Memory & Storage
0x60-0x7f   Push Operations
0x80-0x8f   Duplication Operations
0x90-0x9f   Exchange Operations
0xa0-0xa4   Logging Operations
0xf0-0xff   System Operations
```

### By Implementation Status

- ✅ **Implemented**: Fully working in Synthesizer
- 🔄 **In Progress**: Partially implemented
- ❌ **Not Supported**: Not yet implemented
- 🌐 **External**: Handled outside circuit (e.g., Keccak256)

---

## Arithmetic Operations

### 0x01: ADD

**Opcode**: `0x01`  
**Mnemonic**: `ADD`  
**Gas**: 3  
**Stack Input**: `a`, `b`  
**Stack Output**: `a + b mod 2^256`

#### Standard EVM Behavior

```typescript
const [a, b] = stack.popN(2);
const result = (a + b) % TWO_POW256;
stack.push(result);
```

#### Synthesizer Behavior

```typescript
const [a, b] = stackPt.popN(2);
const result = mod(a.value + b.value, TWO_POW256);
synthesizerArith('ADD', [a.value, b.value], result, runState);
```

#### Circuit Generation

- **Subcircuit**: `ALU1`
- **Selector**: `1n << 1n` (binary: `0b10`)
- **Inputs**: `[selector, a, b]`
- **Outputs**: `[result]`
- **Constraints**: 803 constraints (630 non-linear + 173 linear)

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:97-103`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L97-L103)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:18-26`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L18-L26)
- Subcircuit Mapping: [`packages/frontend/synthesizer/src/tokamak/constant/constants.ts:53`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/tokamak/constant/constants.ts#L53)

#### Status

✅ **Implemented** (Alpha)

---

### 0x02: MUL

**Opcode**: `0x02`  
**Mnemonic**: `MUL`  
**Gas**: 5  
**Stack Input**: `a`, `b`  
**Stack Output**: `a * b mod 2^256`

#### Standard EVM Behavior

```typescript
const [a, b] = stack.popN(2);
const result = (a * b) % TWO_POW256;
stack.push(result);
```

#### Synthesizer Behavior

```typescript
const [a, b] = stackPt.popN(2);
const result = mod(a.value * b.value, TWO_POW256);
synthesizerArith('MUL', [a.value, b.value], result, runState);
```

#### Circuit Generation

- **Subcircuit**: `ALU1`
- **Selector**: `1n << 2n` (binary: `0b100`)
- **Inputs**: `[selector, a, b]`
- **Outputs**: `[result]`
- **Constraints**: 803 constraints (same ALU1 subcircuit, different selector)

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:105-111`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L105-L111)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:28-36`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L28-L36)
- Subcircuit Mapping: [`packages/frontend/synthesizer/src/tokamak/constant/constants.ts:54`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/tokamak/constant/constants.ts#L54)

#### Status

✅ **Implemented** (Alpha)

---

### 0x03: SUB

**Opcode**: `0x03`  
**Mnemonic**: `SUB`  
**Gas**: 3  
**Stack Input**: `a`, `b`  
**Stack Output**: `a - b mod 2^256`

#### Standard EVM Behavior

```typescript
const [a, b] = stack.popN(2);
const result = (a - b) % TWO_POW256;
stack.push(result);
```

#### Synthesizer Behavior

```typescript
const [a, b] = stackPt.popN(2);
const result = mod(a.value - b.value, TWO_POW256);
synthesizerArith('SUB', [a.value, b.value], result, runState);
```

#### Circuit Generation

- **Subcircuit**: `ALU1`
- **Selector**: `1n << 3n` (binary: `0b1000`)
- **Inputs**: `[selector, a, b]`
- **Outputs**: `[result]`
- **Constraints**: 803 constraints (same ALU1 subcircuit)

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:113-119`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L113-L119)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:38-46`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L38-L46)
- Subcircuit Mapping: [`packages/frontend/synthesizer/src/tokamak/constant/constants.ts:55`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/tokamak/constant/constants.ts#L55)

#### Status

✅ **Implemented** (Alpha)

---

### 0x04: DIV

**Opcode**: `0x04`  
**Mnemonic**: `DIV`  
**Gas**: 5  
**Stack Input**: `a`, `b`  
**Stack Output**: `a / b` (integer division, 0 if b == 0)

#### Standard EVM Behavior

```typescript
const [a, b] = stack.popN(2);
let result;
if (b === BIGINT_0) {
  result = BIGINT_0;
} else {
  result = a / b;
}
stack.push(result);
```

#### Synthesizer Behavior

```typescript
const [a, b] = stackPt.popN(2);
let result;
if (b.value === BIGINT_0) {
  result = BIGINT_0;
} else {
  result = mod(a.value / b.value, TWO_POW256);
}
synthesizerArith('DIV', [a.value, b.value], result, runState);
```

#### Circuit Generation

- **Subcircuit**: `ALU2` (handles division/modulo operations)
- **Selector**: `1n << 4n` (binary: `0b10000`)
- **Inputs**: `[selector, a, b]`
- **Outputs**: `[result]`
- **Constraints**: 993 constraints (566 non-linear + 427 linear)

#### Special Cases

- Division by zero returns 0 (EVM convention)
- Integer division (no decimals)

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:121-131`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L121-L131)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:48-61`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L48-L61)
- Subcircuit Mapping: [`packages/frontend/synthesizer/src/tokamak/constant/constants.ts:56`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/tokamak/constant/constants.ts#L56)

#### Status

✅ **Implemented** (Alpha)

---

### 0x0a: EXP

**Opcode**: `0x0a`  
**Mnemonic**: `EXP`  
**Gas**: 10 + 50 per byte of exponent  
**Stack Input**: `base`, `exponent`  
**Stack Output**: `base ^ exponent mod 2^256`

#### Standard EVM Behavior

```typescript
const [base, exponent] = stack.popN(2);
if (exponent === BIGINT_0) {
  stack.push(BIGINT_1);
} else if (base === BIGINT_0) {
  stack.push(BIGINT_0);
} else {
  const result = exponentiation(base, exponent);
  stack.push(result);
}
```

#### Synthesizer Behavior

```typescript
const [base, exponent] = stackPt.popN(2);
let result;
if (exponent.value === BIGINT_0) {
  result = BIGINT_1;
} else if (base.value === BIGINT_0) {
  result = base.value;
} else {
  result = (base.value ** exponent.value) % TWO_POW256;
}
synthesizerArith('EXP', [base.value, exponent.value], result, runState);
```

#### Circuit Generation

- **Algorithm**: Square-and-Multiply (binary exponentiation)
- **Subcircuit**: `ALU1` (SubEXP variant) + `DecToBit`
- **Selector**: `1n << 10n`
- **Placements**: 1 DecToBit + up to 256 SubEXP placements (worst case)
- **Constraints**:
  - DecToBit: 258 constraints (256 non-linear + 2 linear)
  - SubEXP: 803 constraints each
  - **Worst case total: ~206,000 constraints** (most expensive operation)

#### Example: 3^13

```
13 = 0b1101 (binary)

Circuit generation:
1. SubEXP(3, 1) → 3       [bit 0]
2. SubEXP(3, 3) → 9       [square]
3. SubEXP(9, 9) → 81      [square]
4. SubEXP(81, 3) → 243    [multiply, bit 2]
5. SubEXP(243, 243) → 59049 [square]
6. SubEXP(59049, 3) → 177147 [multiply, bit 3]

Result: 3^13 = 1594323
```

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:177-188`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L177-L188)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:141-156`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L141-L156)
- Subcircuit Mapping: [`packages/frontend/synthesizer/src/tokamak/constant/constants.ts:62,80`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/tokamak/constant/constants.ts#L62)

#### Performance Notes

- Most constraint-heavy arithmetic operation
- Number of placements proportional to bits set in exponent
- Consider avoiding large exponents in zk-provable contracts

#### Status

✅ **Implemented** (Alpha)

---

## Comparison & Bitwise Operations

### 0x10: LT

**Opcode**: `0x10`  
**Mnemonic**: `LT` (Less Than)  
**Gas**: 3  
**Stack Input**: `a`, `b`  
**Stack Output**: `1` if `a < b`, `0` otherwise

#### Standard EVM Behavior

```typescript
const [a, b] = stack.popN(2);
const result = a < b ? BIGINT_1 : BIGINT_0;
stack.push(result);
```

#### Synthesizer Behavior

```typescript
const [a, b] = stackPt.popN(2);
const result = a.value < b.value ? BIGINT_1 : BIGINT_0;
synthesizerArith('LT', [a.value, b.value], result, runState);
```

#### Circuit Generation

- **Subcircuit**: `ALU4` (comparison operations)
- **Selector**: `1n << 16n`
- **Inputs**: `[selector, a, b]`
- **Outputs**: `[result]` (0 or 1)
- **Constraints**: 629 constraints (594 non-linear + 35 linear)

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:240-246`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L240-L246)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:167-175`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L167-L175)
- Subcircuit Mapping: [`packages/frontend/synthesizer/src/tokamak/constant/constants.ts:64`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/tokamak/constant/constants.ts#L64)

#### Status

✅ **Implemented** (Alpha)

---

### 0x14: EQ

**Opcode**: `0x14`  
**Mnemonic**: `EQ` (Equal)  
**Gas**: 3  
**Stack Input**: `a`, `b`  
**Stack Output**: `1` if `a == b`, `0` otherwise

#### Standard EVM Behavior

```typescript
const [a, b] = stack.popN(2);
const result = a === b ? BIGINT_1 : BIGINT_0;
stack.push(result);
```

#### Synthesizer Behavior

```typescript
const [a, b] = stackPt.popN(2);
const result = a.value === b.value ? BIGINT_1 : BIGINT_0;
await synthesizerArith('EQ', [a.value, b.value], result, runState);
```

#### Circuit Generation

- **Subcircuit**: `ALU1`
- **Selector**: `1n << 20n`
- **Inputs**: `[selector, a, b]`
- **Outputs**: `[result]` (0 or 1)
- **Constraints**: 803 constraints (same ALU1 subcircuit)

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:272-278`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L272-L278)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:207-215`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L207-L215)
- Subcircuit Mapping: [`packages/frontend/synthesizer/src/tokamak/constant/constants.ts:68`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/tokamak/constant/constants.ts#L68)

#### Status

✅ **Implemented** (Alpha)

---

### 0x16: AND

**Opcode**: `0x16`  
**Mnemonic**: `AND` (Bitwise AND)  
**Gas**: 3  
**Stack Input**: `a`, `b`  
**Stack Output**: `a & b` (bitwise)

#### Standard EVM Behavior

```typescript
const [a, b] = stack.popN(2);
const result = a & b;
stack.push(result);
```

#### Synthesizer Behavior

```typescript
const [a, b] = stackPt.popN(2);
const result = a.value & b.value;
await synthesizerArith('AND', [a.value, b.value], result, runState);
```

#### Circuit Generation

- **Subcircuit**: `AND` (dedicated bitwise circuit)
- **Selector**: `undefined` (no selector, single-purpose circuit)
- **Inputs**: `[a, b]`
- **Outputs**: `[result]`
- **Constraints**: 774 constraints (768 non-linear + 6 linear)

#### How It Works

The AND subcircuit performs bitwise AND on 256-bit inputs:

```
Input A:  1010...
Input B:  1100...
Output:   1000...  (A & B)
```

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:288-294`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L288-L294)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:227-234`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L227-L234)
- Subcircuit Mapping: [`packages/frontend/synthesizer/src/tokamak/constant/constants.ts:70`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/tokamak/constant/constants.ts#L70)

#### Status

✅ **Implemented** (Alpha)

---

### 0x17: OR

**Opcode**: `0x17`  
**Mnemonic**: `OR` (Bitwise OR)  
**Gas**: 3  
**Stack Input**: `a`, `b`  
**Stack Output**: `a | b` (bitwise)

#### Circuit Generation

- **Subcircuit**: `OR` (dedicated bitwise circuit)
- **Selector**: `undefined`
- **Constraints**: 774 constraints (768 non-linear + 6 linear)

#### Source Code

- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:237-244`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L237-L244)

#### Status

✅ **Implemented** (Alpha)

---

### 0x18: XOR

**Opcode**: `0x18`  
**Mnemonic**: `XOR` (Bitwise XOR)  
**Gas**: 3  
**Stack Input**: `a`, `b`  
**Stack Output**: `a ^ b` (bitwise)

#### Circuit Generation

- **Subcircuit**: `XOR` (dedicated bitwise circuit)
- **Selector**: `undefined`
- **Constraints**: 774 constraints (768 non-linear + 6 linear)

#### Source Code

- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:247-254`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L247-L254)

#### Status

✅ **Implemented** (Alpha)

---

### 0x1b: SHL

**Opcode**: `0x1b`  
**Mnemonic**: `SHL` (Shift Left)  
**Gas**: 3  
**Stack Input**: `shift`, `value`  
**Stack Output**: `value << shift`

#### Standard EVM Behavior

```typescript
const [shift, value] = stack.popN(2);
const result = (value << shift) & ((BIGINT_1 << BIGINT_256) - BIGINT_1);
stack.push(result);
```

#### Synthesizer Behavior

```typescript
const [a, b] = stackPt.popN(2);
const result = (b.value << a.value) & ((BigInt(1) << BigInt(256)) - BigInt(1));
await synthesizerArith('SHL', [a.value, b.value], result, runState);
```

#### Circuit Generation

- **Subcircuit**: `ALU3` (shift operations)
- **Selector**: `1n << 27n`
- **Inputs**: `[selector, shift, value]`
- **Outputs**: `[result]`
- **Constraints**: 816 constraints (638 non-linear + 178 linear)

#### Source Code

- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:278-286`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L278-L286)
- Subcircuit Mapping: [`packages/frontend/synthesizer/src/tokamak/constant/constants.ts:75`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/tokamak/constant/constants.ts#L75)

#### Status

✅ **Implemented** (Alpha)

---

## Cryptographic Operations

### 0x20: KECCAK256

**Opcode**: `0x20`  
**Mnemonic**: `KECCAK256` (SHA3)  
**Gas**: 30 + 6 per word  
**Stack Input**: `offset`, `size`  
**Stack Output**: `keccak256(memory[offset:offset+size])`

#### Standard EVM Behavior

```typescript
const [offset, size] = stack.popN(2);
const data = memory.read(Number(offset), Number(size));
const hash = keccak256(data);
stack.push(bytesToBigInt(hash));
```

#### Synthesizer Behavior

```typescript
const [offsetPt, lengthPt] = stackPt.popN(2);
const offset = offsetPt.value;
const length = lengthPt.value;

if (length !== BIGINT_0) {
  // Load memory data as symbols (DataPts)
  const nChunks = Math.ceil(lengthNum / 32);
  const chunkDataPts = [];

  for (let i = 0; i < nChunks; i++) {
    const dataAliasInfos = memoryPt.getDataAlias(_offset, _length);
    chunkDataPts[i] = synthesizer.placeMemoryToStack(dataAliasInfos);
  }

  // Hash is computed externally, but circuit tracks inputs
  const result = stack.peek(1)[0]; // Get result from EVM execution
  stackPt.push(synthesizer.loadAndStoreKeccak(chunkDataPts, result, length));
}
```

#### Circuit Generation

- **Processing**: 🌐 **External** (hash computed outside circuit)
- **Tracking**: Input data symbols recorded in circuit
- **Reason**: Keccak256 is too expensive to compute in-circuit (~100,000 constraints per hash)
- **Approach**:
  1. Track input symbols (DataPts from memory)
  2. Compute hash externally (standard Keccak256)
  3. Load result as auxiliary input (loadAndStoreKeccak)
  4. Circuit verifies correct inputs were hashed (not the hash itself)

#### Why External?

```
In-circuit Keccak256: ~100,000 constraints per hash
Large contract with 10 hashes: 1,000,000 constraints just for hashing
Solution: Compute hash externally, verify inputs/outputs
```

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:190-197`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L190-L197)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:322-375`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L322-L375)

#### Status

✅ **Implemented** (Alpha) - External processing

---

## Environmental Information

### 0x30: ADDRESS

**Opcode**: `0x30`  
**Mnemonic**: `ADDRESS`  
**Gas**: 2  
**Stack Input**: (none)  
**Stack Output**: `address(this)` (current contract address)

#### Standard EVM Behavior

```typescript
const address = bytesToBigInt(runState.interpreter.getAddress());
stack.push(address);
```

#### Synthesizer Behavior

```typescript
await synthesizerEnvInf('ADDRESS', runState);
```

#### Circuit Generation

- **Type**: Environmental Information
- **Processing**: Load from public inputs via buffer system
- **Buffer**: `PUB_IN` (Placement 0)
- **Flow**:
  1. External value (contract address) → PUB_IN buffer
  2. Buffer creates DataPt symbol
  3. Symbol pushed to StackPt
  4. Permutation connects buffer output to usage site

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:355-358`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L355-L358)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:377-382`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L377-L382)

#### Status

✅ **Implemented** (Alpha)

---

### 0x33: CALLER

**Opcode**: `0x33`  
**Mnemonic**: `CALLER`  
**Gas**: 2  
**Stack Input**: (none)  
**Stack Output**: `address(msg.sender)` (caller address)

#### Circuit Generation

- **Type**: Environmental Information
- **Buffer**: `PUB_IN` (Placement 0)

#### Source Code

- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:402-408`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L402-L408)

#### Status

✅ **Implemented** (Alpha)

---

### 0x35: CALLDATALOAD

**Opcode**: `0x35`  
**Mnemonic**: `CALLDATALOAD`  
**Gas**: 3  
**Stack Input**: `i` (byte offset in calldata)  
**Stack Output**: `calldata[i:i+32]` (32 bytes, zero-padded if needed)

#### Standard EVM Behavior

```typescript
const pos = stack.pop();
const calldata = interpreter.getCallData();
const data = getDataSlice(calldata, pos, 32);
stack.push(bytesToBigInt(data));
```

#### Synthesizer Behavior

```typescript
const pos = stackPt.pop().value;
await synthesizerEnvInf('CALLDATALOAD', runState, undefined, pos);
```

#### Circuit Generation

- **Type**: Environmental Information
- **Buffer**: `PUB_IN` (Placement 0) - Calldata is public
- **Processing**:
  1. Load calldata value at position
  2. Create DataPt via PUB_IN buffer
  3. Push symbol to StackPt
- **Constraints**: ~100 (buffer operation)

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:383-387`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L383-L387)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:418-425`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L418-L425)

#### Status

✅ **Implemented** (Alpha)

---

### 0x37: CALLDATACOPY

**Opcode**: `0x37`  
**Mnemonic**: `CALLDATACOPY`  
**Gas**: 3 + 3 per word copied  
**Stack Input**: `destOffset`, `offset`, `size`  
**Stack Output**: (none, writes to memory)

#### Standard EVM Behavior

```typescript
const [memOffset, dataOffset, dataLength] = stack.popN(3);
const data = interpreter.getCallData().subarray(
  Number(dataOffset),
  Number(dataOffset + dataLength)
);
memory.write(Number(memOffset), Number(dataLength), data);
```

#### Synthesizer Behavior

```typescript
const [memOffset, dataOffset, dataLength] = stackPt.popN(3);

if (dataLength.value !== BIGINT_0) {
  // Load calldata as DataPt symbols
  const dataPt = synthesizer.loadEnvInf(
    env.address.toString(),
    'Calldata',
    bytesToBigInt(data),
    Number(dataOffset.value),
    Number(dataLength.value)
  );

  // Write symbols to MemoryPt
  memoryPt.write(
    Number(memOffset.value),
    Number(dataLength.value),
    dataPt
  );
}
```

#### Circuit Generation

- **Type**: Memory Operation + Environmental Information
- **Processing**:
  1. Load calldata from PUB_IN buffer → DataPt
  2. Write DataPt to MemoryPt (tracking memory state)
  3. MemoryPt handles data aliasing if memory overlaps
- **Constraints**: ~100 (buffer) + ~5,000 per memory word (if memory circuits needed)

#### Memory Aliasing Handling

If CALLDATACOPY overlaps with existing memory:

```
Example:
1. CALLDATACOPY(0x00, 0x00, 64)  // Write calldata to memory 0x00-0x40
2. MSTORE(0x20, value)           // Overwrite memory 0x20-0x40
3. MLOAD(0x00)                   // Load memory 0x00-0x20

MemoryPt tracks:
- Calldata symbol at 0x00-0x20 (first 32 bytes)
- MSTORE value at 0x20-0x40 (overwrites last 32 bytes of calldata)

MLOAD generates circuit to reconstruct first 32 bytes from calldata symbol.
```

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:389-405`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L389-L405)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:435-496`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L435-L496)

#### Status

✅ **Implemented** (Alpha)

---

## Block Information

### 0x40: BLOCKHASH

**Opcode**: `0x40`  
**Mnemonic**: `BLOCKHASH`  
**Gas**: 20  
**Stack Input**: `blockNumber`  
**Stack Output**: `blockhash(blockNumber)` (or 0 if invalid)

#### Circuit Generation

- **Type**: Block Information
- **Buffer**: `PUB_IN` (Placement 0)
- **Processing**: Similar to environmental info

#### Source Code

- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:611-616`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L611-L616)

#### Status

✅ **Implemented** (Alpha)

---

### 0x41: COINBASE

**Opcode**: `0x41`  
**Mnemonic**: `COINBASE`  
**Gas**: 2  
**Stack Input**: (none)  
**Stack Output**: `block.coinbase` (miner address)

#### Source Code

- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:619-624`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L619-L624)

#### Status

✅ **Implemented** (Alpha)

---

## Stack, Memory & Storage

### 0x50: POP

**Opcode**: `0x50`  
**Mnemonic**: `POP`  
**Gas**: 2  
**Stack Input**: `value`  
**Stack Output**: (none, removes value)

#### Synthesizer Behavior

```typescript
stackPt.pop(); // Remove top DataPt from symbol stack
```

#### Circuit Generation

- **Type**: Stack Operation
- **Processing**: No circuit placement (pure stack manipulation)
- **Constraints**: 0

#### Status

✅ **Implemented** (Alpha)

---

### 0x51: MLOAD

**Opcode**: `0x51`  
**Mnemonic**: `MLOAD`  
**Gas**: 3 + memory expansion  
**Stack Input**: `offset`  
**Stack Output**: `memory[offset:offset+32]`

#### Standard EVM Behavior

```typescript
const offset = stack.pop();
const data = memory.read(Number(offset), 32);
stack.push(bytesToBigInt(data));
```

#### Synthesizer Behavior

```typescript
const offset = stackPt.pop().value;

// Query MemoryPt for data aliasing info
const dataAliasInfos = memoryPt.getDataAlias(Number(offset), 32);

if (dataAliasInfos.length > 0) {
  // Generate circuit to reconstruct memory from symbols
  const resultPt = synthesizer.placeMemoryToStack(dataAliasInfos);
  stackPt.push(resultPt);
} else {
  // Memory uninitialized, load zero
  stackPt.push(synthesizer.loadAuxin(BIGINT_0));
}
```

#### Circuit Generation

- **Type**: Memory Operation
- **Processing**: Data aliasing resolution
- **Subcircuits Used**:
  - `DecToBit`: Convert DataPts to bits
  - `Accumulator`: Combine multiple DataPts with shifts/masks
  - Bitwise circuits (AND, OR) for masking
- **Constraints**: ~5,000 per DataPt involved

#### Data Aliasing Example

```typescript
// Scenario: Overlapping memory writes
1. MSTORE(0x00, 0xAAAA...AAAA)  // Write to 0x00-0x20
2. MSTORE(0x10, 0xBBBB...BBBB)  // Overlapping write to 0x10-0x30
3. MLOAD(0x00)                  // Load 0x00-0x20

// MemoryPt tracks:
// - dataPt1 (0xAAAA...AAAA) at 0x00-0x20
// - dataPt2 (0xBBBB...BBBB) at 0x10-0x30

// MLOAD(0x00) must reconstruct:
// Result = dataPt1[0x00-0x10] | dataPt2[0x10-0x20]
//        = First 16 bytes of dataPt1 + First 16 bytes of dataPt2

// Circuit:
dataAliasInfos = [
  { dataPt: dataPt1, shift: 0, masker: 0xFFFF...0000 },  // Use first 16 bytes
  { dataPt: dataPt2, shift: 128, masker: 0x0000...FFFF } // Use first 16 bytes, shift left
]

result = (dataPt1 & mask1) | ((dataPt2 & mask2) << 128)
```

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:476-481`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L476-L481)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:632-648`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L632-L648)

#### Status

✅ **Implemented** (Alpha)

---

### 0x52: MSTORE

**Opcode**: `0x52`  
**Mnemonic**: `MSTORE`  
**Gas**: 3 + memory expansion  
**Stack Input**: `offset`, `value`  
**Stack Output**: (none, writes to memory)

#### Standard EVM Behavior

```typescript
const [offset, value] = stack.popN(2);
memory.write(Number(offset), 32, bigIntToBytes(value, 32));
```

#### Synthesizer Behavior

```typescript
const [offset, value] = stackPt.popN(2);

// Write DataPt symbol to MemoryPt with timestamp
memoryPt.write(Number(offset.value), 32, value);
```

#### Circuit Generation

- **Type**: Memory Operation
- **Processing**: Record symbol in MemoryPt
- **Timestamp**: Each MSTORE gets unique timestamp for aliasing resolution
- **Constraints**: 0 (no circuit at write time, circuits generated on MLOAD)

#### How MemoryPt Tracks State

```typescript
MemoryPt: {
  _storePt: Map<timestamp, {
    memOffset: number,
    containerSize: number,
    dataPt: DataPt
  }>,
  _timeStamp: number  // Increments on each write
}

// Example:
MSTORE(0x00, dataPt1) → timestamp 0
MSTORE(0x10, dataPt2) → timestamp 1
MSTORE(0x20, dataPt3) → timestamp 2

// Later MLOAD queries MemoryPt for overlaps
```

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:483-489`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L483-L489)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:650-656`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L650-L656)

#### Status

✅ **Implemented** (Alpha)

---

### 0x54: SLOAD

**Opcode**: `0x54`  
**Mnemonic**: `SLOAD`  
**Gas**: 100/2100 (cold/warm)  
**Stack Input**: `key` (storage slot)  
**Stack Output**: `storage[key]`

#### Standard EVM Behavior

```typescript
const key = stack.pop();
const keyBytes = setLengthLeft(bigIntToBytes(key), 32);
const value = await stateManager.getContractStorage(address, keyBytes);
stack.push(bytesToBigInt(value));
```

#### Synthesizer Behavior

```typescript
const keyPt = stackPt.pop();
const key = setLengthLeft(bigIntToBytes(keyPt.value), 32);
const value = await stateManager.getContractStorage(address, key);

// Load storage value as private input
const valuePt = synthesizer.loadPrvInf(
  address.toString(),
  'Storage',
  bytesToBigInt(value),
  bytesToBigInt(key)
);

stackPt.push(valuePt);
```

#### Circuit Generation

- **Type**: Storage Operation
- **Buffer**: `PRV_IN` (Placement 2) - Storage is private
- **Processing**:
  1. Read storage value from stateManager (external)
  2. Load value as DataPt via PRV_IN buffer
  3. Push symbol to StackPt
- **Constraints**: ~100 (buffer operation)

#### Why Private?

Storage values are often sensitive (user balances, private state). The Synthesizer treats storage as private input by default, allowing users to prove execution without revealing storage contents.

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:511-520`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L511-L520)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:672-689`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L672-L689)

#### Status

✅ **Implemented** (Alpha)

---

### 0x55: SSTORE

**Opcode**: `0x55`  
**Mnemonic**: `SSTORE`  
**Gas**: Complex (see EIP-1283, EIP-2200)  
**Stack Input**: `key`, `value`  
**Stack Output**: (none, writes to storage)

#### Synthesizer Behavior

```typescript
const [keyPt, valuePt] = stackPt.popN(2);
const key = setLengthLeft(bigIntToBytes(keyPt.value), 32);

// Store to state manager (external)
await stateManager.putContractStorage(address, key, bigIntToBytes(valuePt.value, 32));

// Record in PRV_OUT buffer
synthesizer.storePrvOut(
  address.toString(),
  'Storage',
  valuePt,
  bytesToBigInt(key)
);
```

#### Circuit Generation

- **Type**: Storage Operation
- **Buffer**: `PRV_OUT` (Placement 3) - Private outputs
- **Processing**:
  1. Write DataPt symbol to PRV_OUT buffer
  2. Actual storage update happens externally
  3. Circuit tracks which symbols were stored
- **Constraints**: ~100 (buffer operation)

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:522-548`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L522-L548)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:691-710`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L691-L710)

#### Status

✅ **Implemented** (Alpha)

---

### 0x60-0x7f: PUSH1-PUSH32

**Opcodes**: `0x60` - `0x7f`  
**Mnemonic**: `PUSH1` - `PUSH32`  
**Gas**: 3  
**Stack Input**: (none)  
**Stack Output**: `value` (from bytecode)

#### Standard EVM Behavior

```typescript
const numToPush = opcode - 0x5f; // 0x60 → 1 byte, 0x7f → 32 bytes
const value = bytesToBigInt(code.subarray(pc + 1, pc + 1 + numToPush));
stack.push(value);
```

#### Synthesizer Behavior

```typescript
const numToPush = opcode - 0x5f;
const value = bytesToBigInt(code.subarray(pc + 1, pc + 1 + numToPush));

// Load hardcoded value as auxiliary input
const valuePt = synthesizer.loadAuxin(value, numToPush);
stackPt.push(valuePt);
```

#### Circuit Generation

- **Type**: Hardcoded Input
- **Processing**: `loadAuxin()` creates DataPt from constant
- **Constraints**: 0 (constants don't need circuits)
- **Note**: Auxiliary inputs are values that don't come from external sources

#### Why loadAuxin?

```typescript
// PUSH values are hardcoded in bytecode, not from environment/storage
// They're known at compile time, so treated as auxiliary inputs

PUSH1 0x05  →  synthesizer.loadAuxin(5, 1)
PUSH32 0xFFFF...  →  synthesizer.loadAuxin(0xFFFF..., 32)
```

#### Source Code

- EVM Handler: [`packages/frontend/synthesizer/src/opcodes/functions.ts:572-579`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L572-L579)
- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:726-733`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L726-L733)

#### Status

✅ **Implemented** (Alpha)

---

### 0x80-0x8f: DUP1-DUP16

**Opcodes**: `0x80` - `0x8f`  
**Mnemonic**: `DUP1` - `DUP16`  
**Gas**: 3  
**Stack Input**: `value` (at position n from top)  
**Stack Output**: `value`, original stack (duplicates value)

#### Synthesizer Behavior

```typescript
const n = opcode - 0x7f; // 0x80 → 1, 0x8f → 16
stackPt.dup(n); // Duplicate DataPt symbol at position n
```

#### Circuit Generation

- **Type**: Stack Operation
- **Processing**: Duplicate DataPt reference (no circuit)
- **Constraints**: 0

#### Status

✅ **Implemented** (Alpha)

---

### 0x90-0x9f: SWAP1-SWAP16

**Opcodes**: `0x90` - `0x9f`  
**Mnemonic**: `SWAP1` - `SWAP16`  
**Gas**: 3  
**Stack Input**: `value1` (top), `value2` (at position n+1)  
**Stack Output**: `value2`, ..., `value1` (swapped)

#### Synthesizer Behavior

```typescript
const n = opcode - 0x8f; // 0x90 → 1, 0x9f → 16
stackPt.swap(n); // Swap top DataPt with DataPt at position n+1
```

#### Circuit Generation

- **Type**: Stack Operation
- **Processing**: Swap DataPt references (no circuit)
- **Constraints**: 0

#### Status

✅ **Implemented** (Alpha)

---

## Control Flow & System

### 0x56: JUMP

**Opcode**: `0x56`  
**Mnemonic**: `JUMP`  
**Gas**: 8  
**Stack Input**: `counter` (destination PC)  
**Stack Output**: (none, changes PC)

#### Synthesizer Behavior

```typescript
const destPt = stackPt.pop();
// PC change handled by interpreter
// No circuit generation (control flow)
```

#### Circuit Generation

- **Type**: Control Flow
- **Processing**: No circuit (PC manipulation)
- **Constraints**: 0

#### Status

✅ **Implemented** (Alpha)

---

### 0xf0: CREATE

**Opcode**: `0xf0`  
**Mnemonic**: `CREATE`  
**Stack Input**: `value`, `offset`, `size`  
**Stack Output**: `address` (new contract address, or 0 if failed)

#### Status

❌ **Not Supported** (Alpha)

#### Reason

Contract creation requires:

- Context switching circuits (~10,000 constraints)
- Deployment code execution tracking
- Address computation verification

Planned for Beta release with batch transaction support.

---

### 0xf3: RETURN

**Opcode**: `0xf3`  
**Mnemonic**: `RETURN`  
**Gas**: 0 + memory expansion  
**Stack Input**: `offset`, `size`  
**Stack Output**: (none, halts execution)

#### Synthesizer Behavior

```typescript
const [offsetPt, lengthPt] = stackPt.popN(2);

if (lengthPt.value !== BIGINT_0) {
  // Load return data from memory as symbols
  const offset = Number(offsetPt.value);
  const length = Number(lengthPt.value);

  const dataAliasInfos = memoryPt.getDataAlias(offset, length);

  // Generate circuits to reconstruct return data
  for (const info of dataAliasInfos) {
    const dataPt = synthesizer.placeMemoryToStack([info]);
    synthesizer.storePubOut(dataPt); // Write to PUB_OUT buffer
  }
}
```

#### Circuit Generation

- **Type**: System Operation
- **Buffer**: `PUB_OUT` (Placement 1) - Return data is public
- **Processing**:
  1. Load return data from MemoryPt (with aliasing resolution)
  2. Generate circuits to reconstruct data
  3. Write symbols to PUB_OUT buffer
- **Constraints**: ~5,000 per memory segment

#### Source Code

- Synthesizer Handler: [`packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts:845-868`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L845-L868)

#### Status

✅ **Implemented** (Alpha)

---

### 0xfd: REVERT

**Opcode**: `0xfd`  
**Mnemonic**: `REVERT`

#### Status

❌ **Not Supported** (Alpha)

#### Reason

Revert handling requires:

- State rollback tracking
- Error data propagation
- Gas refund calculations

Planned for Beta release.

---

### 0xff: SELFDESTRUCT

**Opcode**: `0xff`  
**Mnemonic**: `SELFDESTRUCT`

#### Status

❌ **Not Supported** (Alpha)

#### Reason

Self-destruct requires:

- Balance transfer verification
- Contract deletion tracking
- Beneficiary updates

Planned for Beta release.

---

## Implementation Status

### ✅ Fully Implemented (Alpha)

#### Arithmetic Operations

- `0x01` ADD
- `0x02` MUL
- `0x03` SUB
- `0x04` DIV
- `0x05` SDIV
- `0x06` MOD
- `0x07` SMOD
- `0x08` ADDMOD
- `0x09` MULMOD
- `0x0a` EXP
- `0x0b` SIGNEXTEND

#### Comparison & Bitwise

- `0x10` LT
- `0x11` GT
- `0x12` SLT
- `0x13` SGT
- `0x14` EQ
- `0x15` ISZERO
- `0x16` AND
- `0x17` OR
- `0x18` XOR
- `0x19` NOT
- `0x1a` BYTE
- `0x1b` SHL
- `0x1c` SHR
- `0x1d` SAR

#### Cryptographic (External)

- `0x20` KECCAK256 (computed externally)

#### Environmental Information

- `0x30` ADDRESS
- `0x31` BALANCE
- `0x32` ORIGIN
- `0x33` CALLER
- `0x34` CALLVALUE
- `0x35` CALLDATALOAD
- `0x36` CALLDATASIZE
- `0x37` CALLDATACOPY
- `0x38` CODESIZE
- `0x39` CODECOPY
- `0x3a` GASPRICE
- `0x3b` EXTCODESIZE
- `0x3c` EXTCODECOPY
- `0x3f` EXTCODEHASH

#### Block Information

- `0x40` BLOCKHASH
- `0x41` COINBASE
- `0x42` TIMESTAMP
- `0x43` NUMBER
- `0x44` DIFFICULTY/PREVRANDAO
- `0x45` GASLIMIT
- `0x46` CHAINID
- `0x48` BASEFEE

#### Stack, Memory & Storage

- `0x50` POP
- `0x51` MLOAD
- `0x52` MSTORE
- `0x53` MSTORE8
- `0x54` SLOAD
- `0x55` SSTORE
- `0x56` JUMP
- `0x57` JUMPI
- `0x58` PC
- `0x59` MSIZE
- `0x5a` GAS
- `0x5b` JUMPDEST

#### Push, Dup, Swap

- `0x60-0x7f` PUSH1-PUSH32
- `0x80-0x8f` DUP1-DUP16
- `0x90-0x9f` SWAP1-SWAP16

#### Logging

- `0xa0-0xa4` LOG0-LOG4

#### System

- `0xf1` CALL
- `0xf2` CALLCODE
- `0xf3` RETURN
- `0xf4` DELEGATECALL
- `0xfa` STATICCALL

### ❌ Not Yet Supported (Alpha)

#### Contract Creation

- `0xf0` CREATE
- `0xf5` CREATE2

#### Error Handling

- `0xfd` REVERT

#### Destruction

- `0xff` SELFDESTRUCT

#### Precompiled Contracts

- Precompiled contract calls (0x01-0x09 addresses)

### 🔄 In Development (Beta)

- Batch transaction processing
- Signature verification (ECRECOVER)
- State channel support
- Context switching optimization

---

## Circuit Complexity Summary

### Constraint Counts by Operation Type

| Operation Type          | Constraints (from QAP Compiler) | Example Opcodes               |
| ----------------------- | ------------------------------- | ----------------------------- |
| **ALU1 Operations**     | 803                             | ADD, SUB, MUL, EQ, ISZERO     |
| **ALU2 Operations**     | 993                             | DIV, MOD, SDIV, SMOD, ADDMOD  |
| **ALU3 Operations**     | 816                             | SHL, SHR, SAR                 |
| **ALU4 Operations**     | 629                             | LT, GT, SLT, SGT              |
| **ALU5 Operations**     | 819                             | SIGNEXTEND, BYTE              |
| **Bitwise Operations**  | 774                             | AND, OR, XOR                  |
| **Bit Decomposition**   | 258                             | DecToBit (used in EXP)        |
| **Exponentiation**      | ~206,000 (worst case)           | EXP (256-bit exponent)        |
| **Memory Operations**   | Variable                        | MLOAD, MSTORE (with aliasing) |
| **External Operations** | 0 (processed outside)           | KECCAK256                     |

### Transaction Complexity Examples

```
Simple Transfer (EOA → EOA):
~5-10 placements, ~4,000-8,000 constraints
Typical opcodes: CALLDATALOAD, CALLER, SLOAD, arithmetic (ALU1/ALU2), SSTORE

ERC-20 Transfer:
~30-50 placements, ~30,000-50,000 constraints
Typical opcodes: CALLDATALOAD, SLOAD (multiple), ALU1 operations, SSTORE (multiple), LOG

DeFi Swap (Uniswap-style):
~200-500 placements, ~200,000-500,000 constraints
Typical opcodes: Multiple CALL, SLOAD/SSTORE, various ALU operations, memory operations

Note: Actual constraint counts depend on:
- Number of operations (each ALU placement = ~800 constraints)
- Memory aliasing complexity (variable cost)
- Use of expensive operations (EXP can add ~200k constraints)
```

---

## Performance Optimization Tips

### 1. Minimize EXP Usage

```solidity
// ❌ Expensive in zk-SNARK
uint result = base ** largeExponent;  // Up to ~206k constraints for 256-bit exponent

// ✅ Better: Use precomputed values or fixed-point math
uint result = base * base * base;  // 3 × 803 = ~2.4k constraints
```

### 2. Batch Storage Operations

```solidity
// ❌ Multiple SLOAD/SSTORE
for (uint i = 0; i < 10; i++) {
  storage[i] = value;  // 10 SSTORE → 1000 constraints
}

// ✅ Use memory, then single SSTORE
uint[] memory temp = new uint[](10);
for (uint i = 0; i < 10; i++) {
  temp[i] = value;
}
// ... process temp array, minimize storage writes
```

### 3. Avoid Keccak256 in Loops

```solidity
// ❌ Expensive
for (uint i = 0; i < 10; i++) {
  hash = keccak256(abi.encode(i));  // External processing overhead
}

// ✅ Better: Minimize hashing
hash = keccak256(abi.encode(array));  // Single hash
```

---

## Related Resources

### Official Ethereum EVM Documentation

- [Ethereum.org - EVM](https://ethereum.org/en/developers/docs/evm/)
- [EVM Opcodes Reference (evm.codes)](https://www.evm.codes/)
- [Yellow Paper](https://ethereum.github.io/yellowpaper/paper.pdf)

### Tokamak zk-EVM Documentation

- [Synthesizer Documentation](https://tokamak.notion.site/Synthesizer-documentation-164d96a400a3808db0f0f636e20fca24)
- [Synthesizer Architecture](./synthesizer-architecture.md)
- [Synthesizer Execution Flow](./synthesizer-execution-flow.md)

### Source Code

- [Tokamak zk-EVM Repository](https://github.com/tokamak-network/Tokamak-zk-EVM)
- [QAP Compiler (Circom)](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/qap-compiler)
- [Synthesizer Source](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/synthesizer)

---

## Appendix: Subcircuit Mapping Table

| Opcode | Operation  | Subcircuit    | Selector  | Constraints | Non-linear | Linear |
| ------ | ---------- | ------------- | --------- | ----------- | ---------- | ------ |
| `0x01` | ADD        | ALU1          | `1 << 1`  | 803         | 630        | 173    |
| `0x02` | MUL        | ALU1          | `1 << 2`  | 803         | 630        | 173    |
| `0x03` | SUB        | ALU1          | `1 << 3`  | 803         | 630        | 173    |
| `0x04` | DIV        | ALU2          | `1 << 4`  | 993         | 566        | 427    |
| `0x05` | SDIV       | ALU2          | `1 << 5`  | 993         | 566        | 427    |
| `0x06` | MOD        | ALU2          | `1 << 6`  | 993         | 566        | 427    |
| `0x07` | SMOD       | ALU2          | `1 << 7`  | 993         | 566        | 427    |
| `0x08` | ADDMOD     | ALU2          | `1 << 8`  | 993         | 566        | 427    |
| `0x09` | MULMOD     | ALU2          | `1 << 9`  | 993         | 566        | 427    |
| `0x0a` | EXP        | ALU1 (SubEXP) | `1 << 10` | ~206,000    | -          | -      |
| `0x0b` | SIGNEXTEND | ALU5          | `1 << 11` | 819         | 640        | 179    |
| `0x10` | LT         | ALU4          | `1 << 16` | 629         | 594        | 35     |
| `0x11` | GT         | ALU4          | `1 << 17` | 629         | 594        | 35     |
| `0x12` | SLT        | ALU4          | `1 << 18` | 629         | 594        | 35     |
| `0x13` | SGT        | ALU4          | `1 << 19` | 629         | 594        | 35     |
| `0x14` | EQ         | ALU1          | `1 << 20` | 803         | 630        | 173    |
| `0x15` | ISZERO     | ALU1          | `1 << 21` | 803         | 630        | 173    |
| `0x16` | AND        | AND           | -         | 774         | 768        | 6      |
| `0x17` | OR         | OR            | -         | 774         | 768        | 6      |
| `0x18` | XOR        | XOR           | -         | 774         | 768        | 6      |
| `0x19` | NOT        | ALU1          | `1 << 25` | 803         | 630        | 173    |
| `0x1a` | BYTE       | ALU5          | `1 << 26` | 819         | 640        | 179    |
| `0x1b` | SHL        | ALU3          | `1 << 27` | 816         | 638        | 178    |
| `0x1c` | SHR        | ALU3          | `1 << 28` | 816         | 638        | 178    |
| `0x1d` | SAR        | ALU3          | `1 << 29` | 816         | 638        | 178    |

**Note**: EXP worst case = DecToBit (258) + SubEXP × 256 (803 × 256) ≈ 206,000 constraints

_Source: [`packages/frontend/qap-compiler/subcircuits/library/info/`](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/qap-compiler/subcircuits/library/info) - Compiled subcircuit constraint information from Circom circuits_

---

**Document Status**: 🔥 Alpha  
**Last Updated**: October 2024  
**Maintained by**: [Tokamak Network](https://github.com/tokamak-network)
