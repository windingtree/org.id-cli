import { KnownProvider, OrgIdContract } from '@windingtree/org.id-core';
import { http, parsers, regexp } from '@windingtree/org.id-utils';
import { ORGJSON } from '@windingtree/org.json-schema/types/org.json';
import { ORGJSONVCNFT } from '@windingtree/org.json-schema/types/orgVc';
import { AES, enc } from 'crypto-js';
import {
  BigNumber,
  providers,
  Signer,
  utils as etherUtils,
  Wallet,
} from 'ethers';
import prompts from 'prompts';
import {
  ProjectKeysReference,
  ProjectOrgIdsReference,
} from '../schema/types/project';
import { AwsKmsSigner } from './awsKms';
import { read } from './fs';
import { getFromIpfs } from './ipfs';
import { AwsKmsKeyConfig } from './keysImport';
import {
  getApiKeyById,
  getKeyPairsFromProject,
  getNetworkProviderById,
  getOrgIdsFromProject,
} from './project';

export interface ParsedDid {
  did: string;
  method: string;
  network: string;
  orgId: string;
  query?: string;
  fragment?: string;
}

export interface DidGroupedCheckResult extends RegExpExecArray {
  groups: {
    did: string;
    method: string;
    network?: string;
    id: string;
    query?: string;
    fragment?: string;
  };
}

export interface BlockchainNetworkConfig {
  name: string;
  id: string;
  address: string;
}

export interface OrgIdApi {
  provider: KnownProvider;
  orgIdContract: OrgIdContract;
  signer: Signer;
  id: string;
  gasPrice?: BigNumber;
}

export const blockchainNetworks: BlockchainNetworkConfig[] = [
  {
    name: 'Sokol xDAI Testnet',
    id: '77',
    address: '0xDd1231c0FD9083DA42eDd2BD4f041d0a54EF7BeE',
  },
  {
    name: 'Columbus',
    id: '502',
    address: '0xd8b75be9a47ffab0b5c27a143b911af7a7bf4076',
  },
  {
    name: 'Goerli',
    id: '5',
    address: '0xe02dF24d8dFdd37B21690DB30F4813cf6c4D9D93',
  },
  {
    name: 'Polygon',
    id: '137',
    address: '0x8a093Cb94663994d19a778c7EA9161352a434c64',
  },
  {
    name: 'Gnosis Chain',
    id: '100',
    address: '0xb63d48e9d1e51305a17F4d95aCa3637BBC181b44',
  },
];

// Extract ORGiD smart contract address from networks list
export const getSupportedNetworkConfig = (
  id: string
): BlockchainNetworkConfig => {
  const networkConfig = blockchainNetworks.filter((b) => b.id === id)[0];

  if (!networkConfig) {
    throw new Error(`Network #${id} not supported by ORGiD protocol yet`);
  }

  return networkConfig;
};

// Encrypts the data
export const encrypt = (data: string, password: string | unknown): string => {
  try {
    return AES.encrypt(data, password as string).toString();
  } catch (error) {
    throw Error('Unable to encrypt');
  }
};

// Decrypts the data
export const decrypt = (encData: string, password: string): string => {
  let decrypted: string;
  try {
    decrypted = AES.decrypt(encData, password).toString(enc.Utf8);
    if (decrypted === '') {
      throw Error('Decrypted data is empty');
    }
  } catch (error) {
    throw Error('Unable to decrypt');
  }
  return decrypted;
};

// Prompt for registered key pair
export const promptKeyPair = async (
  basePath: string,
  type?: string
): Promise<ProjectKeysReference | undefined> => {
  const keyPairRecords = await getKeyPairsFromProject(basePath, type);

  const { keyPair } = await prompts({
    type: 'select',
    name: 'keyPair',
    message: 'Choose a key',
    choices: keyPairRecords.map((k) => ({
      title: k.tag,
      value: k,
    })),
    initial: 0,
  });

  if (!keyPair) {
    throw new Error('Key pair not been selected');
  }

  const keys = keyPair as ProjectKeysReference;

  if (keys.type !== 'multisig') {
    const { password } = await prompts({
      type: 'password',
      name: 'password',
      message: `Enter the password for the key pair "${keys.tag}"`,
    });

    if (keys.type === 'pem') {
      try {
        keys.publicKey = JSON.parse(decrypt(keys.publicKey, password));
        keys.privateKey = JSON.parse(decrypt(keys.privateKey, password));
      } catch (err) {
        throw new Error(`Unable to decode key pair with tag: ${keys.tag}`);
      }
    } else if (keys.type === 'kmsEthereum') {
      keys.privateKey = JSON.parse(decrypt(keys.privateKey, password));
    } else {
      keys.privateKey = decrypt(keys.privateKey, password);
    }
  }

  return keys;
};

// Prompt for ORGiDs
export const promptOrgId = async (
  basePath: string,
  created?: boolean
): Promise<ProjectOrgIdsReference> => {
  const orgIdsRecords = await getOrgIdsFromProject(basePath);

  if (orgIdsRecords.length === 0) {
    throw new Error(`Registered ORGIDs are found`);
  }

  const { orgId } = (await prompts({
    type: 'select',
    name: 'orgId',
    message: 'Choose a registered ORGiD DID',
    choices: orgIdsRecords
      .filter((o) => {
        if (created !== undefined) {
          return !!o.created === created;
        }
        return true;
      })
      .map((o: ProjectOrgIdsReference) => ({
        title: o.did,
        value: o,
      })),
    initial: 0,
  })) as { orgId: ProjectOrgIdsReference };

  return orgId;
};

// Parse DID
export const parseDid = (did: string): ParsedDid => {
  const groupedCheck = regexp.didGrouped.exec(did) as DidGroupedCheckResult;

  if (!groupedCheck || !groupedCheck.groups || !groupedCheck.groups.did) {
    throw new Error(`Invalid DID format: ${did}`);
  }

  const { method, network, id, query, fragment } = groupedCheck.groups;

  return {
    did,
    method,
    network: network || '1', // Mainnet is default value
    orgId: id,
    query,
    fragment,
  };
};

// Get registered provider from project
export const getEthersProvider = async (
  basePath: string,
  network: string
): Promise<providers.JsonRpcProvider> => {
  let providerUri: string | undefined;

  const { uri, encrypted } = await getNetworkProviderById(basePath, network);

  if (!uri) {
    throw new Error(
      `Network provider URI for the network #${network} is not found. Please add it to the project config using operation "--config --record networkProviders"`
    );
  }

  if (encrypted) {
    const { password } = await prompts({
      type: 'password',
      name: 'password',
      message: `Enter the password for the encrypted network provided URI`,
    });

    providerUri = decrypt(uri, password);
  } else {
    providerUri = uri;
  }

  return new providers.JsonRpcProvider(providerUri);
};

// Get registered API key
export const getApiKey = async (
  basePath: string,
  id: string
): Promise<string> => {
  let apiKey: string | undefined;

  const { key, encrypted } = await getApiKeyById(basePath, id);

  if (!key) {
    throw new Error(
      `API key #${id} is not found. Please add it to the project config using operation "--config --record apiKeys"`
    );
  }

  if (encrypted) {
    const { password } = await prompts({
      type: 'password',
      name: 'password',
      message: `Enter the password for the encrypted API key`,
    });

    apiKey = decrypt(key, password);
  } else {
    apiKey = key;
  }

  return apiKey;
};

// Create OrgId contract instance
export const createOrgIdInstance = async (
  basePath: string,
  orgId: ProjectOrgIdsReference
): Promise<OrgIdContract> => {
  if (!orgId || !orgId.orgJson) {
    throw new Error('Chosen ORGiD does not have registered ORG.JSON yet.');
  }

  const orgJsonSource = (await read(basePath, orgId.orgJson, true)) as ORGJSON;

  const { network } = parseDid(orgJsonSource.id);
  const networkConfig = getSupportedNetworkConfig(network);
  const provider = await getEthersProvider(basePath, network);

  return new OrgIdContract(networkConfig.address, provider);
};

// Prepare an ORGiD API for transactions on the ORG.JSON basis
export const prepareOrgIdApi = async (
  basePath: string,
  orgId: ProjectOrgIdsReference,
  keyPair: ProjectKeysReference,
  useAwsKmsSigner = false
): Promise<OrgIdApi> => {
  const { orgJson, owner } = orgId;

  if (!orgJson) {
    throw new Error('Chosen ORGiD does not have registered ORG.JSON yet.');
  }

  const orgJsonSource = (await read(basePath, orgJson, true)) as ORGJSON;

  const { network, orgId: id } = parseDid(orgJsonSource.id);
  const networkConfig = getSupportedNetworkConfig(network);
  const provider = await getEthersProvider(basePath, network);

  if (!keyPair) {
    throw new Error('Unable to get registered key pair');
  }

  let signer: Signer;

  if (useAwsKmsSigner) {
    const config = keyPair.privateKey as unknown as AwsKmsKeyConfig;
    signer = new AwsKmsSigner(
      config.keyId,
      {
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      },
      provider
    );
  } else {
    signer = new Wallet(keyPair.privateKey, provider);
  }

  const signerAddress = await signer.getAddress();

  if (signerAddress !== etherUtils.getAddress(owner)) {
    throw new Error(
      `The registered key has a different address "${signerAddress}" than the ORGiD owner "${owner}"`
    );
  }

  const orgIdContract = new OrgIdContract(networkConfig.address, provider);

  const { gasPrice } = await prompts([
    {
      type: 'select',
      name: 'setGasPrice',
      message: `Do you want to define your own Gas price for transaction?`,
      choices: [
        {
          title: 'Yes',
          value: true,
        },
        {
          title: 'No',
          value: false,
        },
      ],
      initial: 0,
    },
    {
      type: (prevChoice) => (prevChoice ? 'text' : null),
      name: 'gasPrice',
      message: 'Set gas price (GWEI)',
    },
  ]);

  return {
    provider,
    orgIdContract,
    signer,
    id,
    gasPrice: gasPrice ? etherUtils.parseUnits(gasPrice, 'gwei') : undefined,
  };
};

export const downloadOrgIdVc = async (
  basePath: string,
  path: string
): Promise<ORGJSONVCNFT> => {
  const { uri, type } = parsers.parseUri(path);

  switch (type) {
    case 'ipfs':
      return (await getFromIpfs(basePath, uri)) as ORGJSONVCNFT;
    case 'http':
      return (await http.request(uri, 'GET')) as ORGJSONVCNFT;
    default:
      throw new Error(`Unknown ORGiD VC URI type ${type}`);
  }
};
