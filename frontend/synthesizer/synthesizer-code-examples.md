# Synthesizer: Code Examples

This document provides practical code examples for using the Synthesizer.

---

## Basic Usage

### Example 1: Simple Transaction (L1)

```typescript
import { EVM } from '@ethereumjs/evm';
import { createSynthesizerOptsForSimulationFromRPC } from './interface/rpc/rpc';

// Step 1: Create Synthesizer options from RPC
const synthOpts = await createSynthesizerOptsForSimulationFromRPC({
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY',
  txHash: '0xYOUR_TRANSACTION_HASH',
  mode: 'normal'
});

// Step 2: Initialize EVM with Synthesizer
const evm = await EVM.create({
  common: synthOpts.common,
  stateManager: synthOpts.stateManager,
  enableSynthesizer: true
});

// Step 3: Execute transaction
const result = await evm.runCall({
  to: synthOpts.to,
  caller: synthOpts.from,
  data: synthOpts.data,
  gasLimit: synthOpts.gasLimit,
  value: synthOpts.value
});

// Step 4: Export circuit files
const synthesizer = evm.synthesizer;
synthesizer.exportPlacementJSON('./output/placement.json');
synthesizer.exportWireMapJSON('./output/wireMap.json');

console.log('Circuit generation complete!');
console.log(`Placements: ${synthesizer.placements.list.length}`);
```

---

### Example 2: L2 State Channel Transaction

```typescript
import { TokamakL2Tx } from './TokamakL2JS/tx/TokamakL2Tx';
import { eddsaSign_unsafe, poseidon } from './TokamakL2JS/crypto';

// Step 1: Create unsigned transaction
const unsignedTx = TokamakL2Tx.fromTxData({
  nonce: 0,
  gasLimit: 1000000,
  to: Address.fromString('0xL1_CONTRACT_ADDRESS'),
  value: 100n,
  data: Buffer.from('calldata', 'hex')
});

// Step 2: Sign with EdDSA
const privateKey = Buffer.from('YOUR_PRIVATE_KEY', 'hex');
const messageHash = unsignedTx.getHashedMessageToSign();
const eddsaSignature = eddsaSign_unsafe(messageHash, privateKey);
const signedTx = unsignedTx.sign(eddsaSignature);

// Step 3: Create L2-specific Synthesizer options
const synthOpts = await createSynthesizerOptsForSimulationFromRPC({
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY',
  l1Address: '0xL1_CONTRACT_ADDRESS',
  l1ChannelNonce: 0,
  l2CallIdx: 0,
  l2TxSerialized: signedTx.serialize().toString('hex'),
  l2State: {
    registeredKeys: ['0x01', '0x02'],
    stateValues: {
      '0x01': '0xff',
      '0x02': '0x100'
    }
  },
  customCrypto: {
    hasher: poseidon,
    getSigner: () => ({ privateKey, publicKey })
  },
  mode: 'l2-state-channel'
});

// Step 4-5: Same as L1 example
const evm = await EVM.create({ /* ... */ });
const result = await evm.runCall({ /* ... */ });
evm.synthesizer.exportPlacementJSON('./output/placement.json');
```

---

## Advanced Examples

### Example 3: Custom Arithmetic Operation

```typescript
// In a custom opcode handler
const aPt = synthesizer.stackPt.pop();
const bPt = synthesizer.stackPt.pop();

// Place ADD subcircuit
const resultPt = synthesizer.placeArith('ADD', [aPt, bPt])[0];

// Push result back to stack
synthesizer.stackPt.push(resultPt);

console.log(`Created placement ${resultPt.source} for ADD operation`);
```

---

### Example 4: Loading Storage

```typescript
// Load storage value (creates placement if not cached)
const key = 0x1n;
const valuePt = await synthesizer.loadStorage(key);

console.log(`Storage at ${key}: ${valuePt.value}`);
console.log(`Symbol: source=${valuePt.source}, wire=${valuePt.wireIndex}`);
```

---

### Example 5: Memory with Aliasing

```typescript
// Write to memory (symbol-based)
const dataPt = synthesizer.loadAuxin(0xdeadbeefn);
synthesizer.memoryPt.mstore(0x00n, dataPt);

// Write overlapping data
const dataPt2 = synthesizer.loadAuxin(0xcafebaben);
synthesizer.memoryPt.mstore(0x10n, dataPt2);

// Load (resolves aliasing automatically)
const loadedPt = synthesizer.memoryPt.mload(0x00n, 32);
console.log(`Loaded value: ${loadedPt.value}`);
```

---

### Example 6: Poseidon Hash

```typescript
import { poseidon } from './TokamakL2JS/crypto';

// Hash 4 values (for Merkle parent)
const child0 = 0x123n;
const child1 = 0x456n;
const child2 = 0x789n;
const child3 = 0xabcn;

const parentHash = poseidon([child0, child1, child2, child3]);

console.log(`Poseidon hash: ${parentHash.toString(16)}`);
```

---

### Example 7: Merkle Tree Construction

```typescript
import { TokamakL2StateManager } from './TokamakL2JS/stateManager/TokamakL2StateManager';

// Initialize state manager
const stateManager = await TokamakL2StateManager.create({
  l1ContractAddress: Address.fromString('0x...'),
  registeredKeys: ['0x01', '0x02'],
  initialState: {
    '0x01': '0xff',
    '0x02': '0x100'
  },
  hasher: poseidon,
  arity: 4,
  depth: 4
});

// Access Merkle tree
const initialRoot = stateManager.initialMerkleTree.root;
console.log(`Initial Merkle root: ${initialRoot.toString(16)}`);

// After transaction execution
const finalRoot = stateManager.finalMerkleTree.root;
console.log(`Final Merkle root: ${finalRoot.toString(16)}`);
```

---

## Testing Examples

### Example 8: Unit Test

```typescript
import { test } from 'vitest';

test('ADD operation creates correct placement', async () => {
  const synthesizer = new Synthesizer(/* opts */);
  
  const aPt = synthesizer.loadAuxin(10n);
  const bPt = synthesizer.loadAuxin(20n);
  
  const [resultPt] = synthesizer.placeArith('ADD', [aPt, bPt]);
  
  expect(resultPt.value).toBe(30n);
  expect(resultPt.source).toBeGreaterThan(3); // Not a buffer
  
  const placement = synthesizer.placements.list.find(p => p.id === resultPt.source);
  expect(placement?.name).toBe('ALU1');
  expect(placement?.usage).toBe('ADD');
});
```

---

### Example 9: Integration Test

```typescript
test('L2 transaction generates valid circuit', async () => {
  // Setup L2 transaction
  const tx = await createL2Transaction({ /* ... */ });
  const synthOpts = await createSynthesizerOptsForSimulationFromRPC({ /* ... */ });
  
  // Execute
  const evm = await EVM.create({ /* ... */ });
  const result = await evm.runCall({ /* ... */ });
  
  // Verify
  expect(result.execResult.exceptionError).toBeUndefined();
  expect(evm.synthesizer.placements.list.length).toBeGreaterThan(0);
  
  // Verify EdDSA verification placement exists
  const eddsaPlacement = evm.synthesizer.placements.list.find(
    p => p.name === 'EddsaVerify'
  );
  expect(eddsaPlacement).toBeDefined();
});
```

---

## Related Documentation

- [Synthesizer Concepts](./synthesizer-concepts.md)
- [Execution Flow](./synthesizer-execution-flow.md)
- [API Reference](./synthesizer-api-reference.md)
- [L2 State Channels](./synthesizer-l2-state-channels.md)

