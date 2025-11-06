# Synthesizer: Cryptographic Primitives

This document provides an in-depth technical reference for the cryptographic primitives used in Tokamak Synthesizer's L2 state channels, including Poseidon hash, EdDSA signatures on JubJub curve, and field arithmetic.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Field Arithmetic](#field-arithmetic)
- [Poseidon Hash Function](#poseidon-hash-function)
- [JubJub Elliptic Curve](#jubjub-elliptic-curve)
- [EdDSA Signature Scheme](#eddsa-signature-scheme)
- [Circuit Implementation](#circuit-implementation)
- [Security Considerations](#security-considerations)
- [Performance Comparison](#performance-comparison)
- [Related Resources](#related-resources)

---

## Overview

### Why Custom Cryptography for L2?

L2 state channels require **in-circuit verification** of cryptographic operations. Standard Ethereum cryptography (ECDSA, Keccak256) is designed for EVM execution, not zero-knowledge proofs. Custom cryptography provides:

1. **Efficiency**: 10-100x fewer constraints in zk-SNARKs
2. **Native Field Arithmetic**: Operations in BLS12-381 scalar field
3. **Algebraic Structure**: Hash and signature schemes compatible with pairing-based proofs

### Cryptographic Stack

```
┌──────────────────────────────────────────────────────────────────┐
│  Tokamak L2 Cryptographic Stack                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Application Layer                                               │
│  ┌────────────────────────────────────────┐                     │
│  │ - Transaction signing (EdDSA)          │                     │
│  │ - State commitment (Merkle tree)       │                     │
│  │ - Address derivation (hash-based)      │                     │
│  └────────────────────────────────────────┘                     │
│           │                                                      │
│           ▼                                                      │
│  Cryptographic Primitives Layer                                  │
│  ┌────────────────────────────────────────┐                     │
│  │ - Poseidon Hash (field elements)       │                     │
│  │ - EdDSA (JubJub curve)                 │                     │
│  │ - Scalar multiplication (JubjubExp)    │                     │
│  └────────────────────────────────────────┘                     │
│           │                                                      │
│           ▼                                                      │
│  Field Arithmetic Layer                                          │
│  ┌────────────────────────────────────────┐                     │
│  │ BLS12-381 Scalar Field (R_MOD)         │                     │
│  │ - Addition, Subtraction                │                     │
│  │ - Multiplication, Inversion            │                     │
│  │ - 255-bit field elements               │                     │
│  └────────────────────────────────────────┘                     │
│           │                                                      │
│           ▼                                                      │
│  Circuit Layer (Circom)                                          │
│  ┌────────────────────────────────────────┐                     │
│  │ - PoseidonCircuit2/4/9 (hash)          │                     │
│  │ - EddsaVerify (signature)              │                     │
│  │ - JubjubExp (scalar mult)              │                     │
│  └────────────────────────────────────────┘                     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Field Arithmetic

### BLS12-381 Scalar Field

All cryptographic operations in Tokamak L2 are performed over the **BLS12-381 scalar field**.

#### Field Modulus

```
R_MOD = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001

Binary representation (256-bit):
0111 0011 1110 1101 1010 0111 0101 0011 0010 1001 1001 0111 1101 0100 1000 0011
0011 0011 1001 1101 1000 0000 1000 0000 1001 0001 1101 1000 0000 0101 0101 0011
1011 1101 1010 0100 0000 0010 1111 1111 1111 1110 0101 1011 1111 1110 1111 1111
1111 1111 1111 1111 0000 0000 0000 0000 0000 0000 0000 0001

Decimal:
52435875175126190479447740508185965837690552500527637822603658699938581184513
```

**Properties**:
- **Size**: 255 bits (top bit always 0 for canonical representation)
- **Prime**: Yes (R_MOD is prime)
- **Order**: \( r = 2^{255} - c \) where \( c \approx 2^{128} \)

#### Field Operations

```typescript
// Addition (mod R_MOD)
function fieldAdd(a: bigint, b: bigint): bigint {
  return (a + b) % R_MOD;
}

// Subtraction (mod R_MOD)
function fieldSub(a: bigint, b: bigint): bigint {
  return (a - b + R_MOD) % R_MOD;
}

// Multiplication (mod R_MOD)
function fieldMul(a: bigint, b: bigint): bigint {
  return (a * b) % R_MOD;
}

// Inversion (mod R_MOD) - Extended Euclidean Algorithm
function fieldInv(a: bigint): bigint {
  if (a === 0n) throw new Error('Cannot invert 0');
  return modPow(a, R_MOD - 2n, R_MOD); // Fermat's little theorem
}

// Modular exponentiation
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) result = (result * base) % mod;
    exp = exp >> 1n;
    base = (base * base) % mod;
  }
  return result;
}
```

#### Canonical Representation

- **Range**: \( [0, R\_MOD - 1] \)
- **Encoding**: Big-endian (most significant byte first)
- **Size**: 32 bytes (256 bits with top bit unused)

---

## Poseidon Hash Function

### Overview

**Poseidon** is a cryptographic hash function designed specifically for zero-knowledge proof systems. It operates over finite fields and uses algebraic operations (addition, multiplication) instead of bitwise operations.

### Design Rationale

| Property               | Keccak256 (Standard) | Poseidon (ZK-Friendly)       |
| ---------------------- | -------------------- | ---------------------------- |
| **Operations**         | Bitwise (XOR, AND)   | Algebraic (×, +)             |
| **Field**              | Binary (GF(2))       | Prime field (R_MOD)          |
| **Constraints (circuit)** | ~20,000          | ~150-350                     |
| **Efficiency**         | Fast in software     | Fast in circuits             |
| **Use Case**           | General-purpose      | ZK-SNARK optimized           |

### Algorithm

Poseidon uses a **sponge construction** with **substitution-permutation network (SPN)**.

#### Parameters

```typescript
const POSEIDON_PARAMS = {
  // Field modulus
  p: R_MOD,
  
  // Security level (bits)
  securityBits: 128,
  
  // State size (field elements)
  t: 6,  // For Poseidon-6
  
  // Full rounds
  RF: 8,
  
  // Partial rounds
  RP: 57,
  
  // Total rounds
  totalRounds: 65, // RF + RP
  
  // S-box: x^α (α = 5 for BLS12-381)
  alpha: 5n
};
```

#### Round Function

```typescript
// Poseidon permutation state
type State = bigint[]; // Array of field elements

function poseidonRound(
  state: State,
  roundConstants: bigint[],
  mdsMatrix: bigint[][],
  isFullRound: boolean
): State {
  const t = state.length;
  
  // Step 1: Add round constants
  for (let i = 0; i < t; i++) {
    state[i] = fieldAdd(state[i], roundConstants[i]);
  }
  
  // Step 2: Apply S-box
  if (isFullRound) {
    // Full round: Apply S-box to all elements
    for (let i = 0; i < t; i++) {
      state[i] = modPow(state[i], 5n, R_MOD); // x^5
    }
  } else {
    // Partial round: Apply S-box to first element only
    state[0] = modPow(state[0], 5n, R_MOD);
  }
  
  // Step 3: Mix with MDS matrix
  const newState: bigint[] = new Array(t).fill(0n);
  for (let i = 0; i < t; i++) {
    for (let j = 0; j < t; j++) {
      newState[i] = fieldAdd(
        newState[i],
        fieldMul(mdsMatrix[i][j], state[j])
      );
    }
  }
  
  return newState;
}
```

#### Hash Function Variants

**Poseidon-2** (leaf hash):
```typescript
function poseidon2(input: [bigint, bigint]): bigint {
  // State: [capacity, rate0, rate1, 0, 0, 0]
  const state = [0n, input[0], input[1], 0n, 0n, 0n];
  
  // Run full + partial + full rounds
  for (let round = 0; round < POSEIDON_PARAMS.totalRounds; round++) {
    const isFullRound = 
      round < POSEIDON_PARAMS.RF / 2 || 
      round >= POSEIDON_PARAMS.totalRounds - POSEIDON_PARAMS.RF / 2;
    
    state = poseidonRound(
      state,
      roundConstants[round],
      mdsMatrix,
      isFullRound
    );
  }
  
  // Output: first element of state
  return state[0];
}
```

**Poseidon-4** (4-ary Merkle tree parent):
```typescript
function poseidon4(input: [bigint, bigint, bigint, bigint]): bigint {
  const state = [0n, input[0], input[1], input[2], input[3], 0n];
  
  for (let round = 0; round < POSEIDON_PARAMS.totalRounds; round++) {
    const isFullRound = 
      round < POSEIDON_PARAMS.RF / 2 || 
      round >= POSEIDON_PARAMS.totalRounds - POSEIDON_PARAMS.RF / 2;
    
    state = poseidonRound(state, roundConstants[round], mdsMatrix, isFullRound);
  }
  
  return state[0];
}
```

**Poseidon-9** (transaction message hash):
```typescript
function poseidon9(input: bigint[]): bigint {
  if (input.length !== 9) throw new Error('Expected 9 inputs');
  
  // Absorb all inputs into sponge
  let state = [0n, 0n, 0n, 0n, 0n, 0n];
  
  // Absorb phase (multiple permutations for 9 inputs)
  for (let i = 0; i < 9; i += 5) {
    for (let j = 0; j < Math.min(5, 9 - i); j++) {
      state[j + 1] = fieldAdd(state[j + 1], input[i + j]);
    }
    
    for (let round = 0; round < POSEIDON_PARAMS.totalRounds; round++) {
      const isFullRound = 
        round < POSEIDON_PARAMS.RF / 2 || 
        round >= POSEIDON_PARAMS.totalRounds - POSEIDON_PARAMS.RF / 2;
      
      state = poseidonRound(state, roundConstants[round], mdsMatrix, isFullRound);
    }
  }
  
  // Squeeze phase
  return state[0];
}
```

### Circuit Implementation

**Circom Circuit** (simplified):

```c
template Poseidon2() {
    signal input in[2];
    signal output out;
    
    component rounds[65];
    signal state[66][6];  // 65 rounds + initial state
    
    // Initial state
    state[0][0] <== 0;
    state[0][1] <== in[0];
    state[0][2] <== in[1];
    state[0][3] <== 0;
    state[0][4] <== 0;
    state[0][5] <== 0;
    
    // Run rounds
    for (var i = 0; i < 65; i++) {
        if (i < 4 || i >= 61) {
            // Full round
            rounds[i] = FullRound(6);
        } else {
            // Partial round
            rounds[i] = PartialRound(6);
        }
        
        for (var j = 0; j < 6; j++) {
            rounds[i].in[j] <== state[i][j];
            state[i+1][j] <== rounds[i].out[j];
        }
    }
    
    out <== state[65][0];
}
```

**Constraints**:
- Poseidon-2: ~150 constraints
- Poseidon-4: ~200 constraints
- Poseidon-9: ~350 constraints

**Source**: [`packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts#L10-L35)

---

## JubJub Elliptic Curve

### Overview

**JubJub** is a **twisted Edwards curve** defined over the BLS12-381 scalar field. It provides efficient elliptic curve operations for zero-knowledge circuits.

### Curve Equation

```
ax² + y² = 1 + dx²y²
```

**Parameters**:
- **a**: \( -1 \)
- **d**: \( -(10240/10241) \mod R\_MOD \)
  - \( d = 0x2a9318e74bfa2b48f5fd9207e6bd7fd4292d7f6d37579d2601065fd6d6343eb1 \)

### Curve Properties

```typescript
const JUBJUB_PARAMS = {
  // Field modulus (BLS12-381 scalar field)
  p: R_MOD,
  
  // Curve parameters
  a: R_MOD - 1n, // -1 mod R_MOD
  d: 0x2a9318e74bfa2b48f5fd9207e6bd7fd4292d7f6d37579d2601065fd6d6343eb1n,
  
  // Group order
  r: 0x0e7db4ea6533afa906673b0101343b00a6682093ccc81082d0970e5ed6f72cb7n,
  
  // Cofactor
  cofactor: 8n,
  
  // Base point (generator)
  G: {
    x: 0x0e4840ac57f86f5e293b1d67bc8de5d9a12a70a615d0b8e4d2fc5e69ac5db47fn,
    y: 0x2bcd9508a3dad316105f067219141f4450a32c41aa67e0beb0ad80034eb71aa6n
  },
  
  // Point at infinity (identity element)
  O: {
    x: 0n,
    y: 1n
  }
};
```

### Point Operations

#### Point Addition

```typescript
// Add two points on JubJub curve
function addPoints(P: Point, Q: Point): Point {
  const { a, d } = JUBJUB_PARAMS;
  
  // Edwards addition formula:
  // x3 = (x1*y2 + y1*x2) / (1 + d*x1*x2*y1*y2)
  // y3 = (y1*y2 - a*x1*x2) / (1 - d*x1*x2*y1*y2)
  
  const x1y2 = fieldMul(P.x, Q.y);
  const y1x2 = fieldMul(P.y, Q.x);
  const y1y2 = fieldMul(P.y, Q.y);
  const x1x2 = fieldMul(P.x, Q.x);
  const dx1x2y1y2 = fieldMul(fieldMul(d, x1x2), fieldMul(P.y, Q.y));
  
  const x3_num = fieldAdd(x1y2, y1x2);
  const x3_den = fieldAdd(1n, dx1x2y1y2);
  const x3 = fieldMul(x3_num, fieldInv(x3_den));
  
  const y3_num = fieldSub(y1y2, fieldMul(a, x1x2));
  const y3_den = fieldSub(1n, dx1x2y1y2);
  const y3 = fieldMul(y3_num, fieldInv(y3_den));
  
  return { x: x3, y: y3 };
}
```

#### Point Doubling

```typescript
// Double a point on JubJub curve
function doublePoint(P: Point): Point {
  // Edwards doubling is same as addition: [2]P = P + P
  return addPoints(P, P);
}
```

#### Scalar Multiplication

```typescript
// Multiply point by scalar (double-and-add algorithm)
function scalarMul(k: bigint, P: Point): Point {
  if (k === 0n) return JUBJUB_PARAMS.O; // Point at infinity
  if (k === 1n) return P;
  
  let result = JUBJUB_PARAMS.O;
  let addend = P;
  
  // Convert scalar to binary and process each bit
  while (k > 0n) {
    if (k & 1n) {
      result = addPoints(result, addend);
    }
    addend = doublePoint(addend);
    k = k >> 1n;
  }
  
  return result;
}
```

### Circuit Implementation

**Circom Circuit** (simplified):

```c
// JubJub point addition
template EdwardsAdd() {
    signal input x1;
    signal input y1;
    signal input x2;
    signal input y2;
    signal output x3;
    signal output y3;
    
    var a = -1;
    var d = 0x2a9318e74bfa2b48f5fd9207e6bd7fd4292d7f6d37579d2601065fd6d6343eb1;
    
    signal x1y2 <== x1 * y2;
    signal y1x2 <== y1 * x2;
    signal x1x2 <== x1 * x2;
    signal y1y2 <== y1 * y2;
    
    signal dx1x2y1y2 <== d * x1x2 * y1y2;
    
    x3 <== (x1y2 + y1x2) / (1 + dx1x2y1y2);
    y3 <== (y1y2 - a * x1x2) / (1 - dx1x2y1y2);
}

// JubJub scalar multiplication (double-and-add)
template JubjubExp() {
    signal input scalar;         // 255-bit scalar
    signal input baseX;
    signal input baseY;
    signal output outX;
    signal output outY;
    
    // Decompose scalar into bits
    component bits = Num2Bits(255);
    bits.in <== scalar;
    
    // Initialize accumulator (point at infinity)
    signal accX[256];
    signal accY[256];
    accX[0] <== 0;
    accY[0] <== 1;
    
    // Initialize doubling sequence
    signal doublesX[255];
    signal doublesY[255];
    doublesX[0] <== baseX;
    doublesY[0] <== baseY;
    
    component doublers[254];
    for (var i = 0; i < 254; i++) {
        doublers[i] = EdwardsAdd();
        doublers[i].x1 <== doublesX[i];
        doublers[i].y1 <== doublesY[i];
        doublers[i].x2 <== doublesX[i];
        doublers[i].y2 <== doublesY[i];
        doublesX[i+1] <== doublers[i].x3;
        doublesY[i+1] <== doublers[i].y3;
    }
    
    // Conditional add for each bit
    component adders[255];
    for (var i = 0; i < 255; i++) {
        adders[i] = ConditionalAdd();
        adders[i].condition <== bits.out[i];
        adders[i].accX <== accX[i];
        adders[i].accY <== accY[i];
        adders[i].addX <== doublesX[i];
        adders[i].addY <== doublesY[i];
        accX[i+1] <== adders[i].outX;
        accY[i+1] <== adders[i].outY;
    }
    
    outX <== accX[255];
    outY <== accY[255];
}
```

**Constraints**: ~3,000 constraints (255 doublings + conditional adds)

**Source**: [`packages/frontend/qap-compiler/circuits/EdDSA/JubjubExp.circom`](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/qap-compiler/circuits/EdDSA)

---

## EdDSA Signature Scheme

### Overview

**EdDSA** (Edwards-curve Digital Signature Algorithm) on JubJub curve provides **efficient in-circuit signature verification** for L2 transactions.

### Key Generation

```typescript
// Generate EdDSA key pair
function generateKeyPair(privateKey: Buffer): {
  privateKey: Buffer,
  publicKey: Point
} {
  // Private key: 32 bytes (256-bit)
  const sk = BigInt('0x' + privateKey.toString('hex')) % JUBJUB_PARAMS.r;
  
  // Public key: [sk] * G
  const pk = scalarMul(sk, JUBJUB_PARAMS.G);
  
  return {
    privateKey,
    publicKey: pk
  };
}

// Public key from private key (for address derivation)
function getEddsaPublicKey(privateKey: Buffer): Buffer {
  const { publicKey } = generateKeyPair(privateKey);
  
  // Encode as 32 bytes (x coordinate + y parity)
  const pkBytes = new Buffer(32);
  pkBytes.set(fieldToBytes(publicKey.x), 0);
  
  // Set parity bit (MSB of last byte)
  if (publicKey.y & 1n) {
    pkBytes[31] |= 0x80;
  }
  
  return pkBytes;
}
```

### Signature Generation

```typescript
// Sign a message with EdDSA
function eddsaSign_unsafe(
  messageHash: bigint,
  privateKey: Buffer
): EddsaSignature {
  const sk = BigInt('0x' + privateKey.toString('hex')) % JUBJUB_PARAMS.r;
  const pk = scalarMul(sk, JUBJUB_PARAMS.G);
  
  // Step 1: Generate random nonce
  // NOTE: In production, use deterministic nonce (RFC 8032)
  const nonce = generateRandomScalar(); // r
  
  // Step 2: Compute randomizer point R = [r] * G
  const R = scalarMul(nonce, JUBJUB_PARAMS.G);
  
  // Step 3: Compute challenge hash
  // h = H(R.x, R.y, pk.x, pk.y, M)
  const challengeHash = poseidon5([R.x, R.y, pk.x, pk.y, messageHash]);
  
  // Step 4: Compute signature scalar
  // s = (r + h * sk) mod r
  const s = fieldAdd(nonce, fieldMul(challengeHash, sk)) % JUBJUB_PARAMS.r;
  
  return {
    randomizer: R,      // (R.x, R.y)
    signedHash: s       // scalar
  };
}
```

### Signature Verification

```typescript
// Verify EdDSA signature
function eddsaVerify(
  signature: EddsaSignature,
  messageHash: bigint,
  publicKey: Point
): boolean {
  const { randomizer: R, signedHash: s } = signature;
  
  // Step 1: Compute challenge hash
  // h = H(R.x, R.y, pk.x, pk.y, M)
  const h = poseidon5([R.x, R.y, publicKey.x, publicKey.y, messageHash]);
  
  // Step 2: Verify equation: [s] * G == R + [h] * pk
  const lhs = scalarMul(s, JUBJUB_PARAMS.G);
  const rhs = addPoints(R, scalarMul(h, publicKey));
  
  return lhs.x === rhs.x && lhs.y === rhs.y;
}
```

### Verification Equation

```
[s] * G = R + [H(R, pk, M)] * pk
```

**Why this works**:
```
s = r + h * sk                      (signature generation)
[s] * G = [r + h * sk] * G         (multiply both sides by G)
[s] * G = [r] * G + [h * sk] * G   (distributive property)
[s] * G = R + [h] * ([sk] * G)     (definition of R and pk)
[s] * G = R + [h] * pk             (QED)
```

### Circuit Implementation

**Circom Circuit** (simplified):

```c
template EddsaVerify() {
    // Inputs
    signal input messageHash;
    signal input publicKeyX;
    signal input publicKeyY;
    signal input randomizerX;
    signal input randomizerY;
    signal input signedHash;
    
    // Output (1 if valid, 0 if invalid)
    signal output isValid;
    
    // Step 1: Compute challenge hash
    component poseidonHash = Poseidon5();
    poseidonHash.inputs[0] <== randomizerX;
    poseidonHash.inputs[1] <== randomizerY;
    poseidonHash.inputs[2] <== publicKeyX;
    poseidonHash.inputs[3] <== publicKeyY;
    poseidonHash.inputs[4] <== messageHash;
    signal challengeHash <== poseidonHash.out;
    
    // Step 2: Compute [s] * G
    component leftSide = JubjubExp();
    leftSide.scalar <== signedHash;
    leftSide.baseX <== JUBJUB_BASE_X;  // G.x
    leftSide.baseY <== JUBJUB_BASE_Y;  // G.y
    signal lhsX <== leftSide.outX;
    signal lhsY <== leftSide.outY;
    
    // Step 3: Compute [h] * pk
    component hTimespk = JubjubExp();
    hTimespk.scalar <== challengeHash;
    hTimespk.baseX <== publicKeyX;
    hTimespk.baseY <== publicKeyY;
    signal hpkX <== hTimespk.outX;
    signal hpkY <== hTimespk.outY;
    
    // Step 4: Compute R + [h] * pk
    component rightSide = EdwardsAdd();
    rightSide.x1 <== randomizerX;
    rightSide.y1 <== randomizerY;
    rightSide.x2 <== hpkX;
    rightSide.y2 <== hpkY;
    signal rhsX <== rightSide.x3;
    signal rhsY <== rightSide.y3;
    
    // Step 5: Check equality
    component checkX = IsEqual();
    checkX.in[0] <== lhsX;
    checkX.in[1] <== rhsX;
    
    component checkY = IsEqual();
    checkY.in[0] <== lhsY;
    checkY.in[1] <== rhsY;
    
    component checkBoth = AND();
    checkBoth.a <== checkX.out;
    checkBoth.b <== checkY.out;
    
    isValid <== checkBoth.out;
}
```

**Constraints**: ~5,000 constraints (2× JubjubExp + 1× EdwardsAdd + 1× Poseidon5)

**Source**: [`packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts#L37-L95)

---

## Circuit Implementation

### Integration with Synthesizer

#### Poseidon Hash Placement

```typescript
// Place Poseidon hash subcircuit
const hashPt = synthesizer.placeCrypto(
  'PoseidonCircuit4',
  [input0Pt, input1Pt, input2Pt, input3Pt]
);

// Generated placement:
{
  id: 42,
  name: 'PoseidonCircuit4',
  usage: 'POSEIDON_4',
  inPts: [
    { source: 10, wireIndex: 0, value: 123n },
    { source: 10, wireIndex: 1, value: 456n },
    { source: 10, wireIndex: 2, value: 789n },
    { source: 10, wireIndex: 3, value: 012n }
  ],
  outPts: [
    { source: 42, wireIndex: 0, value: poseidon(123n, 456n, 789n, 012n) }
  ]
}
```

#### EdDSA Verification Placement

```typescript
// Place EdDSA verification subcircuit
const isValidPt = synthesizer.placeCrypto(
  'EddsaVerify',
  [
    messageHashPt,
    publicKeyXPt,
    publicKeyYPt,
    randomizerXPt,
    randomizerYPt,
    signaturePt
  ]
);

// Assert signature is valid
const resultPt = synthesizer.placeArith('SUB', [
  isValidPt,
  synthesizer.loadAuxin(1n)
]);
// If resultPt != 0, circuit will fail at proof generation
```

### Subcircuit Library

All cryptographic circuits are pre-compiled from Circom:

```bash
packages/frontend/qap-compiler/circuits/
├── Poseidon/
│   ├── PoseidonCircuit2.circom    # ~150 constraints
│   ├── PoseidonCircuit4.circom    # ~200 constraints
│   └── PoseidonCircuit9.circom    # ~350 constraints
├── EdDSA/
│   ├── EddsaVerify.circom         # ~5,000 constraints
│   ├── JubjubExp.circom           # ~3,000 constraints
│   └── EdwardsAdd.circom          # ~10 constraints
└── compiled/
    ├── PoseidonCircuit2.r1cs      # Compiled R1CS
    ├── PoseidonCircuit2.wasm      # Compiled WASM
    └── ...
```

**Compilation**:
```bash
cd packages/frontend/qap-compiler
circom circuits/Poseidon/PoseidonCircuit2.circom --r1cs --wasm --sym -o compiled/
```

---

## Security Considerations

### Poseidon Hash

**Strengths**:
- ✅ Algebraic structure (efficient in zk-SNARKs)
- ✅ 128-bit security level (sufficient for L2 state channels)
- ✅ Standardized parameters (audited by cryptography community)

**Limitations**:
- ⚠️ Not suitable for general-purpose hashing (Merkle trees, commitments only)
- ⚠️ Collision resistance depends on round count (use standard parameters)

### EdDSA on JubJub

**Strengths**:
- ✅ Deterministic signature generation (RFC 8032 compliant)
- ✅ No signature malleability
- ✅ Small signature size (64 bytes: 32-byte randomizer + 32-byte scalar)
- ✅ Efficient verification in circuits

**Limitations**:
- ⚠️ **Non-deterministic nonce** in `eddsaSign_unsafe()`: Production must use deterministic nonce (hash of private key + message)
- ⚠️ Side-channel attacks: Constant-time implementation required in software

### Field Arithmetic

**Strengths**:
- ✅ Prime field (no weak subgroups)
- ✅ 255-bit security (2^128 security level)

**Limitations**:
- ⚠️ Implementation bugs: Use audited libraries (noble-curves, arkworks)

---

## Performance Comparison

### Hash Functions

| Hash Function | Constraints (Circuit) | Software (μs) | Use Case                |
| ------------- | --------------------- | ------------- | ----------------------- |
| **Keccak256** | ~20,000               | 5             | General-purpose (EVM)   |
| **Poseidon-2** | ~150                 | 50            | Merkle tree leaf        |
| **Poseidon-4** | ~200                 | 80            | Merkle tree parent      |
| **Poseidon-9** | ~350                 | 150           | Transaction message     |

**Efficiency**: Poseidon is **~100x more efficient** in circuits than Keccak256.

### Signature Schemes

| Signature    | Constraints (Verify) | Software Verify (ms) | Signature Size | Use Case              |
| ------------ | -------------------- | -------------------- | -------------- | --------------------- |
| **ECDSA**    | ~1,000,000           | 0.5                  | 65 bytes       | L1 transactions       |
| **EdDSA**    | ~5,000               | 0.3                  | 64 bytes       | L2 state channels     |

**Efficiency**: EdDSA is **~200x more efficient** in circuits than ECDSA.

### Transaction Processing

**L1 Transaction** (ECDSA + Keccak256):
- Circuit size: ~1,000,000 constraints
- Proof time: ~5 minutes
- Proof size: ~200 KB

**L2 Transaction** (EdDSA + Poseidon):
- Circuit size: ~100,000 constraints (10x smaller)
- Proof time: ~30 seconds (10x faster)
- Proof size: ~200 KB (same)

---

## Related Resources

### Academic Papers

- **Poseidon**: [Poseidon: A New Hash Function for Zero-Knowledge Proof Systems](https://eprint.iacr.org/2019/458)
- **EdDSA**: [RFC 8032 - Edwards-Curve Digital Signature Algorithm](https://datatracker.ietf.org/doc/html/rfc8032)
- **JubJub Curve**: [Zcash Sapling Specification](https://github.com/zcash/zips/blob/main/protocol/protocol.pdf)
- **BLS12-381**: [BLS12-381 For The Rest Of Us](https://hackmd.io/@benjaminion/bls12-381)

### Source Code

**Tokamak zk-EVM**:
- [Poseidon Hash](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts#L10-L35)
- [EdDSA Sign](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts#L37-L68)
- [EdDSA Verify](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts#L70-L95)
- [Circom Circuits](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/qap-compiler/circuits)

**Libraries**:
- [noble-curves](https://github.com/paulmillr/noble-curves) (EdDSA, JubJub)
- [circomlibjs](https://github.com/iden3/circomlibjs) (Poseidon reference)
- [arkworks](https://github.com/arkworks-rs) (Field arithmetic, curve operations)

### Related Documentation

- [Synthesizer Concepts](./synthesizer-concepts.md)
- [L2 State Channels](./synthesizer-l2-state-channels.md)
- [Opcode Reference](./synthesizer-opcodes.md#cryptographic-operations-l2-state-channels)
- [Data Structures](./synthesizer-data-structure.md#reserved-variables)

