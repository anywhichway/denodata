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
            if (indexType === "object") {
                for (const entry of Object.entries(value)) {
                    const regExp = toRegExp(entry[0]),
                        next = regExp ? regExp : entry[0];
                    if (regExp || hasRegExp || !schemaKeys || schemaKeys.some((schemaKey) => schemaKey.startsWith([...key, next].join(".")))) {
                        const val = typeof (entry[1]) === "function" ? entry[1].bind(value) : entry[1];
                        getKeys.call(this, [...key, next], val, schemaKeys, {indexType, noTokens}, {
                            keys,
                            hasRegExp: !!regExp
                        });
                    }
                }
            } else if (indexType === "table") {
                schemaKeys ||= Object.values(this.schema[cname].indexes).map((index) => index.keys);
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
        if (isSpecial(value)) {
            keys.push([...key, value])
        } else if (noTokens) {
            keys.push([...key, value])
        } else {
            if (this?.indexOptions?.fulltext) {
                tokenize(value).filter((token) => !STOPWORDS.includes(token)).forEach((token) => {
                    keys.push([...key, token])
                })
            }
            if (!this?.indexOptions?.fulltext && !this.indexOptions?.trigram) {
                keys.push([...key, value])
            }
        }
    } else { //if(!schemaKeys || hasRegExp || schemaKeys.includes(key.join("."))) {
        keys.push([...key, value])
    }
    return keys;
}

const isSpecial = (value) => {
    const specials = ["@undefined", "@Infinity", "@-Infinity", "@NaN"];
    return specials.includes(value) || value.match(/@.*\(.*\)/)
}

const isRegExp = (value) => value instanceof RegExp || value.constructor.name === "RegExp";

const isId = (value) => {
    return /([\$0-9a-f_]*@)?[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value);
}

const deserializeSpecial = (key, value) => {
    if (key !== null && typeof (key) !== "string") return deserializeSpecial(null, key);
    if (key && value === "@undefined") return;
    const type = typeof (value);
    if (type === "string") {
        const number = value.match(/^@BigInt\((.*)\)$/);
        if (number) return new BigInt(number[1]);
        const date = value.match(/^@Date\((.*)\)$/);
        if (date) return new Date(parseInt(date[1]));
        const regexp = value.match(/^@RegExp\((.*)\)$/);
        if (regexp) {
            const li = regexp[1].lastIndexOf("/"),
                str = regexp[1].substring(1, li),
                flags = regexp[1].substring(li + 1);
            return new RegExp(str, flags)
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
const serializeSpecial = ({keepUndefined, keepRegExp} = {}) => (key, value) => {
    if (key !== null && typeof (key) !== "string") return serializeSpecial({keepUndefined, keepRegExp})(null, key);
    if (keepUndefined && key && value === undefined) return "@undefined";
    const type = typeof (value);
    if (type === "symbol") return value.toString();
    if (type === "bignint") return "@BigInt(" + value.toString() + ")";
    if (value && type === "object") {
        if (value instanceof Date || value.constructor.name === "Date") return "@Date(" + value.getTime() + ")";
        if (isRegExp(value)) return keepRegExp ? value : "@RegExp(" + value.toString() + ")";
        if (value instanceof Symbol) return "@Symbol(" + value.toString() + ")";
        const proto = Object.getPrototypeOf(value);
        value = {...value};
        Object.setPrototypeOf(value, proto);
        Object.entries(value).forEach(([key, data]) => {
            value[key] = serializeSpecial({keepUndefined, keepRegExp})(key, data);
        });
    }
    return value;
}

const toRegExp = (value) => {
    if (value.match(/\/.*\/[gimuy]*$/)) {
        const li = value.lastIndexOf("/"),
            str = value.substring(1, li),
            flags = value.substring(li + 1);
        return new RegExp(str, flags);
    }
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

const createId = (cname) => `${cname}@${uuidv4()}`;

const getCname = (id) => (id || "").split("@")[0];

const toIndexPrefix = (indexType) => {
    const prefix = {object: "__oindex__", table: "__tindex__"}[indexType];
    if (!prefix) throw new TypeError("Invalid index type");
    return prefix;
}

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
        ctor ||= new Function(`return function ${name}(data) { return Object.assign(this,data); }`)();
        this.schema[cname] = {cname, ctor, primaryKey, indexes, $schema, $id, title, decription, properties, required};
    }

    db.createIndex = async function ({name, indexType, ctor,cname,keys}) {
        if (!keys || !Array.isArray(keys) || !keys.length) throw new Error("Index must have at least one key");
        name ||= keys.join("_");
        if(!cname && !ctor) throw new Error("Either cname or ctor must be provided when creating an index")
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
    }

    db.transaction = async function (f) {
        const tn = this.atomic(),
            result = await f.call(this, tn);
        await tn.commit();
        return result;
    }

    db.clear = async function () {
        for await(const {key} of db.list({start: [new Uint8Array([])], end: [true]})) {
            await db.delete(key);
        }
    }

    const _delete = db.delete;
    db.delete = async function (value, {cname, indexOnly} = {}) {
        const type = typeof (value);
        if (Array.isArray(value)) {
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
            } else {
                await _delete.call(this, value);
            }
        } else if (value && type === "object") {
            const id = value["#"];
            if (id) {
                cname ||= getCname(id) || value.constructor.name;
                value = serializeSpecial()(null, value);
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
            } else {
                throw new Error("Can't delete object that does not have an id");
            }
        } else {
            await _delete.call(this, [value]);
        }
    }

//valueMatch,select,{cname,fulltext,scan,sort,sortable,minScore,limit=Infinity,offset=0}={}
    db.find = async function* (indexMatch=null, {
        indexName,
        cname,
        minScore,
        valueMatch,
        select,
        limit = Infinity,
        offset = 0
    } = {}) {
        if (indexName && !cname) throw new RangeError("cname must be specified when indexName is specified");
        const indexType = indexName ? "table" : "object",
            keys = indexName ? this.schema[cname].indexes[indexName]?.keys : null,
            indexKeys = indexMatch ? getKeys.call(this, indexMatch, keys ? [keys] : null, {indexType}) : [["#", (value) => value]],
            threshold = indexKeys.length * minScore || 0,
            indexPrefix = toIndexPrefix(indexType);
        if (!cname && indexMatch && indexMatch.constructor.name !== "Object") {
            cname = indexMatch.constructor.name;
        }
        let matches = {};
        for (let i = 0; i < indexKeys.length; i++) {
            const key = indexKeys[i],
                // need to mod for when using table index, get the required fields for the index from the schema
                rangekey = key.map((item) => {
                    const type = typeof (item);
                    if (["boolean", "number", "string"].includes(type)) {
                        return item;
                    }
                    return null;
                }),
                start = indexMatch
                    ? [indexPrefix, ...rangekey.map((item, i) => item === null ? (i % 2 ? new Uint8Array([]) : "") : item), cname ? `${cname}@00000000-0000-0000-000000000000` : ""]
                    : [cname ? `${cname}@00000000-0000-0000-000000000000` : ""],
                end = indexMatch
                    ? [indexPrefix, ...rangekey.map((item, i) => item === null ? (i % 2 ? true : -Infinity) : item), cname ? `${cname}@ffffffff-ffff-ffff-ffffffffffff` : -Infinity]
                    : [cname ? `${cname}@@ffffffff-ffff-ffff-ffffffffffff` : -Infinity],
                submatches = {};
            let subcount = 0;
            //console.log(start,end);
            let matchCount = 0;
            try {
                for await (const match of db.list({start, end, limit})) {
                    matchCount++;
                    const id = indexMatch ? match.key.pop() : match.key[0];
                    if (indexMatch) {
                        match.key.shift(); // remove indexPrefix
                    } else if (match.key.length === 1 && isId(id)) {
                        match.key = ["#", id];
                    }
                    if (key.length === match.key.length && isId(id) && matchKeys(key, match.key)) {
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
            if (hits < threshold) {
                continue;
            }
            if (currentOffset >= offset) {
                const entry = deserializeSpecial(null, await db.get([key]));
                if (entry.value == null) {
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
                    entry.limitOffset = count;
                    entry.maxOffset = entries.length - 1;
                    yield entry;
                    count++;
                }
                if (count >= limit) {
                    break;
                }
            } else {
                currentOffset--;
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
        const result = Array.isArray(key) ? await _get.call(this, key) : await _get.call(this, [key]);
        if(result.value && result.key.length===1 && isId(result.key[0]) && typeof(result.value) === "object") {
            const ctor = this.schema[getCname(result.key[0])]?.ctor;
            if(ctor) result.value = new ctor(result.value)
        }
        return result;
    }

    db.patch = async function (object, {cname} = {}) {
        if (!object || typeof (object) !== "object") {
            throw new TypeError(`Can't patch non-object: ${object}.`);
        }
        object = serializeSpecial()(object);
        cname ||= getCname(object["#"]) || object.constructor.name;
        const indexes = [];
        Object.values(this.schema[cname]?.indexes || {}).forEach(({type, keys}) => {
            indexes.push({indexType: type, keys})
        })
        const id = object["#"] ||= createId(cname),
            entry = await this.get([id]),
            patched = entry.value || {};
        if (indexes.length === 0) {
            Object.assign(patched, object)
            await this.put(patched);
            return id;
        } else {
            for (const {indexType, indexKeys} of indexes) {
                const oldIndexKeys = getKeys.call(this, patched, indexKeys, {indexType, cname}),
                    newIndexKeys = getKeys.call(this, object, indexKeys, {indexType, cname}),
                    removeKeys = oldIndexKeys.reduce((removeKeys, oldKey) => {
                        if (newIndexKeys.some((newKey) => matchKeys(oldKey, newKey))) {
                            return removeKeys;
                        }
                        removeKeys.push(oldKey);
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
            Object.assign(patched, object);
            return await db.put(patched, {cname});  // should put inside a transaction
        }
    }

    db.put = async function (object, {cname, indexType, indexKeys} = {}) {
        if (!object || typeof (object) !== "object") {
            throw new TypeError(`Can't put non-object: ${object}. Do you mean to use set(key,value)?`);
        }
        object = serializeSpecial()(object);
        cname ||= getCname(object["#"]) || object.constructor.name;
        const indexes = [];
        if (indexType && indexKeys) {
            indexes.push({indexType, indexKeys})
        } else {
            Object.values(this.schema[cname]?.indexes || {}).forEach(({type, keys}) => {
                if (!indexType || type === indexType) indexes.push({indexType: type, keys})
            })
        }
        const id = object["#"] ||= createId(cname);
        if (indexes.length === 0) {
            await this.set([id], object);
            return id;
        }
        await this.delete([id], {indexOnly: true}); // clears all index entries
        for (let i = 0; i < indexes.length; i++) {
            let {indexType = "object", indexKeys} = indexes[i];
            const keys = getKeys.call(this, object, indexKeys, {indexType, cname}),
                indexPrefix = toIndexPrefix(indexType);
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
    db.set = async function (key, value) {
        return Array.isArray(key) ? await _set.call(this, key, value) : await _set.call(this, [key], value);
    }
    return db;
}

export {Denobase as default,Denobase};