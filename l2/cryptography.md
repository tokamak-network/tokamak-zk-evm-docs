# L2 State Channels: Cryptography

This document provides an overview of the cryptographic primitives used in Tokamak L2 state channels, including Poseidon hash, EdDSA signatures on JubJub curve, and field arithmetic.

---

## 📋 Overview

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

## 🔢 Field Arithmetic

All cryptographic operations in Tokamak L2 are performed over the **BLS12-381 scalar field**.

### BLS12-381 Scalar Field Modulus

```
R_MOD = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001

Decimal:
52435875175126190479447740508185965837690552500527637822603658699938581184513
```

**Properties**:
- **Size**: 255 bits (top bit always 0 for canonical representation)
- **Prime**: Yes (R_MOD is prime)
- **Order**: \( r = 2^{255} - c \) where \( c \approx 2^{128} \)

### Field Operations

```typescript
// Addition (mod R_MOD)
const sum = (a + b) % R_MOD;

// Subtraction (mod R_MOD)
const diff = (a - b + R_MOD) % R_MOD;

// Multiplication (mod R_MOD)
const product = (a * b) % R_MOD;

// Inversion (Extended Euclidean Algorithm)
const inv = modInverse(a, R_MOD);
```

---

## 🔐 Cryptographic Primitives

### 1. Poseidon Hash Function

**Purpose**: Circuit-friendly hash function for Merkle trees and address derivation

**Details**: See [Poseidon Hash](cryptography/poseidon.md)

**Key Features**:
- Input/Output: Field elements (mod R_MOD)
- Variants: Poseidon(2), Poseidon(4), Poseidon(9) for different input counts
- Efficiency: ~100-150 constraints per hash
- Security: 128-bit security level

**API**:
```typescript
import { poseidon } from 'synthesizer/crypto';

// Hash single value
const hash1 = poseidon(123n);

// Hash two values (for Merkle tree leaves)
const hash2 = poseidon(keyHash, valueHash);

// Hash four values (for Merkle tree parents)
const hash4 = poseidon(child0, child1, child2, child3);

// Hash nine values (for transaction messages)
const hash9 = poseidon(nonce, to, value, ...calldata);
```

---

### 2. JubJub Elliptic Curve

**Purpose**: Efficient curve for EdDSA signatures in zk-SNARKs

**Details**: See [JubJub Curve](cryptography/jubjub.md)

**Curve Equation**:
```
ax² + y² = 1 + dx²y²  (Twisted Edwards form)

where:
  a = -1
  d = -(10240/10241) mod R_MOD
```

**Base Point**:
```
G = (Gx, Gy) where:
  Gx = 0x0e4840ac57f86f5e293b1d67bc8de5d9a12a70a615d0b8e4d2fc5e69ac5db47f
  Gy = 0x2bcd9508a3dad316105f067219141f4450a32c41aa67e0beb0ad80034eb71aa6
```

**Operations**:
- Point Addition: \( P + Q \)
- Scalar Multiplication: \( k \cdot P \)
- Point Doubling: \( 2P \)

---

### 3. EdDSA Signature Scheme

**Purpose**: Signature scheme for L2 transaction authentication

**Details**: See [EdDSA Signature](cryptography/eddsa.md)

**Signature Components**:
```
Signature = (R, s) where:
  R = (Rx, Ry)  // Point on JubJub curve
  s = scalar    // Field element
```

**API**:
```typescript
import {
  eddsaSign_unsafe,
  eddsaVerify,
  getEddsaPublicKey
} from 'synthesizer/crypto';

// Generate key pair
const privateKey = randomBytes(32);
const publicKey = getEddsaPublicKey(privateKey);

// Sign message
const messageHash = poseidon(messageBytes);
const signature = eddsaSign_unsafe(messageHash, privateKey);
// Returns: { randomizer: Point, signedHash: bigint }

// Verify signature
const isValid = eddsaVerify(
  messageHash,
  { x: pubKeyX, y: pubKeyY },
  signature.randomizer,
  signature.signedHash
);
```

---

## 🔧 Circuit Implementation

### Circom Subcircuits

| Subcircuit          | Purpose                          | Input Wires | Output Wires | Constraints |
| ------------------- | -------------------------------- | ----------- | ------------ | ----------- |
| `PoseidonCircuit2`  | Hash 2 field elements (leaf)     | 2           | 1            | ~100        |
| `PoseidonCircuit4`  | Hash 4 field elements (parent)   | 4           | 1            | ~150        |
| `PoseidonCircuit9`  | Hash 9 field elements (message)  | 9           | 1            | ~200        |
| `EddsaVerify`       | Verify EdDSA signature           | 6           | 1 (0 or 1)   | ~4,000      |
| `JubjubExp`         | JubJub scalar multiplication     | 3           | 2 (point)    | ~2,000      |

### Usage in Synthesizer

```typescript
// Example: Poseidon hash placement
const hashPt = synthesizer.placeCrypto(
  'PoseidonCircuit2',
  [keyPt, valuePt]
);

// Example: EdDSA verification placement
const isValidPt = synthesizer.placeCrypto(
  'EddsaVerify',
  [messageHashPt, pubKeyXPt, pubKeyYPt, randomizerXPt, randomizerYPt, signaturePt]
);

// Example: Scalar multiplication placement
const [resultXPt, resultYPt] = synthesizer.placeCrypto(
  'JubjubExp',
  [baseXPt, baseYPt, scalarPt]
);
```

---

## 📊 Performance Comparison

### Hash Functions

| Hash Function | Input Size | Constraints | EVM Gas | Circuit Cost |
| ------------- | ---------- | ----------- | ------- | ------------ |
| **Keccak256** | 32 bytes   | ~100,000    | 30      | ❌ Very High  |
| **SHA-256**   | 32 bytes   | ~25,000     | -       | ❌ High       |
| **Poseidon**  | 2 elements | ~100        | -       | ✅ Low        |

**Circuit Cost Savings**: Poseidon is ~1000x cheaper than Keccak256 in zk-SNARKs!

---

### Signature Schemes

| Signature  | Curve      | Verify (Constraints) | Verify (EVM Gas) | Circuit Cost |
| ---------- | ---------- | -------------------- | ---------------- | ------------ |
| **ECDSA**  | secp256k1  | ~100,000             | 3,000            | ❌ Very High  |
| **EdDSA**  | JubJub     | ~4,000               | -                | ✅ Low        |

**Circuit Cost Savings**: EdDSA is ~25x cheaper than ECDSA in zk-SNARKs!

---

## 🔒 Security Considerations

### Key Management

**⚠️ Never reuse Ethereum L1 keys for L2 transactions!**

- L1 keys: secp256k1 private keys (32 bytes)
- L2 keys: JubJub private keys (32 bytes, different field)

Generate separate keys:

```typescript
import { randomBytes } from 'crypto';

// Generate L2 private key
const l2PrivateKey = randomBytes(32);

// Ensure it's in valid range (< R_MOD)
const R_MOD = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;
if (BigInt('0x' + l2PrivateKey.toString('hex')) >= R_MOD) {
  throw new Error('Private key out of range, regenerate');
}
```

---

### Field Element Range Checks

Always ensure values are within field range:

```typescript
function toFieldElement(value: bigint): bigint {
  return value % R_MOD;
}

// Before hashing
const hash = poseidon(toFieldElement(a), toFieldElement(b));
```

---

### Signature Replay Protection

Include nonce in signed message:

```typescript
const message = poseidon(
  nonce,          // Prevents replay
  contractAddress,
  functionSelector,
  ...calldata
);

const signature = eddsaSign_unsafe(message, privateKey);
```

---

## 🔗 Detailed Documentation

- **[Poseidon Hash](cryptography/poseidon.md)** - Algebraic hash function design and implementation
- **[EdDSA Signature](cryptography/eddsa.md)** - Edwards-curve signature scheme
- **[JubJub Curve](cryptography/jubjub.md)** - Twisted Edwards curve for EdDSA

---

## 📚 Academic References

- **Poseidon Hash**: [Poseidon: A New Hash Function for Zero-Knowledge Proof Systems](https://eprint.iacr.org/2019/458)
- **EdDSA**: [RFC 8032 - Edwards-Curve Digital Signature Algorithm](https://datatracker.ietf.org/doc/html/rfc8032)
- **JubJub Curve**: [Zcash Sapling Specification](https://github.com/zcash/zips/blob/main/protocol/protocol.pdf)
- **BLS12-381**: [BLS12-381 For The Rest Of Us](https://hackmd.io/@benjaminion/bls12-381)

---

## 🛠️ Source Code

- [crypto/index.ts](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/index.ts) - Main cryptographic implementations
- [poseidon.ts](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/poseidon.ts) - Poseidon hash
- [jubjub.ts](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/jubjub.ts) - JubJub curve operations
- [eddsa.ts](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/eddsa.ts) - EdDSA signature

---

**Next**: Dive deeper into [Poseidon Hash](cryptography/poseidon.md), [EdDSA Signature](cryptography/eddsa.md), or [JubJub Curve](cryptography/jubjub.md).



