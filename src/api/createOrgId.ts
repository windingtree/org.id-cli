import { OrgIdData } from '@windingtree/org.id-core/';
import { ORGJSONVCNFT } from '@windingtree/org.json-schema/types/orgVc';
import {
  ProjectKeysReference,
  ProjectOrgIdsReference,
} from '../schema/types/project';
import {
  printError,
  printInfo,
  printMessage,
  printObject,
} from '../utils/console';
import {
  createOrgIdInstance,
  downloadOrgIdVc,
  prepareOrgIdApi,
  promptKeyPair,
  promptOrgId,
} from './common';
import { proposeTx } from './multisig';
import { updateOrgIdRecord } from './project';

export interface OrgIdCreationResult extends Omit<OrgIdData, 'tokenId'> {
  tokenId: string;
}

export const createWithEthereum = async (
  basePath: string,
  orgId: ProjectOrgIdsReference,
  orgVcObj: ORGJSONVCNFT,
  keyPair: ProjectKeysReference,
  useAwsKmsSigner = false
): Promise<void> => {
  if (!orgId.orgIdVc) {
    throw new Error(`ORGiD VC not created for this ORGiD (${orgId.did}) yet`);
  }

  const { orgIdContract, signer, gasPrice } = await prepareOrgIdApi(
    basePath,
    orgId,
    keyPair,
    useAwsKmsSigner
  );

  printMessage(
    '\nSending transaction "createOrgId(bytes32,string,string[])"...'
  );

  const orgIdData = await orgIdContract.createOrgIdWithDelegates(
    orgId.salt,
    orgId.orgIdVc,
    orgVcObj?.credentialSubject?.capabilityDelegation?.map((c) =>
      typeof c === 'string' ? c : c.id
    ) ?? [],
    signer,
    gasPrice ? { gasPrice } : undefined,
    async (txHash) => {
      printInfo(`\nTransaction hash: ${txHash}`);
      try {
        await updateOrgIdRecord(basePath, orgId.did, {
          txHash,
        });
      } catch {
        printError('Unable to update project file');
      }
    }
  );

  if (!orgIdData) {
    throw new Error('Unable to fetch ORGiD data');
  }

  printInfo(`ORGiD with DID: "${orgId.did}" has been successfully created`);

  printObject({
    ...orgIdData,
    tokenId: orgIdData.tokenId.toString(),
  });
};

// Propose ORGiD creation Tx to the multisig
export const createWithMultisig = async (
  basePath: string,
  orgId: ProjectOrgIdsReference,
  orgVcObj: ORGJSONVCNFT,
  keyPair: ProjectKeysReference
): Promise<void> => {
  if (!orgId.orgIdVc) {
    throw new Error('ORGiD VC URI not found');
  }

  if (!keyPair.multisig) {
    throw new Error('Invalid multisig keys config');
  }

  printInfo(
    'Proposing "createOrgId(bytes32,string,string[])" tx to multisig...'
  );

  // Create OrgId Tx
  const orgIdInstance = await createOrgIdInstance(basePath, orgId);
  const registerTxRaw = await orgIdInstance.contract.populateTransaction[
    'createOrgId(bytes32,string,string[])'
  ](
    orgId.salt,
    orgId.orgIdVc,
    orgVcObj?.credentialSubject?.capabilityDelegation?.map((c) =>
      typeof c === 'string' ? c : c.id
    ) ?? []
  );

  await proposeTx(keyPair.multisig, registerTxRaw);
};

// Create new ORGiD
export const createOrgId = async (basePath: string): Promise<void> => {
  const orgId = await promptOrgId(basePath, false);

  if (!orgId) {
    throw new Error('The ORGiD not been selected');
  }

  const { created, did, orgIdVc } = orgId;

  if (created) {
    throw new Error(`This ORGiD ${did} already has been created`);
  }

  if (!orgIdVc) {
    throw new Error(`ORGiD VC not created for this ORGiD (${did}) yet`);
  }

  const orgIdVcObj = await downloadOrgIdVc(basePath, orgIdVc);

  const keyPair = await promptKeyPair(basePath);

  if (!keyPair) {
    throw new Error('Key pair not selected');
  }

  switch (keyPair.type) {
    case 'ethereum':
      await createWithEthereum(basePath, orgId, orgIdVcObj, keyPair);
      break;
    case 'kmsEthereum':
      await createWithEthereum(basePath, orgId, orgIdVcObj, keyPair, true);
      break;
    case 'multisig':
      await createWithMultisig(basePath, orgId, orgIdVcObj, keyPair);
      break;
    default:
      throw new Error(
        `Key with type "${keyPair.type}" cannot be used for an ORGiD creation`
      );
  }

  await updateOrgIdRecord(basePath, did, {
    created: true,
  });
};
