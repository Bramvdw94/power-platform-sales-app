/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "memory" runs the app on the in-memory seed data instead of Dataverse. */
  readonly VITE_SALES_GATEWAY?: string
  /** With the in-memory gateway: who is signed in (megan, adele, alex, diego or bram). */
  readonly VITE_SALES_USER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
