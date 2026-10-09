// The DataverseClient over the services the `pa` CLI generates into
// src/generated. Until those are generated (`pa app add data-source
// --connector dataverse --table systemuser` and `pa app add dataverse-api
// --api-name WhoAmI`), every call fails with a message saying so.

import type { DataverseClient } from "./client"

const notGenerated = () =>
  Promise.reject(new Error("Dataverse data sources are not generated yet; see README, Dataverse data sources"))

export function createGeneratedClient(): DataverseClient {
  return {
    whoAmI: notGenerated,
    getSystemUser: notGenerated,
    listSystemUsers: notGenerated,
  }
}
