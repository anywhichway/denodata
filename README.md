# denobase

A Deno native indexed database. Backed by the `DenoKV` store it has zero external dependencies.

Both traditional table-oriented and object-oriented index approaches are supported and can be mixed and matched.

The standard `DenoKV` key-value functions remain available and are enhanced to support the indexing features.

Support for automatic serialization and deserialization of class instances.

Support for `Date`, `RegExp` and `symbol` as part of keys. Support for `symbol` as part of values.

A powerful `db.find` function that works on both indexes and regular keys with over 50 operators including regular expressions, soundex/echoes, credit card, SSNs and more. If something is missing, it can be added in as little as one line.

# Usage

```javascript
import {Denobase,operators} from "https://unpkg.com/denobase";
const {$startsWith,$eq} = operators;

const db = await Denobase();

// Use like DenoKV
await db.set("mykey", "myvalue");
const {key,value,version} = await db.get("mykey");
await db.delete(["mykey"]);

// Use simplified and extended DenoKV
await db.set("mykey", "myvalue"); // primitves are automatically converted to arrays
await (async () => { const {key,value,version} = await db.get("mykey")})();
await db.delete("mykey"); // using an array for the key is optional, autmatic conversion is done
await db.clear(); // DenoKV does not provide a clear function.

// Use with automatic object indexes
const id = await db.put({id:1,name:"John Doe",age:42},{cname:"Person",autoIndex:true});
await (async () => {
  const {key,value,version} = await db.get(id);
  console.log(value); // prints the Person instance
})();
// find with literals
await (async () => {
  for await (const {key,value,version} of db.find({age:42},{cname:"Person"})) {
    console.log(value); // prints the Person instance
  }
})();
// use built in operators
await (async () => {
  for await (const {key,value,version} of db.find({age:$eq(42)},{cname:"Person"})) {
    console.log(value); // prints the Person instance
  }
})();
// inline your own operators
await (async () => {
  for await (const {key, value, version} of db.find({age: (v) => v === 42 ? v : undefined}, {cname: "Person"})) {
    console.log(value); // prints the Person instance
  }
  await db.delete(value);
  // or await db.delete(id); // deletes the Person instance, updates indexes
})();

// Use with declared indexes and classes
class Book {
  constructor(author, title,publisher) {
    this.author = author;
    this.title = title;
    this.publisher = {
      name:publisher
    }
  }
}
await db.createIndex({indexType:"object",ctor:Book,keys:["author","title","publisher"]});
await db.createIndex({indexType:"table",ctor:Book,keys:["author","title","publisher.name"]});
await db.put(new Book("John Doe", "My Life","ACME, Inc"));
await (async () => {
  for await (const {key,value,version,score,count,offsetCount,totalCount} of db.find(
          {author:"John Doe",title:"My Life"},// partial match pattern
          {cname:"Book",indexName:"author_title_publisher.name"})) { // use the table index
    console.log(value); // prints Book instance
  }
})();
await (async () => {
  for await (const {key, value, version} of db.find(new Book(undefined,undefined,$startsWith("ACME")))) {
    console.log(value); // prints Book instance, a cname for index matching is inferred from class of pattern
  }
})();
await (async () => {
  for await (const {key, value, version, score} of db.find(
          {author: "John Doe",title:"Another Life"},
          {minScore:.5,cname:"Book",indexType:"object"})) { // use object index (minScore is only supported for object indexes)
    console.log(value,score); // prints Book instance, less efficient, large index scans because of lack of cname
  }
})();
await (async () => {
  for await (const {key, value, version} of db.find(
          {author: "John Doe"})) { // use object index since index name is not specified
    console.log(value); // prints Book instance, less efficient, large index scans because of lack of cname
  }
})();
```

# Installation

Not yet available on `deno.land/x`. For now, use: 

```javascript
import {Denobase} from "https://unpkg.com/denobase";` 
import {operators} from "https://unpkg.com/denobase/operators";
```

Run Deno with the `--allow-net` and  `--unstable` flags.

# API

`db Denobase(options={})`

- Returns an enhanced `DenoKV`.

- `options` is reserved for future use.

Note:

- Keys in `denobase` can be any value that is a valid `DenoKV` key component, or they can be a `DenoKV` key. If they are not a `DenoKV` key, they are automatically converted into the arrays normally used by `DenoKV`. For example `"mykey"` is the same as `["mykey"]`.

- Object ids are stored in the property `#`. This will be made configurable in a future release.

`void db.delete(keyOrPattern:primitive|UInt8Array|array|object,{?cname:string,?indexOnly:bool,?find:boolean})`

- Deletes a record using key or pattern. Updates indexes.

- If `keyOrPattern` is a primitive, UInt8Array, or valid DenoKV key, the record is deleted.

- If `keyOrPattern` is an array, but not a valid DenoKV key and `find` is true, `db.find` is used with the array as a pattern. Yielded values are deleted. The `find` flag is used to prevent deletion when an invalid DenoKV key is accidentally passed. 

- If `keyOrPattern` is an object with an id, the id is used to delete the object.

- If `keyOrPattern` is an object without an id and find is `true`, `db.find` is used with the object as a pattern. Yielded values are deleted.

- If `cname` is specified and `keyOrPattern` is a POJO, it is treated like an instance of `cname`. 

- If `indexOnly` is `true` and `keyOrPattern` is an object, only the index entries are deleted.

`Entry *db.find(pattern:array|object,{?cname:string,?valueMatch:function|object,?minScore:number,?offset:number,?limit:number})`

- `Entry` is an object, but not a formal class, with the following properties:

    - `key` - the key of the record
    - `value` - the value of the record
    - `version` - the version of the record

    The `value` property will be an instantiated class instance if the object was a class instance stored by `db.put`.

- When returned by `db.find` an entry also has the following properties:

    - `score` - usually 1, but can be between 0 and 1 exclusive for partial matches
    - `offset` - the absolute offset of the entry in the results
    - `count` - the position of the entry in the results after the initial search offset is applied
    - `totalCount` - the total number of entries in the results

- `pattern` can be an array or an object. If it is an array, it is treated similar to a DenoKV key, except additional pattern matching semantics below apply.  If it is an object, it is converted into a collection of keys for matching against indexes.

- If `pattern` is a POJO, the `cname` parameter can be used to treat it like a class. If `pattern` is an object and `cname` is not specified, the `cname` defaults to the `constructor.name` of the object, unless it is a POJO, in which case a cross class search is conducted.

- The key pattern matching semantics are as follows:

    - A `null` pattern matches all records.
    - Any element of a pattern key that is not a valid DenoKV key component is treated as a wildcard with a lower bound of `UInt8Array([])`. Since bounds are non-inclusive, `true` is not the upper bound; rather, the key is extended one element with a value of `UInt8Array([])`.
    - The DenoKV `list` function is called with the pattern(s) to get the initial set(s) of keys.
    - The associated sets of keys are intersected to get the final set of keys.
    - The final set of keys is filtered to ensure that the keys match the original pattern(s) exactly, e.g. functions and RegExp or special literals, e.g. Dates, in the pattern(s) are used to test the key part at the same index.
    - The values associated with the keys are retrieved from the database.
  
- If the optional `valueMatch` is specified, it is used to filter the resulting entries. The semantics are as follows:

  - If it is a function, it is called with the entry value and any return value that is not `undefined` is used as the result.
  - If it is an object, each property in the `valueMatch`, including nested properties, is found in the value and is tested using the literal value, function, or RegExp in the corresponding property of the pattern. If a function returns anything other than `undefined` the match is successful and the result is used as the property value. If a property value fails the match, the object is discarded.

- If `minScore` is specified, it should be a number between 0 and 1 that represents the percentage of the pattern that needs to match.

- `limit` limits the number of entries returned and defaults to `Infinity`.

- `offset` indicates how many entries to skip before returning results.

`Entry db.get(key:primitive|UInt8Array|array)`

- Works like `DenoKV.get` except that if the entry value is a class instance saved using `db.put`, it is automatically deserialized and instantiated.

`Entry db.patch(value:object|function,{?cname:string,?pattern:array|object})`

- If value is an object and `pattern` is not provided, `db.patch` finds the object in the database based on its id, applies the changes, updates indexes, and saves the object.
- If `pattern` is provided, it is used as an argument to `db.find` and all matching entries are updated using `value`. If `value` is a primitive, it is used as the new value. If it is an object, it is merged with the existing value. If it is a function, it is called with the existing value and the return value is used as the new value. If the function returns `undefined`, the value is not changed.
- Using `undefined` as a property or a sub-property of `value` deletes the property.
- If value is an object and it does not exist, it is created.
- If `cname` is provided, the object is treated as an instance of `cname`.

`void db.put(object,{?cname:string,?autoIndex:boolean})` 

- Takes an object, assigns an id if necessary, populates/updates indexes, and serializes then saves the object using the id as the key.
- If `cname` is provided, the object is treated as an instance of `cname`.
- If `autoIndex` is `true`, the object is indexed using all of its keys.

- `Denobase` serializes `bigints`, `symbols`, `Dates`, and `RegExp` so that they can be restored.

`void db.set(key,value)`

- Works like `DenoKV.set`. Does not manage indexes or do specialized serialization.

# Key and Value Space

## Keys

Key parts are ordered lexicographically by their type (with the exception of `Date`, `RegExp` and `symbol`), and within a given type, they are ordered by their value (including Dates). The ordering of types is as follows:

- Uint8Array
- string (Date, RegExp, symbol)
- number
- bigint
- boolean

Within a given type, the ordering is:

- Uint8Array: byte ordering of the array
- string: byte ordering of the UTF-8 encoding of the string
- number: -NaN < -Infinity < -1.0 < -0.5 < -0.0 < 0.0 < 0.5 < 1.0 < Infinity < NaN
- bigint: mathematical ordering, largest negative number first, largest positive number last
- boolean: false < true

This means that the part 1.0 (a number) is ordered before the part 2.0 (also a number), but is greater than the part 0n (a bigint), because 1.0 is a number and 0n is a bigint, and type ordering has precedence over the ordering of values within a type.

`Date`, `RegExp`, `symbol` in indexes are stored as strings with the form `@<classname>(value)`. This means that they will order by their string representation. This will be transparent to most code because `db.set` and `db.get` have been customized to serialize and deserialize `Date` and `RegExp`.

## Values

Values in Denobase can be arbitrary JavaScript values that are compatible with the structured clone algorithm. This includes:

- boolean
- number
- string
- symbol
- bigint
- Uint8Array
- Array
- Object
- Map
- Set
- Date
- RegExp

Unlike DenoKV, `undefined` and `null` are not valid values.

Objects and arrays can contain any of the above types, including other objects and arrays. Maps and Sets can contain any of the above types, including other Maps and Sets.

Unlike DenoKV, circular references within values are not officially supported.

Objects with non-primitive prototypes are supported when inserted via `db.put`. This is unlike DenoKV, which does not support objects with a non-primitive prototype.

Functions cannot be serialized but symbols can (also an enhancement over DenoKV).

# Index Structure

The index structure is documented for convenience and will not be finalized until the final BETA release. At the moment the structure is easy to manage but quite large. It is RAM efficient, but read/write heavy. It is likely changes will be made to optimize for read/write at the expense of RAM.

Index keys are arrays that start with a prefix indicating the type of index, `__oindex__` for object indexes and `__tindex__` for table indexes. The prefix is followed by property names and a value. The final component is the id of the object.

Indexes are named based on the keys they contain.

Unless restricted by an index definition, an object index has one entry for each property and sub-property in an object. Sub-properties results in a sequence of propertye names in the index key. These are followed by the value and finally the id of the object. For example, a full object index of `{a: {b: 1},c:2,"#":'id'}` would have the following index entries:

```javascript
['__oindex__', 'a', 'b', 1, 'id']
['__oindex__', 'c', 2, 'id']
['__oindex__', '#', 'id']
```

Table indexes are not generated automatically. Nested properties will appear in the index key using dot notation; whereas, for object indexes the key arrays just get longer. Immediately after a property names is its value. The final component is the id of the object. For example, a full table index of `{a: {b: 1},c:2,"#":'id'}` would have the following index entries:

```javascript
['__tindex__', 'a.b', 1, 'id']
['__tindex__', 'c', 2, 'id']
['__tindex__', '#', 'id']
```

Table indexes can be more efficient than object indexes, but they require more work to maintain.


```javascript
const book = {
    id: `Book@4b1dd123-9eda-4133-a6b4-3ec9eb68149a`,
    title: 'The Hobbit',
    author: 'J.R.R. Tolkien',
    pubisher: {
        name: 'Houghton Mifflin',
        location: 'Boston'
    }
}
// object index entries
['__oindex__', 'title', 'The Hobbit', 'Book@4b1dd123-9eda-4133-a6b4-3ec9eb68149a']
['__oindex__', 'author', 'J.R.R. Tolkien', 'Book@4b1dd123-9eda-4133-a6b4-3ec9eb68149a']
['__oindex__', 'pubisher', 'name','Houghton Mifflin','Book@4b1dd123-9eda-4133-a6b4-3ec9eb68149a']
['__oindex__', 'pubisher','location', 'Boston','Book@4b1dd123-9eda-4133-a6b4-3ec9eb68149a']
// table index entries
['__tindex__', 'title', 'The Hobbit', 'Book@4b1dd123-9eda-4133-a6b4-3ec9eb68149a']
['__tindex__', 'author', 'J.R.R. Tolkien', 'Book@4b1dd123-9eda-4133-a6b4-3ec9eb68149a']
['__tindex__', 'pubisher.name','Houghton Mifflin','Book@4b1dd123-9eda-4133-a6b4-3ec9eb68149a']
['__tindex__', 'pubisher.location', 'Boston','Book@4b1dd123-9eda-4133-a6b4-3ec9eb68149a']
```

# Operators

The following operators are supported in patterns.

## Logical

* `$and(...operatorResult)` - logical and
* `$or(...operatorResult))` - logical or
* `$not(...operatorResult))` - logical not
* `$ior(...operatorResult))` - fuzzy matching inclusive or (more matches increase score)
* `$xor(...operatorResult))` - exclusive or

## Comparison

* `$lt(boolean|number|string)` - less than
* `$lte(boolean|number|string)` - less than or equal to
* `$gt(boolean|number|string)` - greater than
* `$gte(boolean|number|string)` - greater than or equal to
* `$eq(boolean|number|string)` - equal to
* `$eeq(boolean|number|string)` - equal to and same type, e.g. `1` is not equal to `'1'
* `$neq(boolean|number|string)` - not equal to
* `$between(boolean|number|string,boolean|number|string)` - property value is between the two values (inclusive)
* `$outside(boolean|number|string,boolean|number|string)` - property value is not between the two values (exclusive)

## String

* `$startsWith(string)` - property value starts with string
* `$endsWith(string)` - property value ends with string
* `$matches(RegExp)` - property value matches regular expression
* `$similar(RegExp)` - alias for `$matches`
* `$includes(string)` - property value contains string
* `$excludes(string)` - property value does not contain string
* `$echoes(string)` - property value sounds like the `string`
* `$soundsLike(string)` - alias for `$echoes`

## Arrays and Sets

* `$in(array)` - property value is in array
* `$nin(array)` - property values is not in array
* `$includes(boolean|number|string|null)` - property value is an array and includes value
* `$excludes(boolean|number|string|null)` - property value is an array and does not include value
* `$intersects(array)` - property value is an array and intersects with array
* `$disjoint(array)` - property value is an array and does not intersect with array
* `$subset(array)` - property value is an array and is a subset of array
* `$superset(array)` - property value is an array and is a superset of array
* `$symmetric(array)` - property value is an array and has same elements as array

## Basic Types

* `$type(typeName:string)` - property value is of `typeName` type
* `$isOdd()` - property value is odd
* `$isEven()` - property value is even
* `$isPrime()` - property value is prime
* `$isComposite()` - property value is composite
* `$isPositive()` - property value is positive
* `$isNegative()` - property value is negative
* `$isInteger()` - property value is an integer
* `$isFloat()` - property value is a float
* `$isNaN()` - property value is not a number
* `$isArray()` - property value is an array
* `$isObject()` - property value is an object
* `$isPrimitive()` - property value is a primitive
* `$isUndefined()` - property value is undefined
* `$isNull()` - property value is null
* `$isTruthy()` - property value is truthy
* `$isFalsy()` - property value is falsy

## Extended Types

* `$isCreditCard()` - property value is a credit card number
* `$isEmail()` - property value is an email address
* `$isHexColor()` - property value is a hex color
* `$isIPV4Address()` - property value is an IP address
* `$isIPV6Address()` - property value is an IP address
* `$isISBN()` - property value is an ISBN
* `$isMACAddress()` - property value is a MAC address
* `$isURL()` - property value is a URL
* `$isUUID()` - property value is a UUID
* `$isZIPCode()` - property value is a ZIP code

# Testing

Some unit tests in place.

`index.js ... index.js ... ... 70.795% (463/654)`
`operators.js ... 80.769% (294/364)`

# Release History (Reverse Chronological Order)

Until production release, all versions will just have a tertiary version number.
Beta will commence when unit test coverage first exceeds 90%.

2023-06-30 v0.0.8 (Alpha)
  - Enhanced documentation

2023-06-28 v0.0.7 (Alpha)
  - Fixed issue with serializing RegExp in keys
  - Fixed issue with serializing symbols
  - Fixed issue with patching when special value, e.g. Date, exists in index keys

2023-06-27 v0.0.6 (Alpha)
  - More refinement to `db.getKeys`
  - Fixes to `db.delete` by object reference
  - Optimizations to serialization
  - More unit tests
  - Enhanced documentation

2023-06-26 v0.0.5 (Alpha)
  - Fixed issue with `db.getKeys` returning too many keys for table indexes

2023-06-26 v0.0.4 (Alpha)
  - Added unit tests for patch and delete
  - Started reporting test coverage
  - Enhanced documentation

2023-06-26 v0.0.3 (Alpha)
  - Added unit tests for operators
  - Pulled operators into index.js and re-exported from there
  - Corrected issue with table indexes on nested objects
  - Optimizations for find on object indexes
  - Updated usage example in documentation to ensure it would execute
  - Added `autoIndex` option to `db.put`
  - Enhanced documentation

2023-06-25 v0.0.2 (Alpha)

  - Corrected date on v0.0.1 below
  - Added find functionality to `db.patch`
  - Enhanced documentation

2023-06-25 v0.0.1 (Alpha)

  - Added `db.find` function
  - Added `db.put` function
  - Added automatic serialization and deserialization of class instances
  - Added support for declared indexes
  - Added support for table like indexes
  - Added support for automatic object indexes








