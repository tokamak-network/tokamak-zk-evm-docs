# L2 State Channels: Integration Guide

This document provides a step-by-step guide to integrate L2 state channel functionality into your application using Tokamak Synthesizer.

---

## 📋 Prerequisites

Before starting, ensure you have:

1. **Tokamak zk-EVM Synthesizer** installed
2. **Alchemy or Infura RPC endpoint** for Ethereum mainnet
3. **EdDSA key pair** for L2 transaction signing
4. **L1 contract address** with registered storage keys

---

## 🚀 Quick Start

### Step 1: Generate L2 Key Pair

```typescript
import { randomBytes } from 'crypto';
import { getEddsaPublicKey } from 'synthesizer/crypto';

// Generate private key (32 bytes)
const privateKey = randomBytes(32);

// Derive public key
const publicKey = getEddsaPublicKey(privateKey);

console.log('Private Key:', privateKey.toString('hex'));
console.log('Public Key:', publicKey.toString('hex'));

// Derive L2 address
import { poseidon } from 'synthesizer/crypto';
const l2Address = poseidon(
  BigInt('0x' + publicKey.slice(0, 32).toString('hex')),
  BigInt('0x' + publicKey.slice(32, 64).toString('hex'))
) & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn;

console.log('L2 Address:', '0x' + l2Address.toString(16).padStart(40, '0'));
```

---

### Step 2: Create TokamakL2Tx

```typescript
import { TokamakL2Tx, eddsaSign_unsafe, getEddsaPublicKey } from 'synthesizer';
import { Address } from '@ethereumjs/util';

// 2.1: Create unsigned transaction
const txData = {
  nonce: 0n,
  gasLimit: 1000000n,
  to: Address.fromString('0xL1_CONTRACT_ADDRESS'),
  value: 0n,
  data: Buffer.from('a9059cbb...', 'hex') // Your calldata
};

const unsignedTx = TokamakL2Tx.fromTxData(txData);

// 2.2: Sign with EdDSA
const messageHash = unsignedTx.getHashedMessageToSign();
const signature = eddsaSign_unsafe(messageHash, privateKey);

// 2.3: Create signed transaction
const signedTx = unsignedTx.addEddsaSignature(signature, getEddsaPublicKey(privateKey));

console.log('Signed TX:', signedTx.serialize().toString('hex'));
```

---

### Step 3: Initialize Synthesizer with L2 Options

```typescript
import { createSynthesizerOptsForSimulationFromRPC } from 'synthesizer';

const synthOpts = await createSynthesizerOptsForSimulationFromRPC({
  // Mode
  mode: 'l2-state-channel',
  
  // RPC configuration
  l1ProviderUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY',
  
  // L1 contract information
  l1Address: '0xL1_CONTRACT_ADDRESS',
  l1ChannelNonce: 0n,
  
  // L2 transaction
  l2CallIdx: 0n,
  l2TxSerialized: signedTx.serialize(),
  
  // L2 state
  l2State: {
    registeredKeys: [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
    ],
    stateValues: [
      100n,  // Initial value for key 1
      200n,  // Initial value for key 2
    ]
  }
});
```

---

### Step 4: Execute Transaction

```typescript
import { EVM } from '@ethereumjs/evm';

// Create EVM with Synthesizer
const evm = await EVM.create({
  common: synthOpts.common,
  stateManager: synthOpts.stateManager,
  enableSynthesizer: true
});

// Execute transaction
const result = await evm.runCall({
  to: synthOpts.to,
  caller: synthOpts.from,
  data: synthOpts.data,
  gasLimit: synthOpts.gasLimit,
  value: synthOpts.value
});

console.log('Gas Used:', result.execResult.gasUsed);
console.log('Return Value:', result.execResult.returnValue.toString('hex'));
```

---

### Step 5: Export Circuit Files

```typescript
import fs from 'fs';

const synthesizer = evm.synthesizer;

// Export placement.json
synthesizer.exportPlacementJSON('./output/placement.json');

// Export wireMap.json
synthesizer.exportWireMapJSON('./output/wireMap.json');

// Get Merkle roots
const initialRoot = synthesizer._stateManager.initialMerkleTree.root;
const finalRoot = synthesizer._stateManager.getUpdatedMerkleTreeRoot();

console.log('Initial Root:', initialRoot.toString('hex'));
console.log('Final Root:', finalRoot.toString('hex'));

// Export summary
fs.writeFileSync('./output/summary.json', JSON.stringify({
  initialRoot: initialRoot.toString('hex'),
  finalRoot: finalRoot.toString('hex'),
  placementCount: synthesizer.placements.list.length,
  eddsaPublicKey: getEddsaPublicKey(privateKey).toString('hex')
}, null, 2));
```

---

### Step 6: Generate Proof (Backend)

```bash
# Navigate to backend prover
cd packages/backend/prove

# Run prover with circuit files
cargo run --release -- \
  --placement ../../output/placement.json \
  --wiremap ../../output/wireMap.json \
  --output ../../output/proof.json
```

---

### Step 7: Verify On-Chain

```javascript
// Submit proof to L1 verifier contract (Solidity)
contract.verifyAndUpdate(
  channelId,
  proof,
  initialRoot,
  finalRoot
);
```

---

## 📚 Complete Example: ERC-20 Transfer

```typescript
import {
  TokamakL2Tx,
  eddsaSign_unsafe,
  getEddsaPublicKey,
  createSynthesizerOptsForSimulationFromRPC
} from 'synthesizer';
import { EVM } from '@ethereumjs/evm';
import { Address } from '@ethereumjs/util';
import fs from 'fs';

async function main() {
  // 1. Setup
  const privateKey = Buffer.from('YOUR_EDDSA_PRIVATE_KEY', 'hex');
  const l1ContractAddress = '0xL1_CONTRACT_ADDRESS';
  const recipientAddress = '0xRECIPIENT_ADDRESS';
  const amount = 100n;
  
  // 2. Encode ERC-20 transfer calldata
  const functionSelector = 'a9059cbb'; // transfer(address,uint256)
  const calldata = Buffer.from(
    functionSelector +
    recipientAddress.slice(2).padStart(64, '0') +
    amount.toString(16).padStart(64, '0'),
    'hex'
  );
  
  // 3. Create and sign transaction
  const unsignedTx = TokamakL2Tx.fromTxData({
    nonce: 0n,
    gasLimit: 100000n,
    to: Address.fromString(l1ContractAddress),
    value: 0n,
    data: calldata
  });
  
  const messageHash = unsignedTx.getHashedMessageToSign();
  const signature = eddsaSign_unsafe(messageHash, privateKey);
  const signedTx = unsignedTx.addEddsaSignature(
    signature,
    getEddsaPublicKey(privateKey)
  );
  
  // 4. Initialize Synthesizer
  const synthOpts = await createSynthesizerOptsForSimulationFromRPC({
    mode: 'l2-state-channel',
    l1ProviderUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY',
    l1Address: l1ContractAddress,
    l1ChannelNonce: 0n,
    l2CallIdx: 0n,
    l2TxSerialized: signedTx.serialize(),
    l2State: {
      registeredKeys: [
        '0x0000000000000000000000000000000000000000000000000000000000000001', // Balance of sender
        '0x0000000000000000000000000000000000000000000000000000000000000002', // Balance of recipient
      ],
      stateValues: [
        1000n,  // Sender initial balance
        0n,     // Recipient initial balance
      ]
    }
  });
  
  // 5. Execute transaction
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
  
  if (result.execResult.exceptionError) {
    throw new Error(`Execution failed: ${result.execResult.exceptionError.error}`);
  }
  
  // 6. Export circuit files
  const synthesizer = evm.synthesizer;
  fs.mkdirSync('./output', { recursive: true });
  
  synthesizer.exportPlacementJSON('./output/placement.json');
  synthesizer.exportWireMapJSON('./output/wireMap.json');
  
  const initialRoot = synthesizer._stateManager.initialMerkleTree.root;
  const finalRoot = synthesizer._stateManager.getUpdatedMerkleTreeRoot();
  
  console.log('✅ Transaction executed successfully');
  console.log('Initial Root:', initialRoot.toString('hex'));
  console.log('Final Root:', finalRoot.toString('hex'));
  console.log('Gas Used:', result.execResult.gasUsed);
  console.log('Placements:', synthesizer.placements.list.length);
}

main().catch(console.error);
```

---

## 🔧 Advanced Configuration

### Custom RPC Provider

```typescript
import { JsonRpcProvider } from 'ethers';

const customProvider = new JsonRpcProvider(
  'https://your-custom-rpc-endpoint.com',
  { chainId: 1, name: 'mainnet' }
);

const synthOpts = await createSynthesizerOptsForSimulationFromRPC({
  mode: 'l2-state-channel',
  l1Provider: customProvider,  // Pass provider directly
  // ... other options
});
```

---

### Multiple Registered Keys

```typescript
const l2State = {
  registeredKeys: Array.from({ length: 64 }, (_, i) => 
    '0x' + (i + 1).toString(16).padStart(64, '0')
  ),
  stateValues: Array.from({ length: 64 }, () => 0n)
};
```

---

### Batch Transactions (Coming Soon)

```typescript
// Future API (not yet implemented)
const batch = await createBatchSynthesizer({
  transactions: [tx1, tx2, tx3],
  initialState,
  // ... options
});

const results = await batch.execute();
```

---

## 🛠️ Troubleshooting

### Error: "Invalid EdDSA signature"

**Cause**: Signature verification failed in `beforeMessage` phase.

**Solution**:
- Ensure you're using the correct private key
- Verify `messageHash` is computed correctly
- Check that `eddsaSign_unsafe` is using the same curve parameters

```typescript
// Debug signature
const msgHash = tx.getHashedMessageToSign();
const sig = eddsaSign_unsafe(msgHash, privateKey);
const pubKey = getEddsaPublicKey(privateKey);

const isValid = eddsaVerify(msgHash, pubKey, sig.randomizer, sig.signedHash);
console.log('Signature valid:', isValid);
```

---

### Error: "Storage key not registered"

**Cause**: Transaction tries to access a storage key that's not in `registeredKeys`.

**Solution**:
- Add the key to `l2State.registeredKeys`
- Or use L1 RPC fallback for non-registered keys (general storage)

```typescript
const l2State = {
  registeredKeys: [
    '0x0000...0001',
    '0x0000...0002',
    '0xYOUR_MISSING_KEY'  // Add this
  ],
  stateValues: [100n, 200n, 0n]
};
```

---

### Error: "Merkle root mismatch"

**Cause**: Initial Merkle root doesn't match on-chain state.

**Solution**:
- Fetch current state from L1 contract
- Ensure `stateValues` match on-chain data

```typescript
// Fetch state from L1
const contract = new Contract(l1Address, abi, provider);
const onChainRoot = await contract.getMerkleRoot(channelId);

// Verify against computed root
const stateManager = new TokamakL2StateManager({ /* ... */ });
const computedRoot = stateManager.initialMerkleTree.root;

if (computedRoot.toString('hex') !== onChainRoot.slice(2)) {
  throw new Error('Root mismatch!');
}
```

---

## 🔗 Related Resources

- [Architecture](architecture.md)
- [Transaction (TokamakL2Tx)](transaction.md)
- [State Management](state-management.md)
- [Cryptography](cryptography.md)
- [Testing](testing.md)

**Source Code Examples**:
- [Integration Test](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/test/l2-integration.test.ts)
- [RPC Helper](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/packages/frontend/synthesizer/src/interface/rpc/rpc.ts)

---

**Next**: See [Testing](testing.md) for test suites and verification procedures.

