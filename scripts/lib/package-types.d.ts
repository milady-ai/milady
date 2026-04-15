export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface JsonObject {
  [key: string]: JsonValue;
}

export type PackageStringMap = Record<string, string>;

export interface PackageWorkspaceObject {
  packages?: string[];
}

export type PackageWorkspaceSpec = string[] | PackageWorkspaceObject;

export interface PackageJsonRecord extends JsonObject {
  name?: string;
  version?: string;
  bin?: string | PackageStringMap;
  dependencies?: PackageStringMap;
  devDependencies?: PackageStringMap;
  optionalDependencies?: PackageStringMap;
  peerDependencies?: PackageStringMap;
  overrides?: PackageStringMap;
  bundleDependencies?: string[] | boolean;
  workspaces?: PackageWorkspaceSpec;
}

export interface PackageLinkDescriptor {
  linkPath: string;
  targetPath: string;
}

export interface VendoredPackageRecord {
  dir: string;
  version: string;
}

export type PublishedPackageSpec = [packageName: string, version: string];
