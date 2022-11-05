import { parseDid } from '@windingtree/org.id-utils/dist/parsers';
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

export const changeWithEthereum = async (
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
  const { orgId: id } = parseDid(orgId.did);

  printMessage(
    '\nSending transaction "setOrgJson(bytes32,string,string[])"...'
  );

  const orgIdData = await orgIdContract.setOrgJsonWithDelegates(
    id,
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

  printInfo(`ORGiD with DID: "${orgId.did}" has been successfully updated`);

  printObject({
    ...orgIdData,
    tokenId: orgIdData.tokenId.toString(),
  });
};

export const changeWithMultisig = async (
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

  const { orgId: id } = parseDid(orgId.did);

  printInfo(
    'Proposing "setOrgJson(bytes32,string,string[])" tx to multisig...'
  );

  // Create OrgId Tx
  const orgIdInstance = await createOrgIdInstance(basePath, orgId);
  const registerTxRaw = await orgIdInstance.contract.populateTransaction[
    'setOrgJson(bytes32,string,string[])'
  ](
    id,
    orgId.orgIdVc,
    orgVcObj?.credentialSubject?.capabilityDelegation?.map((c) =>
      typeof c === 'string' ? c : c.id
    ) ?? []
  );

  await proposeTx(keyPair.multisig, registerTxRaw);
};

export const changeOrgJson = async (basePath: string): Promise<void> => {
  const orgId = await promptOrgId(basePath, true);

  if (!orgId) {
    throw new Error('No registered ORGiDs found in the project');
  }

  const { did, orgIdVc } = orgId;

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
      await changeWithEthereum(basePath, orgId, orgIdVcObj, keyPair);
      break;
    case 'kmsEthereum':
      await changeWithEthereum(basePath, orgId, orgIdVcObj, keyPair, true);
      break;
    case 'multisig':
      await changeWithMultisig(basePath, orgId, orgIdVcObj, keyPair);
      break;
    default:
      throw new Error(
        `Key with type "${keyPair.type}" cannot be used for an ORGiD creation`
      );
  }
};
