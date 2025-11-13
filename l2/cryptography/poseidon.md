# Poseidon Hash Function

**Poseidon** is a cryptographic hash function designed specifically for zero-knowledge proof systems. It operates over finite fields and uses algebraic operations instead of bitwise operations.

---

## 📋 Overview

### Why Poseidon?

| Property           | Keccak256 (Standard) | Poseidon (ZK-Friendly) |
| ------------------ | -------------------- | ---------------------- |
| **Operations**     | Bitwise (XOR, AND)   | Algebraic (×, +)       |
| **Field**          | Binary (GF(2))       | Prime field (R_MOD)    |
| **Constraints**    | ~20,000              | ~150-350               |
| **Efficiency**     | Fast in software     | Fast in circuits       |
| **Use Case**       | General-purpose      | ZK-SNARK optimized     |

**Circuit Cost Savings**: Poseidon is ~100x cheaper than Keccak256 in zk-SNARKs!

---

## 🔧 API Usage

### TypeScript

```typescript
import { poseidon } from 'synthesizer/crypto';

// Hash two values (Merkle tree leaf)
const leafHash = poseidon(keyHash, valueHash);

// Hash four values (Merkle tree parent)
const parentHash = poseidon(child0, child1, child2, child3);

// Hash nine values (transaction message)
const msgHash = poseidon(nonce, to, value, ...calldata);
```

### Variants

- **Poseidon-2**: 2 inputs → 1 output (~150 constraints)
- **Poseidon-4**: 4 inputs → 1 output (~200 constraints)
- **Poseidon-9**: 9 inputs → 1 output (~350 constraints)

---

## 🔐 Algorithm

### Sponge Construction

Poseidon uses a **sponge construction** with **substitution-permutation network (SPN)**.

#### Parameters

```typescript
const POSEIDON_PARAMS = {
  p: R_MOD,            // Field modulus
  securityBits: 128,   // Security level
  t: 6,                // State size (field elements)
  RF: 8,               // Full rounds
  RP: 57,              // Partial rounds
  totalRounds: 65,     // RF + RP
  alpha: 5n            // S-box: x^5
};
```

#### Round Function

Each round consists of:

1. **Add Round Constants** (ARK)
2. **Apply S-box** (x^5)
   - Full round: All elements
   - Partial round: First element only
3. **Mix with MDS Matrix** (Maximum Distance Separable)

---

## 📊 Circuit Implementation

### Circom Circuit

```c
template Poseidon2() {
    signal input in[2];
    signal output out;
    
    component rounds[65];
    signal state[66][6];
    
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
            rounds[i] = FullRound(6);
        } else {
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

---

## 🔗 References

- **Paper**: [Poseidon: A New Hash Function for Zero-Knowledge Proof Systems](https://eprint.iacr.org/2019/458)
- **Source**: [`crypto/poseidon.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/poseidon.ts)
- **Circuit**: [`poseidon.circom`](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/qap-compiler/circom/poseidon)

**Back**: [Cryptography Overview](../cryptography.md)



