import { Location, Uri } from 'vscode';

import { FileType } from '@i18n-weave/util/util-enums';

export interface TranslationKeyData {
  value: string | null;
  location: Location;
}

type Metadata = {
  uri: Uri;
  entryLastModified: Date;
  type: FileType;
};

type FileData = {
  metaData: Metadata;
};

export type TranslationFile = {
  type: 'translation';
  language: string;
  namespace: string;
  dialect?: string;
  keys: Record<string, TranslationKeyData>;
  jsonContent: JSON;
} & FileData;

export type CodeFile = {
  type: 'code';
  content: string;
} & FileData;
