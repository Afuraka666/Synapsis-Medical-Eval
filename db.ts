import Dexie, { type Table } from 'dexie';
import { type PatientCase, type Snippet } from './types';

export class UnganaDatabase extends Dexie {
  patientCases!: Table<PatientCase>;
  snippets!: Table<Snippet>;

  constructor() {
    super('UnganaMedicalDB');
    this.version(2).stores({
      patientCases: '++id, title, timestamp',
      snippets: '++id, title, savedAt'
    });
  }
}

export const db = new UnganaDatabase();
