# Frontend

The frontend of Tokamak zk-EVM consists of compiler tools that convert Ethereum transactions and blocks into Tokamak zk-SNARK circuits. This section covers the core frontend components and their documentation.

---

## Components

### [Synthesizer](synthesizer.md)

The Synthesizer is the main frontend compiler that processes Ethereum transactions and generates wire maps for Tokamak zk-SNARK proof generation.

**Documentation:**

- [Concepts](synthesizer/synthesizer-concepts.md) - Fundamental concepts and architecture
- [Execution Flow](synthesizer/synthesizer-execution-flow.md) - Step-by-step transaction processing
- [Code Architecture](synthesizer/synthesizer-architecture.md) - Code structure and implementation details
- [Data Structures](synthesizer/synthesizer-data-structure.md) - Core data types (DataPt, StackPt, MemoryPt)
- [Opcodes](synthesizer/synthesizer-opcodes.md) - EVM opcode implementation reference

**Quick Links:**

- [GitHub Repository](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/synthesizer)
- [Official Documentation](https://tokamak.notion.site/Synthesizer-documentation-164d96a400a3808db0f0f636e20fca24)

---

## Related Components

### QAP Compiler

The QAP Compiler manages the library of fundamental subcircuits used by the Synthesizer. These subcircuits implement EVM operations for 256-bit words.

- [GitHub Repository](https://github.com/tokamak-network/Tokamak-zk-EVM/tree/main/packages/frontend/qap-compiler)

---

## Additional Resources

- **Research Paper**: [Tokamak zk-SNARK](https://eprint.iacr.org/2024/507)
- **Main Repository**: [Tokamak-zk-EVM](https://github.com/tokamak-network/Tokamak-zk-EVM)
- **Backend Documentation**: Coming soon
