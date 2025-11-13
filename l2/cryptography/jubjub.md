# JubJub Elliptic Curve

**JubJub** is a **twisted Edwards curve** defined over the BLS12-381 scalar field. It provides efficient elliptic curve operations for zero-knowledge circuits.

---

## 📋 Overview

### Curve Equation

```
ax² + y² = 1 + dx²y²  (Twisted Edwards form)
```

**Parameters**:
- **a**: -1
- **d**: -(10240/10241) mod R_MOD
  - `d = 0x2a9318e74bfa2b48f5fd9207e6bd7fd4292d7f6d37579d2601065fd6d6343eb1`

### Curve Properties

```typescript
const JUBJUB_PARAMS = {
  p: R_MOD,  // Field modulus (BLS12-381 scalar field)
  a: R_MOD - 1n,  // -1 mod R_MOD
  d: 0x2a9318e74bfa2b48f5fd9207e6bd7fd4292d7f6d37579d2601065fd6d6343eb1n,
  
  // Base point (generator)
  G: {
    x: 0x0e4840ac57f86f5e293b1d67bc8de5d9a12a70a615d0b8e4d2fc5e69ac5db47fn,
    y: 0x2bcd9508a3dad316105f067219141f4450a32c41aa67e0beb0ad80034eb71aa6n
  },
  
  // Point at infinity (identity element)
  O: { x: 0n, y: 1n }
};
```

---

## 🔧 Point Operations

### Point Addition

```typescript
// Edwards addition formula:
// x3 = (x1*y2 + y1*x2) / (1 + d*x1*x2*y1*y2)
// y3 = (y1*y2 - a*x1*x2) / (1 - d*x1*x2*y1*y2)

function addPoints(P: Point, Q: Point): Point {
  const { a, d } = JUBJUB_PARAMS;
  
  const x1y2 = fieldMul(P.x, Q.y);
  const y1x2 = fieldMul(P.y, Q.x);
  const y1y2 = fieldMul(P.y, Q.y);
  const x1x2 = fieldMul(P.x, Q.x);
  const dx1x2y1y2 = fieldMul(fieldMul(d, x1x2), fieldMul(P.y, Q.y));
  
  const x3 = fieldMul(
    fieldAdd(x1y2, y1x2),
    fieldInv(fieldAdd(1n, dx1x2y1y2))
  );
  
  const y3 = fieldMul(
    fieldSub(y1y2, fieldMul(a, x1x2)),
    fieldInv(fieldSub(1n, dx1x2y1y2))
  );
  
  return { x: x3, y: y3 };
}
```

### Scalar Multiplication

```typescript
// Double-and-add algorithm
function scalarMul(k: bigint, P: Point): Point {
  if (k === 0n) return JUBJUB_PARAMS.O;
  if (k === 1n) return P;
  
  let result = JUBJUB_PARAMS.O;
  let addend = P;
  
  while (k > 0n) {
    if (k & 1n) {
      result = addPoints(result, addend);
    }
    addend = addPoints(addend, addend); // Double
    k = k >> 1n;
  }
  
  return result;
}
```

---

## 📊 Circuit Implementation

### Circom Circuit

```c
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
```

**Constraints**: ~8 constraints per addition

---

## 💡 Usage Example

```typescript
import { scalarMul, JUBJUB_PARAMS } from 'synthesizer/crypto';

// Generate public key from private key
const privateKey = 12345678n;
const publicKey = scalarMul(privateKey, JUBJUB_PARAMS.G);

console.log('Public Key X:', publicKey.x.toString(16));
console.log('Public Key Y:', publicKey.y.toString(16));
```

---

## 🔗 References

- **Zcash Sapling**: [Zcash Protocol Specification](https://github.com/zcash/zips/blob/main/protocol/protocol.pdf)
- **Source**: [`crypto/jubjub.ts`](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/TokamakL2JS/crypto/jubjub.ts)

**Back**: [Cryptography Overview](../cryptography.md)



