# Synthesizer Opcode Reference

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

## All Opcodes

| Opcode      | Name         | Stack In             | Stack Out               | Subcircuit    | Details                                   |
| ----------- | ------------ | -------------------- | ----------------------- | ------------- | ----------------------------------------- |
| `0x01`      | ADD          | a, b                 | a + b                   | ALU1          | [View Details →](#0x01-add)               |
| `0x02`      | MUL          | a, b                 | a × b                   | ALU1          | [View Details →](#0x02-mul)               |
| `0x03`      | SUB          | a, b                 | a - b                   | ALU1          | [View Details →](#0x03-sub)               |
| `0x04`      | DIV          | a, b                 | a / b                   | ALU2          | [View Details →](#0x04-div)               |
| `0x0a`      | EXP          | base, exp            | base ^ exp              | ALU1+DecToBit | [View Details →](#0x0a-exp)               |
| `0x10`      | LT           | a, b                 | a < b                   | ALU4          | [View Details →](#0x10-lt)                |
| `0x11`      | GT           | a, b                 | a > b                   | ALU4          | [View Details →](#0x11-gt)                |
| `0x12`      | SLT          | a, b                 | a < b (signed)          | ALU4          | [View Details →](#0x12-slt)               |
| `0x13`      | SGT          | a, b                 | a > b (signed)          | ALU4          | [View Details →](#0x13-sgt)               |
| `0x14`      | EQ           | a, b                 | a == b                  | ALU1          | [View Details →](#0x14-eq)                |
| `0x15`      | ISZERO       | a                    | a == 0                  | ALU1          | [View Details →](#0x15-iszero)            |
| `0x16`      | AND          | a, b                 | a & b                   | AND           | [View Details →](#0x16-and)               |
| `0x17`      | OR           | a, b                 | a &#124; b              | OR            | [View Details →](#0x17-or)                |
| `0x18`      | XOR          | a, b                 | a ^ b                   | XOR           | [View Details →](#0x18-xor)               |
| `0x19`      | NOT          | a                    | ~a                      | ALU1          | [View Details →](#0x19-not)               |
| `0x1a`      | BYTE         | i, x                 | x[i]                    | ALU5          | [View Details →](#0x1a-byte)              |
| `0x1b`      | SHL          | shift, value         | value << shift          | ALU3          | [View Details →](#0x1b-shl)               |
| `0x1c`      | SHR          | shift, value         | value >> shift          | ALU3          | [View Details →](#0x1c-shr)               |
| `0x1d`      | SAR          | shift, value         | value >> shift (signed) | ALU3          | [View Details →](#0x1d-sar)               |
| `0x20`      | KECCAK256    | offset, size         | hash                    | External      | [View Details →](#0x20-keccak256)         |
| `0x30`      | ADDRESS      | -                    | address(this)           | PUB_IN        | [View Details →](#0x30-address)           |
| `0x35`      | CALLDATALOAD | i                    | calldata[i]             | PUB_IN        | [View Details →](#0x35-calldataload)      |
| `0x37`      | CALLDATACOPY | memOff, dataOff, len | -                       | PUB_IN        | [View Details →](#0x37-calldatacopy)      |
| `0x50`      | POP          | value                | -                       | Stack         | [View Details →](#0x50-pop)               |
| `0x51`      | MLOAD        | offset               | memory[offset]          | Memory        | [View Details →](#0x51-mload)             |
| `0x52`      | MSTORE       | offset, value        | -                       | Memory        | [View Details →](#0x52-mstore)            |
| `0x54`      | SLOAD        | key                  | storage[key]            | PRV_IN        | [View Details →](#0x54-sload)             |
| `0x55`      | SSTORE       | key, value           | -                       | PRV_OUT       | [View Details →](#0x55-sstore)            |
| `0x60-0x7f` | PUSH1-32     | -                    | value                   | Constant      | [View Details →](#0x60-0x7f-push1-push32) |
| `0x80-0x8f` | DUP1-16      | ...                  | value, ...              | Stack         | [View Details →](#0x80-0x8f-dup1-dup16)   |
| `0x90-0x9f` | SWAP1-16     | a, ..., b            | b, ..., a               | Stack         | [View Details →](#0x90-0x9f-swap1-swap16) |

---

## Arithmetic Operations

<a id="0x01-add"></a>

<a id="0x01-add"></a>

### 0x01: ADD

**Constraints**: 803 | **Status**: ✅ Implemented

**Stack**: `a, b` → `a + b mod 2^256`

#### Synthesizer Behavior

```typescript
const [a, b] = stackPt.popN(2);
const result = mod(a.value + b.value, TWO_POW256);
synthesizerArith('ADD', [a.value, b.value], result, runState);
```

#### Circuit Generation

- **Subcircuit**: `ALU1` | **Selector**: `1n << 1n`
- **Constraints**: 803 (630 non-linear + 173 linear)

**Source**: [`functions.ts:97-103`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L97-L103) | [`handlers.ts:18-26`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L18-L26)

---

<a id="0x02-mul"></a>

<a id="0x02-mul"></a>

### 0x02: MUL

**Constraints**: 803 | **Status**: ✅ Implemented

**Stack**: `a, b` → `a * b mod 2^256`

#### Synthesizer Behavior

```typescript
const [a, b] = stackPt.popN(2);
const result = mod(a.value * b.value, TWO_POW256);
synthesizerArith('MUL', [a.value, b.value], result, runState);
```

#### Circuit Generation

- **Subcircuit**: `ALU1` | **Selector**: `1n << 2n`
- **Constraints**: 803 (same ALU1 subcircuit, different selector)

**Source**: [`functions.ts:105-111`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L105-L111) | [`handlers.ts:28-36`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L28-L36)

---

<a id="0x03-sub"></a>

<a id="0x03-sub"></a>

### 0x03: SUB

**Constraints**: 803 | **Status**: ✅ Implemented

**Stack**: `a, b` → `a - b mod 2^256`

#### Synthesizer Behavior

```typescript
const [a, b] = stackPt.popN(2);
const result = mod(a.value - b.value, TWO_POW256);
synthesizerArith('SUB', [a.value, b.value], result, runState);
```

#### Circuit Generation

- **Subcircuit**: `ALU1` | **Selector**: `1n << 3n`
- **Constraints**: 803

**Source**: [`functions.ts:113-119`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L113-L119) | [`handlers.ts:38-46`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L38-L46)

---

<a id="0x04-div"></a>

<a id="0x04-div"></a>

### 0x04: DIV

**Constraints**: 993 | **Status**: ✅ Implemented

**Stack**: `a, b` → `a / b` (integer division, 0 if b == 0)

#### Synthesizer Behavior

```typescript
const [a, b] = stackPt.popN(2);
let result = b.value === BIGINT_0 ? BIGINT_0 : mod(a.value / b.value, TWO_POW256);
synthesizerArith('DIV', [a.value, b.value], result, runState);
```

#### Circuit Generation

- **Subcircuit**: `ALU2` (handles division/modulo)
- **Selector**: `1n << 4n`
- **Constraints**: 993 (566 non-linear + 427 linear)

**Special Cases**: Division by zero returns 0 (EVM convention)

**Source**: [`functions.ts:121-131`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L121-L131) | [`handlers.ts:48-61`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L48-L61)

---

<a id="0x0a-exp"></a>

<a id="0x0a-exp"></a>

### 0x0a: EXP

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
  - DecToBit: 258 (256 non-linear + 2 linear)
  - SubEXP: 803 each
  - **Worst case total: ~206,000** (most expensive operation)

#### Example: Computing 3^13

```
13 = 0b1101 (binary)

Circuit generation:
1. SubEXP(3, 1) → 3         [bit 0 set]
2. SubEXP(3, 3) → 9         [square]
3. SubEXP(9, 9) → 81        [square]
4. SubEXP(81, 3) → 243      [bit 2 set, multiply]
5. SubEXP(243, 243) → 59049 [square]
6. SubEXP(59049, 3) → 177147 [bit 3 set, multiply]

Result: 3^13 = 1594323
```

#### Performance Notes

- ⚠️ Most constraint-heavy arithmetic operation
- Number of placements proportional to bits set in exponent
- Consider avoiding large exponents in zk-provable contracts

#### Source Code

- EVM Handler: [`functions.ts:177-188`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L177-L188)
- Synthesizer Handler: [`handlers.ts:141-156`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L141-L156)

**Status**: ✅ Implemented (Alpha)

---

## Comparison & Bitwise Operations

<a id="0x10-lt"></a>

<a id="0x10-lt"></a>

### 0x10: LT

**Constraints**: 629 | **Status**: ✅ Implemented

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
- **Constraints**: 629 (594 non-linear + 35 linear)

#### Source Code

- EVM Handler: [`functions.ts:240-246`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L240-L246)
- Synthesizer Handler: [`handlers.ts:167-175`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L167-L175)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x11-gt"></a>

### 0x11: GT

**Constraints**: 629 | **Status**: ✅ Implemented

**Stack Input**: `a`, `b`  
**Stack Output**: `1` if `a > b`, `0` otherwise

---

<a id="0x12-slt"></a>

### 0x12: SLT

**Constraints**: 629 | **Status**: ✅ Implemented

**Stack Input**: `a`, `b` (signed)  
**Stack Output**: `1` if `a < b` (signed comparison), `0` otherwise

---

<a id="0x13-sgt"></a>

### 0x13: SGT

**Constraints**: 629 | **Status**: ✅ Implemented

**Stack Input**: `a`, `b` (signed)  
**Stack Output**: `1` if `a > b` (signed comparison), `0` otherwise

---

<a id="0x14-eq"></a>

### 0x14: EQ

**Constraints**: 803 | **Status**: ✅ Implemented

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
- **Constraints**: 803 (same ALU1 subcircuit)

#### Source Code

- EVM Handler: [`functions.ts:272-278`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L272-L278)
- Synthesizer Handler: [`handlers.ts:207-215`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L207-L215)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x15-iszero"></a>

### 0x15: ISZERO

**Constraints**: 803 | **Status**: ✅ Implemented

**Stack Input**: `a`  
**Stack Output**: `1` if `a == 0`, `0` otherwise

---

<a id="0x16-and"></a>

### 0x16: AND

**Constraints**: 774 | **Status**: ✅ Implemented

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
- **Inputs**: `[a, b]` (no selector)
- **Outputs**: `[result]`
- **Constraints**: 774 (768 non-linear + 6 linear)

#### How It Works

Performs bitwise AND on 256-bit inputs:

```
Input A:  1010...
Input B:  1100...
Output:   1000...  (A & B)
```

#### Source Code

- EVM Handler: [`functions.ts:288-294`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L288-L294)
- Synthesizer Handler: [`handlers.ts:227-234`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L227-L234)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x17-or"></a>

### 0x17: OR

**Constraints**: 774 | **Status**: ✅ Implemented

**Stack Input**: `a`, `b`  
**Stack Output**: `a | b` (bitwise)

#### Circuit Generation

- **Subcircuit**: `OR` (dedicated bitwise circuit)
- **Constraints**: 774 (768 non-linear + 6 linear)

#### Source Code

- Synthesizer Handler: [`handlers.ts:237-244`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L237-L244)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x18-xor"></a>

### 0x18: XOR

**Constraints**: 774 | **Status**: ✅ Implemented

**Stack Input**: `a`, `b`  
**Stack Output**: `a ^ b` (bitwise)

#### Circuit Generation

- **Subcircuit**: `XOR` (dedicated bitwise circuit)
- **Constraints**: 774 (768 non-linear + 6 linear)

#### Source Code

- Synthesizer Handler: [`handlers.ts:247-254`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L247-L254)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x19-not"></a>

### 0x19: NOT

**Constraints**: 803 | **Status**: ✅ Implemented

**Stack Input**: `a`  
**Stack Output**: `~a` (bitwise NOT)

---

<a id="0x1a-byte"></a>

### 0x1a: BYTE

**Constraints**: 629 | **Status**: ✅ Implemented

**Stack Input**: `i`, `x`  
**Stack Output**: `x[i]` (i-th byte of x)

---

<a id="0x1b-shl"></a>

### 0x1b: SHL

**Constraints**: 629 | **Status**: ✅ Implemented

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
- **Constraints**: 816 (638 non-linear + 178 linear)

#### Source Code

- Synthesizer Handler: [`handlers.ts:278-286`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L278-L286)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x1c-shr"></a>

### 0x1c: SHR

**Constraints**: 629 | **Status**: ✅ Implemented

**Stack Input**: `shift`, `value`  
**Stack Output**: `value >> shift`

---

<a id="0x1d-sar"></a>

### 0x1d: SAR

**Constraints**: 629 | **Status**: ✅ Implemented

**Stack Input**: `shift`, `value`  
**Stack Output**: `value >> shift` (signed)

---

## Cryptographic Operations

<a id="0x20-keccak256"></a>

### 0x20: KECCAK256

**Constraints**: ~5000 | **Status**: ✅ Implemented

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
  3. Load result as auxiliary input
  4. Circuit verifies correct inputs were hashed (not the hash itself)

#### Why External?

```
In-circuit Keccak256: ~100,000 constraints per hash
Large contract with 10 hashes: 1,000,000 constraints just for hashing
Solution: Compute hash externally, verify inputs/outputs
```

#### Source Code

- EVM Handler: [`functions.ts:190-197`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L190-L197)
- Synthesizer Handler: [`handlers.ts:322-375`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L322-L375)

**Status**: ✅ Implemented (Alpha) - External processing

---

## Environmental Information

<a id="0x30-address"></a>

### 0x30: ADDRESS

**Constraints**: ~100 | **Status**: ✅ Implemented

**Stack Input**: `-`  
**Stack Output**: `address(this)` (current contract address)

#### Synthesizer Behavior

```typescript
await synthesizerEnvInf('ADDRESS', runState);
```

#### Circuit Generation

- **Buffer**: `PUB_IN` (Placement 0)
- **Flow**:
  1. External value (contract address) → PUB_IN buffer
  2. Buffer creates DataPt symbol
  3. Symbol pushed to StackPt

#### Source Code

- EVM Handler: [`functions.ts:355-358`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L355-L358)
- Synthesizer Handler: [`handlers.ts:377-382`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L377-L382)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x35-calldataload"></a>

### 0x35: CALLDATALOAD

**Constraints**: ~100 | **Status**: ✅ Implemented

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

- **Buffer**: `PUB_IN` (Placement 0) - Calldata is public
- **Processing**:
  1. Load calldata value at position
  2. Create DataPt via PUB_IN buffer
  3. Push symbol to StackPt
- **Constraints**: ~100 (buffer operation)

#### Source Code

- EVM Handler: [`functions.ts:383-387`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L383-L387)
- Synthesizer Handler: [`handlers.ts:418-425`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L418-L425)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x37-calldatacopy"></a>

### 0x37: CALLDATACOPY

**Constraints**: ~100 | **Status**: ✅ Implemented

**Stack Input**: `destOffset`, `offset`, `size`  
**Stack Output**: `-` (writes to memory)

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

<a id="0x40-blockhash"></a>

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

<a id="0x41-coinbase"></a>

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

<a id="0x50-pop"></a>

### 0x50: POP

**Constraints**: 0 | **Status**: ✅ Implemented

**Stack Input**: `value`  
**Stack Output**: `-` (removes value)

#### Synthesizer Behavior

```typescript
stackPt.pop(); // Remove top DataPt from symbol stack
```

#### Circuit Generation

- **Type**: Stack Operation
- **Processing**: No circuit placement (pure stack manipulation)
- **Constraints**: 0

**Status**: ✅ Implemented (Alpha)

---

<a id="0x51-mload"></a>

### 0x51: MLOAD

**Constraints**: ~5000 | **Status**: ✅ Implemented

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

- **Type**: Memory Operation with data aliasing resolution
- **Subcircuits**: DecToBit, Accumulator, Bitwise (AND, OR)
- **Constraints**: ~5,000 per overlapping DataPt

#### Data Aliasing Example

```typescript
// Overlapping memory writes:
1. MSTORE(0x00, 0xAAAA...AAAA)  // Write to 0x00-0x20
2. MSTORE(0x10, 0xBBBB...BBBB)  // Overlapping write to 0x10-0x30
3. MLOAD(0x00)                  // Load 0x00-0x20

// MLOAD must reconstruct:
// Result = dataPt1[0x00-0x10] | dataPt2[0x10-0x20]

// Circuit:
result = (dataPt1 & mask1) | ((dataPt2 & mask2) << 128)
```

#### Source Code

- EVM Handler: [`functions.ts:476-481`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L476-L481)
- Synthesizer Handler: [`handlers.ts:632-648`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L632-L648)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x52-mstore"></a>

### 0x52: MSTORE

**Constraints**: ~5000 | **Status**: ✅ Implemented

**Stack Input**: `offset`, `value`  
**Stack Output**: `-` (writes to memory)

#### Synthesizer Behavior

```typescript
const [offset, value] = stackPt.popN(2);

// Write DataPt symbol to MemoryPt with timestamp
memoryPt.write(Number(offset.value), 32, value);
```

#### Circuit Generation

- **Type**: Memory Operation
- **Processing**: Record symbol in MemoryPt with timestamp
- **Constraints**: 0 (lazy - circuits generated on MLOAD)

#### How MemoryPt Tracks State

```typescript
MemoryPt: Map<timestamp, { memOffset, containerSize, dataPt }>

// Each MSTORE increments timestamp:
MSTORE(0x00, dataPt1) → timestamp 0
MSTORE(0x10, dataPt2) → timestamp 1
// Later MLOAD queries for overlaps
```

#### Source Code

- EVM Handler: [`functions.ts:483-489`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L483-L489)
- Synthesizer Handler: [`handlers.ts:650-656`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L650-L656)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x54-sload"></a>

### 0x54: SLOAD

**Constraints**: ~100 | **Status**: ✅ Implemented

**Stack Input**: `key` (storage slot)  
**Stack Output**: `storage[key]`

#### Standard EVM Behavior

```typescript
const key = stack.pop();
const value = await stateManager.getContractStorage(address, key);
stack.push(bytesToBigInt(value));
```

#### Synthesizer Behavior

```typescript
const keyPt = stackPt.pop();
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

- **Buffer**: `PRV_IN` (Placement 2) - Storage is private by default
- **Processing**:
  1. Read storage value from stateManager (external)
  2. Load value as DataPt via PRV_IN buffer
  3. Push symbol to StackPt
- **Constraints**: ~100 (buffer operation)

#### Why Private?

Storage values are often sensitive (user balances, private state). The Synthesizer treats storage as private input, allowing users to prove execution without revealing storage contents.

#### Source Code

- EVM Handler: [`functions.ts:511-520`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L511-L520)
- Synthesizer Handler: [`handlers.ts:672-689`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L672-L689)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x55-sstore"></a>

### 0x55: SSTORE

**Constraints**: ~100 | **Status**: ✅ Implemented

**Stack Input**: `key`, `value`  
**Stack Output**: `-` (writes to storage)

#### Synthesizer Behavior

```typescript
const [keyPt, valuePt] = stackPt.popN(2);

// Store to state manager (external)
await stateManager.putContractStorage(address, key, valuePt.value);

// Record in PRV_OUT buffer
synthesizer.storePrvOut(address.toString(), 'Storage', valuePt, key);
```

#### Circuit Generation

- **Buffer**: `PRV_OUT` (Placement 3) - Private outputs
- **Processing**:
  1. Write DataPt symbol to PRV_OUT buffer
  2. Actual storage update happens externally
  3. Circuit tracks which symbols were stored
- **Constraints**: ~100 (buffer operation)

#### Source Code

- EVM Handler: [`functions.ts:522-548`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L522-L548)
- Synthesizer Handler: [`handlers.ts:691-710`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L691-L710)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x60-0x7f-push1-push32"></a>

### 0x60-0x7f: PUSH1-PUSH32

**Constraints**: 0 | **Status**: ✅ Implemented

**Stack Input**: `-`  
**Stack Output**: `value` (from bytecode)

#### Synthesizer Behavior

```typescript
const numToPush = opcode - 0x5f;
const value = bytesToBigInt(code.subarray(pc + 1, pc + 1 + numToPush));

// Load hardcoded value as auxiliary input
const valuePt = synthesizer.loadAuxin(value, numToPush);
stackPt.push(valuePt);
```

#### Why loadAuxin?

PUSH values are hardcoded in bytecode (not from environment/storage), so they're treated as auxiliary inputs:

```typescript
PUSH1 0x05        → synthesizer.loadAuxin(5, 1)
PUSH32 0xFFFF...  → synthesizer.loadAuxin(0xFFFF..., 32)
```

#### Circuit Generation

- **Type**: Hardcoded constant
- **Constraints**: 0 (constants don't need circuits)

#### Source Code

- EVM Handler: [`functions.ts:572-579`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/functions.ts#L572-L579)
- Synthesizer Handler: [`handlers.ts:726-733`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/opcodes/synthesizer/handlers.ts#L726-L733)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x80-0x8f-dup1-dup16"></a>

### 0x80-0x8f: DUP1-DUP16

**Constraints**: 0 | **Status**: ✅ Implemented

**Stack Input**: `...`  
**Stack Output**: `value, ...` (duplicates value at position n from top)

#### Synthesizer Behavior

```typescript
const n = opcode - 0x7f; // 0x80 → 1, 0x8f → 16
stackPt.dup(n); // Duplicate DataPt reference
```

#### Circuit Generation

- **Type**: Stack manipulation
- **Constraints**: 0 (no circuit needed)

**Status**: ✅ Implemented (Alpha)

---

<a id="0x90-0x9f-swap1-swap16"></a>

### 0x90-0x9f: SWAP1-SWAP16

**Constraints**: 0 | **Status**: ✅ Implemented

**Stack Input**: `a, ..., b`  
**Stack Output**: `b, ..., a` (swaps top with item at position n+1)

#### Synthesizer Behavior

```typescript
const n = opcode - 0x8f; // 0x90 → 1, 0x9f → 16
stackPt.swap(n); // Swap DataPt references
```

#### Circuit Generation

- **Type**: Stack manipulation
- **Constraints**: 0 (no circuit needed)

**Status**: ✅ Implemented (Alpha)

---

## Control Flow & System

<a id="0x56-jump"></a>

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

<a id="0xf0-create"></a>

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

<a id="0xf3-return"></a>

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

<a id="0xfd-revert"></a>

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

<a id="0xff-selfdestruct"></a>

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

```javascript
// ❌ Expensive in zk-SNARK
uint result = base ** largeExponent;  // Up to ~206k constraints for 256-bit exponent

// ✅ Better: Use precomputed values or fixed-point math
uint result = base * base * base;  // 3 × 803 = ~2.4k constraints
```

### 2. Batch Storage Operations

```javascript
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

```javascript
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
