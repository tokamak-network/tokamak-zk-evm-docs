# EdDSA Signature Scheme

**EdDSA (Edwards-curve Digital Signature Algorithm)** on JubJub curve provides efficient signature verification in zero-knowledge circuits.

---

## 📋 Overview

### Why EdDSA for L2?

| Property           | ECDSA (L1)     | EdDSA (L2)    |
| ------------------ | -------------- | ------------- |
| **Curve**          | secp256k1      | JubJub        |
| **Field**          | ~256-bit prime | BLS12-381 scalar |
| **Constraints**    | ~100,000       | ~4,000        |
| **Signature Size** | 65 bytes       | 64 bytes      |
| **Recovery**       | Yes            | No (pubkey included) |

**Circuit Cost Savings**: EdDSA is ~25x cheaper than ECDSA in zk-SNARKs!

---

## 🔐 Signature Algorithm

### Signature Components

```
Signature = (R, s) where:
  R = (Rx, Ry)  // Point on JubJub curve (randomizer)
  s = scalar    // Field element
```

### Signing

```typescript
function eddsaSign_unsafe(msgHash: bigint, privateKey: Buffer): Signature {
  const { G } = JUBJUB_PARAMS;
  
  // 1. Derive public key: A = [privateKey] * G
  const publicKey = scalarMul(BigInt('0x' + privateKey.toString('hex')), G);
  
  // 2. Generate random nonce
  const r = randomFieldElement();
  
  // 3. Compute R = [r] * G
  const R = scalarMul(r, G);
  
  // 4. Compute s = r + hash(R, A, M) * privateKey (mod R_MOD)
  const challenge = poseidon(R.x, R.y, publicKey.x, publicKey.y, msgHash);
  const s = (r + challenge * BigInt('0x' + privateKey.toString('hex'))) % R_MOD;
  
  return {
    randomizer: R,
    signedHash: s
  };
}
```

### Verification

```typescript
function eddsaVerify(
  msgHash: bigint,
  publicKey: Point,
  randomizer: Point,
  signedHash: bigint
): boolean {
  const { G } = JUBJUB_PARAMS;
  
  // 1. Compute challenge: c = hash(R, A, M)
  const challenge = poseidon(
    randomizer.x,
    randomizer.y,
    publicKey.x,
    publicKey.y,
    msgHash
  );
  
  // 2. Verify: [s]*G == R + [c]*A
  const leftSide = scalarMul(signedHash, G);
  const rightSide = addPoints(
    randomizer,
    scalarMul(challenge, publicKey)
  );
  
  return leftSide.x === rightSide.x && leftSide.y === rightSide.y;
}
```

---

## 🔧 API Usage

### Generate Key Pair

```typescript
import { randomBytes } from 'crypto';
import { getEddsaPublicKey } from 'synthesizer/crypto';

// Generate private key
const privateKey = randomBytes(32);

// Derive public key
const publicKey = getEddsaPublicKey(privateKey);
// Returns: Buffer (32 bytes, compressed Y coordinate)
```

### Sign Message

```typescript
import { eddsaSign_unsafe, poseidon } from 'synthesizer/crypto';

// Hash message with Poseidon
const message = poseidon(nonce, to, value, ...data);

// Sign
const signature = eddsaSign_unsafe(message, privateKey);
// Returns: { randomizer: Point, signedHash: bigint }
```

### Verify Signature

```typescript
import { eddsaVerify } from 'synthesizer/crypto';

const isValid = eddsaVerify(
  message,
  { x: publicKeyX, y: publicKeyY },
  signature.randomizer,
  signature.signedHash
);

console.log('Signature valid:', isValid);
```

---

## 📊 Circuit Implementation

### Circom Circuit

```c
template EddsaVerify() {
    signal input msgHash;
    signal input pubKeyX;
    signal input pubKeyY;
    signal input randomizerX;
    signal input randomizerY;
    signal input signature;
    signal output isValid;
    
    // 1. Compute challenge: c = Poseidon(R, A, M)
    component hasher = Poseidon(5);
    hasher.in[0] <== randomizerX;
    hasher.in[1] <== randomizerY;
    hasher.in[2] <== pubKeyX;
    hasher.in[3] <== pubKeyY;
    hasher.in[4] <== msgHash;
    signal challenge <== hasher.out;
    
    // 2. Compute [s]*G
    component sG = JubjubExp();
    sG.baseX <== GX;  // Generator X
    sG.baseY <== GY;  // Generator Y
    sG.scalar <== signature;
    
    // 3. Compute [c]*A
    component cA = JubjubExp();
    cA.baseX <== pubKeyX;
    cA.baseY <== pubKeyY;
    cA.scalar <== challenge;
    
    // 4. Compute R + [c]*A
    component add = EdwardsAdd();
    add.x1 <== randomizerX;
    add.y1 <== randomizerY;
    add.x2 <== cA.outX;
    add.y2 <== cA.outY;
    
    // 5. Verify: [s]*G == R + [c]*A
    signal xMatch <== IsEqual()([sG.outX, add.x3]);
    signal yMatch <== IsEqual()([sG.outY, add.y3]);
    isValid <== xMatch * yMatch;
}
```

**Constraints**: ~4,000 constraints

---

## 💡 Complete Example

```typescript
import {
  eddsaSign_unsafe,
  eddsaVerify,
  getEddsaPublicKey,
  poseidon
} from 'synthesizer/crypto';
import { randomBytes } from 'crypto';

// 1. Generate key pair
const privateKey = randomBytes(32);
const publicKey = getEddsaPublicKey(privateKey);
const publicKeyPoint = {
  x: BigInt('0x' + publicKey.slice(0, 32).toString('hex')),
  y: BigInt('0x' + publicKey.slice(32, 64).toString('hex'))
};

// 2. Create and sign message
const message = poseidon(
  123n,    // nonce
  456n,    // to address
  1000n    // value
);

const signature = eddsaSign_unsafe(message, privateKey);

// 3. Verify signature
const isValid = eddsaVerify(
  message,
  publicKeyPoint,
  signature.randomizer,
  signature.signedHash
);

console.log('Signature valid:', isValid); // true
```

---

## 🔒 Security Considerations

### Never Reuse Keys

⚠️ **Do not reuse Ethereum L1 keys for L2 transactions!**

- L1 keys: secp256k1 curve
- L2 keys: JubJub curve (different field)

### Nonce Management

Always include a nonce in signed messages:

```typescript
const message = poseidon(
  nonce,  // Prevents replay attacks
  to,
  value,
  ...data
);
```

---

## 🔗 References

- **RFC 8032**: [Edwards-Curve Digital Signature Algorithm](https://datatracker.ietf.org/doc/html/rfc8032)
- **Source**: [`crypto/eddsa.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/eddsa.ts)
- **Circuit**: [`eddsa.circom`](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/qap-compiler/circom/eddsa)

**Back**: [Cryptography Overview](../cryptography.md)



