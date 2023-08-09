import {DONE} from "./constants.js"
const getValue = (key:string, data:object) :undefined|object => {
    const keys: string[] = key.split(".");
    let result: any = data;
    do {
        const key = keys.shift();
        result = key ? result[key] : undefined;
    } while (result && typeof (result) === "object" && keys.length);
    if (keys.length) return undefined;
    return result;
}


const deserializeSpecial = (key:any, value?:any) :any => {
    if (key !== null && typeof (key) !== "string") return deserializeSpecial(null, key);
    const type = typeof (value);
    if (type === "string") {
        if(value==="@undefined") return undefined;
        const number = value.match(/^@BigInt\((.*)\)$/);
        if (number) return BigInt(number[1]);
        const date = value.match(/^@Date\((.*)\)$/);
        if (date) return new Date(parseInt(date[1]));
        const regexp = value.match(/^@RegExp\((.*)\)$/);
        if (regexp) {
            const li = regexp[1].lastIndexOf("/"),
                str = regexp[1].substring(1, li),
                flags = regexp[1].substring(li + 1);
            return new RegExp(str, flags);
        }
        const symbol = value.match(/^@Symbol\((.*)\)$/);
        if (symbol) return Symbol.for(symbol[1]);
        return value;
    }
    if (value && type === "object") {
        Object.entries(value).forEach(([key, data]) => {
            //value[key] = deserializeSpecial(key, data); // does not work in Deno deploy KV beta
            const desc = {...Object.getOwnPropertyDescriptor(value,key),value:deserializeSpecial(key, data)};
            if(desc.writable) {
                value[key] = desc.value;
            } else if(desc.configurable) {
                Object.defineProperty(value,key,desc);
            }
        });
    }
    return value;
}

const isSpecial = (value:string) => {
    const specials = ["@undefined"];
    return specials.includes(value) || value.match(/@.*\(.*\)/)
}

const isRegExp = (value:object) => value instanceof RegExp || value.constructor.name === "RegExp";

const isId = (value:any) => {
    return /([$0-9a-f_]*@)?[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value);
}

type ScoredFunction = Function & {score?:number};
const matchKeys:ScoredFunction = (pattern:Array<any>, target:Array<any>):boolean => {
    matchKeys.score = 1;
    return pattern.every((item, i) => {
        const type = typeof (item);
        if (type === "function") {
            const result = item(deserializeSpecial(null, target[i]));
            matchKeys.score = (matchKeys.score===undefined ? 1 :  matchKeys.score) * (typeof (item.score) === "number" ? item.score : 1);
            return result !== undefined;
        }
        if (item && type === "object") {
            const value = deserializeSpecial(null, target[i]);
            if (item instanceof Date) {
                if (value && typeof (value) === "object" && typeof (value.getTime) === "function") {
                    return item.getTime() === value.getTime();
                }
                return false;
            }
            if (item instanceof RegExp) {
                return item.test(value)
            }
            return false;
        }
        if (item === undefined) {// matches anything by comvention
            return true;
        }
        return item === target[i];
    })
}

const selector = (value:any,pattern:any,{root=value,parent,key}:{root?:any,parent?:object,key?:string}={}) : any => {
    const ptype = typeof(pattern),
        vtype = typeof(value);
    if(value===pattern) {
        return value;
    }
    if(ptype==="number" && vtype==="number") {
        return  isNaN(pattern) && isNaN(value) ? value : undefined
    }
    if(ptype==="function") {
        return pattern(value,{root,parent,key});
    }
    if(value && ptype==="object") {
        if(isRegExp(pattern)) {
            if(vtype==="string") {
                const matches = value.match(pattern)||[];
                return matches[1];
            }
            return;
        }
        if(pattern instanceof Date) {
            return value && vtype==="object" && value instanceof Date && pattern.getTime()===value.getTime() ? value : undefined;
        }
        for(const key in value) {
            if(!Object.keys(pattern).some((pkey)=> {
                const regExp = toRegExp(pkey);
                return (regExp && regExp.test(key)) || pkey===key;
            })) {
                delete value[key];
            }
        }
        for(const entry of Object.entries(pattern)) {
            const key = entry[0],
                regExp = toRegExp(key);
            let result;
            if(regExp) {
                for(const [key,v] of Object.entries(value)) {
                    if(regExp.test(key)) {
                        result = selector(v,entry[1], {root, parent: value, key})
                        if ([undefined,DONE].includes(result)) {
                            delete value[key]
                        } else {
                            value[key] = result;
                        }
                    }
                }
            } else {
                result = selector(value[key],entry[1], {root, parent: value, key});
                if ([undefined,DONE].includes(result)) {
                    delete value[key]
                } else {
                    value[key] = result;
                }
            }
        }
        return value;
    }
}

const serializeKey = (key:any,skip:any[]=["bigint"]) => {
    key = Array.isArray(key) ? key.map((key) => Array.isArray(key) ? key.map((item) => item==null ? new Uint8Array([]) : item) : (key==null ? new Uint8Array([]) : key)) : key
    return serializeSpecial(key,skip);
}

const serializeValue = function(value:any,skip:any[]=["bigint",RegExp,Date,"undefined"]) {
    return serializeSpecial(value,skip);
}

const serializeSpecial = (value:any,skip:any[]=[]): any => {
    const type = typeof (value);
    if(skip.some((skipType)=>type===skipType || (value && type==="object" && typeof(skipType)==="function" && value instanceof skipType))) return value;
    if (type === "symbol") return "@" + value.toString();
    if (type === "bigint") return "@BigInt(" + value.toString() + ")";
    if (value && type === "object") {
        if(value instanceof Uint8Array) return value;
        if(Array.isArray(value)) return value.map((item)=> serializeSpecial(item,skip));
        if (value instanceof Date || value.constructor.name === "Date") return "@Date(" + value.getTime() + ")";
        if (isRegExp(value)) return "@RegExp(" + value.toString() + ")";
        const proto = Object.getPrototypeOf(value);
        try {
            value = structuredClone(value);
        } catch(e) {
            value = {...value};
            // what about Set and Map
            Object.entries(value).forEach(([key, data]) => {
                const desc = {...Object.getOwnPropertyDescriptor(value,key),value:serializeSpecial(data,skip)};
                if(desc.writable) {
                    value[key] = desc.value;
                } else if(desc.configurable) {
                    Object.defineProperty(value,key,desc);
                }
            });
        }
        Object.setPrototypeOf(value, proto);
    }
    return value;
}

const stringifyKey = (key:any[]): string => {
    return JSON.stringify(key.map((item) => {
        return item && typeof(item)==="object" && item instanceof Uint8Array ? [...item] : item; // properly stringify Uint8Array
    }))
}

const parseKey = (key:string): any[] => {
    return JSON.parse(key).map((item:any) => {
        return Array.isArray(item) ? new Uint8Array(item) : item; // properly parse UInt8Array
    })
}

const toIndexPrefix = (indexType:string): string|undefined => {
   return {object: "__oindex__", table: "__tindex__"}[indexType];
}

const toKey = (value:any) : any[] => {
    const type = typeof (value);
    if(value && type==="object") {
        if(value instanceof Uint8Array) return [value];
        if(value instanceof Array) return value.map((item) => toKey(item)[0])
        if(value instanceof Date) return [serializeKey(value)];
        if(isRegExp(value)) return [serializeKey(value)];
    } else if(type==="symbol") {
        return [serializeKey(value)];
    } else if(type==="boolean" || type==="number" || type==="string" || type==="bigint" || type==="function" || value===null) {
        return [value];
    }
    throw new TypeError("Key type must be one of: bigint, boolean, function, null, number, string, symbol, Date, RegExp, Uint8Array, Array");
}

const toPattern = (key:any[]):any[] => {
    return key.map((item) => {
        const type = typeof (item);
        if (["boolean", "number", "string","bigint"].includes(type) || (item && type==="object" && item instanceof Uint8Array)) {
            return item;
        }
        return undefined;
    })
}

const toRegExp = (value:string): RegExp|undefined => {
    if (value.match(/\/.*\/[gimuy]*$/)) {
        const li = value.lastIndexOf("/"),
            str = value.substring(1, li),
            flags = value.substring(li + 1);
        return new RegExp(str, flags);
    }
}


const createId = (cname:string): string => `${cname}@${uuidv4()}`;

const getCname = (id:string|undefined): string|undefined => (id || "").split("@")[0];

class Index {
    name: string;
    type: string;
    keys: string[];
    unique: boolean;
    constructor({name, type, keys, unique = false}:{name:string,type:string,keys:string[],unique?:boolean}) {
        this.name = name;
        this.type = type;
        this.keys = keys;
        this.unique = unique;
    }
}
const uuidv4 = (): string => crypto.randomUUID();

const db:{[key:string|symbol]:any} = (await Deno.openKv() as {[key:string|symbol]:any});

type DenodataOptions = {maxTransactionSize?:number,idProperty?:string,metadataProperty?:string,indexValueMutator?:(value:any)=>any};

function Denodata(options:DenodataOptions) {
    const me = (Object.create(Denodata.prototype) as {[key:string|symbol]:any});
    Object.assign(me.options,options);
    me.options.maxTransactionSize ||= 10;
    me.options.idProperty ||= "#";
    me.options.metadataProperty ||= "^";
    me.options.indexValueMutator ||= (value:any):any => value;
    return new Proxy(me, {
        get(target, prop, receiver) {
            const value = target[prop];
            return typeof(value)==="function" ? value.bind(db) : value
        }
    });
}

Denodata.prototype = db;
const options:{[key:string]:any} = {};
Denodata.prototype.options = options;
Denodata.prototype.schema = {};
Denodata.prototype.indexes = {};

Denodata.prototype.createSchema = function ({
                                  cname,
                                  ctor,
                                  primaryKey,
                                  indexes = {},
                                  $schema,
                                  $id,
                                  title,
                                  description,
                                  properties,
                                  required = []
                              }:{cname?:string,ctor?:Function,primaryKey?:string,indexes?:{[key:string]:object},$schema?:string,$id?:string,title?:string,description?:string,properties?:{[key:string]:object},required?:string[]} = {}) {
    cname ||= title;
    title ||= cname;
    primaryKey ||= this.options.idProperty;
    if(!cname && !title) throw new Error("Either cname or title must be provided when creating a schema");
    if (this.schema[(cname as string)]) throw new Error("Schema already exists");
    ctor ||= new Function(`return function ${cname}(data) { return Object.assign(this,data); }`)();
    this.schema[(cname as string)] = {cname, ctor, primaryKey, indexes, $schema, $id, title, description, properties, required};
}

Denodata.prototype.createIndex = async function ({name, indexType="object", ctor,cname,keys}:{name?:string,indexType?:string,ctor?:Function,cname?:string,keys?:string[]} = {}) {
    if (!keys || !Array.isArray(keys) || !keys.length) throw new Error("Index must have at least one key");
    name ||= keys.join("_");
    if(!cname && !ctor) throw new Error("Either cname or ctor must be provided when creating an index");
    cname ||= ctor?.name;
    this.schema[(cname as string)] ||= {primaryKey: this.options.idProperty, indexes: {}};
    this.schema[(cname as string)].ctor ||= ctor || new Function(`return function ${cname}(data) { return Object.assign(this,data); }`)();
    this.schema[(cname as string)].indexes[name] = new Index({name, type: indexType, keys});
    for await(const key of this.list({
        start: `${(cname as string)}@00000000-0000-0000-000000000000`,
        end: `${(cname as string)}@ffffffff-ffff-ffff-ffffffffffff`
    })) {
        const object = await this.get(key);
        await this.put(object, {indexType, indexKeys: keys});
    }
    return this.schema[(cname as string)].indexes[name];
}

/*db.transaction = async function (f) {
    const tn = this.atomic(),
        result = await f.call(this, tn);
    await tn.commit();
    return result;
}*/

Denodata.prototype.clear = async function () {
    for await(const {key} of this.list({start: [new Uint8Array([])], end: [true]})) {
        await this.delete(key);
    }
}

const _delete = db.delete.bind(db);
Denodata.prototype.delete = async function (value:any, {cname, indexOnly,find}:{cname?:string,indexOnly?:boolean,find?:boolean} = {}) {
    const type = typeof (value),
        originalValue:any = value;
    if(type!=="object" && !Array.isArray(value)) {
        value = [value]
    }
    if (Array.isArray( value)) {
        const key = toPattern(toKey(value));
        if (value.length === 1 && isId(value[0])) {
            const entry = await _get(value);
            if (entry.value != null) {
                const id = value[0],
                    indexes:({indexType:string,indexKeys:string[]})[] = [];
                cname ||= getCname(id);
                Object.values(this.schema[(cname as string)]?.indexes || {}).forEach((value) => {
                    const {indexType, keys} = (value as {[key:string]:any});
                    indexes.push({indexType: type, indexKeys:keys});
                });
                for (const {indexType, indexKeys} of indexes) {
                    const keys = serializeKey(this.getKeys(entry.value, [indexKeys], {indexType, cname})),
                        indexPrefix = toIndexPrefix(indexType);
                    let keyBatch = keys.splice(0, this.options.maxTransactionSize);
                    while (keyBatch.length > 0) {
                        const tn = this.atomic();
                        for (let key of keyBatch) {
                            key = this.options.indexValueMutator(key,cname);
                            if(key && !key.some((item:any) => item==null)) {
                                tn.delete([indexPrefix, ...key, id]);
                            }
                        }
                        await tn.commit();
                        keyBatch = keys.splice(0, this.options.maxTransactionSize);
                    }
                }
            }
            if (!indexOnly) {
                await _delete(value);
            }
        } else if(find && key.some((item) => item===undefined)) {
            for await (const entry of this.find(value)) { // should value be key?
                await db.delete(entry.key);
            }
        } else {
            await _delete(value);
        }
    } else if (value && type === "object") {
        if(value instanceof Uint8Array) {
            await _delete([value]);
        } else if(value instanceof RegExp || value instanceof Date) {
            await _delete(toKey(value));
        } else {
            const id = value[this.options.idProperty];
            if (id) {
                cname ||= getCname(id) || value.constructor.name;
                const metadata = value[this.options.metadataProperty];
                value = serializeValue(value);
                const indexes: ({ indexType: string, indexKeys: string[] })[] = [];
                Object.values(this.schema[(cname as string)]?.indexes || {}).forEach((value) => {
                    const {indexType, keys} = (value as { [key: string]: any });
                    indexes.push({indexType, indexKeys: keys})
                });
                for (const {indexType, indexKeys} of indexes) {
                    const keys = serializeKey(this.getKeys(value, indexKeys, {indexType, cname})),
                        indexPrefix = toIndexPrefix(indexType);
                    let keyBatch = keys.splice(0, this.options.maxTransactionSize);
                    while (keyBatch.length > 0) {
                        const tn = this.atomic();
                        for (let key of keyBatch) {
                            key = this.options.indexValueMutator(key, cname);
                            if (key && !key.some((item: any) => item == null)) {
                                tn.delete([indexPrefix, ...key, id]);
                            }
                        }
                        await tn.commit();
                        keyBatch = keys.splice(0, this.options.maxTransactionSize);
                    }
                }
                if (!indexOnly) {
                    await _delete([id]);
                }
            } else if (find) {
                for await (const entry of this.find(value, {cname})) {
                    await _delete(entry.key);
                }
            } else {
                throw new Error("Can't delete object that does not have an id unless find option is true");
            }
        }
    }
    const args = [deserializeSpecial(null,originalValue), {cname, indexOnly,find}];
    await handleEvent("delete", Object.assign({value:originalValue}, cname ? {cname} : undefined),args);
}

//valueMatch,select,{cname,fulltext,scan,sort,sortable,minScore,limit=Infinity,offset=0}={}
Denodata.prototype.find = async function* (pattern:({[key:string]:any}|any)=null, {
    indexName,
    cname,
    ctor,
    minScore = 0,
    valueMatch,
    select,
    limit = Infinity,
    offset = 0
}:{indexName?:string,cname?:string,ctor?:((...args: any[]) => object),minScore?:number,valueMatch?:object|ScoredFunction,select?:object|((arg:any)=>any),limit?:number,offset?:number} = {}) {
    const isArray = Array.isArray(pattern);
    cname ||= typeof(ctor)==="function" && ctor.name!=="Object" ? ctor.name : undefined;
    if (indexName && !cname && pattern?.constructor.name==="Object") {
        throw new RangeError("cname must be specified when indexName is specified and pattern is a POJO");
    }
    if(pattern && !isArray && typeof(pattern) !== "object") {
        throw new TypeError("pattern must be one of: null, array or object")
    }
    if(!cname && !isArray && pattern && pattern.constructor.name !== "Object") {
        cname = pattern.constructor.name;
    }
    const indexType = indexName ? "table" : "object",
        isTable = indexType === "table",
        keys = indexName ? this.schema[(cname as string)].indexes[indexName]?.keys : null,
        // if pattern is an array then it is a key pattern, otherwise it is an object pattern
        indexKeys = pattern ?  (Array.isArray(pattern) ? [pattern] : this.getKeys(pattern, keys ? [keys] : null, {indexType,cname})) : [[this.options.idProperty, (value:any):any => value]],
        threshold = indexKeys.length * minScore,
        indexPrefix = isArray ? null : toIndexPrefix(indexType);
    let matches:{[key:string]:number} = {};
    for (let i = 0; i < indexKeys.length; i++) {
        const key = indexKeys[i],
            rangekey = key[key.length-1]===true ? toPattern([...key,new Uint8Array([])]) : toPattern(key),
            start = pattern
                // for index lookups main part of key alternates between string and any type, otherwise undefined is any type
                ? [...rangekey.map((item:any, i:number) => item === undefined ? ((i % 2 && isTable) || isArray ? new Uint8Array([]) : "") : item)]
                : [cname ? `${cname}@00000000-0000-0000-000000000000` : ""],
            end = pattern
                ? [...rangekey.map((item:any, i:number) => item === undefined ? ((i % 2 && isTable) || isArray ? true : -NaN) : item)]
                : [cname ? `${cname}@@ffffffff-ffff-ffff-ffffffffffff` : -NaN],
            submatches:{[key:string]:number} = {};
        if(indexPrefix && pattern) {
            start.unshift(indexPrefix);
            start.push(cname ? `${cname}@00000000-0000-0000-000000000000` : "")
            end.unshift(indexPrefix);
            if(end[end.length-1] === true) {
                end.push(new Uint8Array([]));
            }
            end.push(cname ? `${cname}@ffffffff-ffff-ffff-ffffffffffff` : -NaN)
        }
        let subcount = 0;
        //console.log(start,end);
        let matchCount = 0;
        try {
            const list = !isArray || rangekey.some((item) => item===undefined)
                ? this.list({start, end, limit})
                : async function*() {
                    const entry = await db.get(rangekey);
                    if(entry && entry.value!==undefined) {
                        yield entry;
                    }
                }();
            for await (const match of list) {
                matchCount++;
                const id:string = isArray ? stringifyKey(serializeKey(match.key,[])) : (pattern ? match.key.pop() : match.key[0]);
                if (pattern) {
                    if(pattern[this.options.idProperty] !== undefined && pattern[this.options.idProperty] !== id) {
                        continue;
                    }
                    if(!isArray) {
                        match.key.shift();
                    } // remove indexPrefix
                } else if (match.key.length === 1 && isId(id)) {
                    match.key = [this.options.idProperty, id];
                }
                if (key.length === match.key.length && (isArray || isId(id)) && matchKeys(key, match.key)) {
                    if (i === 0) {
                        matches[id] = 1;
                    } else if (minScore != null) {
                        if (matches[id]) {
                            matches[id]++;
                        } else {
                            matches[id] = 1;
                        }
                    } else if (matches[id]) {
                        subcount++;
                        submatches[id] = 1;
                    }
                }
            }
        } catch (err) {
            //console.log(err,matchCount)
            if (err.message !== "cursor out of bounds" && !(matchCount > 0 && err.message === "invalid boundary key")) {
                throw err;
            }
        }
        if (i > 0 && minScore == null) {
            if (subcount === 0) {
                break;
            }
            matches = submatches;
        }
    }
    let count:number = 0,
        currentOffset:number = 0;
    const entries:([string,number][])    = Object.entries(matches);
    for (let [key, hits] of entries) {
        if(isArray) {
            key = deserializeSpecial(parseKey(key));
        }
        if (hits < threshold) {
            continue;
        }
        if (currentOffset >= offset) {
            const entry = await this.get(key);
            if (entry.value == null) {
                await this.delete([key]); // database clean-up
                continue;
            }
            if (valueMatch && valueMatch !== entry.value) {
                const type = typeof (valueMatch);
                if (type === "function") {
                    entry.value = (valueMatch as ScoredFunction)(entry.value);
                    const score:number|undefined = Object.getOwnPropertyDescriptor(valueMatch, "score")?.value;
                    if (typeof (score) === "number") {
                        hits *= score;
                    }
                } else if (type === "object") {
                    entry.value = this.matchValue(valueMatch, entry.value);
                    hits *= this.matchValue.score;
                }
            }
            if (select) {
                entry.value = selector(entry.value, select);
            }
            if (entry.value !== undefined) {
                if (minScore != null) {
                    entry.score = hits / indexKeys.length;
                } else {
                    entry.score = 1;
                }
                entry.offset = currentOffset;
                entry.count = count;
                entry.totalCount = entries.length;
                yield entry;
                count++;
            }
            if (count >= limit) {
                break;
            }
        } else {
            currentOffset++;
        }
    }
}

Denodata.prototype.findAll = async function(...args:any[]) {
    const results = [];
    for await (const result of this.find(...args)) {
        results.push(result);
    }
    return results;
}

const _get = db.get.bind(db);
Denodata.prototype.get = async function (key:any) {
    const entry = deserializeSpecial(null,await _get(toKey(key)));
    if(entry.value?.data!==undefined) {
        entry.metadata = entry.value.metadata;
        if(entry.metadata?.expires && entry.metadata.expires < Date.now()) {
            await this.delete(entry.key);
            return {key, value:undefined};
        }
        if (entry.key.length === 1 && isId(entry.key[0]) && typeof (entry.value.data) === "object") {
            const ctor = this.schema[(getCname(entry.key[0]) as string)]?.ctor;
            entry.value = ctor ? Object.assign(Object.create(ctor.prototype), entry.value.data) : entry.value.data;
        } else {
            entry.value = entry.value.data;
        }
    }
    return entry;
}

Denodata.prototype.getKeys = function(target:object, value:any, schemaKeys:string[][], {indexType, cname, noTokens}:{[key:string]:any} = {}, {hasRegExp, keys = []}:{hasRegExp?:boolean,keys?:any[]} = {}) {
    noTokens ||= this.options.index?.fulltext || this.options.index?.trigram;
    if (target && typeof (target) === "object" && !Array.isArray(target)) {
        return this.getKeys([], target, value, schemaKeys);
    }
    const key = (target as Array<any>),
        type = typeof (value);
    if (value && type === "object") {
        if (isRegExp(value) || value instanceof Date) {
            keys.push([...key, value])
        } else {
            schemaKeys ||= cname ? Object.values(this.schema[cname]?.indexes||{}).filter((index):boolean => (index as {[key:string]:any}).type===indexType).map((index) => (index as {[key:string]:any}).keys) : [];
            if (indexType === "object") {
                for (const entry of Object.entries(value)) {
                    const regExp = toRegExp(entry[0]),
                        next = regExp ? regExp : entry[0];
                    if (regExp || hasRegExp || schemaKeys.length===0 || schemaKeys.some((keys) => (keys as string[]).some((schemaKey:string) => schemaKey.startsWith([...key, next].join("."))))) {
                        const val = typeof (entry[1]) === "function" ? entry[1].bind(value) : entry[1];
                        this.getKeys([...key, next], val, schemaKeys, {indexType, noTokens}, {
                            keys,
                            hasRegExp: !!regExp
                        });
                    }
                }
            } else if (indexType === "table") {
                for (const properties of schemaKeys) {
                    const key = [];
                    for (const property of properties) {
                        key.push(property);
                        const propertyValue = getValue(property, value),
                            val = typeof (propertyValue) === "function" ? propertyValue.bind(value) : propertyValue;
                        key.push(val);
                    }
                    keys.push(key);
                }
            }
        }
    } else if (type === "string") {
        if (isSpecial(value) || noTokens) {
            keys.push([...key, value])
        } else { // even though full text not yet implemented, do not delete or comment out more of this code
            if (this.options.index?.fulltext) {
                //tokenize(value).filter((token:string) => !STOPWORDS.includes(token)).forEach((token:string) => {
                //    keys.push([...key, token])
                //})
            } else if (!this.options.index?.trigram) {
                keys.push([...key, value]); // what happens if trigram is true?
            }
        }
    } else {
        keys.push([...key, value])
    }
    return keys;
}

Denodata.prototype.matchValue = function(pattern:object, target:object) {
    const targetKeys = this.getKeys(target);
    this.matchValue.score = 1;
    if (this.getKeys(pattern).every((key:any[]) => {
        const result = targetKeys.some((targetKey:any[]) => matchKeys(key, targetKey));
        this.matchValue.score = (this.matchValue.score===undefined ? 1 : this.matchValue.score) * (matchKeys.score===undefined ? 1 : matchKeys.score)
        return result;
    })) {
        return target;
    }
}

Denodata.prototype.patch = async function (value:any, {cname,pattern,metadata}:{cname?:string|undefined,pattern?:object|undefined,metadata?:object|undefined} = {}) {
    const type = typeof (value),
        originalValue = value;
    if (value && type==="object" && !(value[this.options.idProperty] || pattern)) {
        throw new TypeError(`Can't patch non-object or object without id key if there is no pattern.`);
    }
    cname ||= getCname(value[this.options.idProperty]);
    if(value && type==="object") {
        try {
            value = structuredClone(value);
        } catch(e) {
            Array.isArray(value) ? [...value] : {...value}; // should be deep copy?
        }
    }
    if(pattern) {
        for await(const entry of this.find(pattern,{cname})) {
            if(type==="object") {
                await this.patch(entry.value, {cname,metadata});
            } else if(type==="function") {
                const newValue = value(entry.value);
                if(newValue!==undefined) {
                    await this.set(entry.key,newValue,{metadata});
                }
            } else {
                this.set(entry.key, value,{metadata});
            }
        }
        return;
    }
    if(metadata) value[this.options.metadataProperty] = metadata;
    value = serializeValue(value);
    const indexes: any[] = [];
    Object.values(this.schema[(cname as string)]?.indexes || {}).forEach((value) => {
        const {type,keys} = (value as {[key:string]:any});
        indexes.push({indexType: type, keys})
    })
    const id = value[this.options.idProperty],
        entry = await this.get([id]),
        patched = entry.value || {};
    let result;
    if (indexes.length === 0) {
        Object.assign(patched, value)
        result = this.put(patched);
    } else {
        for (const {indexType, indexKeys} of indexes) {
            const oldIndexKeys = this.getKeys(patched, indexKeys, {indexType, cname}),
                newIndexKeys = this.getKeys(value, indexKeys, {indexType, cname}),
                removeKeys = oldIndexKeys.reduce((removeKeys: any[], oldKey: any[]) => {
                    if (newIndexKeys.some((newKey: any[]) => matchKeys(oldKey, newKey))) {
                        return removeKeys;
                    }
                    removeKeys.push(serializeKey(oldKey));
                    return removeKeys;
                }, []),
                indexPrefix = toIndexPrefix(indexType);
            let keys = removeKeys.splice(0, this.options.maxTransactionSize);
            while (keys.length > 0) {
                const tn = this.atomic();
                for (let key of keys) {
                    key = this.options.indexValueMutator(key, cname);
                    if (key && !key.some((item: any) => item == null)) {
                        tn.delete([indexPrefix, ...key, id]);
                    }
                }
                await tn.commit();
                keys = removeKeys.splice(0, this.options.maxTransactionSize);
            }
        }
        if (metadata) { // prepare to patch metadata separately
            delete value[this.options.metadataProperty];
        }
        Object.assign(patched, value);
        if (metadata) { // patch metadata separately
            patched[this.options.metadataProperty] ||= {};
            Object.assign(patched[this.options.metadataProperty], metadata);
        }
        result = this.put(patched, {cname, patch: true});  // should put inside a transaction
    }
    const args = [deserializeSpecial(null,originalValue), {cname,pattern,metadata}];
    await handleEvent("patch",Object.assign(  {value},cname ? {cname} : undefined,metadata ? {metadata} : undefined),args);
    return result;
}

Denodata.prototype.put = async function (object: { [key:string]:any }, {cname, metadata,indexType, autoIndex,indexKeys,patch} :{cname?:string,metadata?:object,indexType?:string,autoIndex?:boolean,indexKeys?:string[],patch?:boolean}={}) : Promise<string> {
    cname ||= getCname(object[this.options.idProperty]) || object.constructor.name;
    const id = object[this.options.idProperty] ||= createId(cname),
        indexes = [];
    if(metadata) object[this.options.metadataProperty] = metadata;
    if(autoIndex && !indexKeys && indexType!=="table") {
        indexKeys = Object.keys(object);
        indexType = "object";
    }
    if (indexType && indexKeys) {
        indexes.push({indexType, indexKeys, name:"dynamic"})
    } else if(cname) {
        Object.values(this.schema[cname]?.indexes || {}).forEach((value) => {
            const {type, keys,name} = (value as {[key:string]:any});
            if (!indexType || type === indexType) indexes.push({indexType: type, indexKeys:keys,name})
        })
    }
    if (indexes.length === 0) {
        await this.set([id], object);
    } else {
        if (!patch) {
            await this.delete([id], {indexOnly: true});
        } // clears all index entries
        for (let i = 0; i < indexes.length; i++) {
            let {indexType = "object", indexKeys} = indexes[i];
            const keys = serializeKey(this.getKeys(object, indexKeys ? [indexKeys] : null, {indexType, cname})),
                indexPrefix = toIndexPrefix(indexType);
            //if(keys.some((key) => key.some((item)=>item==null))) {
            //  throw new TypeError(`Can't index null or undefined value for keys ${JSON.stringify(indexKeys)} for index ${name} on object ${JSON.stringify(object)}`);
            //}
            let keyBatch = keys.splice(0, this.options.maxTransactionSize);
            while (keyBatch.length > 0) {
                const tn = this.atomic();
                for (let key of keyBatch) {
                    key = this.options.indexValueMutator(key, cname);
                    if (key && !key.some((item: any) => item == null)) {
                        tn.set([indexPrefix, ...key, id], 0); // 0 is correct, index entries are just keys
                    }
                }
                await tn.commit();
                keyBatch = keys.splice(0, this.options.maxTransactionSize);
            }
        }
        await this.set([id], object);
    }
    const args = [object, {cname, metadata,indexType, autoIndex,indexKeys,patch}];
    await handleEvent("put",Object.assign(  {value:object},cname ? {cname} : undefined,metadata ? {metadata} : undefined),args);
    return id;
}


const _set = db.set.bind(db);
Denodata.prototype.set = async function (key:any, value:any,metadata:object|undefined) {
    const originalValue = value;
    value = {data:value,metadata:metadata||value[this.options.metadataProperty]};
    metadata = value.metadata;
    //delete value.data[this.options.metadataProperty];
    const type = typeof(value.metadata?.expires);
    if(type==="number") {
        value.metadata.expires = new Date(Date.now()+value.metadata.expires);
    } else if(value.metadata?.expires && !(type==="object" && value.metadata.expires instanceof Date)) {
        throw new TypeError(`Expires value must be number of milliseconds or Date: ${value.metadata.expires}`);
    }
    value = serializeValue(value);
    delete value.data[this.options.metadataProperty];
    const result = await _set(toKey(key),value),
        args = [key, deserializeSpecial(null,originalValue), metadata];
    await handleEvent("set",Object.assign({value:{key,value:deserializeSpecial(null,value.data)}},metadata ? {metadata} : undefined),args);
    return result;
}

const SUBSCRIPTIONS:{
    [key:string]:Map<{[key:string]: any },(value:any)=>any>
} = {
        delete:new Map(),
        patch:new Map(),
        put:new Map(),
        set:new Map()
    };

async function handleEvent(event:string, value:{[key:string]:any}={},args:any[]=[]) {
    for(const entry of SUBSCRIPTIONS[event]) {
        const pattern:{[key:string]:any} = entry[0].pattern,
            ptype:string = typeof(pattern),
            target:{[key:string]:any} = {...value};
        target.pattern = value.value;
        delete target.value;
        if(ptype==="function" && (pattern as Function)(pattern)) {
            await entry[1].apply(null,args as [value:any]);
        } else if(selector(target,entry[0])!==undefined) {
            await entry[1].apply(null,args as [value:any]);
        }
    };
}

Denodata.prototype.subscribe = function(on:{delete?:any,patch?:any,put?:any,set?:any}={},callback:(value:any)=>void, {cname,metadata}:{cname?:string,metadata?:{[key:string]:any}}={}) {
    for(const [key,pattern] of Object.entries(on)) {
        SUBSCRIPTIONS[key].set(Object.assign({pattern},cname ? {cname} : undefined,metadata ? {metadata} : undefined),callback);
    }
}

Denodata.prototype.unsubscribe = function(on:{delete?:any,patch?:any,put?:any,set?:any}={},callback?:(value:any)=>void,options:{cname?:string,metadata?:{[key:string]:any}}={}) {
    for(const [event,pattern] of Object.entries(on)) {
        for (const entry of SUBSCRIPTIONS[event]) {
            if (pattern) {
                const ptype = typeof (pattern);
                if (ptype === "function" && pattern !== entry[0].pattern) {
                    return;
                }
                if (pattern !== undefined) {
                    if (selector(entry[0], {pattern, ...options}) === undefined) {
                        return;
                    }
                }
            }
            if (callback && callback !== entry[1]) {
               continue;
            }
            this[event].subscriptions.delete(entry[0]);
        }
    }
}



export default Denodata;