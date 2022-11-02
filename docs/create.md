# Creation of ORGiD with or without delegated key

> ORGiD VC can be signed using delegated key (verification method). Here the steps of how to make it in the right way

> If you want to create an ORGiD that uses `multisig` ownership type please [follow this guide](./create-multisig.md).

## Prerequisites

### Network providers

To be able to create ORGiDs in the OrgId smart contract on the proper network the CLI must be configured with a proper network provider.

For example, if you want to create an ORGiD in Goerli network you must add configuration for a network provider of this network.

To add network provider you have to use this command:

```bash
orgid --operation config --record networkProviders
```

> You will be prompted for a network Id. You have to enter a proper chain Id of the network (e.q. `5` for Goerli) which configuration you are adding.

### API keys

To be able to deploy files to IPFS you have to import an API key of the Web3Storage service. This key must be generated according to this guide: https://web3.storage/docs/how-tos/generate-api-token/

To import this API key in the CLI you have to use this command:

```bash
orgid --operation keys:import --keyType api
```

> Important. When you add an API key you have to use the API key Id `w3s` (!!!).

### Signing keys

As minimum you need to add an `ethereum` type of key pair to be able to send transactions from CLI.

To import this kind of key pair you need to use the following command:

```bash
orgid --operation keys:import --keyType ethereum
```

Imported key pair can be used for transaction sending and signing of ORGiD VC as well. But if you want to use for the creation of an ORGiD VC a `secp256k1` type of key (generated in PEM format) you have to import this key into the CLI. Required instructions about generation and import you can find below.

## Generation and registration of keys

### Registration of EOA key pair

### Generate keys in PEM format

```bash
openssl ecparam -name secp256k1 -genkey -out ./key.pem
openssl pkcs8 -in ./key.pem -topk8 -nocrypt -out ./pkcs8.pem
openssl ec -in ./pkcs8.pem -pubout > ./key.pub
```

### Import EOA keys into project

```bash
orgid --operation keys:import --keyType ethereum
```

### Import PEM keys into project

```bash
orgid --operation keys:import --keyType pem --pubPem ./key.pub --privPem ./pkcs8.pem
```

> Important! You can import `pkcs8`-formatted private key only

## Bootstrap a new ORGiD

```bash
orgid --operation bootstrap --output ./rawOrgId.json
```

> Important! During bootstrap process you must select a key tag of `ethereum` type, that you imported earlier. This key will be used as owner of an ORGiD.

## Add your key as delegate

> Use `--delegated true` option only if you want to use delegated signing feature of ORGiD.

> The delegation feature of ORGiD allows delegating a possibility to sign an ORGiD VC to a third-party key that is different from the owner's key.

```bash
orgid --operation keys:add --keyType ethereum --delegated true
orgid --operation keys:add --keyType pem --delegated true
```

## Create ORGiD VC

```bash
orgid --operation orgIdVc --output ./orgIdVc.json --deploy ipfs
```

## Create ORGiD using multisig

```bash
orgid --operation create
```
