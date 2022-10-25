import type { ParsedArgv } from '../utils/env';
import type {
  ProjectKeysReference, ProjectOrgIdsReference
} from '../schema/types/project';
import prompts from 'prompts';
import { regexp } from '@windingtree/org.id-utils';
import { DateTime } from  'luxon';
import { utils as ethersUtils } from 'ethers';
import {
  addKeyPairToProject, addOrgIdToProject
} from './project';
import { printInfo } from '../utils/console';
import { encrypt, promptOrgId } from './common';
import {
  createJWK,
  importKeyPrivatePem,
  importKeyPublicPem,
  JWK
} from '@windingtree/org.id-auth/dist/keys';
import { read, write } from './fs';
import { createVerificationMethodWithBlockchainAccountId, createVerificationMethodWithKey } from '@windingtree/org.json-utils';
import { parseDid } from '@windingtree/org.id-utils/dist/parsers';
import { ORGJSON, VerificationMethodReference } from '@windingtree/org.json-schema/types/org.json';

export interface ProjectKeysReferenceWithJwk extends ProjectKeysReference {
  publicJwk: JWK,
  privateJwk: JWK
}

export type ProjectKeys<T> = T extends ProjectKeysReferenceWithJwk ? ProjectKeysReferenceWithJwk : ProjectKeysReference;

// Import of Ethereum keys
export const importEthereum = async (basePath: string): Promise<ProjectKeysReference> => {
  const { tag, accountAddress, privateKey } = await prompts([
    {
      type: 'text',
      name: 'tag',
      message: 'Please enter an unique key tag'
    },
    {
      type: 'text',
      name: 'accountAddress',
      message: 'Please enter an Ethereum account address',
      validate: value =>
          regexp.ethereumAddress.exec(value) !== null
            ? true
            : 'Value must be a valid Ethereum address'
    },
    {
      type: 'password',
      name: 'privateKey',
      message: 'Please enter a private key for the Ethereum account',
    }
  ]);

  if (!accountAddress || ! privateKey) {
    throw new Error(
      'Both the account address and its private key must be provided'
    );
  }

  const { password } = await prompts(
    {
      type: 'password',
      name: 'password',
      message: 'Please provide an encryption password for keys storage',
      validate: value =>
        /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z])/.exec(value)
          ? true
          : 'Password must consist of a minimum of eight characters, at least one letter and one number'
    }
  );

  const keyPairRecord = await addKeyPairToProject(
    basePath,
    {
      type: 'ethereum',
      tag,
      publicKey: ethersUtils.getAddress(accountAddress),
      privateKey: encrypt(privateKey, password),
      date: DateTime.now().toISO()
    }
  );

  printInfo(
    `Key pair of type "ethereum" with tag "${tag}" has been successfully imported\n`
  );

  return keyPairRecord;
};

// Import keys pair in PEM format
export  const importPem = async (
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
      message: 'Please enter an unique key tag'
    }
  ]);

  const pemPublicKeyRaw = await read(basePath, args['--pubPem']);
  const pemPrivateKeyRaw = await read(basePath, args['--privPem']);

  // Import into KeyLike format (binary)
  const pemPublicKey = await importKeyPublicPem(pemPublicKeyRaw);
  const pemPrivateKey = await importKeyPrivatePem(pemPrivateKeyRaw);

  const publicJwk = await createJWK(pemPublicKey);
  const privateJwk = await createJWK(pemPrivateKey);

  const { password } = await prompts(
    {
      type: 'password',
      name: 'password',
      message: 'Please provide an encryption password for keys storage',
      validate: value =>
        /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z])/.exec(value)
          ? true
          : 'Password must consist of a minimum of eight characters, at least one letter and one number'
    }
  );

  const keyPairRecord = await addKeyPairToProject(
    basePath,
    {
      type: 'pem',
      tag,
      publicKey: encrypt(JSON.stringify(publicJwk), password),
      privateKey: encrypt(JSON.stringify(privateJwk), password),
      date: DateTime.now().toISO()
    }
  );

  printInfo(
    `Key pair of type "secp256k1" (converted from PEM format) with tag "${tag}" has been successful imported\n`
  );

  return {
    ...keyPairRecord,
    publicJwk,
    privateJwk
  };
};

// Import key
export const keysImport = async (
  basePath: string,
  args: ParsedArgv
): Promise<void> => {

  if (!args['--keyType']) {
    throw new Error(
      'Key pair type must be provided using "--keyType" option'
    );
  }

  let projectKey: ProjectKeysReference | undefined;
  let projectKeyJwk: ProjectKeysReferenceWithJwk | undefined;

  switch (args['--keyType']) {
    case 'ethereum':
      projectKey = await importEthereum(basePath);
      break;
    case 'pem':
      projectKeyJwk = await importPem(basePath, args);
      break;
    // @todo Add more types
    default:
      throw new Error(`Unknown key pair type: "${args['--keyType']}"`)
  }

  if (args['--addToOrgId']) {
    printInfo('Adding of verification method to an ORG.JSON...');

    const orgId = await promptOrgId(basePath);

    if (orgId) {
      throw new Error('No registered ORGiDs found in the project');
    }

    const {
      did,
      orgJson,
      salt,
      owner,
      created
    } = orgId;

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

    let verificationMethod: VerificationMethodReference;
    let verificationMethodId: string;

    if (args['--keyType'] === 'ethereum') {

      if (!projectKey) {
        throw new Error('Invalid projectKey');
      }

      verificationMethodId = `${did}#${projectKey.tag}`;

      verificationMethod = createVerificationMethodWithBlockchainAccountId(
        verificationMethodId,
        controller,
        'eip155',
        parsedController.network,
        projectKey.publicKey
      );
    } else {

      if (!projectKeyJwk) {
        throw new Error('Invalid projectKeyJwk');
      }

      verificationMethodId = `${did}#${projectKeyJwk.tag}`;

      verificationMethod = await createVerificationMethodWithKey(
        verificationMethodId,
        controller,
        projectKeyJwk.publicJwk
      );
    }

    if (args['--keyType'] === 'pem' || args['--isDelegated']) {
      const delegates = new Set(orgJsonObj.capabilityDelegation);
      delegates.add(verificationMethodId);
      orgJsonObj.capabilityDelegation = Array.from(delegates);
    }

    if (!orgJsonObj.verificationMethod) {
      orgJsonObj.verificationMethod = [];
    }

    const isMethodExists = orgJsonObj.verificationMethod.find(
      v => v.id === verificationMethodId
    );

    if (isMethodExists) {
      orgJsonObj.verificationMethod = orgJsonObj.verificationMethod.map(
        v => {
          if (v.id ) {
            return verificationMethod;
          }
          return v;
        }
      );
    } else {
      orgJsonObj.verificationMethod.push(verificationMethod);
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
      date: DateTime.now().toISO()
    };

    await addOrgIdToProject(basePath, orgIdRecord);

    printInfo(
      `"verificationMethod" with Id ${verificationMethod.id} has been added.\n`+
      `ORG.JSON file for ${did} has been successfully updated in the project.`
    );
  }
};
