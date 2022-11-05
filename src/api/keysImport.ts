import {
  createJWK,
  importKeyPrivatePem,
  importKeyPublicPem,
  JWK,
} from '@windingtree/org.id-auth/dist/keys';
import { regexp } from '@windingtree/org.id-utils';
import { parseDid } from '@windingtree/org.id-utils/dist/parsers';
import {
  ORGJSON,
  VerificationMethodReference,
} from '@windingtree/org.json-schema/types/org.json';
import {
  createVerificationMethodWithBlockchainAccountId,
  createVerificationMethodWithKey,
} from '@windingtree/org.json-utils';
import { utils as ethersUtils } from 'ethers';
import { DateTime } from 'luxon';
import prompts from 'prompts';
import {
  ProjectKeysReference,
  ProjectOrgIdsReference,
} from '../schema/types/project';
import { printInfo } from '../utils/console';
import { ParsedArgv } from '../utils/env';
import { AwsKmsSigner } from './awsKms';
import { encrypt, promptKeyPair, promptOrgId } from './common';
import { read, write } from './fs';
import { addKeyPairToProject, addOrgIdToProject } from './project';
import { manageApisKeysStorage } from './projectConfig';

export interface ProjectKeysReferenceWithJwk extends ProjectKeysReference {
  publicJwk: JWK;
  privateJwk: JWK;
}

export type ProjectKeys<T> = T extends ProjectKeysReferenceWithJwk
  ? ProjectKeysReferenceWithJwk
  : ProjectKeysReference;

export interface AwsKmsKeyConfig {
  keyId: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Import of Ethereum keys
export const importEthereum = async (
  basePath: string
): Promise<ProjectKeysReference> => {
  const { tag, accountAddress, privateKey } = await prompts([
    {
      type: 'text',
      name: 'tag',
      message: 'Please enter an unique key tag',
    },
    {
      type: 'text',
      name: 'accountAddress',
      message: 'Please enter an Ethereum account address',
      validate: (value) =>
        regexp.ethereumAddress.exec(value) !== null
          ? true
          : 'Value must be a valid Ethereum address',
    },
    {
      type: 'password',
      name: 'privateKey',
      message: 'Please enter a private key for the Ethereum account',
    },
  ]);

  if (!accountAddress || !privateKey) {
    throw new Error(
      'Both the account address and its private key must be provided'
    );
  }

  const { password } = await prompts({
    type: 'password',
    name: 'password',
    message: 'Please provide an encryption password for keys storage',
    validate: (value) =>
      /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z])/.exec(value)
        ? true
        : 'Password must consist of a minimum of eight characters, at least one letter and one number',
  });

  const keyPairRecord = await addKeyPairToProject(basePath, {
    type: 'ethereum',
    tag,
    publicKey: ethersUtils.getAddress(accountAddress),
    privateKey: encrypt(privateKey, password),
    date: DateTime.now().toISO(),
  });

  printInfo(
    `Key pair of type "ethereum" with tag "${tag}" has been successfully imported\n`
  );

  return keyPairRecord;
};

export const createVerificationMethodWithAwsKms = async (
  verificationMethodId: string,
  controller: string,
  keyConfig: AwsKmsKeyConfig,
  network: string
): Promise<VerificationMethodReference> => {
  const signer = new AwsKmsSigner(keyConfig.keyId, {
    region: keyConfig.region,
    credentials: {
      accessKeyId: keyConfig.accessKeyId,
      secretAccessKey: keyConfig.secretAccessKey,
    },
  });
  const address = await signer.getAddress();

  return createVerificationMethodWithBlockchainAccountId(
    verificationMethodId,
    controller,
    'eip155',
    network,
    address
  );
};

export const addToOrgJson = async (
  basePath: string,
  args: ParsedArgv
): Promise<void> => {
  printInfo('Adding of verification method to an ORG.JSON...\n');

  if (!args['--keyType']) {
    throw new Error('Key pair type must be provided using "--keyType" option');
  }

  const orgId = await promptOrgId(basePath);

  if (!orgId) {
    throw new Error('No registered ORGiDs found in the project');
  }

  const { did, orgJson, salt, owner, created } = orgId;

  if (!orgJson) {
    throw new Error(
      `Link to the ORG.JSON file not found for the selected ${did}`
    );
  }

  const orgJsonObj = await read<ORGJSON>(basePath, orgJson, true);

  const controller = args['--controller'] || did;

  const parsedController = parseDid(controller);

  if (!parsedController.did || !parsedController.network) {
    throw new Error(`Invalid controller did: ${controller}`);
  }

  const projectKey = await promptKeyPair(basePath, args['--keyType']);

  if (!projectKey) {
    throw new Error('Key pair not been selected');
  }

  let verificationMethod: VerificationMethodReference;
  const verificationMethodId = `${did}#${projectKey.tag}`;

  switch (args['--keyType']) {
    case 'ethereum':
      verificationMethod = createVerificationMethodWithBlockchainAccountId(
        verificationMethodId,
        controller,
        'eip155',
        parsedController.network,
        projectKey.publicKey
      );
      break;
    case 'pem':
      verificationMethod = await createVerificationMethodWithKey(
        verificationMethodId,
        controller,
        projectKey.publicKey as unknown as JWK
      );
      break;
    case 'kmsEthereum':
      verificationMethod = await createVerificationMethodWithAwsKms(
        verificationMethodId,
        controller,
        projectKey.privateKey as unknown as AwsKmsKeyConfig,
        parsedController.network
      );
      break;
    default:
      throw new Error(
        `It is not possible to create verification method using "${args['--keyType']}" type of key`
      );
  }

  if (!orgJsonObj.verificationMethod) {
    orgJsonObj.verificationMethod = [];
  }

  const isMethodExists = orgJsonObj.verificationMethod.find(
    (v) => v.id === verificationMethodId
  );

  if (isMethodExists) {
    orgJsonObj.verificationMethod = orgJsonObj.verificationMethod.map((v) => {
      if (v.id) {
        return verificationMethod;
      }
      return v;
    });
  } else {
    orgJsonObj.verificationMethod.push(verificationMethod);
  }

  if (args['--delegated']) {
    const delegates = new Set(orgJsonObj.capabilityDelegation);
    delegates.add(verificationMethodId);
    orgJsonObj.capabilityDelegation = Array.from(delegates);
  }

  const outputOrgJsonFile = await write(
    basePath,
    orgJson,
    JSON.stringify(orgJsonObj, null, 2)
  );

  const orgIdRecord: ProjectOrgIdsReference = {
    did,
    salt,
    owner,
    orgJson: outputOrgJsonFile,
    created,
    date: DateTime.now().toISO(),
  };

  await addOrgIdToProject(basePath, orgIdRecord);

  printInfo(
    `"verificationMethod" with Id ${verificationMethod.id} has been added.\n` +
      `ORG.JSON file for ${did} has been successfully updated in the project.`
  );
};

// Import keys pair in PEM format
export const importPem = async (
  basePath: string,
  args: ParsedArgv
): Promise<ProjectKeysReferenceWithJwk> => {
  if (!args['--pubPem'] || !args['--privPem']) {
    throw new Error(
      'Both paths to pem-formatted keys must be provided using "--pubPem" and "--privPem" options'
    );
  }

  const { tag } = await prompts([
    {
      type: 'text',
      name: 'tag',
      message: 'Please enter an unique key tag',
    },
  ]);

  const pemPublicKeyRaw = await read(basePath, args['--pubPem']);
  const pemPrivateKeyRaw = await read(basePath, args['--privPem']);

  // Import into KeyLike format (binary)
  const pemPublicKey = await importKeyPublicPem(pemPublicKeyRaw);
  const pemPrivateKey = await importKeyPrivatePem(pemPrivateKeyRaw);

  const publicJwk = await createJWK(pemPublicKey);
  const privateJwk = await createJWK(pemPrivateKey);

  const { password } = await prompts({
    type: 'password',
    name: 'password',
    message: 'Please provide an encryption password for keys storage',
    validate: (value) =>
      /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z])/.exec(value)
        ? true
        : 'Password must consist of a minimum of eight characters, at least one letter and one number',
  });

  const keyPairRecord = await addKeyPairToProject(basePath, {
    type: 'pem',
    tag,
    publicKey: encrypt(JSON.stringify(publicJwk), password),
    privateKey: encrypt(JSON.stringify(privateJwk), password),
    date: DateTime.now().toISO(),
  });

  printInfo(
    `Key pair of type "secp256k1" (converted from PEM format) with tag "${tag}" has been successful imported\n`
  );

  return {
    ...keyPairRecord,
    publicJwk,
    privateJwk,
  };
};

export const importMultisig = async (
  basePath: string
): Promise<ProjectKeysReference> => {
  const { tag, multisig } = await prompts([
    {
      type: 'text',
      name: 'tag',
      message: 'Please enter an unique key tag',
    },
    {
      type: 'text',
      name: 'multisig',
      message: 'Please enter Safe wallet address (with net prefix)',
    },
  ]);

  const keyPairRecord = await addKeyPairToProject(basePath, {
    type: 'multisig',
    tag,
    publicKey: '',
    privateKey: '',
    multisig,
    date: DateTime.now().toISO(),
  });

  printInfo(`Multisig "key" with tag "${tag}" has been successful imported\n`);

  return keyPairRecord;
};

export const importKmsEthereum = async (basePath: string): Promise<void> => {
  const { tag, keyId, region, accessKeyId, secretAccessKey } = await prompts([
    {
      type: 'text',
      name: 'tag',
      message: 'Please enter an unique key tag',
      validate: (value) =>
        typeof value === 'string' && value !== ''
          ? true
          : 'This field cannot be empty',
    },
    {
      type: 'password',
      name: 'keyId',
      message: 'Please enter an AWS KMS Key Id',
      validate: (value) =>
        typeof value === 'string' && value !== ''
          ? true
          : 'This field cannot be empty',
    },
    {
      type: 'password',
      name: 'region',
      message: 'Please enter an AWS region',
      validate: (value) =>
        typeof value === 'string' && value !== ''
          ? true
          : 'This field cannot be empty',
    },
    {
      type: 'password',
      name: 'accessKeyId',
      message: 'Please enter an AWS KMS access key Id',
      validate: (value) =>
        typeof value === 'string' && value !== ''
          ? true
          : 'This field cannot be empty',
    },
    {
      type: 'password',
      name: 'secretAccessKey',
      message: 'Please enter an AWS KMS secret access key',
      validate: (value) =>
        typeof value === 'string' && value !== ''
          ? true
          : 'This field cannot be empty',
    },
  ]);

  if (!keyId || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'All of "keyId", "region", "accessKeyId" and "secretAccessKey" must be provided'
    );
  }

  const { password } = await prompts({
    type: 'password',
    name: 'password',
    message: 'Please provide an encryption password for keys storage',
    validate: (value) =>
      /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z])/.exec(value)
        ? true
        : 'Password must consist of a minimum of eight characters, at least one letter and one number',
  });

  await addKeyPairToProject(basePath, {
    type: 'kmsEthereum',
    tag,
    publicKey: '',
    privateKey: encrypt(
      JSON.stringify({
        keyId,
        region,
        accessKeyId,
        secretAccessKey,
      }),
      password
    ),
    date: DateTime.now().toISO(),
  });

  printInfo(
    `Key pair of type "kmsEthereum" with tag "${tag}" has been successfully imported\n`
  );
};

// Import key
export const keysImport = async (
  basePath: string,
  args: ParsedArgv
): Promise<void> => {
  if (!args['--keyType']) {
    throw new Error('Key pair type must be provided using "--keyType" option');
  }

  switch (args['--keyType']) {
    case 'ethereum':
      await importEthereum(basePath);
      break;
    case 'pem':
      await importPem(basePath, args);
      break;
    case 'multisig':
      await importMultisig(basePath);
      break;
    case 'kmsEthereum':
      await importKmsEthereum(basePath);
      break;
    case 'api':
      await manageApisKeysStorage(basePath);
      break;
    default:
      throw new Error(`Unknown key pair type: "${args['--keyType']}"`);
  }
};
