#!/usr/bin/env -S node --no-deprecation
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
const { cli, console: { printError } } = require('../dist');

cli(process.cwd(), process.argv)
  .catch(error => {
    console.log(error);
    printError(error.message);
    process.exit(1);
  })
  .finally(() => process.exit(0));
