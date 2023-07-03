import {DONE} from "./constants.js"
const getValue = (key, data) => {
    const keys = key.split(".");
    let result = data;
    do {
        result = result[keys.shift()];
    } while (result && typeof (result) === "object" && keys.length);
    if (keys.length) return undefined;
    return result;
}

function getKeys(key, value, schemaKeys, {indexType, cname, noTokens} = {}, {hasRegExp, keys = []} = {}) {
    const keyType = typeof (key);
    noTokens ||= this.indexOptions?.fulltext || this.indexOptions?.trigram;
    if (key && keyType === "object" && !Array.isArray(key)) {
        return getKeys.call(this, [], key, value, schemaKeys);
    }
    const type = typeof (value);
    if (value && type === "object") {
        if (isRegExp(value) || value instanceof Date) {
            keys.push([...key, value])
        } else {
            schemaKeys ||= cname ? Object.values(this.schema[cname]?.indexes||{}).filter(index => index.type===indexType).map((index) => index.keys) : [];
            if (indexType === "object") {
                for (const entry of Object.entries(value)) {
                    const regExp = toRegExp(entry[0]),
                        next = regExp ? regExp : entry[0];
                    if (regExp || hasRegExp || schemaKeys.length===0 || schemaKeys.some((keys) => keys.some((schemaKey) => schemaKey.startsWith([...key, next].join("."))))) {
                        const val = typeof (entry[1]) === "function" ? entry[1].bind(value) : entry[1];
                        getKeys.call(this, [...key, next], val, schemaKeys, {indexType, noTokens}, {
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
                            val = typeof (propertyValue) === "function" ? keyValue.bind(value) : propertyValue;
                        key.push(val);
                    }
                    keys.push(key);
                }
            }
        }
    } else if (type === "string") {
        if (isSpecial(value) || noTokens) {
            keys.push([...key, value])
        } else {
            if (this?.indexOptions?.fulltext) {
                tokenize(value).filter((token) => !STOPWORDS.includes(token)).forEach((token) => {
                    keys.push([...key, token])
                })
            } else if (!this.indexOptions?.trigram) {
                keys.push([...key, value]); // what happens if trigram is true?
            }
        }
    } else {
        keys.push([...key, value])
    }
    return keys;
}

const deserializeSpecial = (key, value) => {
    if (key !== null && typeof (key) !== "string") return deserializeSpecial(null, key);
    const type = typeof (value);
    if (type === "string") {
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
        ;
        const symbol = value.match(/^@Symbol\((.*)\)$/);
        if (symbol) return Symbol.for(symbol[1]);
        return value;
    }
    if (value && type === "object") {
        Object.entries(value).forEach(([key, data]) => {
            value[key] = deserializeSpecial(key, data);
        });
    }
    return value;
}

const isSpecial = (value) => {
    const specials = ["@undefined"];
    return specials.includes(value) || value.match(/@.*\(.*\)/)
}

const isRegExp = (value) => value instanceof RegExp || value.constructor.name === "RegExp";

const isId = (value) => {
    return /([\$0-9a-f_]*@)?[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value);
}

const matchValue = function (pattern, target) {
    const targetKeys = getKeys.call(this, target);
    matchValue.score = 1;
    if (getKeys.call(this, pattern).every((key) => {
        const result = targetKeys.some((targetKey) => matchKeys(key, targetKey));
        matchValue.score *= matchKeys.score;
        return result;
    })) {
        return target;
    }
}

const matchKeys = (pattern, target) => {
    matchKeys.score = 1;
    return pattern.every((item, i) => {
        const type = typeof (item);
        if (type === "function") {
            const result = item(deserializeSpecial(null, target[i]));
            matchKeys.score *= typeof (item.score) === "number" ? item.score : 1;
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

const selector = (value,pattern,{root=value,parent,key}={}) => {
    const ptype = typeof(pattern),
        vtype = typeof(value);
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
    if(ptype==="number" && vtype==="number" && isNaN(pattern) && isNaN(value)) return value;
    return pattern===value ? value : undefined;
}

const serializeKey = (key,skip=["bigint"]) => {
    return serializeSpecial(null,key,skip);
}

const serializeValue = (value,skip=["bigint",RegExp,Date]) => {
    return serializeSpecial(null,value,skip);
}

const serializeSpecial = (key, value,skip=[]) => {
    if(Array.isArray(value)) {
        if(value instanceof Uint8Array) return value;
        return value.map((item,i)=>serializeSpecial(i,item,skip));
    }
    const type = typeof (value);
    if(skip.some((skipType)=>type===skipType || (value && type==="object" && typeof(skipType)==="function" && value instanceof skipType))) return value;
    if (type === "symbol") return "@" + value.toString();
    if (type === "bigint") return "@BigInt(" + value.toString() + ")";
    if (value && type === "object") {
        if (value instanceof Date || value.constructor.name === "Date") return "@Date(" + value.getTime() + ")";
        if (isRegExp(value)) return "@RegExp(" + value.toString() + ")";
        const proto = Object.getPrototypeOf(value);
        try {
            value = structuredClone(value);
        } catch(e) {
            value = {...value};
            // what about Set and Map
            Object.entries(value).forEach(([key, data]) => {
                value[key] = serializeSpecial(key, data,skip);
            });
        }
        Object.setPrototypeOf(value, proto);
    }
    return value;
}

const toIndexPrefix = (indexType) => {
    const prefix = {object: "__oindex__", table: "__tindex__"}[indexType];
    if (!prefix) throw new TypeError("Invalid index type");
    return prefix;
}

const toKey = (value) => {
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

const toPattern = (key) => {
    return key.map((item) => {
        const type = typeof (item);
        if (["boolean", "number", "string","bigint"].includes(type) || (item && type==="object" && item instanceof Uint8Array)) {
            return item;
        }
        return undefined;
    })
}

const toRegExp = (value) => {
    if (value.match(/\/.*\/[gimuy]*$/)) {
        const li = value.lastIndexOf("/"),
            str = value.substring(1, li),
            flags = value.substring(li + 1);
        return new RegExp(str, flags);
    }
}


const createId = (cname) => `${cname}@${uuidv4()}`;

const getCname = (id) => (id || "").split("@")[0];

class Index {
    constructor({name, type, keys, unique = false} = {}) {
        this.name = name;
        this.type = type;
        this.keys = keys;
        this.unique = unique;
    }
}
const uuidv4 = () => crypto.randomUUID();
const Denobase = async (options={}) => {
    const db = await Deno.openKv();

    Object.defineProperty(db, "schema", {value: {}});
    Object.defineProperty(db, "indexes", {value: {}});

    db.createSchema = function ({
                                    cname,
                                    ctor,
                                    primaryKey = "#",
                                    indexes = {},
                                    $schema,
                                    $id,
                                    title,
                                    decription,
                                    properties,
                                    required = [],
                                } = {}) {
        const type = "object";
        cname ||= title;
        title ||= cname;
        if (this.schema[cname]) throw new Error("Schema already exists");
        ctor ||= new Function(`return function ${cname}(data) { return Object.assign(this,data); }`)();
        this.schema[cname] = {cname, ctor, primaryKey, indexes, $schema, $id, title, decription, properties, required};
    }

    db.createIndex = async function ({name, indexType, ctor,cname,keys}) {
        if (!keys || !Array.isArray(keys) || !keys.length) throw new Error("Index must have at least one key");
        name ||= keys.join("_");
        if(!cname && !ctor) throw new Error("Either cname or ctor must be provided when creating an index");
        cname ||= ctor?.name;
        this.schema[cname] ||= {primaryKey: "#", indexes: {}};
        this.schema[cname].ctor ||= ctor || new Function(`return function ${cname}(data) { return Object.assign(this,data); }`)();
        this.schema[cname].indexes[name] = new Index({name, type: indexType, cname, keys});
        for await(const key of this.list({
            start: `${cname}@00000000-0000-0000-000000000000`,
            end: `${cname}@ffffffff-ffff-ffff-ffffffffffff`
        })) {
            const object = await this.get(key);
            await this.put(object, {indexType, indexKeys: keys});
        }
        return this.schema[cname].indexes[name];
    }

    /*db.transaction = async function (f) {
        const tn = this.atomic(),
            result = await f.call(this, tn);
        await tn.commit();
        return result;
    }*/

    db.clear = async function () {
        for await(const {key} of db.list({start: [new Uint8Array([])], end: [true]})) {
            await db.delete(key);
        }
    }

    const _delete = db.delete;
    db.delete = async function (value, {cname, indexOnly,find} = {}) {
        const type = typeof (value);
        if (Array.isArray( value)) {
            const key = toPattern(toKey(value));
            if (value.length === 1 && isId(value[0])) {
                const entry = await this.get(value[0]);
                if (entry.value != null) {
                    const id = value[0],
                        indexes = [];
                    cname ||= getCname(id),
                        Object.values(this.schema[cname]?.indexes || {}).forEach(({type, keys}) => {
                            indexes.push({indexType: type, keys})
                        });
                    for (const {indexType, indexKeys} of indexes) {
                        const keys = getKeys.call(this, entry.value, indexKeys, {indexType, cname}),
                            indexPrefix = toIndexPrefix(indexType);
                        let keyBatch = keys.splice(0, 10); // 10 is max changes in a transaction
                        while (keyBatch.length > 0) {
                            const tn = this.atomic();
                            for (const key of keyBatch) {
                                tn.delete([indexPrefix, ...key, id]);
                            }
                            await tn.commit();
                            keyBatch = keys.splice(0, 10);
                        }
                    }
                }
                if (!indexOnly) {
                    await _delete.call(this, value);
                }
            } else if(find && key.some((item) => item===undefined)) {
                for await (const entry of this.find(value)) { // should value be key?
                    await _delete.call(this,entry.key);
                }
            } else {
                await _delete.call(this, value);
            }
        } else if (value && type === "object") {
            const id = value["#"];
            if (id) {
                cname ||= getCname(id) || value.constructor.name;
                value = serializeValue(value);
                const indexes = [];
                Object.values(this.schema[cname]?.indexes || {}).forEach(({type, keys}) => {
                    indexes.push({indexType: type, keys})
                });
                for (const {indexType, indexKeys} of indexes) {
                    const keys = getKeys.call(this, value, indexKeys, {indexType, cname}),
                        indexPrefix = toIndexPrefix(indexType);
                    let keyBatch = keys.splice(0, 10); // 10 is max changes in a transaction
                    while (keyBatch.length > 0) {
                        const tn = this.atomic();
                        for (const key of keyBatch) {
                            tn.delete([indexPrefix, ...key, id]);
                        }
                        await tn.commit();
                        keyBatch = keys.splice(0, 10);
                    }
                }
                if (!indexOnly) {
                    await _delete.call(this, [id]);
                }
            } else if(find) {
                for await (const entry of this.find(value,{cname})) {
                    await _delete.call(this,entry.key);
                }
            } else {
                throw new Error("Can't delete object that does not have an id unless find option is true");
            }
        } else {
            await _delete.call(this, [value]);
        }
    }

//valueMatch,select,{cname,fulltext,scan,sort,sortable,minScore,limit=Infinity,offset=0}={}
    db.find = async function* (pattern=null, {
        indexName,
        cname,
        minScore,
        valueMatch,
        select,
        limit = Infinity,
        offset = 0
    } = {}) {
        const isArray = Array.isArray(pattern);
        if (indexName && !cname && pattern.constructor.name==="Object") {
            throw new RangeError("cname must be specified when indexName is specified and pattern is a POJO");
        }
        if(pattern && !isArray && typeof(pattern) !== "object") {
            throw new TypeErro("pattern must be one of: null, array or object")
        }
        if(!cname && !isArray && indexName && pattern.constructor.name !== "Object") {
          cname = pattern.constructor.name;
        }
        const indexType = indexName ? "table" : "object",
            isTable = indexType === "table",
            keys = indexName ? this.schema[cname].indexes[indexName]?.keys : null,
            // if pattern is an array then it is a key pattern, otherwise it is an object pattern
            indexKeys = pattern ?  (Array.isArray(pattern) ? [pattern] : getKeys.call(this, pattern, keys ? [keys] : null, {indexType})) : [["#", (value) => value]],
            threshold = indexKeys.length * minScore || 0,
            indexPrefix = isArray ? null : toIndexPrefix(indexType);
        if (!isArray && !cname && pattern && pattern.constructor.name !== "Object") {
            cname = pattern.constructor.name;
        }
        let matches = {};
        for (let i = 0; i < indexKeys.length; i++) {
            const key = indexKeys[i],
                rangekey = key[key.length-1]===true ? toPattern([...key,new Uint8Array([])]) : toPattern(key),
                start = pattern
                    // for index lookups main part of key alternates between string and any type, otherwise undefined is any type
                    ? [...rangekey.map((item, i) => item === undefined ? ((i % 2 && isTable) || isArray ? new Uint8Array([]) : "") : item)]
                    : [cname ? `${cname}@00000000-0000-0000-000000000000` : ""],
                end = pattern
                    ? [...rangekey.map((item, i) => item === undefined ? ((i % 2 && isTable) || isArray ? true : -NaN) : item)]
                    : [cname ? `${cname}@@ffffffff-ffff-ffff-ffffffffffff` : -NaN],
                submatches = {};
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
                    const id = isArray ? JSON.stringify(serializeKey(match.key,[])) : (pattern ? match.key.pop() : match.key[0]);
                    if (pattern) {
                        if(!isArray) {
                            match.key.shift();
                        } // remove indexPrefix
                    } else if (match.key.length === 1 && isId(id)) {
                        match.key = ["#", id];
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
            ;
            if (i > 0 && minScore == null) {
                if (subcount === 0) {
                    break;
                }
                matches = submatches;
            }
        }
        let count = 0,
            currentOffset = 0;
        const entries = Object.entries(matches);
        for (let [key, hits] of entries) {
            if(isArray) {
                key = deserializeSpecial(JSON.parse(key));
            }
            if (hits < threshold) {
                continue;
            }
            if (currentOffset >= offset) {
                const entry = await db.get(key);
                if (entry.value == null) { // should this be undefined?
                    await this.delete([key]); // database clean-up
                    continue;
                }
                if (valueMatch && valueMatch !== entry.value) {
                    const type = typeof (valueMatch);
                    if (type === "function") {
                        entry.value = valueMatch(entry.value);
                        if (typeof (valueMatch.score) === "number") {
                            hits *= valueMatch.score;
                        }
                    } else if (type === "object") {
                        entry.value = matchValue.call(this, valueMatch, entry.value);
                        hits *= matchValue.score;
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

    db.findAll = async function(...args) {
        const results = [];
        for await (const result of this.find(...args)) {
            results.push(result);
        }
        return results;
    }

    const _get = db.get;
    db.get = async function (key) {
        const entry = deserializeSpecial(null,await _get.call(this, toKey(key)));
        if(entry.value) {
            entry.metadata = entry.value.metadata;
            if(entry.metadata?.expires && entry.metadata.expires < Date.now()) {
                await this.delete(key);
                return {key, value:undefined};
            }
            if (entry.key.length === 1 && isId(entry.key[0]) && typeof (entry.value.data) === "object") {
                const ctor = this.schema[getCname(entry.key[0])]?.ctor;
                if (ctor) entry.value = Object.assign(Object.create(ctor.prototype), entry.value.data);
            } else {
                entry.value = entry.value.data;
            }
        }
        return entry;
    }

    db.patch = async function (value, {cname,pattern,metadata} = {}) {
        const type = typeof (value);
        if (value && type==="object" && !(value["#"] || pattern)) {
            throw new TypeError(`Can't patch non-object or object without id key if there is no pattern.`);
        }
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
        if(metadata) value["^"] = metadata;
        value = serializeValue(value);
        cname ||= getCname(value["#"]);
        const indexes = [];
        Object.values(this.schema[cname]?.indexes || {}).forEach(({type, keys}) => {
            indexes.push({indexType: type, keys})
        })
        const id = value["#"],
            entry = await this.get([id]),
            patched = entry.value || {};
        if (indexes.length === 0) {
            Object.assign(patched, value)
            await this.put(patched);
            return id;
        } else {
            for (const {indexType, indexKeys} of indexes) {
                const oldIndexKeys = getKeys.call(this, patched, indexKeys, {indexType, cname}),
                    newIndexKeys = getKeys.call(this, value, indexKeys, {indexType, cname}),
                    removeKeys = oldIndexKeys.reduce((removeKeys, oldKey) => {
                        if (newIndexKeys.some((newKey) => matchKeys(oldKey, newKey))) {
                            return removeKeys;
                        }
                        removeKeys.push(serializeKey(oldKey));
                        return removeKeys;
                    }, []),
                    indexPrefix = toIndexPrefix(indexType);
                let keys = removeKeys.splice(0, 10); // 10 is max changes in a transaction
                while (keys.length > 0) {
                    const tn = this.atomic();
                    for (const key of keys) {
                        tn.delete([indexPrefix, ...key, id]);
                    }
                    await tn.commit();
                    keys = removeKeys.splice(0, 10);
                }
            }
            if(metadata) { // prepare to patch metadata separately
                delete value["^"];
            }
            Object.assign(patched, value);
            if(metadata) { // patch metadata separately
                patched["^"] ||= {};
                Object.assign(patched["^"], metadata);
            }
            return await db.put(patched, {cname,patch:true});  // should put inside a transaction
        }
    }

    db.put = async function (object, {cname, metadata,indexType, autoIndex,indexKeys,patch} = {}) {
        if (!object || typeof (object) !== "object") {
            throw new TypeError(`Can't put non-object: ${object}. Do you mean to use set(key,value)?`);
        }
        cname ||= getCname(object["#"]) || object.constructor.name;
        const id = object["#"] ||= createId(cname),
            indexes = [];
        if(metadata) object["^"] = metadata;
        if(autoIndex && !indexKeys && indexType!=="table") {
            indexKeys = Object.keys(object);
            indexType = "object";
        }
        if (indexType && indexKeys) {
            indexes.push({indexType, indexKeys, name:"dynamic"})
        } else {
            Object.values(this.schema[cname]?.indexes || {}).forEach(({type, keys,name}) => {
                if (!indexType || type === indexType) indexes.push({indexType: type, keys,name})
            })
        }
        if (indexes.length === 0) {
            await this.set([id], object);
            return id;
        }
        if(!patch) {
            await this.delete([id], {indexOnly: true});
        } // clears all index entries
        for (let i = 0; i < indexes.length; i++) {
            let {indexType = "object", indexKeys,name} = indexes[i];
            const keys = serializeKey(getKeys.call(this, object, indexKeys ? [indexKeys] : null, {indexType, cname})),
                indexPrefix = toIndexPrefix(indexType);
            if(keys.some((key) => key.some((item)=>item==null))) {
                throw new TypeError(`Can't index null or undefined value for keys ${JSON.stringify(indexKeys)} for index ${name} on object ${JSON.stringify(object)}`);
            }
            let keyBatch = keys.splice(0, 10); // 10 is max changes in a transaction
            while (keyBatch.length > 0) {
                const tn = this.atomic();
                for (const key of keyBatch) {
                    tn.set([indexPrefix, ...key, id], 0);
                }
                await tn.commit();
                keyBatch = keys.splice(0, 10);
            }
        }
        await this.set([id], object);
        return id;
    }

    const _set = db.set;
    db.set = async function (key, value,metadata) {
        value = {data:value,metadata:metadata||value["^"]};
        const type = typeof(value.metadata?.expires);
        if(type==="number") {
            value.metadata.expires = new Date(Date.now()+value.metadata.expires);
        } else if(value.metadata?.expires && !(type==="object" && value.metadata.expires instanceof Date)) {
            throw new TypeError(`Expires value must be number of milliseconds or Date: ${value.metadata.expires}`);
        }
        return _set.call(this, toKey(key),serializeValue(value));
    }
    return db;
}

export {Denobase as default,Denobase};