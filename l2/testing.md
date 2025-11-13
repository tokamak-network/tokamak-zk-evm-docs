# L2 State Channels: Testing

This document provides testing strategies, test suites, and verification procedures for L2 state channel functionality.

---

## 🧪 Test Checklist

### 1. EdDSA Signature

- [ ] Generate key pair correctly
- [ ] Sign transaction with private key
- [ ] Verify signature off-chain
- [ ] Verify signature in-circuit (EddsaVerify placement)
- [ ] Reject invalid signatures

### 2. Merkle Tree State

- [ ] Initial root matches expected value
- [ ] Leaf updates reflect SSTORE operations
- [ ] Final root computed correctly (4-ary, depth 4)
- [ ] Empty nodes use NULL_POSEIDON_LEVELn constants
- [ ] Merkle proofs are valid

### 3. Storage Access

- [ ] Registered keys load from Merkle tree
- [ ] General keys load from L1 RPC
- [ ] Storage writes update final tree
- [ ] L1/L2 key hashing works correctly

### 4. Circuit Generation

- [ ] beforeMessage verifies EdDSA signature
- [ ] step processes EVM opcodes
- [ ] afterMessage finalizes Merkle tree
- [ ] Output files (placement.json, wireMap.json) are valid

### 5. Proof Generation

- [ ] Backend prover accepts circuit files
- [ ] Proof generation completes (1-2 minutes)
- [ ] Proof verifies on-chain (Solidity verifier)

---

## 🔬 Unit Tests

### Test 1: EdDSA Signature

```typescript
import { test, expect } from 'vitest';
import {
  eddsaSign_unsafe,
  eddsaVerify,
  getEddsaPublicKey
} from 'synthesizer/crypto';
import { randomBytes } from 'crypto';

test('EdDSA signature creation and verification', () => {
  // Generate key pair
  const privateKey = randomBytes(32);
  const publicKey = getEddsaPublicKey(privateKey);
  
  // Message to sign
  const messageHash = 123456789n;
  
  // Sign
  const signature = eddsaSign_unsafe(messageHash, privateKey);
  
  // Verify
  const isValid = eddsaVerify(
    messageHash,
    { x: BigInt('0x' + publicKey.slice(0, 32).toString('hex')), y: BigInt('0x' + publicKey.slice(32, 64).toString('hex')) },
    signature.randomizer,
    signature.signedHash
  );
  
  expect(isValid).toBe(true);
});

test('EdDSA signature rejects invalid signature', () => {
  const privateKey = randomBytes(32);
  const publicKey = getEddsaPublicKey(privateKey);
  
  const messageHash = 123456789n;
  const wrongMessageHash = 987654321n;
  
  const signature = eddsaSign_unsafe(messageHash, privateKey);
  
  // Verify with wrong message
  const isValid = eddsaVerify(
    wrongMessageHash,
    { x: BigInt('0x' + publicKey.slice(0, 32).toString('hex')), y: BigInt('0x' + publicKey.slice(32, 64).toString('hex')) },
    signature.randomizer,
    signature.signedHash
  );
  
  expect(isValid).toBe(false);
});
```

---

### Test 2: TokamakL2Tx

```typescript
import { test, expect } from 'vitest';
import { TokamakL2Tx, eddsaSign_unsafe, getEddsaPublicKey } from 'synthesizer';
import { Address } from '@ethereumjs/util';
import { randomBytes } from 'crypto';

test('Create and sign TokamakL2Tx', () => {
  // Create unsigned transaction
  const tx = TokamakL2Tx.fromTxData({
    nonce: 0n,
    gasLimit: 100000n,
    to: Address.fromString('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
    value: 100n,
    data: Buffer.alloc(0)
  });
  
  // Sign
  const privateKey = randomBytes(32);
  const messageHash = tx.getHashedMessageToSign();
  const signature = eddsaSign_unsafe(messageHash, privateKey);
  const publicKey = getEddsaPublicKey(privateKey);
  
  const signedTx = tx.addEddsaSignature(signature, publicKey);
  
  // Verify fields
  expect(signedTx.v).toBeDefined();
  expect(signedTx.r).toBeDefined();
  expect(signedTx.s).toBeDefined();
  
  // Verify sender public key
  const senderPubKey = signedTx.getSenderPublicKey();
  expect(senderPubKey.x).toBeDefined();
  expect(senderPubKey.y).toBeDefined();
});
```

---

### Test 3: Merkle Tree State

```typescript
import { test, expect } from 'vitest';
import { TokamakL2StateManager } from 'synthesizer';
import { Address } from '@ethereumjs/util';
import { poseidon } from 'synthesizer/crypto';

test('Merkle tree initial root computation', async () => {
  const stateManager = new TokamakL2StateManager({
    l1ContractAddress: Address.fromString('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
    registeredKeys: [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
    ],
    initialStateValues: {
      '0x0000000000000000000000000000000000000000000000000000000000000001': 100n,
      '0x0000000000000000000000000000000000000000000000000000000000000002': 200n,
    },
    rpcProvider: null  // For testing only
  });
  
  const initialRoot = stateManager.initialMerkleTree.root;
  expect(initialRoot).toBeDefined();
  expect(initialRoot.length).toBe(32);
});

test('Merkle tree storage update', async () => {
  const stateManager = new TokamakL2StateManager({
    l1ContractAddress: Address.fromString('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
    registeredKeys: [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    ],
    initialStateValues: {
      '0x0000000000000000000000000000000000000000000000000000000000000001': 100n,
    },
    rpcProvider: null
  });
  
  const initialRoot = stateManager.initialMerkleTree.root.toString('hex');
  
  // Update storage
  await stateManager.putStorage(
    Address.fromString('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex'),
    Buffer.from('00000000000000000000000000000000000000000000000000000000000000ff', 'hex')
  );
  
  const finalRoot = stateManager.getUpdatedMerkleTreeRoot().toString('hex');
  
  // Roots should be different
  expect(finalRoot).not.toBe(initialRoot);
});
```

---

## 🧩 Integration Tests

### Test 4: Full L2 Transaction Flow

```typescript
import { test, expect } from 'vitest';
import {
  TokamakL2Tx,
  eddsaSign_unsafe,
  getEddsaPublicKey,
  createSynthesizerOptsForSimulationFromRPC
} from 'synthesizer';
import { EVM } from '@ethereumjs/evm';
import { Address } from '@ethereumjs/util';
import { randomBytes } from 'crypto';

test('L2 transaction execution with Synthesizer', async () => {
  // 1. Setup
  const privateKey = randomBytes(32);
  const publicKey = getEddsaPublicKey(privateKey);
  
  // 2. Create and sign transaction
  const tx = TokamakL2Tx.fromTxData({
    nonce: 0n,
    gasLimit: 100000n,
    to: Address.fromString('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
    value: 100n,
    data: Buffer.alloc(0)
  });
  
  const messageHash = tx.getHashedMessageToSign();
  const signature = eddsaSign_unsafe(messageHash, privateKey);
  const signedTx = tx.addEddsaSignature(signature, publicKey);
  
  // 3. Initialize Synthesizer
  const synthOpts = await createSynthesizerOptsForSimulationFromRPC({
    mode: 'l2-state-channel',
    l1ProviderUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY',
    l1Address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    l1ChannelNonce: 0n,
    l2CallIdx: 0n,
    l2TxSerialized: signedTx.serialize(),
    l2State: {
      registeredKeys: [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
      ],
      stateValues: [1000n]
    }
  });
  
  // 4. Execute
  const evm = await EVM.create({
    common: synthOpts.common,
    stateManager: synthOpts.stateManager,
    enableSynthesizer: true
  });
  
  const result = await evm.runCall({
    to: synthOpts.to,
    caller: synthOpts.from,
    data: synthOpts.data,
    gasLimit: synthOpts.gasLimit,
    value: synthOpts.value
  });
  
  // 5. Verify
  expect(result.execResult.exceptionError).toBeUndefined();
  
  const synthesizer = evm.synthesizer;
  expect(synthesizer.placements.list.length).toBeGreaterThan(0);
  
  // Verify EdDSA verification placement exists
  const eddsaPlacement = synthesizer.placements.list.find(p => p.name === 'EddsaVerify');
  expect(eddsaPlacement).toBeDefined();
  
  // Verify Merkle roots
  const initialRoot = synthesizer._stateManager.initialMerkleTree.root;
  const finalRoot = synthesizer._stateManager.getUpdatedMerkleTreeRoot();
  expect(initialRoot).toBeDefined();
  expect(finalRoot).toBeDefined();
}, 30000); // 30 second timeout
```

---

## 🔍 End-to-End Tests

### Test 5: Circuit Generation + Proof Generation

```typescript
import { test, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';

test('Generate circuit files and create proof', async () => {
  // 1. Run Synthesizer (from previous test)
  // ... (setup and execute transaction)
  
  // 2. Export circuit files
  synthesizer.exportPlacementJSON('./test-output/placement.json');
  synthesizer.exportWireMapJSON('./test-output/wireMap.json');
  
  expect(fs.existsSync('./test-output/placement.json')).toBe(true);
  expect(fs.existsSync('./test-output/wireMap.json')).toBe(true);
  
  // 3. Run backend prover
  try {
    execSync(
      'cargo run --release -- ' +
      '--placement ./test-output/placement.json ' +
      '--wiremap ./test-output/wireMap.json ' +
      '--output ./test-output/proof.json',
      {
        cwd: '../backend/prove',
        timeout: 120000  // 2 minutes
      }
    );
  } catch (error) {
    throw new Error(`Prover failed: ${error.message}`);
  }
  
  // 4. Verify proof file exists
  expect(fs.existsSync('./test-output/proof.json')).toBe(true);
  
  // 5. Parse proof
  const proof = JSON.parse(fs.readFileSync('./test-output/proof.json', 'utf-8'));
  expect(proof.proof).toBeDefined();
  expect(proof.publicInputs).toBeDefined();
}, 180000); // 3 minute timeout
```

---

## 🎯 Performance Benchmarks

### Benchmark 1: Circuit Generation Time

```typescript
test('Benchmark: Circuit generation time', async () => {
  const start = Date.now();
  
  // Run Synthesizer
  // ... (execute transaction)
  
  const end = Date.now();
  const duration = end - start;
  
  console.log(`Circuit generation time: ${duration}ms`);
  expect(duration).toBeLessThan(10000); // < 10 seconds
});
```

---

### Benchmark 2: Proof Generation Time

```typescript
test('Benchmark: Proof generation time', async () => {
  // Generate circuit files first
  // ...
  
  const start = Date.now();
  
  execSync(
    'cargo run --release -- ' +
    '--placement ./test-output/placement.json ' +
    '--wiremap ./test-output/wireMap.json ' +
    '--output ./test-output/proof.json',
    { cwd: '../backend/prove' }
  );
  
  const end = Date.now();
  const duration = end - start;
  
  console.log(`Proof generation time: ${duration}ms`);
  expect(duration).toBeLessThan(180000); // < 3 minutes
}, 200000);
```

---

## 🛠️ Test Utilities

### Helper: Create Test Transaction

```typescript
export async function createTestL2Transaction(opts: {
  privateKey: Buffer;
  to: string;
  value?: bigint;
  data?: Buffer;
  nonce?: bigint;
}): Promise<TokamakL2Tx> {
  const tx = TokamakL2Tx.fromTxData({
    nonce: opts.nonce ?? 0n,
    gasLimit: 100000n,
    to: Address.fromString(opts.to),
    value: opts.value ?? 0n,
    data: opts.data ?? Buffer.alloc(0)
  });
  
  const messageHash = tx.getHashedMessageToSign();
  const signature = eddsaSign_unsafe(messageHash, opts.privateKey);
  const publicKey = getEddsaPublicKey(opts.privateKey);
  
  return tx.addEddsaSignature(signature, publicKey);
}
```

---

### Helper: Setup Test State Manager

```typescript
export function createTestStateManager(opts: {
  registeredKeys: string[];
  initialValues: bigint[];
}): TokamakL2StateManager {
  const initialState: Record<string, bigint> = {};
  opts.registeredKeys.forEach((key, i) => {
    initialState[key] = opts.initialValues[i] ?? 0n;
  });
  
  return new TokamakL2StateManager({
    l1ContractAddress: Address.fromString('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
    registeredKeys: opts.registeredKeys,
    initialStateValues: initialState,
    rpcProvider: null  // Mock for testing
  });
}
```

---

## 🔗 Related Resources

- [Integration Guide](integration-guide.md)
- [Architecture](architecture.md)
- [Transaction](transaction.md)
- [State Management](state-management.md)

**Test Examples**:
- [Unit Tests](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/synthesizer/test/unit)
- [Integration Tests](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/synthesizer/test/integration)

---

**Next**: Return to [L2 Overview](README.md) for the complete L2 State Channels documentation.



