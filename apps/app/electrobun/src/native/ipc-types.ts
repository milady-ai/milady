export type IpcPrimitive = string | number | boolean | null | undefined;

export interface IpcObject {
  [key: string]: IpcValue;
}

/**
 * IPC values must be JSON-serializable. The `& object` union member
 * allows TypeScript interfaces (which lack implicit index signatures)
 * to pass through without explicit casting at every call site.
 */
export type IpcValue =
  | IpcPrimitive
  | IpcObject
  | (object & { _brand?: never })
  | IpcValue[]
  | ArrayBuffer
  | Float32Array
  | Uint8Array;
