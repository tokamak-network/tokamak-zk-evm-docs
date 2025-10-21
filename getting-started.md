# Getting Started

This guide will help you download and run Tokamak zk-EVM tools.

## Download

We recommend downloading Tokamak zk-EVM packages directly from GitHub:

- **Core Package (Full Node)**: [https://github.com/tokamak-network/Tokamak-zk-EVM/releases](https://github.com/tokamak-network/Tokamak-zk-EVM/releases)
- **GUI Playground**: [https://github.com/tokamak-network/Tokamak-zk-EVM-playgrounds/releases](https://github.com/tokamak-network/Tokamak-zk-EVM-playgrounds/releases)
- **CLI Tool**: [https://github.com/tokamak-network/create-tokamak-zk-evm](https://github.com/tokamak-network/create-tokamak-zk-evm)

**Core Package** contains the full Synthesizer compiler and proving system.

**GUI Playground** provides an interactive desktop application for visualizing the proof generation pipeline.

**CLI Tool** offers a command-line interface for quick proof generation and verification.

All packages contain the necessary components to generate and verify zero-knowledge proofs for Ethereum transactions.

## Which Version to Download?

Download the latest version matching your operating system and processor architecture.

- **Core Package**: Suitable for developers and server deployments
- **GUI Playground**: Preferable for learning and visualization
- **CLI Tool**: Best for quick testing and integration

## Why Prefer GitHub?

- Releases appear first on GitHub
- Direct access to source code and release notes
- Community-driven issue tracking and discussions
- Transparent development process

## Quick Start

### Using the Core Package

```bash
# Clone the repository
git clone https://github.com/tokamak-network/Tokamak-zk-EVM.git
cd Tokamak-zk-EVM

# Install and setup
./tokamak-cli --install <YOUR_ALCHEMY_API_KEY>

# Generate a proof
./tokamak-cli --prove <TX_HASH> <OUTPUT_PATH>

# Verify a proof
./tokamak-cli --verify <PROOF_PATH>
```

### Using the CLI Tool

```bash
# Install globally via npm
npm install -g create-tokamak-zk-evm

# Initialize a new project
npx create-tokamak-zk-evm init my-project
cd my-project

# Generate a proof
tokamak-zk-evm prove <TX_HASH>
```

For detailed installation instructions, prerequisites, and platform-specific setup, please refer to the README files in each repository.

## System Requirements

- **Node.js**: >= 18.x (Core) or >= 20.x (CLI)
- **Memory**: < 10GB RAM
- **Platform**: Windows (Docker), macOS, or Linux
- **Optional**: NVIDIA GPU with CUDA support for acceleration

## Performance

The Tokamak zk-SNARK backend provides:

- **Memory**: < 10GB required
- **Time**: 1-2 minutes proof generation
- **Acceleration**: CUDA (NVIDIA GPU) or Apple Silicon support
- **Optimization**: MSM and NTT accelerated by ICICLE APIs

## Security Notice

**Important:** Always use a **free, non-sensitive API key** for testing. Do not use production credentials.

The tools may write your RPC endpoint to local configuration files. Delete these files after use and ensure they are not committed to version control.

## Next Steps

- Learn about [Synthesizer concepts](frontend/synthesizer/synthesizer-concepts.md)
- Explore the [Synthesizer architecture](frontend/synthesizer/synthesizer-architecture.md)
- Review [supported opcodes](frontend/synthesizer/synthesizer-opcodes.md)
- Read the [Tokamak zk-SNARK paper](https://eprint.iacr.org/2024/507)

## Additional Resources

- **Academic Paper**: [https://eprint.iacr.org/2024/507](https://eprint.iacr.org/2024/507)
- **Contributing Guidelines**: [https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/CONTRIBUTING.md](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/CONTRIBUTING.md)
- **Community Support**: [GitHub Issues](https://github.com/tokamak-network/Tokamak-zk-EVM/issues)
