import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts"
import {Denobase} from "./index.js";
import operators from "./operators.js";
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

await db.createIndex({indexType:"table",cname:"Book",ctor:Book,keys:["author","title"]});
await db.createIndex({indexType:"object",cname:"Book",ctor:Book,keys:Object.keys(books[0])});

await db.clear();
for(const book of books) {
    await db.put(book);
}
await db.set(1,1);
await db.set(false,false);

Deno.test("get primitive", async () => {
    const result = await db.get(1);
    assertEquals(result.value,1);
})

Deno.test("find using Array, i.e. key", async () => {
    const results = await db.findAll([(value)=>typeof(value)!=="string" ? value : undefined]);
    assertEquals(results.length,2);
})

Deno.test("delete using Array, i.e. key", async () => {
    const test = (value)=> value===1 || value===false ? value : undefined;
    await db.delete([test],{find:true});
    const results = await db.findAll([test]);
    assertEquals(results.length,0);
})


Deno.test("partial object index match", async () => {
    const results = await db.findAll({title: 'Reinventing Organizations'},{cname:"Book"});
    assertEquals(results.length,1);
    assertEquals(results[0].value instanceof Book,true);
    assertEquals(results[0].value.title,"Reinventing Organizations");
});
Deno.test("partial object index match no cname", async () => {
    const results = await db.findAll({title: 'Reinventing Organizations'});
    assertEquals(results.length,1);
    assertEquals(results[0].value instanceof Book,true);
    assertEquals(results[0].value.title,"Reinventing Organizations");
});
Deno.test("partial object index no match not indexed", async () => {
    const results = await db.findAll({title: 'Creating Organizations'});
    assertEquals(results.length,0);
});
Deno.test("full table index match", async () => {
    const results = await db.findAll({title: 'Reinventing Organizations',author:'Laloux'}, {cname:"Book",indexName:"author_title"});
    assertEquals(results.length,1);
    assertEquals(results[0].value.title,"Reinventing Organizations");
    assertEquals(results[0].value.author,"Laloux");
});
Deno.test("partial table index match", async () => {
    const results = await db.findAll({title: 'Reinventing Organizations'}, {cname:"Book",indexName:"author_title"});
    assertEquals(results.length,1);
    assertEquals(results[0].value.title,"Reinventing Organizations");
    assertEquals(results[0].value.author,"Laloux");
});
Deno.test("table index no match", async () => {
    const results = await db.findAll({title: 'Creating Organizations'}, {cname:"Book",indexName:"author_title"});
    assertEquals(results.length,0);
});
Deno.test("RegExp value match", async () => {
    const results = await db.findAll({title: /Reinventing Organizations/}, {cname:"Book"});
    assertEquals(results.length,1);
    assertEquals(results[0].value.title,"Reinventing Organizations");
});
Deno.test("Literal date match", async () => {
    const results = await db.findAll({author: 'Laloux',published: books[0].published}, {cname:"Book"});
    assertEquals(results.length,1);
    assertEquals(results[0].value.author,"Laloux");
    assertEquals(results[0].value.title,"Reinventing Organizations");
    assertEquals(results[0].value.published instanceof Date,true);
    assertEquals(results[0].value.published.getTime(),books[0].published.getTime());
});
Deno.test("Custom operator value match", async () => {
    const results = await db.findAll({author: 'Laloux',published(date) { return date<new Date() ? date : undefined; }}, {cname:"Book"});
    assertEquals(results.length,1);
    assertEquals(results[0].value.author,"Laloux");
    assertEquals(results[0].value.title,"Reinventing Organizations");
    assertEquals(results[0].value.published instanceof Date,true);
    assertEquals(results[0].value.published.getTime(),books[0].published.getTime());
});
Deno.test("Operator match", async () => {
    const results = await db.findAll({author: $echoes('Lalox')}, {cname:"Book"});
    assertEquals(results.length,1);
    assertEquals(results[0].value.author,"Laloux");
    assertEquals(results[0].value.title,"Reinventing Organizations");
})
Deno.test("Property match", async () => {
    const results = await db.findAll({[/author/]: "Laloux"}, {cname:"Book"});
    assertEquals(results.length,1);
    assertEquals(results[0].value.author,"Laloux");
    assertEquals(results[0].value.title,"Reinventing Organizations");
})
Deno.test("Min score", async () => {
    const results = await db.findAll({
        title: 'Building Organizations',
        author: 'Laloux'
    },{minScore:.5});
    assertEquals(results.length,1);
    assertEquals(results[0].value.author,"Laloux");
    assertEquals(results[0].value.title,"Reinventing Organizations");
    assertEquals(results[0].score,.5);
});
Deno.test("All books", async () => {
    const results = await db.findAll(null,{cname:"Book"});
    assertEquals(results.length,2);
})
Deno.test("Find all", async () => {
    const results = await db.findAll();
    assertEquals(results.length,3);
});
Deno.test("patch", async (t) => {
    await t.step("find & patch",async () => {
        let results = await db.findAll({author: 'Laloux'},{cname:"Book"});
        assertEquals(results.length,1);
        assertEquals(results[0].value.author,"Laloux");
        assertEquals(results[0].value.title,"Reinventing Organizations");
        results[0].value.author = "LALOUX";
        await db.patch(results[0].value);
        results = await db.findAll({author: 'LALOUX'},{cname:"Book"});
        assertEquals(results.length,1);
        assertEquals(results[0].value.author,"LALOUX");
        assertEquals(results[0].value.title,"Reinventing Organizations");
    })
    await t.step("verify",async () => {
        const results = await db.findAll({author: 'Laloux'},{cname:"Book"});
        assertEquals(results.length,0);
    })
});

Deno.test("patch with find", async (t) => {
    await t.step("patch",async () => {
        await db.set(1,1);
        await db.patch((value) => value+1,{pattern:[1]});
    })
    await t.step("verify",async () => {
        const entry = await db.get(1);
        assertEquals(entry.value,2);
    })
})
