import { Attribute, Attributes, Manager, Statement, StringMap } from './metadata';
import { buildToSave, buildToSaveBatch } from './build';

// tslint:disable-next-line:class-name
export class resource {
  static string?: boolean;
}
export class DatabaseManager implements Manager {
  constructor(public database: any) {
    this.exec = this.exec.bind(this);
    this.execBatch = this.execBatch.bind(this);
    this.query = this.query.bind(this);
    this.queryOne = this.queryOne.bind(this);
    this.execScalar = this.execScalar.bind(this);
    this.count = this.count.bind(this);
  }
  exec(sql: string, args?: any[]): Promise<number> {
    return exec(this.database, sql, args);
  }
  execBatch(statements: Statement[], firstSuccess?: boolean): Promise<number> {
    return execBatch(this.database, statements, firstSuccess);
  }
  query<T>(sql: string, args?: any[], m?: StringMap, fields?: Attribute[]): Promise<T[]> {
    return query(this.database, sql, args, m, fields);
  }
  queryOne<T>(sql: string, args?: any[], m?: StringMap, fields?: Attribute[]): Promise<T> {
    return queryOne(this.database, sql, args, m, fields);
  }
  execScalar<T>(sql: string, args?: any[]): Promise<T> {
    return execScalar<T>(this.database, sql, args);
  }
  count(sql: string, args?: any[]): Promise<number> {
    return count(this.database, sql, args);
  }
}

export function execute(db: any, sql: string): Promise<void> {
  if (db.executeSql) {
    return new Promise<void>((resolve, reject) => {
      db.executeSql(sql, [], () => {
        return resolve();
      }, (err: any) => {
        return reject(err);
      });
    });
  } else {
    return new Promise<void>((resolve, reject) => {
      return db.transaction(txn => {
        txn.executeSql(sql, [], () => {
          return resolve();
        });
      }, (err: any) => {
        return reject(err);
      });
    });
  }
}
export function execBatch(db: any, statements: Statement[], firstSuccess?: boolean): Promise<number> {
  if (!statements || statements.length === 0) {
    return Promise.resolve(0);
  } else if (statements.length === 1) {
    return exec(db, statements[0].query, statements[0].params);
  }
  if (firstSuccess) {
    return new Promise<number>((resolve, reject) => {
      return db.transaction(txn => {
        return txn.executeSql(statements[0].query, statements[0].params, (tx, result) => {
          if (result && result.rowsAffected > 0) {
            let subs = statements.slice(1);
            subs.forEach(item => {
              txn.executeSql(item.query, toArray(item.params));
            });
          }
        }, (err: any) => {
          return reject(err);
        });
      }, (e: any) => {
        reject(e);
      }, () => {
        resolve(1);
      });
    });
  } else {
    return new Promise<number>((resolve, reject) => {
      return db.transaction(txn => {
        statements.forEach(item => {
          txn.executeSql(item.query, toArray(item.params));
        })
      }, (e: any) => {
        reject(e);
      }, () => {
        resolve(1);
      });
    });
  }
}
function buildError(err: any): any {
  if (err.errno === 19 && err.code === 'SQLITE_CONSTRAINT') {
    err.error = 'duplicate';
  }
  return err;
}
export function getTransaction(db: any): Promise<any> {
  return new Promise<number>((resolve, reject) => {
    return db.transaction(txn => {
      return resolve(txn);
    }, (e: any) => {
      reject(e);
    });
  });
}
/**
 * 
 * @param db can be db or transaction
 * @param sql 
 * @param args 
 */
export function exec(db: any, sql: string, args?: any[]): Promise<number> {
  const p = toArray(args);
  if (db.executeSql) {
    return new Promise<number>((resolve, reject) => {
      db.executeSql(sql, p, (tx, result) => {
        if (result && result.rowsAffected > 0) {
          return resolve(1);
        } else if (!result) {
          return reject(0);
        }
      });
    });
  } else {
    return new Promise<number>((resolve, reject) => {
      return db.transaction(txn => {
        txn.executeSql(sql, p, (tx, result) => {
          if (result && result.rowsAffected > 0) {
            return resolve(1);
          }
        });
      }, (e: any) => {
        buildError(e);
        reject(e);
      }, () => {
        resolve(1);
      });
    });
  }
}
export function query<T>(db: any, sql: string, args?: any[], m?: StringMap, bools?: Attribute[]): Promise<T[]> {
  const p = toArray(args);
  if (db.executeSql) {
    return new Promise<T[]>((resolve, reject) => {
      db.executeSql(sql, p, (tx, results: any) => {
        return resolve(handleResults<T>(results.rows._array, m, bools));
      });
    });
  } else {
    return new Promise<T[]>((resolve, reject) => {
      return db.transaction(txn => {
        txn.executeSql(sql, p, (tx, results: any) => {
          return resolve(handleResults<T>(results.rows._array, m, bools));
        });
      }, (err: any) => {
        reject(err);
      });
    });
  }
}
export function queryOne<T>(db: any, sql: string, args?: any[], m?: StringMap, bools?: Attribute[]): Promise<T> {
  const p = toArray(args);
  if (db.executeSql) {
    return new Promise<T>((resolve, reject) => {
      db.executeSql(sql, p, (tx, result: any) => {
        if (result.rows && result.rows._array && result.rows.length > 0) {
          return resolve(handleResult<T>(result.rows._array, m, bools));
        } else {
          return resolve(null);
        }
      });
    });
  } else {
    return new Promise<T>((resolve, reject) => {
      return db.transaction(txn => {
        txn.executeSql(sql, p, (tx, result: any) => {
          if (result.rows && result.rows._array && result.rows.length > 0) {
            return resolve(handleResult<T>(result.rows._array, m, bools));
          } else {
            return resolve(null);
          }
        });
      }, (err: any) => {
        reject(err);
      });
    });
  }
}
export function execScalar<T>(db: any, sql: string, args?: any[]): Promise<T> {
  return queryOne<T>(db, sql, args).then(r => {
    if (!r) {
      return null;
    } else {
      const keys = Object.keys(r);
      return r[keys[0]];
    }
  });
}
export function count(db: any, sql: string, args?: any[]): Promise<number> {
  return execScalar<number>(db, sql, args);
}
export function save<T>(db: any | ((sql: string, args?: any[]) => Promise<number>), obj: T, table: string, attrs: Attributes, buildParam?: (i: number) => string, i?: number): Promise<number> {
  const stm = buildToSave(obj, table, attrs, buildParam, i);
  if (!stm) {
    return Promise.resolve(0);
  } else {
    if (typeof db === 'function') {
      return db(stm.query, stm.params);
    } else {
      return exec(db, stm.query, stm.params);
    }
  }
}
export function saveBatch<T>(db: any | ((statements: Statement[]) => Promise<number>), objs: T[], table: string, attrs: Attributes, buildParam?: (i: number) => string): Promise<number> {
  const stmts = buildToSaveBatch(objs, table, attrs, buildParam);
  if (!stmts || stmts.length === 0) {
    return Promise.resolve(0);
  } else {
    if (typeof db === 'function') {
      return db(stmts);
    } else {
      return execBatch(db, stmts);
    }
  }
}
export function toArray(arr: any[]): any[] {
  if (!arr || arr.length === 0) {
    return [];
  }
  const p: any[] = [];
  const l = arr.length;
  for (let i = 0; i < l; i++) {
    if (arr[i] === undefined || arr[i] == null) {
      p.push(null);
    } else {
      if (typeof arr[i] === 'object') {
        if (arr[i] instanceof Date) {
          p.push(arr[i]);
        } else {
          if (resource.string) {
            const s: string = JSON.stringify(arr[i]);
            p.push(s);
          } else {
            p.push(arr[i]);
          }
        }
      } else {
        p.push(arr[i]);
      }
    }
  }
  return p;
}
export function handleResult<T>(r: T, m?: StringMap, bools?: Attribute[]): T {
  if (r == null || r === undefined || (!m && (!bools || bools.length === 0))) {
    return r;
  }
  handleResults([r], m, bools);
  return r;
}
export function handleResults<T>(r: T[], m?: StringMap, bools?: Attribute[]): T[] {
  if (m) {
    const res = mapArray(r, m);
    if (bools && bools.length > 0) {
      return handleBool(res, bools);
    } else {
      return res;
    }
  } else {
    if (bools && bools.length > 0) {
      return handleBool(r, bools);
    } else {
      return r;
    }
  }
}
export function handleBool<T>(objs: T[], bools: Attribute[]): T[] {
  if (!bools || bools.length === 0 || !objs) {
    return objs;
  }
  for (const obj of objs) {
    for (const field of bools) {
      const value = obj[field.name];
      if (value != null && value !== undefined) {
        const b = field.true;
        if (b == null || b === undefined) {
          // tslint:disable-next-line:triple-equals
          obj[field.name] = ('1' == value || 'T' == value || 'Y' == value || 'true' == value);
        } else {
          // tslint:disable-next-line:triple-equals
          obj[field.name] = (value == b ? true : false);
        }
      }
    }
  }
  return objs;
}
export function map<T>(obj: T, m?: StringMap): any {
  if (!m) {
    return obj;
  }
  const mkeys = Object.keys(m);
  if (mkeys.length === 0) {
    return obj;
  }
  const obj2: any = {};
  const keys = Object.keys(obj);
  for (const key of keys) {
    let k0 = m[key];
    if (!k0) {
      k0 = key;
    }
    obj2[k0] = obj[key];
  }
  return obj2;
}
export function mapArray<T>(results: T[], m?: StringMap): T[] {
  if (!m) {
    return results;
  }
  const mkeys = Object.keys(m);
  if (mkeys.length === 0) {
    return results;
  }
  const objs = [];
  const length = results.length;
  for (let i = 0; i < length; i++) {
    const obj = results[i];
    const obj2: any = {};
    const keys = Object.keys(obj);
    for (const key of keys) {
      let k0 = m[key];
      if (!k0) {
        k0 = key;
      }
      obj2[k0] = (obj as any)[key];
    }
    objs.push(obj2);
  }
  return objs;
}
export function getFields(fields: string[], all?: string[]): string[] {
  if (!fields || fields.length === 0) {
    return undefined;
  }
  const ext: string[] = [];
  if (all) {
    for (const s of fields) {
      if (all.includes(s)) {
        ext.push(s);
      }
    }
    if (ext.length === 0) {
      return undefined;
    } else {
      return ext;
    }
  } else {
    return fields;
  }
}
export function buildFields(fields: string[], all?: string[]): string {
  const s = getFields(fields, all);
  if (!s || s.length === 0) {
    return '*';
  } else {
    return s.join(',');
  }
}
export function getMapField(name: string, mp?: StringMap): string {
  if (!mp) {
    return name;
  }
  const x = mp[name];
  if (!x) {
    return name;
  }
  if (typeof x === 'string') {
    return x;
  }
  return name;
}
export function isEmpty(s: string): boolean {
  return !(s && s.length > 0);
}
// tslint:disable-next-line:max-classes-per-file
export class StringService {
  constructor(public db: any, public table: string, public column: string) {
    this.load = this.load.bind(this);
    this.save = this.save.bind(this);
  }
  load(key: string, max: number): Promise<string[]> {
    const s = `select ${this.column} from ${this.table} where ${this.column} like ? order by ${this.column} limit ${max}`;
    return query(this.db, s, ['' + key + '%']).then(arr => {
      return arr.map(i => i[this.column] as string);
    });
  }
  save(values: string[]): Promise<number> {
    if (!values || values.length === 0) {
      return Promise.resolve(0);
    }
    const arr: string[] = [];
    for (let i = 1; i <= values.length; i++) {
      arr.push('(?)');
    }
    const s = `insert or ignore into ${this.table}(${this.column})values${arr.join(',')}`;
    return exec(this.db, s, values);
  }
}

export function version(attrs: Attributes): Attribute {
  const ks = Object.keys(attrs);
  for (const k of ks) {
    const attr = attrs[k];
    if (attr.version) {
      attr.name = k;
      return attr;
    }
  }
  return undefined;
}
// tslint:disable-next-line:max-classes-per-file
export class SqliteWriter<T> {
  db?: any;
  exec?: (sql: string, args?: any[]) => Promise<number>;
  map?: (v: T) => T;
  param?: (i: number) => string;
  constructor(db: any | ((sql: string, args?: any[]) => Promise<number>), public table: string, public attributes: Attributes, toDB?: (v: T) => T, buildParam?: (i: number) => string) {
    this.write = this.write.bind(this);
    if (typeof db === 'function') {
      this.exec = db;
    } else {
      this.db = db;
    }
    this.param = buildParam;
    this.map = toDB;
  }
  write(obj: T): Promise<number> {
    if (!obj) {
      return Promise.resolve(0);
    }
    let obj2 = obj;
    if (this.map) {
      obj2 = this.map(obj);
    }
    const stmt = buildToSave(obj2, this.table, this.attributes, this.param);
    if (stmt) {
      if (this.exec) {
        return this.exec(stmt.query, stmt.params);
      } else {
        return exec(this.db, stmt.query, stmt.params);
      }
    } else {
      return Promise.resolve(0);
    }
  }
}
// tslint:disable-next-line:max-classes-per-file
export class SqliteBatchWriter<T> {
  pool?: any;
  version?: string;
  execute?: (statements: Statement[]) => Promise<number>;
  map?: (v: T) => T;
  param?: (i: number) => string;
  constructor(db: any | ((statements: Statement[]) => Promise<number>), public table: string, public attributes: Attributes, toDB?: (v: T) => T, buildParam?: (i: number) => string) {
    this.write = this.write.bind(this);
    if (typeof db === 'function') {
      this.execute = db;
    } else {
      this.pool = db;
    }
    this.param = buildParam;
    this.map = toDB;
    const x = version(attributes);
    if (x) {
      this.version = x.name;
    }
  }
  write(objs: T[]): Promise<number> {
    if (!objs || objs.length === 0) {
      return Promise.resolve(0);
    }
    let list = objs;
    if (this.map) {
      list = [];
      for (const obj of objs) {
        const obj2 = this.map(obj);
        list.push(obj2);
      }
    }
    const stmts = buildToSaveBatch(list, this.table, this.attributes, this.param);
    if (stmts && stmts.length > 0) {
      if (this.execute) {
        return this.execute(stmts);
      } else {
        return execBatch(this.pool, stmts);
      }
    } else {
      return Promise.resolve(0);
    }
  }
}

export interface AnyMap {
  [key: string]: any;
}
// tslint:disable-next-line:max-classes-per-file
export class SqliteChecker {
  constructor(private db: any, private service?: string, private timeout?: number) {
    if (!this.timeout) {
      this.timeout = 4200;
    }
    if (!this.service) {
      this.service = 'sqlite';
    }
    this.check = this.check.bind(this);
    this.name = this.name.bind(this);
    this.build = this.build.bind(this);
  }
  check(): Promise<AnyMap> {
    const obj = {} as AnyMap;
    const promise = new Promise<any>((resolve, reject) => {
      this.db.get('select date()', (err, result) => {
        if (err) {
          return reject(err);
        } else {
          resolve(obj);
        }
      });
    });
    if (this.timeout > 0) {
      return promiseTimeOut(this.timeout, promise);
    } else {
      return promise;
    }
  }
  name(): string {
    return this.service;
  }
  build(data: AnyMap, err: any): AnyMap {
    if (err) {
      if (!data) {
        data = {} as AnyMap;
      }
      data['error'] = err;
    }
    return data;
  }
}

function promiseTimeOut(timeoutInMilliseconds: number, promise: Promise<any>): Promise<any> {
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(`Timed out in: ${timeoutInMilliseconds} milliseconds!`);
      }, timeoutInMilliseconds);
    })
  ]);
}
