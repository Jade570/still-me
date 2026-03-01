/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_WS_URL: string;
  readonly VITE_JOIN_LINK: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}