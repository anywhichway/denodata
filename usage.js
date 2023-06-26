//import {Denobase} from "https://unpkg.com/denobase";
//import {operators} from "https://unpkg.com/denobase/operators";
import {Denobase} from "./index.js";
import {operators} from "./operators.js";
const {$startsWith,$eq} = operators;

const db = await Denobase();

// Use like DenoKV
await db.set("mykey", "myvalue");
const {key,value,version} = await db.get("mykey");
await db.delete(["mykey"]);

// Use simplified and extended DenoKV
await db.set("mykey", "myvalue");
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