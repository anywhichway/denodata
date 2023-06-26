import { expect } from "https://deno.land/x/expect@v0.2.1/mod.ts";
import {Denobase} from "./index.js";
import {operators} from "./operators.js";
const {$echoes} = operators;

const db = await Denobase();
const uuidv4 = () => crypto.randomUUID();

class Book {
    constructor(options={}) {
        Object.assign(this,options)
    }
}

const now = new Date();
const books = [{
    "#": `Book@${uuidv4()}`,
    title: 'Reinventing Organizations',
    author: 'Laloux',
    expires: Infinity,
    cost: NaN,
    published: now
},{
    "#": uuidv4(),
    title: 'Creating Organizations',
    author: 'Laloux'
},new Book({
    title: 'Beyond Organizations',
    author: 'Jones',
    expires: Infinity,
    cost: NaN,
    published: now
})];

await db.clear();
await db.set(1,1);
await db.set(false,false);
Deno.test("create Index", async () => {
    const i1 = await db.createIndex({indexType:"table",cname:"Book",ctor:Book,keys:["author","title"]}),
        i2 = await db.createIndex({indexType:"object",cname:"Book",ctor:Book,keys:Object.keys(books[0])});
    expect(Object.keys(db.schema.Book.indexes).length).toEqual(2);
    expect(i1.type).toEqual("table");
    expect(i2.type).toEqual("object");
    for(const book of books) {
        await db.put(book);
    }
});

Deno.test("get primitive", async () => {
    const result = await db.get(1);
    expect(result.value).toEqual(1);
})

Deno.test("patch non-object throws", async() => {
    await expect(db.patch(1)).rejects.toThrow();
});
Deno.test("patch primitive with find", async() => {
    await db.patch(2,{pattern:[1]});
    const result = await db.get(1);
    expect(result.value).toEqual(2);
});

Deno.test("delete object no id throws", async() => {
    await expect(db.delete({})).rejects.toThrow();
});


Deno.test("find using Array, i.e. key", async () => {
    const results = await db.findAll([(value)=>typeof(value)!=="string" ? value : undefined]);
    expect(results.length,2);
})

Deno.test("delete using Array, i.e. key", async () => {
    const test = (value)=> value===1 || value===false ? value : undefined;
    await db.delete([test],{find:true});
    const results = await db.findAll([test]);
    expect(results.length).toEqual(0);
})

Deno.test("partial object index match", async () => {
    const results = await db.findAll({title: 'Reinventing Organizations'},{cname:"Book"});
    expect(results.length).toEqual(1);
    expect(results[0].value instanceof Book).toEqual(true);
    expect(results[0].value.title).toEqual("Reinventing Organizations");
});
Deno.test("partial object index match no cname", async () => {
    const results = await db.findAll({title: 'Reinventing Organizations'});
    expect(results.length,1);
    expect(results[0].value instanceof Book).toEqual(true);
    expect(results[0].value.title).toEqual("Reinventing Organizations");
});
Deno.test("partial object index no match not indexed", async () => {
    const results = await db.findAll({title: 'Creating Organizations'});
    expect(results.length).toEqual(0);
});
Deno.test("full table index match", async () => {
    const results = await db.findAll({title: 'Reinventing Organizations',author:'Laloux'}, {cname:"Book",indexName:"author_title"});
    expect(results.length,1);
    expect(results[0].value.title).toEqual("Reinventing Organizations");
    expect(results[0].value.author).toEqual("Laloux");
});
Deno.test("partial table index match", async () => {
    const results = await db.findAll({title: 'Reinventing Organizations'}, {cname:"Book",indexName:"author_title"});
    expect(results.length).toEqual(1);
    expect(results[0].value.title).toEqual("Reinventing Organizations");
    expect(results[0].value.author).toEqual("Laloux");
});
Deno.test("table index no match", async () => {
    const results = await db.findAll({title: 'Creating Organizations'}, {cname:"Book",indexName:"author_title"});
    expect(results.length).toEqual(0);
});
Deno.test("RegExp value match", async () => {
    const results = await db.findAll({title: /Reinventing Organizations/}, {cname:"Book"});
    expect(results.length).toEqual(1);
    expect(results[0].value.title).toEqual("Reinventing Organizations");
});
Deno.test("Literal date match", async () => {
    const results = await db.findAll({author: 'Laloux',published: books[0].published}, {cname:"Book"});
    expect(results.length,1);
    expect(results[0].value.author).toEqual("Laloux");
    expect(results[0].value.title).toEqual("Reinventing Organizations");
    expect(results[0].value.published instanceof Date).toEqual(true);
    expect(results[0].value.published.getTime()).toEqual(books[0].published.getTime());
});
Deno.test("Custom operator value match", async () => {
    const results = await db.findAll({author: 'Laloux',published(date) { return date<new Date() ? date : undefined; }}, {cname:"Book"});
    expect(results.length,1);
    expect(results[0].value.author).toEqual("Laloux");
    expect(results[0].value.title).toEqual("Reinventing Organizations");
    expect(results[0].value.published instanceof Date).toEqual(true);
    expect(results[0].value.published.getTime()).toEqual(books[0].published.getTime());
});
Deno.test("Operator match", async () => {
    const results = await db.findAll({author: $echoes('Lalox')}, {cname:"Book"});
    expect(results.length).toEqual(1);
    expect(results[0].value.author).toEqual("Laloux");
    expect(results[0].value.title).toEqual("Reinventing Organizations");
})
Deno.test("Property match", async () => {
    const results = await db.findAll({[/author/]: "Laloux"}, {cname:"Book"});
    expect(results.length).toEqual(1);
    expect(results[0].value.author).toEqual("Laloux");
    expect(results[0].value.title).toEqual("Reinventing Organizations");
})
Deno.test("Min score", async () => {
    const results = await db.findAll({
        title: 'Building Organizations',
        author: 'Laloux'
    },{minScore:.5});
    expect(results.length).toEqual(1);
    expect(results[0].value.author).toEqual("Laloux");
    expect(results[0].value.title).toEqual("Reinventing Organizations");
    expect(results[0].score).toEqual(.5);
});
Deno.test("All books", async () => {
    const results = await db.findAll(null,{cname:"Book"});
    expect(results.length).toEqual(2);
})
Deno.test("Find all", async () => {
    const results = await db.findAll();
    expect(results.length).toEqual(3);
});
Deno.test("patch", async (t) => {
    await t.step("find & patch",async () => {
        let results = await db.findAll({author: 'Laloux'},{cname:"Book"});
        expect(results.length).toEqual(1);
        expect(results[0].value.author).toEqual("Laloux");
        expect(results[0].value.title).toEqual("Reinventing Organizations");
        results[0].value.author = "LALOUX";
        await db.patch(results[0].value);
        results = await db.findAll({author: 'LALOUX'},{cname:"Book"});
        expect(results.length).toEqual(1);
        expect(results[0].value.author).toEqual("LALOUX");
        expect(results[0].value.title).toEqual("Reinventing Organizations");
    })
    await t.step("verify",async () => {
        const results = await db.findAll({author: 'Laloux'},{cname:"Book"});
        expect(results.length).toEqual(0);
    })
});

Deno.test("patch with find", async (t) => {
    await t.step("patch",async () => {
        await db.set(1,1);
        await db.patch((value) => value+1,{pattern:[1]});
    })
    await t.step("verify",async () => {
        const entry = await db.get(1);
        expect(entry.value).toEqual(2);
    })
})
