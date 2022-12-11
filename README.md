# StealthPay contracts

On chain components of the [StealthPay protocol](../README.md).

## Development

This dev toolchain based on @paulkberg's [solidity-template](https://github.com/paulrberg/solidity-template) repo includes:

- [Hardhat](https://github.com/nomiclabs/hardhat): compile and run the smart contracts on a local development network
- [TypeChain](https://github.com/ethereum-ts/TypeChain): generate TypeScript types for smart contracts
- [Ethers](https://github.com/ethers-io/ethers.js/): renowned Ethereum library and wallet implementation
- [Waffle](https://github.com/EthWorks/Waffle): tooling for writing comprehensive smart contract tests
- [Solhint](https://github.com/protofire/solhint): linter
- [Solcover](https://github.com/sc-forks/solidity-coverage) code coverage
- [Prettier Plugin Solidity](https://github.com/prettier-solidity/prettier-plugin-solidity): code formatter

## Usage

### Pre Requisites

Before running any command, make sure to install dependencies

```sh
$ yarn install
```

### Compile

Compile the smart contracts with Hardhat:

```sh
$ yarn compile
```

### TypeChain

Compile the smart contracts and generate TypeChain artifacts:

```sh
$ yarn build
```

### Test

Run the Mocha tests:

```sh
$ yarn test
```


### Clean

Delete the smart contract artifacts, the coverage reports and the Hardhat cache:

```sh
$ yarn clean
```

### Deploy
```sh
$ yarn deploy
$ yarn deploy:registry
```
- Verify contact
- 1.reading artfacts->build-info/*.json-->input:{XXXX} 
- 2.save->xxxx.json
- 3.etherscan.io->upload JSON

## Question
node.js v18 for windows
```sh
"deploy": "SET NODE_OPTIONS=--openssl-legacy-provider && yarn build && hardhat run scripts/deploy.js",
"deploy:registry": "SET NODE_OPTIONS=--openssl-legacy-provider && yarn build && hardhat run scripts/deploy-registry.js"
```

node.js v18 for Linux
```sh
"deploy": "export NODE_OPTIONS=--openssl-legacy-provider && yarn build && hardhat run scripts/deploy.js",
"deploy:registry": "export NODE_OPTIONS=--openssl-legacy-provider && yarn build && hardhat run scripts/deploy-registry.js"
```
## npx hardhat verify
   ```sh
   #npx hardhat verify --contract contracts/ERC20Token.sol:ERC20Token --network goerli 0xxxx021221212 \"USD Coin\" \"USDC\""
   ```
   - CMD: npx hardhat verify
   - contract: --contract contracts/ERC20Token.sol:ERC20Token
   - contract address and parameters: --network goerli 0xxxx021221212 \"USD Coin\" \"USDC\""

　The parameters must be the same as those published in the contract
    


