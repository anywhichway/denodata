# denobase

A Deno native indexed database. Backed by the `DenoKV` store it has zero external dependencies.

Both traditional table oriented and object-oriented index approaches are supported and can be mixed and matched.

The standard key-value functions remain available and are enhanced to support the indexing features.

Support for automatic serialization and deserialization of class instances.

A powerful `db.find` function with over 50 operators including RegExp, soundex/echoes, credit card, SSNs and more. If something is missing, you can add it in as little as one line.

The find functionality includes partial matching.

# Usage

```javascript
import { Denobase } from "denobase";

const db = new Denobase();

// Use like DenoKV


// Use with automatic object indexes


// Use with declared object indexes


// use with declared table like indexes

```

# API

`db Denobase(options={})`

- Returns a new `Denobase` instance.

- `options` is reserved fro future use.

Note: Keys in `denobase` can be any value that is a valid `DenoKV` key component orthey can be a `DenoKV` key. If they are not a `DenoKV` key, they are automatically converted into the arrays normally used by `DenoKV`. For example `"mykey"` is the same as `["mykey"]`.

`void db.delete(key:primitive|UInt8Array|array|object,{?cname:string,?indexOnly:bool,?find:boolean})`

- Delete a record by key or pattern. Updates indexes.

- If `key` is a primitive, UInt8Array, or valid DenoKV key, the record is deleted.

- If `key` is an array, but not a valid DenoKV and `find` is true, `db.find` is used to find matches and they are deleted. The `find` flag is used to prevent deletion when an invalid DenoKV key is accidentally passed. 

- If `key` is an object with an id, the id is used to delete the object.

- If `key` is an object without an id and find is `true`, `db.find` is used to find matches and they are deleted.

- If `cname` is specified and `key` is a POJO, it is treated like an instance of `cname`. 

- If `indexOnly` is `true` and `key` is an object, only the index entries are deleted.

`Entry *db.find(pattern:array|object,{?cname:string,?minScore:number,?valueMatch:function|object,?offset:number,?limit:number})`

- `Entry` is an object, but not a formal class, with the following properties:

    - `key` - the key of the record
    - `value` - the value of the record
    - `version` - the version of the record

    The `value` property will be an instantiatied class instance if the object was saved as a class instance.

- When returned by `db.find` an entry also has the following properties:

    - `score` - usually 1, but can be between 0 and 1 exclusive for partial matches
    - `offset` - the absolute offset of the entry in the results
    - `count` - the position of the entry in the results after the initial search offset is applied
    - `totalCount` - the total number of entries in the results

- `pattern` can be an array or an object. If it is an array, it is treated similar to a DenoKV key, except the pattern matching semantics below apply.  If it is an object, it is converted into a collection of keys for matching against indexes.

- If `pattern` is a POJO, the `cname` parameter can be used to treat it like a class.

- The key pattern matching semantics are as follows:

    - A `null` pattern matches all records.
    - Any element of a pattern key that is not a valid DenoKV key component is treated as a wildcard and for a lower bounds replaced with `UInt8Array([])` and `true` for upper bounds.
    - The DenoKV `list` function is called with the pattern(s) to get the initial set(s) of keys.
    - The associated sets of keys are intersected to get the final set of keys.
    - The final set of keys is filtered to ensure that the keys match the pattern(s) exactly, e.g. functions in the pattern(s) are used to test the key part at the same index.
    - The values associated with the keys are retrieved from the database.
  
- If `valueMatch` is specified, it is used to filter the resulting values. The semantics are as follows:

  - If it is a function, it is called with the value and any return value that is not `undefined` is used as the result.
  - Each property in the pattern, including nested properties, is found in the value and is tested using the literal value, function, or RegExp in the corresponding property of the pattern. If a function returns anything other than `undefined` the match is successful and the result is used as the property value. If a property value fails the match, the object is discarded.

`Entry db.get(key:primitive|UInt8Array|array)`

- Works like `DenoKV.get` except that if the value is a class instance, it is automatically deserialized and instantiated.

`Entry db.patch(object,{?cname:string})`

- Takes a partial object, finds the object in the database based on its id, applies the changes, updates indexes, and saves the object.
- Using `undefined` as a property value deletes the property.
- If the object does not exist, it is created.
- If `cname` is provided, the object is treated as an instance of `cname`.
- A `find` option will be added similar to `db.delete` to allow patching multiple objects.

`void db.put(object,{?cname:string})` 

- Takes an object, assigns an id if necessary, populates/updates indexes, and serializes then saves the object using the id as the key.

- `Denobase` serializes `bigints`, `symbols`, `Dates`, and `RegExp` so that they can be restored.

`void db.set(key,value)`

- Works like `DenoKV.set`. Does not manage indexes or do specialized serialization.

# Operators

To be written.

# Index Structure

To be written.

# Testing

Some unit tests in place. More to come, including coverage report.

# Release History (Reverse Chronological Order)

Until production release all versions will just have a tertiary version number.
Beta will commence when unit test coverage first exceeds 90%

- 2021-06-25 v0.0.1 (Alpha)
    - Added `db.find` function
    - Added `db.put` function
    - Added automatic serialization and deserialization of class instances
    - Added support for declared indexes
    - Added support for table like indexes
    - Added support for automatic object indexes







