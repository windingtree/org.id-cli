import { object } from '@windingtree/org.id-utils';
import type { ORGJSONVCNFT } from '@windingtree/org.json-schema/types/orgVc';
import { DateTime } from 'luxon';
import path from 'path';
import type { ProjectDeploymentReference } from '../schema/types/project';
import { printInfo } from '../utils/console';
import type { ParsedArgv } from '../utils/env';
import { read } from './fs';
import { addToIpfs, removeFromIpfs } from './ipfs';
import { addDeploymentToProject } from './project';

export const deployFileIpfs = async (
  basePath: string,
  args: ParsedArgv
): Promise<ProjectDeploymentReference> => {
  if (!args['--path']) {
    throw new Error(`Path to the file must be provided using "--path" option`);
  }

  let orgIdDid: string | undefined;

  if (args['--filetype'] === 'orgIdVc') {
    const orgIdVc = (await read(
      basePath,
      args['--path'],
      true
    )) as ORGJSONVCNFT;
    orgIdDid = object.getDeepValue(orgIdVc, 'credentialSubject.id') as string;
  }

  const fileToDeploy = path.resolve(basePath, args['--path']);

  const cid = await addToIpfs(basePath, fileToDeploy);

  // Build a deployment record
  const deploymentRecord: ProjectDeploymentReference = {
    type: 'ipfs',
    path: fileToDeploy,
    uri: `ipfs://${cid}`,
    date: DateTime.now().toISO(),
  };

  const { remove } = await addDeploymentToProject(
    basePath,
    deploymentRecord,
    orgIdDid
  );

  printInfo(
    `The file ${fileToDeploy} has been successfully deployed to IPFS and pinned`
  );

  if (remove) {
    await removeFromIpfs(basePath, remove.uri.split('//')[1]);

    printInfo(`Old deployment ${remove.uri} has been successfully unpinned`);
  }

  return deploymentRecord;
};
