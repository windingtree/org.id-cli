# Creation of JWT

> Keys for signing JWT must be already imported into CLI using `--operation keys:import`

## Prerequisites

The issuer ORGiD must be registered before a JWT generation

## Creation of JWT

```bash
orgid --operation jwt --issuer <ISSUER_DID#key> --audience <AUDIENCE_DID> --expiration <TIME_IN_MILLISECONDS> --scope <scope1>,<scope2>,<scope3>,...
```

- `issuer` - the creator and signer of a JWT, full DID, the verification method Id (mandatory)
- `audience` - an entity which will use JWT for accessing an issuer service, DID only (mandatory)
- `scope` - scope of permissions (comma separated strings, optional)
- `expiration` - JWT ttl in milliseconds (optional, if not defined a JWT will not be restricted by time)
