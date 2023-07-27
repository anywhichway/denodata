import { expect } from "https://deno.land/x/expect@v0.2.1/mod.ts";
import {Denobase} from "./index.ts";
import {operators} from "./operators.ts";
const {$echoes} = operators;

const test = async (deno) => {
    const tests = [];
    if(deno) {
        //const _test = deno.test.bind(deno);
        deno.test = function(title,test) {
            tests.push({title,test});
        }
    } else {
        deno = Deno
    }
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
        aRegExp: /a/g,
        title: 'Reinventing Organizations',
        author: 'Laloux',
        expires: Infinity,
        cost: NaN,
        published: now,
        aSymbol: Symbol("a")
    },{
        "#": uuidv4(),
        title: 'Creating Organizations',
        author: 'Laloux'
    },new Book({
        title: 'Beyond Organizations',
        author: 'Jones',
        expires: Infinity,
        cost: NaN,
        published: now,
        publisher: {
            name: "ACME, Inc"
        }
    })];

    await db.clear();


    deno.test("createIndex throws for no keys", async () => {
        try {
            await db.createIndex({indexType:"table",cname:"Book",ctor:Book})
        } catch(e) {
            return;
        }
        throw new Error("error expected")
    });
    deno.test("createIndex throws for no cname or ctor", async () => {
        try {
            await db.createIndex({indexType:"table",keys:["a"]})
        } catch(e) {
            return;
        }
        throw new Error("error expected")
    });
    deno.test("createIndex", async () => {
        const i1 = await db.createIndex({indexType:"table",cname:"Book",ctor:Book,keys:["author","title","publisher.name"]}),
            i2 = await db.createIndex({indexType:"object",cname:"Book",ctor:Book,keys:Object.keys(books[0])});
        expect(Object.keys(db.schema.Book.indexes).length).toEqual(2);
        expect(i1.type).toEqual("table");
        expect(i2.type).toEqual("object");
        for(const book of books) {
            await db.put(book,{metadata:{expires:1000*60,created:new Date()}});
        }
    });

    deno.test("createSchema throws for existing", async () => {
        try {
            await db.createSchema({cname:"Book"})
        } catch(e) {
            return;
        }
        throw new Error("error expected")
    })
    deno.test("createSchema automatic ctor", async () => {
        await db.createSchema({cname:"Test1"});
        expect(typeof(db.schema.Test1.ctor)).toEqual("function");
    })
    deno.test("createSchema has ctor", async () => {
        await db.createSchema({cname:"Test2",ctor:function() {}});
        expect(typeof(db.schema.Test2.ctor)).toEqual("function");
    })

    deno.test("get primitive", async () => {
        await db.set(1,1);
        const result = await db.get(1);
        expect(result.value).toEqual(1);
    })

    deno.test("date key and value", async () => {
        const now = new Date();
        await db.set(now,now);
        const entry = await db.get(now);
        expect(entry.key[0]).toBeInstanceOf(Date);
        expect(entry.value).toBeInstanceOf(Date);
        expect(entry.key[0].getTime()).toEqual(entry.value.getTime());
        expect(entry.key[0].getTime()).toEqual(now.getTime());
    })

    9007199254740991n
    deno.test("bigint key and value", async () => {
        const num = 9007199254740991n;
        await db.set(num,num);
        const entry = await db.get(num);
        expect(entry.key[0]).toEqual(num);
        expect(entry.value).toEqual(num);
    })

    deno.test("UInt8Array key and value", async () => {
        const arr = new Uint8Array([1,2,3]);
        await db.set(arr,arr);
        let entry = await db.get(arr);
        expect(entry.key[0]).toEqual(arr);
        expect(entry.value).toEqual(arr);
        await db.delete(arr);
        entry = await db.get(arr);
        expect(entry.value).toEqual(null);
    })

    deno.test("RegExp value", async () => {
        await db.set("regexp",/a/g);
        const entry = await db.get("regexp");
        expect(entry.value).toEqual(/a/g);
        await db.delete("regexp");
    });

    deno.test("RegExp key", async () => {
        await db.set(/a/g,"regexp");
        const entry = await db.get(/a/g);
        expect(entry.value).toEqual("regexp");
        await db.delete(/a/g);
    });

    deno.test("Date value", async () => {
        const now = new Date();
        await db.set("adate",now);
        const entry = await db.get("adate");
        expect(entry.value.getTime()).toEqual(now.getTime());
        await db.delete(now);
    });

    deno.test("Date key", async () => {
        const now = new Date();
        await db.set(now,"adate");
        const entry = await db.get(now);
        expect(entry.value).toEqual("adate");
        await db.delete(now);
    });


    deno.test("delete object no id throws", async() => {
        await expect(db.delete({})).rejects.toThrow();
    });


    deno.test("find using Array, i.e. key", async () => {
        const results = await db.findAll([(value)=>typeof(value)!=="string" ? value : undefined]);
        expect(results.length,2);
    })

    deno.test("find no cname", async () => {
        const results = await db.findAll(books[2]);
        expect(results.length).toEqual(1);
    })

    deno.test("delete using Array, i.e. key", async () => {
        const test = (value)=> value===1 || value===false ? value : undefined;
        await db.delete([test],{find:true});
        const results = await db.findAll([test]);
        expect(results.length).toEqual(0);
    })

    deno.test("autoIndex",async () => {
        await db.put({name:"joe",age:21},{cname:"Person",autoIndex:true});
        const results = await db.findAll({age: 21},{cname:"Person"});
        expect(results.length).toEqual(1);
        expect(results[0].value.age).toEqual(21);
        await db.delete(results[0].value);
        const entry = await db.get(results[0].value["#"]);
        expect(entry.value).toBeNull();
    })

    deno.test("partial object index match", async () => {
        const results = await db.findAll({title: 'Reinventing Organizations'},{cname:"Book"});
        expect(results.length).toEqual(1);
        expect(results[0].value instanceof Book).toEqual(true);
        expect(results[0].value.title).toEqual("Reinventing Organizations");
    });
    deno.test("partial object index match no cname", async () => {
        const results = await db.findAll({title: 'Reinventing Organizations'});
        expect(results.length,1);
        expect(results[0].value instanceof Book).toEqual(true);
        expect(results[0].value.title).toEqual("Reinventing Organizations");
    });
    deno.test("partial object index match with valueMatch object", async () => {
        const results = await db.findAll({title: 'Reinventing Organizations'},{valueMatch:{author:"Laloux"}});
        expect(results.length,1);
        expect(results[0].value instanceof Book).toEqual(true);
        expect(results[0].value.title).toEqual("Reinventing Organizations");
        expect(results[0].value.author).toEqual("Laloux");
    });
    deno.test("partial object index match with valueMatch function", async () => {
        const results = await db.findAll({title: 'Reinventing Organizations'},{valueMatch:(value)=>value});
        expect(results.length,1);
        expect(results[0].value instanceof Book).toEqual(true);
        expect(results[0].value.title).toEqual("Reinventing Organizations");
        expect(results[0].value.author).toEqual("Laloux");
    });
    deno.test("partial object index match with select object", async () => {
        const results = await db.findAll({title: 'Reinventing Organizations'},{select:{"#":now,aSymbol:"a",[/title/]:/(.*)/,cost:NaN,expires:Infinity,published:now,aRegExp:(value)=>value,author:(value)=>value.toUpperCase()}});
        expect(results.length,1);
        expect(results[0].value instanceof Book).toEqual(true);
        expect(results[0].value["#"]).toEqual(undefined);
        expect(results[0].value.aSymbol).toEqual(undefined);
        expect(results[0].value.title).toEqual('Reinventing Organizations');
        expect(results[0].value.expires).toEqual(Infinity);
        expect(results[0].value.cost).toEqual(NaN);
        expect(results[0].value.published).toEqual(now);
        expect(results[0].value.aRegExp).toBeInstanceOf(RegExp);
        expect(results[0].value.author).toEqual("LALOUX");
    });

    deno.test("partial object index match with select functional transform", async () => {
        const results = await db.findAll({title: 'Reinventing Organizations'},{select:(value) => {return {author:value.author.toUpperCase()}}});
        expect(results.length,1);
        expect(results[0].value.title).toEqual(undefined);
        expect(results[0].value.author).toEqual("LALOUX");
    });
    deno.test("partial object index no match not indexed", async () => {
        const results = await db.findAll({title: 'Creating Organizations'});
        expect(results.length).toEqual(0);
    });
    deno.test("full table index match", async () => {
        const results = await db.findAll({title: 'Reinventing Organizations',author:'Laloux'}, {cname:"Book",indexName:"author_title_publisher.name"});
        expect(results.length,1);
        expect(results[0].value.title).toEqual("Reinventing Organizations");
        expect(results[0].value.author).toEqual("Laloux");
    });
    deno.test("partial table index match", async () => {
        const results = await db.findAll({title: 'Reinventing Organizations'}, {cname:"Book",indexName:"author_title_publisher.name"});
        expect(results.length).toEqual(1);
        expect(results[0].value.title).toEqual("Reinventing Organizations");
        expect(results[0].value.author).toEqual("Laloux");
    });
    deno.test("table index no match", async () => {
        const results = await db.findAll({title: 'Creating Organizations'}, {cname:"Book",indexName:"author_title_publisher.name"});
        expect(results.length).toEqual(0);
    });
    deno.test("RegExp value match", async () => {
        const results = await db.findAll({title: /Reinventing Organizations/}, {cname:"Book"});
        expect(results.length).toEqual(1);
        expect(results[0].value.title).toEqual("Reinventing Organizations");
    });
    deno.test("Literal date match", async () => {
        const results = await db.findAll({author: 'Laloux',published: books[0].published}, {cname:"Book"});
        expect(results.length,1);
        expect(results[0].value.author).toEqual("Laloux");
        expect(results[0].value.title).toEqual("Reinventing Organizations");
        expect(results[0].value.published instanceof Date).toEqual(true);
        expect(results[0].value.published.getTime()).toEqual(books[0].published.getTime());
    });
    deno.test("Custom operator value match", async () => {
        const results = await db.findAll({author: 'Laloux',published(date) { return date<new Date() ? date : undefined; }}, {cname:"Book"});
        expect(results.length,1);
        expect(results[0].value.author).toEqual("Laloux");
        expect(results[0].value.title).toEqual("Reinventing Organizations");
        expect(results[0].value.published instanceof Date).toEqual(true);
        expect(results[0].value.published.getTime()).toEqual(books[0].published.getTime());
    });
    deno.test("Operator match", async () => {
        const results = await db.findAll({author: $echoes('Lalox')}, {cname:"Book"});
        expect(results.length).toEqual(1);
        expect(results[0].value.author).toEqual("Laloux");
        expect(results[0].value.title).toEqual("Reinventing Organizations");
    })
    deno.test("Property match", async () => {
        const results = await db.findAll({[/author/]: "Laloux"}, {cname:"Book"});
        expect(results.length).toEqual(1);
        expect(results[0].value.author).toEqual("Laloux");
        expect(results[0].value.title).toEqual("Reinventing Organizations");
    })
    deno.test("Min score", async () => {
        const results = await db.findAll({
            title: 'Building Organizations',
            author: 'Laloux'
        },{minScore:.5});
        expect(results.length).toEqual(1);
        expect(results[0].value.author).toEqual("Laloux");
        expect(results[0].value.title).toEqual("Reinventing Organizations");
        expect(results[0].score).toEqual(.5);
    });

// this test will occasionally fail for unknown reasons
    deno.test("All books", async () => {
        const results = await db.findAll(null,{cname:"Book"});
        expect(results.length).toEqual(2);
    })
    deno.test("Find all", async () => {
        const results = await db.findAll();
        expect(results.length).toEqual(3);
    });
    deno.test("Find throws for no cname", async () => {
        try {
            await db.findAll({},{indexName:"myindex"});
        } catch(e) {
            return;
        }
        throw new Error("error expected")
    });

    deno.test("Find throws for bad pattern", async () => {
        try {
            await db.findAll(1);
        } catch(e) {
            return;
        }
        throw new Error("error expected")
    });

    deno.test("delete by object", async () => {
        const id = await db.put(new Book({title:"test","author":"test"})),
            e1 = await db.get(id);
        expect(e1.value instanceof Book).toEqual(true);
        await db.delete(e1.value);
        const e2 = await db.get(id);
        expect(e2.value).toEqual(null);
    })

    deno.test("put non-object",async () => {
        try {
            await db.put(1);
        } catch(e) {
            return;
        }
        throw new Error("expected error")
    })
    deno.test("patch", async (t) => {
        await t.step("find & patch",async () => {
            let results = await db.findAll({author: 'Laloux'},{cname:"Book"});
            expect(results.length).toEqual(1);
            expect(results[0].value.author).toEqual("Laloux");
            expect(results[0].value.title).toEqual("Reinventing Organizations");
            results[0].value.author = "LALOUX";
            await db.patch(results[0].value,{metadata:{test:1}});
            results = await db.findAll({author: 'LALOUX'},{cname:"Book"});
            expect(results.length).toEqual(1);
            expect(results[0].value.author).toEqual("LALOUX");
            expect(results[0].value.title).toEqual("Reinventing Organizations");
            expect(results[0].metadata.test).toEqual(1);
        })
        await t.step("verify",async () => {
            const results = await db.findAll({author: 'Laloux'},{cname:"Book"});
            expect(results.length).toEqual(0);
        })
    });

    deno.test("patch with find", async (t) => {
        await t.step("patch",async () => {
            await db.set(1,1);
            await db.patch((value) => value+1,{pattern:[1]});
        })
        await t.step("verify",async () => {
            const entry = await db.get(1);
            expect(entry.value).toEqual(2);
        })
    })

    deno.test("patch throws for no pattern", async (t) => {
        try {
            await db.patch(1);
        } catch(e) {
            return;
        }
        throw new Error("expected error")
    })

    deno.test("patch no index", async (t) => {
        class Dummy {
            constructor(config={}) {
                Object.assign(this,config);
            }
        }
        await db.patch(new Dummy({name:"joe","#":"Dummy@1"}));
        await db.delete("Dummy@1")
    })

    deno.test("patch object throws for no id or pattern", async (t) => {
        try {
            await db.patch({name:"joe"});
        } catch(e) {
            return;
        }
        throw new Error("expected error")
    })
    deno.test("patch non-object throws", async() => {
        await expect(db.patch(1)).rejects.toThrow();
    });
    deno.test("patch primitive with find", async() => {
        await db.patch(2,{pattern:[1]});
        const result = await db.get(1);
        expect(result.value).toEqual(2);
    });

    deno.test("delete indexed", async () => {
        await db.delete([books[0]["#"]]);
        const entry = await db.get(books[0]["#"]);
        expect(entry.value).toEqual(null);
    });



    deno.test("expire immediately", async (t) => {
        await t.step("set",async () => {
            await db.set(1,1,{expires:0});
        })
        await t.step("verify",async () => {
            const entry = await db.get(1);
            expect(entry.value===undefined).toEqual(true);
        })
    })
    deno.test("expire later", async (t) => {
        await t.step("set",async () => {
            await db.set(1,1,{expires:1000});
        })
        await t.step("verify",async () => {
            const entry = await db.get(1);
            expect(entry.value).toEqual(1);
        })
        await t.step("verify",async () => {
            await new Promise((resolve) => setTimeout(resolve,1001));
            const entry = await db.get(1);
            expect(entry.value===undefined).toEqual(true);
        })
    })
    deno.test("expire throws for type", async (t) => {
        try {
            await db.set(1,1,{expires:"1"});
        } catch(e) {
            return;
        }
        throw new Error("expected error")
    })

    deno.test("sum", async () => {
        await db.atomic().sum(["count"],1n).commit();
        const sum = await db.get("count");
        expect(sum.value.value).toEqual(1n);
    })

    return async () => {
        const errors = [],
            start = Date.now();
        let count = 0,
            steps = 0
        for(const {title,test} of tests) {
            const t = {
                async step(title,f) {
                    const start = Date.now()
                    try {
                        await f();
                        console.log('  ',title,` ... \x1b[32m\x1b[1mok\x1b[22m\x1b[39m (${Date.now()-start}ms)`);
                        steps++;
                    } catch(error) {
                        error.step = true;
                        console.log('  ',title,` ... FAILED (${Date.now()-start}ms)`);
                        throw error;
                    }
                }
            }
            const start = Date.now()
            try {
                await test(t);
                console.log(title,` ...  \x1b[32m\x1b[1mok\x1b[22m\x1b[39m (${Date.now()-start}ms)`);
                count++
            } catch(error) {
                console.error(title,` ... \x1b[31m\x1b[1mFAILED\x1b[22m\x1b[39m (${Date.now()-start}ms)`);
                errors.push({title,error});
            }
        }
        if(errors.length>0) {
            console.error('\n\x1b[31m\x1b[1mERRORS\x1b[22m\x1b[39m');
            for(const {title,error} of errors) {
                const stack = error.stack.split("at ").slice(0,error.step ? -4 : -2);
                stack.unshift('\n\x1b[31m\x1b[1merror\x1b[22m\x1b[39m: ');
                console.log(`\n${title} => ${stack[stack.length-1].trim()}\n`,stack.join('').trim());
            }
            console.error('\n\x1b[31m\x1b[1mFAILURES\x1b[22m\x1b[39m\n');
            for(const {title,error} of errors) {
                const stack = error.stack.split("at ").slice(0,error.step ? -4 : -2);
                console.log(title,` => ${stack[stack.length-1]}`);
            }
        }
        console.log(`\n${count<tests.length ? '\x1b[31m\x1b[1mFAILED\x1b[22m\x1b[39m' : '\x1b[32m\x1b[1mok\x1b[22m\x1b[39m'} | ${count} passed (steps ${steps}) | failed ${tests.length-count} (${Date.now()-start}ms)`);
    }

}


//(await test(Deno))();
await test();

export default test;
